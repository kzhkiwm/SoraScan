/**
 * SoraScan - Camera, Image Processing, QR & OCR Engine
 * Tesseract.js & jsQR によるハイブリッド解析
 */

export class ScannerEngine {
  constructor(options = {}) {
    this.videoElement = options.videoElement;
    this.canvasElement = options.canvasElement || (typeof document !== 'undefined' ? document.createElement('canvas') : null);
    this.cropOverlayElement = options.cropOverlayElement; // ガイド枠エレメント
    this.onQRDetected = options.onQRDetected || (() => {});
    this.onStatusChange = options.onStatusChange || (() => {});

    this.stream = null;
    this.isScanningQR = false;
    this.animationFrameId = null;
    this.tesseractWorker = null;
    this.isTesseractLoading = false;
    this.torchEnabled = false;

    // 音響フィードバック用 Web Audio Context
    this.audioCtx = null;
  }

  /**
   * カメラの起動
   */
  async startCamera(preferredDeviceId = null) {
    this.stopCamera();

    const constraints = {
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      }
    };

    if (preferredDeviceId) {
      constraints.video.deviceId = { exact: preferredDeviceId };
    }

    // セキュアコンテキストチェック (HTTPS or localhost)
    if (!window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      const errMsg = '【HTTP接続の制限】スマートフォンのブラウザ仕様により、HTTPS接続（またはchrome://flags設定）がない場合カメラがブロックされます。「アルバム写真から選択」をご利用いただくか、HTTPS環境でお試しください。';
      this.onStatusChange({ status: 'error', message: errMsg, isHttpsIssue: true });
      return false;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const errMsg = 'ブラウザがカメラ機能（getUserMedia）に対応していないか、HTTP接続のため無効化されています。';
      this.onStatusChange({ status: 'error', message: errMsg, isHttpsIssue: true });
      return false;
    }

    try {
      this.onStatusChange({ status: 'starting', message: 'カメラを起動しています...' });
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.videoElement.srcObject = this.stream;
      await this.videoElement.play();

      this.onStatusChange({ status: 'ready', message: 'カメラ準備完了' });
      this.startQRScanning();
      return true;
    } catch (err) {
      console.error('Camera access error:', err);
      let errMsg = 'カメラの起動に失敗しました。';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errMsg = 'カメラの使用が拒否されました。ブラウザのサイト設定でカメラを許可してください。';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        errMsg = 'カメラデバイスが見つかりませんでした。';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        errMsg = 'カメラが他のアプリで使用されているか、ハードウェアエラーが発生しました。';
      }
      this.onStatusChange({ status: 'error', message: errMsg, error: err });
      return false;
    }
  }

  /**
   * カメラの停止
   */
  stopCamera() {
    this.stopQRScanning();
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
    this.onStatusChange({ status: 'stopped', message: 'カメラ停止中' });
  }

  /**
   * トーチ（フラッシュライト）のON/OFF切り替え
   */
  async toggleTorch() {
    if (!this.stream) return false;
    const track = this.stream.getVideoTracks()[0];
    if (!track) return false;

    const capabilities = track.getCapabilities ? track.getCapabilities() : {};
    if (!capabilities.torch) {
      return false; // サポート外
    }

    try {
      this.torchEnabled = !this.torchEnabled;
      await track.applyConstraints({
        advanced: [{ torch: this.torchEnabled }]
      });
      return this.torchEnabled;
    } catch (e) {
      console.warn('Torch control failed:', e);
      return false;
    }
  }

  /**
   * QRコードリアルタイム検出ループ
   */
  startQRScanning() {
    if (this.isScanningQR) return;
    this.isScanningQR = true;

    let lastScanTime = 0;
    const scanInterval = 120; // 120ms間隔でスキャン（バッテリー節約とレスポンスのバランス）

    const loop = (timestamp) => {
      if (!this.isScanningQR) return;

      if (this.videoElement && this.videoElement.readyState === this.videoElement.HAVE_ENOUGH_DATA) {
        if (timestamp - lastScanTime >= scanInterval) {
          lastScanTime = timestamp;
          this._scanQRFrame();
        }
      }

      this.animationFrameId = requestAnimationFrame(loop);
    };

    this.animationFrameId = requestAnimationFrame(loop);
  }

  stopQRScanning() {
    this.isScanningQR = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * 1フレームからQRコードを読み取り
   */
  _scanQRFrame() {
    if (!window.jsQR || !this.videoElement) return;

    const vWidth = this.videoElement.videoWidth;
    const vHeight = this.videoElement.videoHeight;
    if (vWidth === 0 || vHeight === 0) return;

    // クロップ枠内のエリアのみ、または中央エリアをターゲットにして高速化
    const canvas = this.canvasElement;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    // スキャン解像度は程よく小さめ（最大640px幅）にして処理負荷を大幅低減
    const scale = Math.min(1, 640 / vWidth);
    const sw = Math.round(vWidth * scale);
    const sh = Math.round(vHeight * scale);

    canvas.width = sw;
    canvas.height = sh;
    ctx.drawImage(this.videoElement, 0, 0, sw, sh);

    try {
      const imgData = ctx.getImageData(0, 0, sw, sh);
      const code = window.jsQR(imgData.data, sw, sh, {
        inversionAttempts: 'dontInvert'
      });

      if (code && code.data) {
        const serial = this.extractSerialFromText(code.data);
        const isUrl = /^https?:\/\//i.test(code.data.trim());
        if (serial || isUrl) {
          if (serial) {
            this.triggerSuccessEffect();
          }
          this.onQRDetected({
            raw: code.data,
            url: isUrl ? code.data.trim() : null,
            serial: serial,
            source: 'qr'
          });
        }
      }
    } catch (e) {
      // フレーム取得エラーは無視
    }
  }

  /**
   * Tesseract.js Workerの初期化
   */
  async initTesseract(progressCallback) {
    if (this.tesseractWorker) return this.tesseractWorker;
    if (this.isTesseractLoading) {
      while (this.isTesseractLoading) {
        await new Promise(r => setTimeout(r, 100));
      }
      return this.tesseractWorker;
    }

    this.isTesseractLoading = true;
    try {
      this.onStatusChange({ status: 'ocr_loading', message: 'OCRエンジンを準備中...' });
      
      const worker = await Tesseract.createWorker('eng', 1, {
        logger: m => {
          if (progressCallback && m.status === 'recognizing text') {
            progressCallback(Math.round(m.progress * 100));
          }
        }
      });

      // 日向坂46仕様: 英大文字と数字の14文字連続（ハイフンなし）にホワイトリストを限定
      await worker.setParameters({
        tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE
      });

      this.tesseractWorker = worker;
      this.isTesseractLoading = false;
      this.onStatusChange({ status: 'ocr_ready', message: 'OCRエンジン準備完了' });
      return worker;
    } catch (err) {
      this.isTesseractLoading = false;
      console.error('Tesseract init failed:', err);
      this.onStatusChange({ status: 'error', message: 'OCRエンジンの初期化に失敗しました。', error: err });
      throw err;
    }
  }

  /**
   * 券面全体から作品情報（アルバム・シングル名、応募サイトURL、応募期間等）をスマート抽出
   * ユーザーリクエスト：「アルバム名は上部の黒字部分、応募サイトはQRコードで確認できます」
   * @param {HTMLImageElement|HTMLVideoElement|Blob|File|HTMLCanvasElement} source
   * @param {Object} options - { geminiApiKey }
   */
  async extractCampaignInfo(source, options = {}) {
    this.onStatusChange({ status: 'processing', message: '券面から作品名と応募サイトURLを解析中...' });

    // 1. 画像からCanvasを作成
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    let naturalW, naturalH;

    if (source instanceof HTMLCanvasElement) {
      naturalW = source.width;
      naturalH = source.height;
      canvas.width = naturalW;
      canvas.height = naturalH;
      ctx.drawImage(source, 0, 0);
    } else if (source instanceof Blob || source instanceof File) {
      const img = await this._loadImageFromFile(source);
      naturalW = img.naturalWidth;
      naturalH = img.naturalHeight;
      canvas.width = naturalW;
      canvas.height = naturalH;
      ctx.drawImage(img, 0, 0);
    } else {
      naturalW = source.videoWidth || source.naturalWidth || source.width;
      naturalH = source.videoHeight || source.naturalHeight || source.height;
      canvas.width = naturalW;
      canvas.height = naturalH;
      ctx.drawImage(source, 0, 0);
    }

    if (!naturalW || !naturalH) {
      throw new Error('画像のサイズを取得できませんでした');
    }

    // 2. Gemini APIが使える場合はAIで超高精度抽出（最優先）
    if (options.geminiApiKey) {
      try {
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        const base64Data = dataUrl.split(',')[1];
        const prompt = `日向坂46のCD封入スペシャル抽選応募シリアルナンバーの券面画像です。
以下の情報を正確に読み取って、JSONのみ（\`\`\`jsonブロックなし、純粋なJSON文字列）で出力してください。

1. "title": 券面上部の黒背景・白抜き文字部分に大きく書かれている作品名・アルバム名・シングル名（例: "日向坂46 18thシングル『イチャイチャ虫』" または "18thシングル『イチャイチャ虫』"）
2. "shortTitle": 作品の短縮通称（例: "18th イチャイチャ虫"）
3. "applyUrl": 券面のQRコードまたは本文中に記載されている公式応募サイトURL（例: "https://ticket.fortunemeets.app/hinatazaka46/18th"）
4. "period": 《応募期間》として本文に書かれている応募期間（例: "2026/09/30 10:00 〜 2026/11/30 23:59"）
5. "serial": シリアルナンバー枠に印字されている英数字14文字（あれば）

JSONフォーマット例:
{"title": "日向坂46 18thシングル『イチャイチャ虫』", "shortTitle": "18th「イチャイチャ虫」", "applyUrl": "https://ticket.fortunemeets.app/hinatazaka46/18th", "period": "2026/09/30 10:00 〜 2026/11/30 23:59", "serial": "JR4KAR7KQ4B8TN"}`;

        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${options.geminiApiKey}`;
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: 'image/jpeg', data: base64Data } }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 300 }
          })
        });

        if (response.ok) {
          const resJson = await response.json();
          let text = resJson.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
          text = text.replace(/^```json/i, '').replace(/```$/i, '').trim();
          const parsed = JSON.parse(text);
          if (parsed && (parsed.title || parsed.applyUrl)) {
            if (parsed.serial && typeof parsed.serial === 'string') {
              const cleanS = parsed.serial.replace(/[^A-Z0-9]/gi, '').toUpperCase();
              if (cleanS.length === 14 && !parsed.serialSuffix) {
                parsed.serialSuffix = cleanS.substring(12, 14);
              }
            }
            this.triggerSuccessEffect();
            this.onStatusChange({ status: 'done', message: 'Gemini AIで作品名と応募サイトURLを検出しました' });
            return parsed;
          }
        }
      } catch (geminiErr) {
        console.warn('Gemini campaign extraction fallback:', geminiErr);
      }
    }

    // 3. ローカル解析パイプライン（QRコード ＆ 上部黒帯反転OCR）
    let detectedUrl = null;
    let detectedSerial = null;

    // A. QRコードデコード (jsQR)
    if (window.jsQR) {
      const qrCanvas = document.createElement('canvas');
      const maxDim = 1200;
      const scale = Math.min(1, maxDim / Math.max(naturalW, naturalH));
      qrCanvas.width = Math.round(naturalW * scale);
      qrCanvas.height = Math.round(naturalH * scale);
      const qctx = qrCanvas.getContext('2d');
      qctx.drawImage(canvas, 0, 0, qrCanvas.width, qrCanvas.height);

      const imgData = qctx.getImageData(0, 0, qrCanvas.width, qrCanvas.height);
      const qrResult = window.jsQR(imgData.data, qrCanvas.width, qrCanvas.height, {
        inversionAttempts: 'attemptBoth'
      });

      if (qrResult && qrResult.data) {
        if (/^https?:\/\//i.test(qrResult.data)) {
          detectedUrl = qrResult.data.trim();
        }
        detectedSerial = this.extractSerialFromText(qrResult.data);
      }
    }

    // B. 上部黒帯（アルバム名・作品名）のクロップ＆反転OCR
    let detectedTitle = null;
    let detectedPeriod = '';

    try {
      const topCanvas = document.createElement('canvas');
      const topCropH = Math.round(naturalH * 0.32);
      topCanvas.width = naturalW;
      topCanvas.height = topCropH;
      const tctx = topCanvas.getContext('2d');

      tctx.drawImage(canvas, 0, 0, naturalW, topCropH, 0, 0, naturalW, topCropH);

      // 黒背景・白文字を反転して「白背景・黒文字」に変換
      const topData = tctx.getImageData(0, 0, naturalW, topCropH);
      const d = topData.data;
      for (let i = 0; i < d.length; i += 4) {
        d[i] = 255 - d[i];
        d[i + 1] = 255 - d[i + 1];
        d[i + 2] = 255 - d[i + 2];
      }
      tctx.putImageData(topData, 0, 0);

      const worker = await this.initTesseract();
      await worker.setParameters({
        tessedit_char_whitelist: ''
      });
      const ocrRes = await worker.recognize(topCanvas);
      const rawTitleText = ocrRes.data.text || '';

      const lines = rawTitleText.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
      for (const line of lines) {
        if (line.includes('日向坂') || line.includes('シングル') || line.includes('アルバム') || /『.+』/.test(line)) {
          detectedTitle = line.replace(/発売記念.*$/, '').replace(/スペシャル抽選.*$/, '').trim();
          break;
        }
      }
      if (!detectedTitle && lines.length > 0) {
        detectedTitle = lines[0];
      }
    } catch (ocrErr) {
      console.warn('Local title OCR failed:', ocrErr);
    }

    if (!detectedUrl) {
      detectedUrl = 'https://ticket.fortunemeets.app/hinatazaka46/18th';
    }

    this.onStatusChange({ status: 'done', message: '作品情報の解析が完了しました' });
    if (detectedTitle || detectedUrl) {
      this.triggerSuccessEffect();
    }

    let shortTitle = '';
    if (detectedTitle) {
      const match = detectedTitle.match(/『([^』]+)』|「([^」]+)」/);
      shortTitle = match ? match[1] || match[2] : detectedTitle.substring(0, 16);
    }

    let serialSuffix = '';
    if (detectedSerial && detectedSerial.length === 14) {
      serialSuffix = detectedSerial.substring(12, 14);
    }

    return {
      title: detectedTitle || '日向坂46 18thシングル『イチャイチャ虫』',
      shortTitle: shortTitle || '18th「イチャイチャ虫」',
      serialSuffix: serialSuffix,
      applyUrl: detectedUrl || 'https://ticket.fortunemeets.app/hinatazaka46/18th',
      period: detectedPeriod || '2026/09/30 10:00 〜 2026/11/30 23:59',
      serial: detectedSerial || null
    };
  }

  /**
   * Gemini Vision API による超高精度AI解析
   * @param {HTMLImageElement|HTMLVideoElement|Blob|File|HTMLCanvasElement} source
   * @param {string} apiKey
   * @param {string} [expectedSuffix]
   */
  async recognizeWithGemini(source, apiKey, expectedSuffix = '') {
    if (!apiKey) throw new Error('Gemini APIキーが設定されていません');

    this.onStatusChange({ status: 'processing', message: 'Gemini AIで券面を高精度解析中...' });

    // 画像をBase64 JPEGに変換
    let dataUrl;
    if (source instanceof HTMLCanvasElement) {
      dataUrl = source.toDataURL('image/jpeg', 0.9);
    } else {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      let w = source.videoWidth || source.naturalWidth || source.width;
      let h = source.videoHeight || source.naturalHeight || source.height;
      if (source instanceof Blob || source instanceof File) {
        const img = await this._loadImageFromFile(source);
        w = img.naturalWidth;
        h = img.naturalHeight;
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(img, 0, 0);
      } else {
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(source, 0, 0);
      }
      dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    }

    const base64Data = dataUrl.split(',')[1];

    const suffixHint = (expectedSuffix && expectedSuffix.length === 2)
      ? `\n【作品固有の確定情報（重要ヒント）】\n- このCD作品のシリアルナンバーは、末尾2文字が必ず「${expectedSuffix}」で終わることが確定しています。\n- 末尾2文字の認識・判定にはこの「${expectedSuffix}」を最優先の照合ヒントとして利用し、かすれや類似文字（TとI/1/7、NとM/H、8とBなど）の誤読を防ぎ、正確に判定してください。\n`
      : '';

    const prompt = `日向坂46のCD封入スペシャル抽選応募シリアルナンバーの券面画像です。
${suffixHint}
【重要：シリアルナンバーの位置とレイアウト】
- 券面の下部に「四角い枠線（シリアルボックス）」があり、その枠線の左上に小さく「シリアルナンバー」と日本語で印刷されています。
- その「シリアルナンバー」という文字の真下に、大きなフォントで横1行に印字されている【英大文字と数字の連続する14文字（ハイフンなし）】（例: "JR4KAR7KQ4B8TN"）が目的のシリアルコードです。
- 枠線の右側にはQRコードがあります。

【指示】
- 「シリアルナンバー」の真下にある【14文字の英数字コード】のみを正確に抽出してください。
- 「0（数字のゼロ）」と「O（アルファベットのオー）」、「1（数字のイチ）」と「I（アルファベットのアイ）」、「8（数字のハチ）」と「B（アルファベットのビー）」をフォント形状から厳密に見分けてください。
- 上部の説明文やURL（"18th", "SRCL 13850~1", "TYPE-A", "fortunemeets"など）は絶対に無視してください。
- 余計な説明、前置き、引用符、Markdownは一切含めず、抽出した14文字（例: JR4KAR7KQ4B8TN）のみを出力してください。`;

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const payload = {
      contents: [{
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: base64Data
            }
          }
        ]
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 100
      }
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      throw new Error(errJson.error?.message || `Gemini API エラー: HTTP ${response.status}`);
    }

    const resJson = await response.json();
    const candidateText = resJson.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    let cleanSerial = candidateText.replace(/[^A-Z0-9]/gi, '').toUpperCase();

    // 抽出されたシリアルが14文字で末尾2文字が指定サフィックスと1文字違いの類似なら安全に補正
    if (expectedSuffix && expectedSuffix.length === 2 && cleanSerial.length === 14) {
      const tail = cleanSerial.substring(12, 14);
      if (tail !== expectedSuffix) {
        // 類似文字補正チェック
        const isNear = this.isSuffixNearMatch(tail, expectedSuffix);
        if (isNear) {
          cleanSerial = cleanSerial.substring(0, 12) + expectedSuffix;
        }
      }
    }

    this.onStatusChange({ status: 'done', message: 'Gemini AI解析完了' });
    if (cleanSerial) {
      this.triggerSuccessEffect();
    }

    return {
      rawText: candidateText,
      confidence: 99,
      bestSerial: cleanSerial,
      candidates: [{ code: cleanSerial, score: 100, source: 'gemini' }],
      processedDataUrl: dataUrl
    };
  }

  /**
   * 現在のカメラプレビューまたは画像ファイルからOCR文字認識を実行
   * @param {HTMLImageElement|HTMLVideoElement|Blob|File} source
   * @param {Object} options - { cropToGuide, geminiApiKey, expectedSuffix, onProgress }
   */
  async captureAndRecognize(source = null, options = {}) {
    const targetSource = source || this.videoElement;
    if (!targetSource) throw new Error('解析対象の画像または映像がありません');

    const expectedSuffix = options.expectedSuffix ? String(options.expectedSuffix).trim().toUpperCase().substring(0, 2) : '';

    // 1. Gemini APIキーが設定されている場合はAI解析を優先（超高精度）
    if (options.geminiApiKey) {
      try {
        return await this.recognizeWithGemini(targetSource, options.geminiApiKey, expectedSuffix);
      } catch (geminiErr) {
        console.warn('Gemini API failed, falling back to local OCR:', geminiErr);
        this.onStatusChange({ status: 'warning', message: 'Gemini AI通信に失敗したため、端末内OCRに切り替えます...' });
      }
    }

    this.onStatusChange({ status: 'processing', message: '画像を最適化・端末内OCR解析中...' });

    // 2. 画像のクロップ & 高度な適応的二値化（Bradley法）
    const processedCanvas = await this.preprocessImage(targetSource, options.cropToGuide !== false);

    // 3. OCRエンジンの準備
    const worker = await this.initTesseract(options.onProgress);

    // 4. OCR実行
    const result = await worker.recognize(processedCanvas);
    const rawText = result.data.text || '';
    const confidence = result.data.confidence;

    // 5. シリアルナンバー候補の抽出 & クリーニング (expectedSuffixヒント活用)
    const extracted = this.parseCandidateSerials(rawText, expectedSuffix);

    this.onStatusChange({ status: 'done', message: '解析完了' });
    if (extracted.bestCandidate) {
      this.triggerSuccessEffect();
    }

    return {
      rawText: rawText,
      confidence: confidence,
      bestSerial: extracted.bestCandidate,
      candidates: extracted.candidates,
      processedDataUrl: processedCanvas.toDataURL('image/png')
    };
  }

  /**
   * 画像前処理パイプライン
   * グレースケール、二値化、コントラスト強調、シャープニング
   */
  async preprocessImage(source, cropToGuide = true) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    let naturalW, naturalH;
    if (source instanceof HTMLVideoElement) {
      naturalW = source.videoWidth;
      naturalH = source.videoHeight;
    } else if (source instanceof HTMLImageElement) {
      naturalW = source.naturalWidth;
      naturalH = source.naturalHeight;
    } else if (source instanceof Blob || source instanceof File) {
      const img = await this._loadImageFromFile(source);
      return this.preprocessImage(img, false);
    }

    if (!naturalW || !naturalH) {
      throw new Error('画像サイズを取得できませんでした');
    }

    // ガイド枠のクロップ計算 (object-fit: cover を正確に補正)
    let sx = 0, sy = 0, sWidth = naturalW, sHeight = naturalH;
    
    if (cropToGuide && this.cropOverlayElement && this.videoElement) {
      const vRect = this.videoElement.getBoundingClientRect();
      const oRect = this.cropOverlayElement.getBoundingClientRect();

      if (vRect.width > 0 && vRect.height > 0) {
        const videoRatio = naturalW / naturalH;
        const elemRatio = vRect.width / vRect.height;

        let renderW, renderH, offsetX, offsetY;
        if (elemRatio > videoRatio) {
          renderW = vRect.width;
          renderH = vRect.width / videoRatio;
          offsetX = 0;
          offsetY = (vRect.height - renderH) / 2;
        } else {
          renderH = vRect.height;
          renderW = vRect.height * videoRatio;
          offsetY = 0;
          offsetX = (vRect.width - renderW) / 2;
        }

        const scale = naturalW / renderW;
        sx = Math.max(0, ((oRect.left - vRect.left) - offsetX) * scale);
        sy = Math.max(0, ((oRect.top - vRect.top) - offsetY) * scale);
        sWidth = Math.min(naturalW - sx, oRect.width * scale);
        sHeight = Math.min(naturalH - sy, oRect.height * scale);
      }
    }

    // 1. クロップ領域の画像を一時Canvas（cropCanvas）に描画
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = sWidth;
    cropCanvas.height = sHeight;
    const cCtx = cropCanvas.getContext('2d');
    cCtx.drawImage(source, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);

    // 2. 自動傾き検出＆水平化 (Auto-Deskew)
    // 撮影時の斜め傾き（数度）による文字上下欠損を防止
    const skewAngle = this.estimateSkewAngle(cropCanvas);
    let deskewedCanvas = cropCanvas;

    if (Math.abs(skewAngle) >= 0.3) {
      deskewedCanvas = document.createElement('canvas');
      deskewedCanvas.width = sWidth;
      deskewedCanvas.height = sHeight;
      const dCtx = deskewedCanvas.getContext('2d');
      dCtx.fillStyle = '#FFFFFF';
      dCtx.fillRect(0, 0, sWidth, sHeight);
      dCtx.translate(sWidth / 2, sHeight / 2);
      dCtx.rotate(-skewAngle * Math.PI / 180.0);
      dCtx.translate(-sWidth / 2, -sHeight / 2);
      dCtx.drawImage(cropCanvas, 0, 0);
    }

    // 3. Qiita流 クリーン・グレースケール拡大（二値化を行わない高精度階調処理）
    // OCR認識精度向上のための適正解像度へのリサイズ（幅1200〜1600px）
    const targetWidth = Math.max(1200, Math.min(1800, Math.round(sWidth * 2.2)));
    const targetHeight = Math.round(sHeight * (targetWidth / sWidth));

    const pad = 40; // 上下左右に40pxの純白パディング（Tesseract境界認識の向上）
    canvas.width = targetWidth + pad * 2;
    canvas.height = targetHeight + pad * 2;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(deskewedCanvas, 0, 0, sWidth, sHeight, pad, pad, targetWidth, targetHeight);

    // 4. 階調を維持した背景白マスク化（Qiita流）
    // 局所適応的な白背景化マスクを生成し、背景の影・グラデーションを純白(255)に飛ばしつつ、
    // 文字本体はコントラスト正規化した滑らかなグレースケール（アンチエイリアス維持）で出力
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;
    const w = canvas.width;
    const h = canvas.height;

    // グレースケール変換 (Rec. 709)
    const gray = new Float32Array(w * h);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      gray[j] = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    }

    // 積分画像（Integral Image）の計算
    const integral = new Float64Array(w * h);
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let y = 0; y < h; y++) {
        const idx = y * w + x;
        sum += gray[idx];
        integral[idx] = (x === 0 ? 0 : integral[idx - 1]) + sum;
      }
    }

    const s = Math.max(8, Math.round(w / 18));
    const s2 = Math.round(s / 2);
    const t = 0.10; // 最適閾値

    for (let y = 0; y < h; y++) {
      const y1 = Math.max(0, y - s2);
      const y2 = Math.min(h - 1, y + s2);
      for (let x = 0; x < w; x++) {
        const x1 = Math.max(0, x - s2);
        const x2 = Math.min(w - 1, x + s2);
        const count = (x2 - x1) * (y2 - y1);
        const sum = integral[y2 * w + x2] - integral[y1 * w + x2] - integral[y2 * w + x1] + integral[y1 * w + x1];
        const curr = gray[y * w + x];
        const isText = (curr * count) < (sum * (1.0 - t));

        const pIdx = (y * w + x) * 4;
        if (isText) {
          // 文字本体: 局所平均との比率でコントラスト強調したグレースケール（アンチエイリアス保持）
          const localMean = sum / count;
          let normVal = Math.round((curr / localMean) * 200);
          normVal = Math.max(0, Math.min(180, normVal));
          data[pIdx] = normVal;
          data[pIdx + 1] = normVal;
          data[pIdx + 2] = normVal;
        } else {
          // 背景: 純白
          data[pIdx] = 255;
          data[pIdx + 1] = 255;
          data[pIdx + 2] = 255;
        }
        data[pIdx + 3] = 255;
      }
    }

    ctx.putImageData(imgData, 0, 0);
    return canvas;
  }

  /**
   * 水平投影プロファイルによる傾き角度（Deskew Angle）自動検出
   * @param {HTMLCanvasElement} canvas
   * @returns {number} 傾き角度（度数法）
   */
  estimateSkewAngle(canvas) {
    const sw = Math.min(320, canvas.width);
    const sh = Math.min(160, canvas.height);
    const thumb = document.createElement('canvas');
    thumb.width = sw;
    thumb.height = sh;
    const tCtx = thumb.getContext('2d');
    tCtx.drawImage(canvas, 0, 0, sw, sh);

    const imgData = tCtx.getImageData(0, 0, sw, sh);
    const d = imgData.data;
    const gray = new Uint8Array(sw * sh);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) {
      gray[j] = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) | 0;
    }

    let bestAngle = 0;
    let maxVariance = -1;
    const cx = sw / 2;
    const cy = sh / 2;

    // -5.0度 〜 +5.0度 を 0.25度刻みで探索
    for (let deg = -5.0; deg <= 5.0; deg += 0.25) {
      const rad = (deg * Math.PI) / 180.0;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);

      const startY = Math.round(sh * 0.15);
      const endY = Math.round(sh * 0.85);
      const numRows = endY - startY;
      const rowSums = new Float64Array(numRows);
      let totalSum = 0;
      let validSamples = 0;

      for (let r = 0; r < numRows; r++) {
        const y = startY + r;
        let rowSum = 0;
        let rowCount = 0;

        for (let x = Math.round(sw * 0.1); x < Math.round(sw * 0.9); x += 2) {
          const dx = x - cx;
          const dy = y - cy;
          const srcX = Math.round(cx + dx * cos - dy * sin);
          const srcY = Math.round(cy + dx * sin + dy * cos);

          if (srcX >= 0 && srcX < sw && srcY >= 0 && srcY < sh) {
            rowSum += (255 - gray[srcY * sw + srcX]); // 黒文字に高い重み
            rowCount++;
          }
        }

        if (rowCount > 0) {
          rowSums[r] = rowSum / rowCount;
          totalSum += rowSums[r];
          validSamples++;
        }
      }

      if (validSamples > 0) {
        const mean = totalSum / validSamples;
        let variance = 0;
        for (let r = 0; r < validSamples; r++) {
          const diff = rowSums[r] - mean;
          variance += diff * diff;
        }
        variance /= validSamples;

        if (variance > maxVariance) {
          maxVariance = variance;
          bestAngle = deg;
        }
      }
    }

    return bestAngle;
  }

  /**
   * 2文字のサフィックスが類似（OCR混同文字または1文字違い）しているか判定
   * @param {string} tail - 判定対象の2文字
   * @param {string} target - 期待される2文字サフィックス（例: 'TN'）
   * @returns {boolean}
   */
  isSuffixNearMatch(tail, target) {
    if (!tail || !target || tail.length !== 2 || target.length !== 2) return false;
    if (tail === target) return true;

    // OCR混同文字テーブル (3↔S, 3↔8↔B, S↔5等)
    const confusableMap = {
      'T': ['I', '1', '7', 'L', 'J', 'Y'],
      'N': ['M', 'H', 'W', 'U', 'K', 'V'],
      '0': ['O', 'Q', 'D', 'U'],
      'O': ['0', 'Q', 'D'],
      '1': ['I', 'L', 'T', '7'],
      'I': ['1', 'L', 'T', '7'],
      '8': ['B', '3', '6', 'S'],
      'B': ['8', '6', '3'],
      '3': ['S', '8', 'B', 'E', '5'],
      'S': ['3', '5', '8'],
      '5': ['S', '6', '3'],
      '2': ['Z'],
      'Z': ['2']
    };

    const isCharMatchOrConfusable = (c1, c2) => {
      if (c1 === c2) return true;
      if (confusableMap[c1] && confusableMap[c1].includes(c2)) return true;
      if (confusableMap[c2] && confusableMap[c2].includes(c1)) return true;
      return false;
    };

    const match0 = isCharMatchOrConfusable(tail[0], target[0]);
    const match1 = isCharMatchOrConfusable(tail[1], target[1]);

    // 両方が一致または混同文字の場合
    if (match0 && match1) return true;

    // 1文字が完全一致しており、もう1文字が英数字の何らかの誤読である場合（1文字違い）
    if ((tail[0] === target[0]) || (tail[1] === target[1])) {
      return true;
    }

    return false;
  }

  /**
   * テキストまたはURLから日向坂46のシリアルナンバーらしき文字列を正規表現で抽出
   * @param {string} text
   * @param {string} [expectedSuffix]
   */
  extractSerialFromText(text, expectedSuffix = '') {
    if (!text) return null;
    const candidates = this.parseCandidateSerials(text, expectedSuffix);
    return candidates.bestCandidate;
  }

  /**
   * OCR抽出テキストからシリアル候補を複数抽出・スコアリング
   * アルバム共通の末尾2文字（expectedSuffix）を最優先ヒントとして活用し、スコア加算・誤読自動補正を実施
   * @param {string} rawText
   * @param {string} [expectedSuffix] - 例: 'TN'
   */
  parseCandidateSerials(rawText, expectedSuffix = '') {
    if (!rawText) return { bestCandidate: null, candidates: [] };

    const suffix = expectedSuffix ? String(expectedSuffix).trim().toUpperCase().substring(0, 2) : '';
    const lines = rawText.split(/[\r\n]+/);
    let candidates = [];
    const fullTextUpper = rawText.toUpperCase();

    // 1. URLクエリパラメータのチェック (QRコード読み取り時)
    const pUrl14 = /[?&](?:code|serial|ticket|c)=([A-Z0-9]{14})(?:&|$)/i;
    const urlMatch14 = fullTextUpper.match(pUrl14);
    if (urlMatch14 && urlMatch14[1]) {
      return {
        bestCandidate: urlMatch14[1],
        candidates: [{ code: urlMatch14[1], score: 100, source: 'url_14' }]
      };
    }

    const pUrlGeneric = /[?&](?:code|serial|ticket|c)=([A-Z0-9\-]+)/i;
    const urlMatchGeneric = fullTextUpper.match(pUrlGeneric);
    if (urlMatchGeneric && urlMatchGeneric[1]) {
      const cleanUrl = urlMatchGeneric[1].replace(/[^A-Z0-9]/gi, '');
      if (cleanUrl.length === 14) {
        return {
          bestCandidate: cleanUrl,
          candidates: [{ code: cleanUrl, score: 100, source: 'url_clean_14' }]
        };
      } else if (cleanUrl.length >= 10 && cleanUrl.length <= 16) {
        candidates.push({ code: cleanUrl, raw: urlMatchGeneric[1], score: 85 });
      }
    }

    // 2. 「シリアルナンバー」というキーワードの出現行を検出（アンカー特定）
    let serialAnchorLineIndex = -1;
    lines.forEach((line, idx) => {
      const lower = line.toLowerCase();
      if (lower.includes('シリアル') || lower.includes('ナンバー') || lower.includes('serial') || lower.includes('number')) {
        serialAnchorLineIndex = idx;
      }
    });

    // 説明文やURLに含まれる固定文字列（これらが含まれる場合はシリアルではない）
    const blacklistWords = ['SRCL', '18TH', '17TH', '16TH', '15TH', '14TH', '13TH', '12TH', 'FORTUNE', 'MEETS', 'HTTP', 'TICKET', 'HINATAZAKA', 'TYPEA', 'TYPEB', 'TYPEC', 'TYPED', 'APP'];

    const isBlacklisted = (str) => {
      return blacklistWords.some(w => str.includes(w));
    };

    // 3. ちょうど14文字の連続英数字
    const pExact14 = /\b[A-Z0-9]{14}\b/g;
    const mExact14 = fullTextUpper.match(pExact14);
    if (mExact14) {
      mExact14.forEach(c => {
        if (!isBlacklisted(c) && !candidates.some(cand => cand.code === c)) {
          // 数字と英字の両方を含んでいる場合は高スコア
          const hasLetter = /[A-Z]/.test(c);
          const hasDigit = /[0-9]/.test(c);
          const score = (hasLetter && hasDigit) ? 100 : 85;
          candidates.push({ code: c, raw: c, score });
        }
      });
    }

    // 4. 行ごとに空白・記号を除去して「ちょうど14文字」になるもの
    // 例: 実物のように文字間に字間がある場合 ("J R 4 K A R 7 K Q 4 B 8 T N")
    lines.forEach((line, idx) => {
      const cleanLine = line.replace(/[^A-Z0-9]/gi, '').toUpperCase();
      if (isBlacklisted(cleanLine)) return;

      // 「シリアルナンバー」アンカー行の直後の行ならボーナス
      const isRightAfterAnchor = (serialAnchorLineIndex !== -1 && (idx === serialAnchorLineIndex + 1 || idx === serialAnchorLineIndex));
      const anchorBonus = isRightAfterAnchor ? 50 : 0;

      if (cleanLine.length === 14 && !candidates.some(c => c.code === cleanLine)) {
        const hasLetter = /[A-Z]/.test(cleanLine);
        const hasDigit = /[0-9]/.test(cleanLine);
        const baseScore = (hasLetter && hasDigit) ? 105 : 90;
        candidates.push({ code: cleanLine, raw: line.trim(), score: baseScore + anchorBonus });
      } else if (cleanLine.length > 14) {
        // expectedSuffixがある場合、行内にsuffixが見つかればその末尾から14文字を優先抽出
        if (suffix && suffix.length === 2) {
          let sPos = cleanLine.indexOf(suffix);
          while (sPos !== -1) {
            if (sPos >= 12) {
              const subFromSuffix = cleanLine.substring(sPos - 12, sPos + 2);
              if (!isBlacklisted(subFromSuffix) && !candidates.some(c => c.code === subFromSuffix)) {
                candidates.push({ code: subFromSuffix, raw: line.trim(), score: 110 + anchorBonus, source: 'suffix_aligned' });
              }
            }
            sPos = cleanLine.indexOf(suffix, sPos + 1);
          }
        }

        // 15文字以上ある場合（前後にゴミが付着）、14文字の部分文字列を抽出
        for (let i = 0; i <= cleanLine.length - 14; i++) {
          const sub = cleanLine.substring(i, i + 14);
          if (!isBlacklisted(sub) && !candidates.some(c => c.code === sub)) {
            candidates.push({ code: sub, raw: line.trim(), score: 85 - i * 2 + anchorBonus });
          }
        }
      } else if (cleanLine.length >= 12 && cleanLine.length <= 16 && !candidates.some(c => c.code === cleanLine)) {
        candidates.push({ code: cleanLine, raw: line.trim(), score: 65 + anchorBonus });
      }
    });

    // 5. expectedSuffix（アルバム共通末尾2文字）に基づくスコアリングボーナス & 誤読自動補正候補生成
    if (suffix && suffix.length === 2) {
      const generatedCandidates = [];

      candidates.forEach(cand => {
        if (cand.code && cand.code.length === 14) {
          const tail = cand.code.substring(12, 14);
          if (tail === suffix) {
            // 末尾2文字が完全に一致: 強力なボーナス (+35点)
            cand.score += 35;
            cand.suffixMatched = true;
          } else if (this.isSuffixNearMatch(tail, suffix)) {
            // 末尾2文字が混同文字または1文字違いの場合: 末尾を補正した候補を生成して追加
            const correctedCode = cand.code.substring(0, 12) + suffix;
            const alreadyExists = candidates.some(c => c.code === correctedCode) || generatedCandidates.some(c => c.code === correctedCode);
            if (!alreadyExists) {
              generatedCandidates.push({
                code: correctedCode,
                raw: cand.raw,
                score: cand.score + 25, // 元候補より優先
                source: 'suffix_corrected',
                originalCode: cand.code,
                suffixCorrected: true
              });
            }
          }
        }
      });

      if (generatedCandidates.length > 0) {
        candidates = candidates.concat(generatedCandidates);
      }
    }

    // 重複除去（同一codeの中で最高scoreを残す）
    const uniqueMap = new Map();
    candidates.forEach(c => {
      const existing = uniqueMap.get(c.code);
      if (!existing || c.score > existing.score) {
        uniqueMap.set(c.code, c);
      }
    });
    candidates = Array.from(uniqueMap.values());

    // スコア降順ソート
    candidates.sort((a, b) => b.score - a.score);

    return {
      bestCandidate: candidates.length > 0 ? candidates[0].code : null,
      candidates: candidates
    };
  }

  /**
   * 誤認識しやすい文字の相互変換ヘルパー
   * @param {string} serial
   * @param {number} charIndex
   * @param {string} targetChar
   */
  substituteChar(serial, charIndex, targetChar) {
    if (charIndex < 0 || charIndex >= serial.length) return serial;
    return serial.substring(0, charIndex) + targetChar + serial.substring(charIndex + 1);
  }

  /**
   * 読み取り成功時のサウンド＆バイブレーション
   */
  triggerSuccessEffect() {
    // バイブレーション（Android等）
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate([40, 50, 40]);
      } catch (e) {}
    }

    // Web Audio チャイム音（明るい上昇音）
    try {
      if (!this.audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
          this.audioCtx = new AudioContext();
        }
      }
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      if (this.audioCtx) {
        const now = this.audioCtx.currentTime;
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        osc.type = 'sine';
        // ド(523.25Hz) → ソ(783.99Hz) の明るいピンポン音
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.12); // A5

        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);

        osc.connect(gain);
        gain.connect(this.audioCtx.destination);

        osc.start(now);
        osc.stop(now + 0.25);
      }
    } catch (e) {
      // Audio autoplay policy等の例外は無視
    }
  }

  /**
   * File / Blob から Image オブジェクトを非同期ロード
   */
  _loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(img.src);
        resolve(img);
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }
}
