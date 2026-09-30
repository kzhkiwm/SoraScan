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

      // 英大文字・数字・ハイフンにホワイトリストを限定して精度を最大化
      await worker.setParameters({
        tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-',
        tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT
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
   * 現在のカメラプレビューまたは画像ファイルからOCR文字認識を実行
   * @param {HTMLImageElement|HTMLVideoElement|Blob|File} source
   * @param {Object} options
   */
  async captureAndRecognize(source = null, options = {}) {
    const targetSource = source || this.videoElement;
    if (!targetSource) throw new Error('解析対象の画像または映像がありません');

    this.onStatusChange({ status: 'processing', message: '画像を最適化・解析中...' });

    // 1. 画像のクロップ & 前処理（二値化・コントラスト強調）
    const processedCanvas = await this.preprocessImage(targetSource, options.cropToGuide !== false);

    // 2. OCRエンジンの準備
    const worker = await this.initTesseract(options.onProgress);

    // 3. OCR実行
    const result = await worker.recognize(processedCanvas);
    const rawText = result.data.text || '';
    const confidence = result.data.confidence;

    // 4. シリアルナンバー候補の抽出 & クリーニング
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

    // ガイド枠がある場合、その領域だけを切り抜いてOCR負荷軽減＆認識精度向上
    let sx = 0, sy = 0, sWidth = naturalW, sHeight = naturalH;
    
    if (cropToGuide && this.cropOverlayElement && this.videoElement) {
      const vRect = this.videoElement.getBoundingClientRect();
      const oRect = this.cropOverlayElement.getBoundingClientRect();

      if (vRect.width > 0 && vRect.height > 0) {
        const scaleX = naturalW / vRect.width;
        const scaleY = naturalH / vRect.height;

        sx = Math.max(0, (oRect.left - vRect.left) * scaleX);
        sy = Math.max(0, (oRect.top - vRect.top) * scaleY);
        sWidth = Math.min(naturalW - sx, oRect.width * scaleX);
        sHeight = Math.min(naturalH - sy, oRect.height * scaleY);
      }
    }

    // OCRに適した解像度にリサイズ（幅1000〜1600px程度が最も認識率が高い）
    const targetWidth = Math.max(800, Math.min(1600, sWidth));
    const targetHeight = Math.round(sHeight * (targetWidth / sWidth));

    canvas.width = targetWidth;
    canvas.height = targetHeight;

    // クロップ領域を描画
    ctx.drawImage(source, sx, sy, sWidth, sHeight, 0, 0, targetWidth, targetHeight);

    // 画像フィルタ（グレースケール & 二値化）
    const imgData = ctx.getImageData(0, 0, targetWidth, targetHeight);
    const data = imgData.data;

    // 輝度ヒストグラムの算出
    let minLum = 255;
    let maxLum = 0;
    const lums = new Uint8Array(data.length / 4);

    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      // Rec. 709 輝度計算
      const lum = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) | 0;
      lums[j] = lum;
      if (lum < minLum) minLum = lum;
      if (lum > maxLum) maxLum = lum;
    }

    // 適応的コントラスト強調 & 二値化 (Otsuベースの閾値)
    const range = Math.max(1, maxLum - minLum);
    const threshold = minLum + range * 0.48; // やや暗めを黒文字として判定

    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      const lum = lums[j];
      // 二値化：文字（暗い部分）を黒(0)、券面背景を白(255)
      const val = lum < threshold ? 0 : 255;
      data[i] = val;
      data[i + 1] = val;
      data[i + 2] = val;
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

    // 改行で分割して行ごとに探索
    const lines = rawText.split(/[\r\n]+/);
    const candidates = [];

    // パターン1: 4文字-4文字-4文字-4文字 (例: ABCD-1234-EFGH-5678)
    const p1 = /[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}/gi;
    // パターン2: 16桁連続英数字 (例: ABCD1234EFGH5678)
    const p2 = /\b[A-Z0-9]{16}\b/gi;
    // パターン3: 12〜15桁英数字
    const p3 = /\b[A-Z0-9]{12,15}\b/gi;
    // パターン4: URLクエリパラメータ (code=XXXX, serial=XXXX, token=XXXX)
    const pUrl = /[?&](?:code|serial|ticket|c)=([A-Z0-9\-]+)/i;

    // URLパターンのチェック
    const urlMatch = rawText.match(pUrl);
    if (urlMatch && urlMatch[1]) {
      const cleanUrlCode = urlMatch[1].replace(/[^A-Z0-9]/gi, '').toUpperCase();
      if (cleanUrlCode.length >= 8) {
        return {
          bestCandidate: cleanUrlCode,
          candidates: [{ code: cleanUrlCode, score: 100, source: 'url_param' }]
        };
      }
    }

    // 全文から正規表現マッチング
    const fullTextUpper = rawText.toUpperCase();
    
    // ハイフン区切りマッチ
    const m1 = fullTextUpper.match(p1);
    if (m1) {
      m1.forEach(c => {
        const clean = c.replace(/[^A-Z0-9]/g, '');
        candidates.push({ code: clean, raw: c, score: 95 });
      });
    }

    // 16桁マッチ
    const m2 = fullTextUpper.match(p2);
    if (m2) {
      m2.forEach(c => {
        if (!candidates.some(cand => cand.code === c)) {
          candidates.push({ code: c, raw: c, score: 90 });
        }
      });
    }

    // 行ごとのスペース区切り対応（例: "ABCD 1234 EFGH 5678" のようにスペースが入ってしまった場合）
    lines.forEach(line => {
      const cleanLine = line.replace(/[^A-Z0-9]/gi, '').toUpperCase();
      if (cleanLine.length === 16 && !candidates.some(c => c.code === cleanLine)) {
        candidates.push({ code: cleanLine, raw: line.trim(), score: 85 });
      } else if (cleanLine.length >= 12 && cleanLine.length <= 15 && !candidates.some(c => c.code === cleanLine)) {
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
