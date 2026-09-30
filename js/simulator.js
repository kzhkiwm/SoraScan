/**
 * SoraScan - Sample Ticket Simulator
 * 日向坂46スペシャル応募券の模擬プレビュー生成 & テスト用スキャン機能
 */

export const TicketSimulator = {
  /**
   * ランダムな16桁シリアルコード（4桁×4ブロック）を生成
   */
  generateRandomSerial() {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // 紛らわしい 0, O, 1, I を除外した本格的なコード体系
    let result = '';
    for (let i = 0; i < 16; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  },

  /**
   * リアルな日向坂46応募シリアル券の画像をCanvasに描画
   * @param {Object} options
   * @returns {HTMLCanvasElement}
   */
  async renderTicket(options = {}) {
    const serial = options.serial || this.generateRandomSerial();
    const type = options.type || '初回仕様限定盤 Type-A';
    const singleTitle = options.singleTitle || '13th Single「卒業写真だけが知ってる」';

    const canvas = document.createElement('canvas');
    const width = 1000;
    const height = 560; // 黄金比に近い横長カード
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // 1. 背景（日向坂46 スカイブルーの爽やかなグラデーション）
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, '#E8F7FE');
    grad.addColorStop(0.3, '#BAE6FD');
    grad.addColorStop(1, '#7CC7E8');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // 2. 装飾ライン・幾何学模様
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 3;
    ctx.strokeRect(20, 20, width - 40, height - 40);

    // 斜めスカイブルーアクセント
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(260, 0);
    ctx.lineTo(140, height);
    ctx.lineTo(0, height);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.fill();

    // 3. タイトルヘッダー
    ctx.fillStyle = '#0B6EBA';
    ctx.font = 'bold 24px "Noto Sans JP", sans-serif';
    ctx.fillText('日向坂46', 44, 64);

    ctx.fillStyle = '#1E293B';
    ctx.font = 'bold 22px "Noto Sans JP", sans-serif';
    ctx.fillText(singleTitle, 160, 64);

    // 4. サブヘッダーバッジ
    ctx.fillStyle = '#0B6EBA';
    ctx.beginPath();
    ctx.roundRect(44, 88, 380, 36, 6);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 18px "Noto Sans JP", sans-serif';
    ctx.fillText('スペシャル抽選応募シリアルナンバー', 58, 113);

    ctx.fillStyle = '#D97706';
    ctx.font = 'bold 16px "Noto Sans JP", sans-serif';
    ctx.fillText(`【${type}】封入特典`, 440, 113);

    // 5. シリアルナンバー表示ボックス（OCRのメインターゲット）
    const boxX = 44;
    const boxY = 145;
    const boxW = 600;
    const boxH = 140;

    // 白背景カード
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = 'rgba(0, 40, 80, 0.15)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 4;
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 12);
    ctx.fill();

    // シャドウリセット
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = '#0B6EBA';
    ctx.lineWidth = 2;
    ctx.stroke();

    // ボックス内ラベル
    ctx.fillStyle = '#64748B';
    ctx.font = 'bold 14px "Noto Sans JP", sans-serif';
    ctx.fillText('▼ シリアルコード（英数字16桁）', boxX + 24, boxY + 36);

    // シリアルナンバー本体（4桁ハイフン区切り）
    const formattedSerial = serial.match(/.{1,4}/g).join('-');
    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 44px "Courier New", monospace, sans-serif';
    ctx.letterSpacing = '3px';
    ctx.fillText(formattedSerial, boxX + 24, boxY + 95);

    // 6. QRコード領域
    const qrSize = 160;
    const qrX = 720;
    const qrY = 135;

    // QR枠
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.roundRect(qrX - 10, qrY - 10, qrSize + 20, qrSize + 20, 10);
    ctx.fill();

    // QRコードのURL: 日向坂46特設応募サイト形式
    const targetUrl = `https://ticket.fortunemusic.app/hinata46/serial/?code=${serial}`;
    
    if (window.QRCode && window.QRCode.toCanvas) {
      const qrCanvas = document.createElement('canvas');
      await window.QRCode.toCanvas(qrCanvas, targetUrl, {
        width: qrSize,
        margin: 0,
        color: { dark: '#0C1A30', light: '#FFFFFF' }
      });
      ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);
    } else {
      // フォールバック: QRコード風モザイクパターン
      ctx.fillStyle = '#1E293B';
      ctx.fillRect(qrX, qrY, qrSize, qrSize);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '14px sans-serif';
      ctx.fillText('QR CODE', qrX + 45, qrY + 85);
    }

    ctx.fillStyle = '#475569';
    ctx.font = '12px "Noto Sans JP", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('スマートフォンで', qrX + qrSize / 2, qrY + qrSize + 26);
    ctx.fillText('読み取り応募も可能', qrX + qrSize / 2, qrY + qrSize + 42);
    ctx.textAlign = 'left';

    // 7. 応募規約・説明文
    ctx.fillStyle = '#334155';
    ctx.font = '13px "Noto Sans JP", sans-serif';
    ctx.fillText('【応募方法・注意事項】', 44, 330);
    ctx.font = '12px "Noto Sans JP", sans-serif';
    ctx.fillStyle = '#475569';
    ctx.fillText('1. 上記シリアルコードまたはQRコードから特設応募サイトへアクセスしてください。', 44, 355);
    ctx.fillText('2. 1つのシリアルコードにつき、1回のみご応募いただけます。（重複応募不可）', 44, 375);
    ctx.fillText('3. 応募期間を過ぎたシリアルコードは理由の如何を問わず無効となります。', 44, 395);
    ctx.fillText('4. シリアルコードの転売・譲渡は固く禁止いたします。', 44, 415);

    // 8. フッター
    ctx.fillStyle = '#0B6EBA';
    ctx.font = 'bold 13px "Noto Sans JP", sans-serif';
    ctx.fillText('Sony Music Labels Inc. / Seed & Flower LLC', 44, 470);

    ctx.fillStyle = '#DC2626';
    ctx.font = 'bold 13px "Noto Sans JP", sans-serif';
    ctx.fillText('★ 応募締切: 2026年11月30日(月) 23:59まで', 540, 470);

    return canvas;
  }
};
