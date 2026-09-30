/**
 * SoraScan - Sample Ticket Simulator
 * 日向坂46スペシャル応募券の模擬プレビュー生成 & テスト用スキャン機能
 */

export const TicketSimulator = {
  /**
   * ランダムな14文字シリアルコード（英大文字・数字・ハイフンなし）を生成
   */
  generateRandomSerial() {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let result = '';
    for (let i = 0; i < 14; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  },

  /**
   * リアルな日向坂46応募シリアル券の画像をCanvasに描画（実物券面デザイン完全準拠）
   * @param {Object} options
   * @returns {HTMLCanvasElement}
   */
  async renderTicket(options = {}) {
    const serial = options.serial || this.generateRandomSerial();
    const type = options.type || '初回仕様限定盤 TYPE-A';
    const singleTitle = options.singleTitle || '日向坂46 18thシングル\n『イチャイチャ虫』発売記念';
    const applyUrl = options.applyUrl || 'https://ticket.fortunemeets.app/hinatazaka46/18th';
    const period = options.period || '2026年9月30日(水) 10:00〜2026年11月30日(月) 23:59まで';

    const canvas = document.createElement('canvas');
    const width = 1000;
    const height = 980; // 実物券面のほぼ正方形に近いプロポーション
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // 1. 券面台紙背景（クリーンな白地）
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);

    // 外枠（実物のマージン）
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    ctx.strokeRect(20, 20, width - 40, height - 40);

    // 2. 上部【黒背景・白抜き文字ヘッダー帯】（実物券面最大の特徴）
    const headerX = 40;
    const headerY = 40;
    const headerW = width - 80;
    const headerH = 180;

    ctx.fillStyle = '#111827'; // 重厚なブラック
    ctx.fillRect(headerX, headerY, headerW, headerH);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFFFFF';

    // 1行目: 日向坂46 18thシングル
    ctx.font = 'bold 36px "Noto Sans JP", sans-serif';
    ctx.fillText('日向坂46 18thシングル', width / 2, headerY + 52);

    // 2行目: 『イチャイチャ虫』発売記念
    ctx.font = 'bold 44px "Noto Sans JP", sans-serif';
    ctx.fillText('『イチャイチャ虫』発売記念', width / 2, headerY + 110);

    // 3行目: スペシャル抽選応募シリアルナンバー
    ctx.font = 'bold 30px "Noto Sans JP", sans-serif';
    ctx.fillText('スペシャル抽選応募シリアルナンバー', width / 2, headerY + 158);

    // 3. 本文説明文
    ctx.textAlign = 'left';
    ctx.fillStyle = '#1F2937';
    ctx.font = '16px "Noto Sans JP", sans-serif';

    const descY = 250;
    const textLines = [
      `この度は、日向坂46の18thシングル【${type}】をお買い上げいただき、誠にありがとうございます。`,
      '本抽選応募シリアルナンバー1枚につき1回、スペシャル応募企画にご応募いただけます。詳しい',
      '内容や応募に関しては、下記アドレスにアクセスしてご確認ください。また応募の際は、記載の',
      '「シリアルナンバー」と必要事項を入力してください。当選に関しては、特典内容により発表方法',
      'が異なりますので、必ず下記アドレスにてご確認ください。たくさんのご応募お待ちしております。',
      'スペシャル抽選応募の詳細は、日向坂46オフィシャルホームページ内特設サイトをご確認ください！'
    ];

    textLines.forEach((line, idx) => {
      ctx.fillText(line, 44, descY + idx * 28);
    });

    // 4. 特設応募URLの強調表示（実物同様）
    const urlY = 445;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 32px "Courier New", monospace, sans-serif';
    ctx.fillText(applyUrl, width / 2, urlY);

    ctx.font = '16px "Noto Sans JP", sans-serif';
    ctx.fillStyle = '#4B5563';
    ctx.fillText('(PC/スマートフォン/タブレット共通)', width / 2, urlY + 32);

    // 5. 《応募期間》ブラックリボン
    const periodY = 515;
    ctx.fillStyle = '#111827';
    ctx.fillRect(40, periodY, width - 80, 48);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 20px "Noto Sans JP", sans-serif';
    ctx.fillText(`《応募期間》${period}`, width / 2, periodY + 32);

    // 6. 下部【シリアルナンバー枠】（実物同様の二重構造）
    const boxX = 40;
    const boxY = 600;
    const boxW = width - 80;
    const boxH = 240;

    // 白枠背景 & ボーダー
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(boxX, boxY, boxW, boxH);

    // 左上ラベル
    ctx.textAlign = 'left';
    ctx.fillStyle = '#1F2937';
    ctx.font = 'bold 15px "Noto Sans JP", sans-serif';
    ctx.fillText('シリアルナンバー', boxX + 24, boxY + 36);

    // 14文字シリアル本体（大文字・字間あり）
    const formattedSerial = serial.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 52px "Courier New", monospace, sans-serif';
    ctx.letterSpacing = '6px';
    ctx.fillText(formattedSerial, boxX + 24, boxY + 120);

    // 7. QRコード（シリアル枠内の右側）
    const qrSize = 190;
    const qrX = boxX + boxW - qrSize - 20;
    const qrY = boxY + 25;

    // QR枠線
    ctx.strokeStyle = '#9CA3AF';
    ctx.lineWidth = 1;
    ctx.strokeRect(qrX - 10, qrY - 10, qrSize + 20, qrSize + 20);

    if (window.QRCode && window.QRCode.toCanvas) {
      const qrCanvas = document.createElement('canvas');
      await window.QRCode.toCanvas(qrCanvas, applyUrl, {
        width: qrSize,
        margin: 0,
        color: { dark: '#111827', light: '#FFFFFF' }
      });
      ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);
    } else {
      // フォールバック
      ctx.fillStyle = '#111827';
      ctx.fillRect(qrX, qrY, qrSize, qrSize);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('QR CODE', qrX + qrSize / 2, qrY + qrSize / 2);
    }

    // 8. 券面最下部の注意書き
    ctx.textAlign = 'center';
    ctx.fillStyle = '#4B5563';
    ctx.font = '14px "Noto Sans JP", sans-serif';
    ctx.fillText('※裏面の注意事項もご確認ください', width / 2, height - 40);

    return canvas;
  }
};
