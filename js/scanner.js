/**
 * SoraScan - Camera, Image Processing, QR & OCR Engine
 * Tesseract.js & jsQR によるハイブリッド解析
 */

export class ScannerEngine {
  constructor(options = {}) {
    this.videoElement = options.videoElement;
    this.canvasElement = options.canvasElement || document.createElement('canvas');
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
        if (serial) {
          this.triggerSuccessEffect();
          this.onQRDetected({
            raw: code.data,
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
        tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK
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
   * Gemini Vision API による超高精度AI解析
   * @param {HTMLImageElement|HTMLVideoElement|Blob|File|HTMLCanvasElement} source
   * @param {string} apiKey
   */
  async recognizeWithGemini(source, apiKey) {
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

    const prompt = `日向坂46のCD封入スペシャル抽選応募シリアルナンバー（またはQRコード）が写っています。
このシリアルナンバーは【英大文字と数字の連続する14文字（ハイフンなし）】です（例: "A8B3K9M2X4P7W1"）。
画像内からこの14文字の英数字コードのみを正確に抽出してください。
注意事項：
- ハイフンやスペースは絶対に含めず、連続する14文字の英大文字・数字のみを出力してください。
- 「0（数字のゼロ）」と「O（アルファベットのオー）」、「1（数字のイチ）」と「I（アルファベットのアイ）」を券面のフォント形状から厳密に見分けてください。
- 余計な説明、前置き、引用符、Markdownは一切含めず、抽出した14文字のみ（例: A8B3K9M2X4P7W1）を出力してください。`;

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
    const cleanSerial = candidateText.replace(/[^A-Z0-9]/gi, '').toUpperCase();

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
   * @param {Object} options
   */
  async captureAndRecognize(source = null, options = {}) {
    const targetSource = source || this.videoElement;
    if (!targetSource) throw new Error('解析対象の画像または映像がありません');

    // 1. Gemini APIキーが設定されている場合はAI解析を優先（超高精度）
    if (options.geminiApiKey) {
      try {
        return await this.recognizeWithGemini(targetSource, options.geminiApiKey);
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

    // 5. シリアルナンバー候補の抽出 & クリーニング
    const extracted = this.parseCandidateSerials(rawText);

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

    // OCR認識精度向上のための適正解像度へのリサイズ（幅1200〜1600px）
    const targetWidth = Math.max(1000, Math.min(1800, Math.round(sWidth)));
    const targetHeight = Math.round(sHeight * (targetWidth / sWidth));

    canvas.width = targetWidth;
    canvas.height = targetHeight;

    // クロップ領域を描画（白背景マージン付きで境界ノイズ防止）
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    ctx.drawImage(source, sx, sy, sWidth, sHeight, 0, 0, targetWidth, targetHeight);

    // 高度な局所適応的二値化（Bradley-Roth / Integral Image アルゴリズム）
    // 照明ムラや斜めの影があっても文字の輪郭だけを確実に黒く抽出
    const imgData = ctx.getImageData(0, 0, targetWidth, targetHeight);
    const data = imgData.data;
    const w = targetWidth;
    const h = targetHeight;

    // 1. グレースケール変換配列の作成
    const gray = new Uint8Array(w * h);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      gray[j] = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) | 0;
    }

    // 2. 積分画像（Integral Image）の計算
    const integral = new Float64Array(w * h);
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let y = 0; y < h; y++) {
        const index = y * w + x;
        sum += gray[index];
        integral[index] = (x === 0 ? 0 : integral[index - 1]) + sum;
      }
    }

    // 3. 局所適応的二値化の適用
    // 局所ウィンドウサイズ（画像の約1/16）
    const s = Math.max(8, Math.round(w / 18));
    const s2 = Math.round(s / 2);
    const t = 0.14; // 近傍平均より14%以上暗いピクセルを黒文字と判定

    for (let y = 0; y < h; y++) {
      const y1 = Math.max(0, y - s2);
      const y2 = Math.min(h - 1, y + s2);
      for (let x = 0; x < w; x++) {
        const x1 = Math.max(0, x - s2);
        const x2 = Math.min(w - 1, x + s2);
        const count = (x2 - x1) * (y2 - y1);

        // 積分画像から近傍領域の合計輝度をO(1)で取得
        const sum = integral[y2 * w + x2] - integral[y1 * w + x2] - integral[y2 * w + x1] + integral[y1 * w + x1];
        const currentVal = gray[y * w + x];

        // 閾値判定
        const isText = (currentVal * count) < (sum * (1.0 - t));
        const outVal = isText ? 0 : 255;

        const pIdx = (y * w + x) * 4;
        data[pIdx] = outVal;
        data[pIdx + 1] = outVal;
        data[pIdx + 2] = outVal;
        data[pIdx + 3] = 255;
      }
    }

    ctx.putImageData(imgData, 0, 0);
    return canvas;
  }

  /**
   * テキストまたはURLから日向坂46のシリアルナンバーらしき文字列を正規表現で抽出
   */
  extractSerialFromText(text) {
    if (!text) return null;
    const candidates = this.parseCandidateSerials(text);
    return candidates.bestCandidate;
  }

  /**
   * OCR抽出テキストからシリアル候補を複数抽出・スコアリング
   */
  parseCandidateSerials(rawText) {
    if (!rawText) return { bestCandidate: null, candidates: [] };

    const lines = rawText.split(/[\r\n]+/);
    const candidates = [];
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

    // 2. ちょうど14文字の連続英数字 (日向坂46公式仕様 最優先)
    const pExact14 = /\b[A-Z0-9]{14}\b/g;
    const mExact14 = fullTextUpper.match(pExact14);
    if (mExact14) {
      mExact14.forEach(c => {
        if (!candidates.some(cand => cand.code === c)) {
          candidates.push({ code: c, raw: c, score: 100 });
        }
      });
    }

    // 3. 行ごとに空白・記号を除去して「ちょうど14文字」になるもの
    // 例: OCRが途中にスペースを誤認した場合 ("A8B3 2K9M 4P7W 1X")
    lines.forEach(line => {
      const cleanLine = line.replace(/[^A-Z0-9]/gi, '').toUpperCase();
      if (cleanLine.length === 14 && !candidates.some(c => c.code === cleanLine)) {
        candidates.push({ code: cleanLine, raw: line.trim(), score: 98 });
      } else if (cleanLine.length > 14) {
        // 15文字以上ある場合（前後にゴミが付着）、14文字の部分文字列を抽出
        for (let i = 0; i <= cleanLine.length - 14; i++) {
          const sub = cleanLine.substring(i, i + 14);
          if (!candidates.some(c => c.code === sub)) {
            candidates.push({ code: sub, raw: line.trim(), score: 88 - i * 2 });
          }
        }
      } else if (cleanLine.length >= 12 && cleanLine.length <= 16 && !candidates.some(c => c.code === cleanLine)) {
        candidates.push({ code: cleanLine, raw: line.trim(), score: 70 });
      }
    });

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
