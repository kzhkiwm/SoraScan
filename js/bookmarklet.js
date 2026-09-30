/**
 * SoraScan Bookmarklet Generator & Auto-Apply Assistant
 * 
 * 日向坂46公式シリアル応募サイト（ticket.fortunemeets.app / forTUNE meets）
 * および模擬応募サイトに完全対応したモバイル特化型自動登録ブックマークレット生成エンジン。
 * 
 * 【forTUNE meets 公式仕様対応】
 * - 入力枠: #inputSerial1, #inputSerial2, #inputSerial3 ... #inputSerial10
 * - 枠追加: 「＋ 入力枠を追加」ボタンの自動クリック（最大10枠一括登録対応）
 * - React仮想DOM値注入: nativeValueSetter + input/change イベント強制バブリング
 * - 登録ボタン: 「シリアルナンバー登録」ボタンの自動検知と活性化クリック
 * - 完了検知 & エラー検知（無効シリアルの停止保護）
 */

export class BookmarkletEngine {
  /**
   * 未応募シリアル配列と作品情報を元に、応募サイトで実行可能なブックマークレットコード（javascript: URL）を生成
   * @param {Array<{serial: string, id?: string}>} serials - 未応募シリアルの配列
   * @param {Object} campaignInfo - 作品情報（title, applyUrl等）
   * @returns {string} `javascript:(...)` 形式の実行コード
   */
  static generateCode(serials = [], campaignInfo = {}) {
    const serialList = serials.map(s => (typeof s === 'string' ? s : s.serial).trim().toUpperCase());
    const campaignTitle = campaignInfo.shortTitle || campaignInfo.title || '対象作品';
    const jsonList = JSON.stringify(serialList);

    const runnerCode = `(function() {
  if (window.__SORASCAN_BOOKMARKLET_ACTIVE__) {
    const existing = document.getElementById('sorascan-floating-bar');
    if (existing) {
      existing.style.display = 'block';
      existing.scrollIntoView({ behavior: 'smooth', block: 'end' });
      alert('☀️ SoraScan 自動登録バーは既に起動しています');
      return;
    }
  }
  window.__SORASCAN_BOOKMARKLET_ACTIVE__ = true;

  const serialsQueue = ${jsonList};
  const campTitle = ${JSON.stringify(campaignTitle)};
  let currentIndex = 0;
  let isAutoRunning = false;
  let autoTimer = null;
  const appliedSerials = [];

  // スタイルの注入
  const styleEl = document.createElement('style');
  styleEl.id = 'sorascan-bookmarklet-styles';
  styleEl.textContent = \`
    #sorascan-floating-bar {
      position: fixed;
      bottom: 12px;
      left: 50%;
      transform: translateX(-50%);
      width: calc(100% - 20px);
      max-width: 500px;
      background: rgba(15, 23, 42, 0.94);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1.5px solid rgba(124, 199, 232, 0.6);
      border-radius: 18px;
      padding: 12px 14px;
      box-shadow: 0 12px 36px rgba(0, 0, 0, 0.7), 0 0 24px rgba(124, 199, 232, 0.25);
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Zen Kaku Gothic New", "Segoe UI", Roboto, sans-serif;
      z-index: 9999999;
      box-sizing: border-box;
      transition: all 0.3s ease;
    }
    #sorascan-floating-bar.minimized {
      padding: 6px 14px;
      width: auto;
      border-radius: 24px;
    }
    #sorascan-floating-bar * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    .ss-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }
    .ss-title-row {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.84rem;
      font-weight: 700;
      color: #7cc7e8;
    }
    .ss-count-badge {
      background: rgba(124, 199, 232, 0.2);
      color: #7cc7e8;
      border: 1px solid rgba(124, 199, 232, 0.4);
      padding: 1px 7px;
      border-radius: 12px;
      font-size: 0.72rem;
      font-weight: 700;
    }
    .ss-controls-top {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .ss-icon-btn {
      background: rgba(255, 255, 255, 0.1);
      border: none;
      color: #94a3b8;
      width: 26px;
      height: 26px;
      border-radius: 50%;
      cursor: pointer;
      font-size: 0.8rem;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s;
    }
    .ss-icon-btn:hover {
      background: rgba(255, 255, 255, 0.2);
      color: #ffffff;
    }
    .ss-body {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .ss-current-card {
      background: rgba(0, 0, 0, 0.45);
      border: 1px dashed rgba(124, 199, 232, 0.35);
      border-radius: 10px;
      padding: 8px 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .ss-serial-text {
      font-family: monospace;
      font-size: 1.05rem;
      font-weight: 700;
      color: #ffffff;
      letter-spacing: 1.5px;
    }
    .ss-actions-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .ss-btn {
      height: 42px;
      border-radius: 10px;
      font-size: 0.86rem;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      border: none;
      transition: all 0.2s ease;
    }
    .ss-btn-batch {
      background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
      color: #ffffff;
      box-shadow: 0 4px 12px rgba(2, 132, 199, 0.3);
    }
    .ss-btn-batch:hover {
      background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);
    }
    .ss-btn-auto {
      background: linear-gradient(135deg, #10b981 0%, #047857 100%);
      color: #ffffff;
      box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
    }
    .ss-btn-auto.active {
      background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%);
      animation: ss-pulse 1.5s infinite;
    }
    .ss-status-msg {
      font-size: 0.74rem;
      color: #94a3b8;
      text-align: center;
      line-height: 1.4;
      min-height: 18px;
    }
    @keyframes ss-pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.88; transform: scale(0.98); }
    }
  \`;
  document.head.appendChild(styleEl);

  const bar = document.createElement('div');
  bar.id = 'sorascan-floating-bar';

  function render() {
    const total = serialsQueue.length;
    const remaining = total - currentIndex;
    const currentCode = serialsQueue[currentIndex] || 'すべて登録完了！';

    if (remaining <= 0) {
      bar.innerHTML = \`
        <div class="ss-header">
          <div class="ss-title-row">
            <span>☀️ SoraScan 自動登録</span>
            <span class="ss-count-badge">全件完了！</span>
          </div>
          <button class="ss-icon-btn" id="ss-btn-close">✕</button>
        </div>
        <div class="ss-body">
          <div class="ss-current-card" style="justify-content:center; color:#34d399; font-weight:700;">
            🎉 すべてのシリアル（\${total}件）を処理しました！
          </div>
          <button class="ss-btn ss-btn-batch" id="ss-btn-finish">
            完了シリアルをコピーして閉じる
          </button>
        </div>
      \`;
      attachDoneEvents();
      return;
    }

    const nextBatchCount = Math.min(10, remaining);

    bar.innerHTML = \`
      <div class="ss-header">
        <div class="ss-title-row">
          <span>☀️ SoraScan</span>
          <span class="ss-count-badge">残 \${remaining} / 計 \${total} 件</span>
          <span style="font-size:0.7rem; color:#94a3b8; max-width:130px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">\${campTitle}</span>
        </div>
        <div class="ss-controls-top">
          <button class="ss-icon-btn" id="ss-btn-minimize" title="最小化">_</button>
          <button class="ss-icon-btn" id="ss-btn-close" title="閉じる">✕</button>
        </div>
      </div>

      <div class="ss-body" id="ss-body-content">
        <div class="ss-current-card">
          <span class="ss-serial-text">\${formatCode(currentCode)}</span>
          <span style="font-size:0.72rem; color:#7cc7e8; cursor:pointer;" id="ss-btn-skip">スキップ ↷</span>
        </div>

        <div class="ss-actions-grid">
          <button class="ss-btn ss-btn-batch" id="ss-btn-batch" title="最大10件の入力枠にシリアルを一括注入して送信">
            ⚡ \${nextBatchCount}件を一括登録
          </button>
          <button class="ss-btn ss-btn-auto \${isAutoRunning ? 'active' : ''}" id="ss-btn-auto">
            \${isAutoRunning ? '⏹ 連続停止' : '🚀 全自動連続登録'}
          </button>
        </div>

        <div class="ss-status-msg" id="ss-status-msg">
          \${isAutoRunning ? '🔄 自動登録実行中... (完了検知後に次へ)' : '「一括登録」で最大10件を瞬時に登録できます'}
        </div>
      </div>
    \`;
    attachActiveEvents();
  }

  function formatCode(str) {
    if (!str || str.length !== 14) return str;
    return str.substring(0, 4) + '-' + str.substring(4, 8) + '-' + str.substring(8, 12) + '-' + str.substring(12);
  }

  function setStatus(msg, isError = false) {
    const el = document.getElementById('ss-status-msg');
    if (el) {
      el.style.color = isError ? '#f87171' : '#7cc7e8';
      el.textContent = msg;
    }
  }

  // ページ内のシリアル入力フィールド一覧を取得（forTUNE meets仕様: #inputSerial1, #inputSerial2...）
  function getAllInputFields() {
    // 1. 公式ID指定
    const officialInputs = Array.from(document.querySelectorAll('input[id^="inputSerial"], input[name^="inputSerial"]'));
    if (officialInputs.length > 0) return officialInputs;

    // 2. 汎用フォールバック
    return Array.from(document.querySelectorAll('input#serial_code, input[name*="serial" i], input[type="text"]:not([readonly]):not([type="hidden"])'));
  }

  // 「＋ 入力枠を追加」ボタンを取得
  function getAddInputButton() {
    const buttons = Array.from(document.querySelectorAll('button'));
    return buttons.find(b => b.textContent.includes('入力枠を追加')) || null;
  }

  // 登録ボタンを取得（「シリアルナンバー登録」）
  function getSubmitButton() {
    // 公式クラス・テキスト
    const buttons = Array.from(document.querySelectorAll('button, input[type="submit"]'));
    return buttons.find(b => {
      const text = b.textContent.trim();
      return text.includes('シリアルナンバー登録') || text.includes('登録する') || text.includes('応募する');
    }) || document.getElementById('btnSubmitSerial') || document.querySelector('button[type="submit"]');
  }

  // 入力フィールドに値を注入（ReactのvalueTrackerバイパス & input/changeイベント強制発火）
  function setInputValue(input, value) {
    input.focus();
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    if (nativeSetter) {
      nativeSetter.call(input, value);
    } else {
      input.value = value;
    }
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // 最大10件の一括登録を実行（forTUNE meets の複数枠仕様に完全対応！）
  async function executeBatchStep() {
    const remaining = serialsQueue.length - currentIndex;
    if (remaining <= 0) return false;

    const countToApply = Math.min(10, remaining);
    const codesToApply = serialsQueue.slice(currentIndex, currentIndex + countToApply);

    setStatus(\`⏳ \${countToApply}件の入力枠を準備中...\`);

    // 必要に応じて「＋ 入力枠を追加」を連打して枠数を増やす（公式仕様: 最大10枠まで）
    let inputs = getAllInputFields();
    const addBtn = getAddInputButton();

    if (addBtn && inputs.length < countToApply) {
      const neededClicks = countToApply - inputs.length;
      for (let i = 0; i < neededClicks; i++) {
        addBtn.click();
        await new Promise(r => setTimeout(r, 60));
      }
      // 再取得
      inputs = getAllInputFields();
    }

    if (inputs.length === 0) {
      // 登録完了画面にいる場合は、「シリアルナンバー登録」リンクで戻るかチェック
      const regLink = document.querySelector('a[href*="/registration"], a.button.round.green');
      if (regLink && regLink.textContent.includes('登録')) {
        setStatus('🔄 登録ページへ遷移中...');
        regLink.click();
        setTimeout(() => executeBatchStep(), 1000);
        return true;
      }
      setStatus('⚠️ シリアル入力枠が見つかりません。シリアル登録画面を開いてください', true);
      stopAutoRun();
      return false;
    }

    // 各入力枠にシリアルを順次注入
    for (let i = 0; i < codesToApply.length; i++) {
      const targetInput = inputs[i];
      if (targetInput) {
        setInputValue(targetInput, codesToApply[i]);
      }
    }

    setStatus(\`✍️ \${countToApply}件のシリアルを入力しました。登録ボタンを押します...\`);

    // 少し待機してReactの状態更新を待つ
    await new Promise(r => setTimeout(r, 300));

    const submitBtn = getSubmitButton();
    if (!submitBtn) {
      setStatus('⚠️ 登録ボタンが見つかりません。手動で押してください', true);
      stopAutoRun();
      return false;
    }

    // 送信ボタンをクリック
    submitBtn.click();

    // 成功記録
    appliedSerials.push(...codesToApply);
    currentIndex += countToApply;
    render();

    if (isAutoRunning) {
      setStatus('⏳ サーバーの応答を待機中...');
      waitForResponseAndNext();
    } else {
      setStatus(\`✅ \${countToApply}件の登録リクエストを送信しました！\`);
    }

    return true;
  }

  // サーバー完了検知および次バッチへの自動進行
  function waitForResponseAndNext() {
    let checkCount = 0;
    const maxChecks = 40; // 最大8秒待機

    const interval = setInterval(() => {
      checkCount++;
      const text = document.body.innerText;
      
      const isSuccess = text.includes('登録が完了') || 
                        text.includes('登録しました') || 
                        text.includes('受付を完了') ||
                        document.querySelector('#resultBox.success, .alert-success') !== null;

      const isError = text.includes('無効なシリアル') || 
                      text.includes('既に使用') || 
                      text.includes('エラーが発生しました') ||
                      document.querySelector('#resultBox.error, .modal-overlay.error') !== null;

      if (isSuccess || isError || checkCount >= maxChecks) {
        clearInterval(interval);
        if (isError) {
          setStatus('⚠️ エラーを検知したため自動進行を停止しました。画面を確認してください', true);
          stopAutoRun();
          return;
        }

        // 次のバッチへ（2秒の安全待機）
        autoTimer = setTimeout(async () => {
          if (isAutoRunning && currentIndex < serialsQueue.length) {
            // もし完了画面なら「シリアルナンバー登録」リンクを押して入力画面へ戻る
            const regLink = document.querySelector('a[href*="/registration"], a.button.round');
            if (regLink && (regLink.textContent.includes('シリアルナンバー登録') || regLink.textContent.includes('続けて登録') || regLink.textContent.includes('戻る'))) {
              regLink.click();
              await new Promise(r => setTimeout(r, 800));
            }
            executeBatchStep();
          } else {
            stopAutoRun();
          }
        }, 2000);
      }
    }, 200);
  }

  function startAutoRun() {
    isAutoRunning = true;
    render();
    executeBatchStep();
  }

  function stopAutoRun() {
    isAutoRunning = false;
    if (autoTimer) clearTimeout(autoTimer);
    render();
  }

  function attachActiveEvents() {
    const btnBatch = document.getElementById('ss-btn-batch');
    if (btnBatch) btnBatch.addEventListener('click', () => executeBatchStep());

    const btnAuto = document.getElementById('ss-btn-auto');
    if (btnAuto) {
      btnAuto.addEventListener('click', () => {
        if (isAutoRunning) stopAutoRun();
        else startAutoRun();
      });
    }

    const btnSkip = document.getElementById('ss-btn-skip');
    if (btnSkip) {
      btnSkip.addEventListener('click', () => {
        currentIndex++;
        render();
      });
    }

    const btnMinimize = document.getElementById('ss-btn-minimize');
    if (btnMinimize) {
      btnMinimize.addEventListener('click', () => {
        const body = document.getElementById('ss-body-content');
        if (body.style.display === 'none') {
          body.style.display = 'flex';
          btnMinimize.textContent = '_';
          bar.classList.remove('minimized');
        } else {
          body.style.display = 'none';
          btnMinimize.textContent = '□';
          bar.classList.add('minimized');
        }
      });
    }

    const btnClose = document.getElementById('ss-btn-close');
    if (btnClose) {
      btnClose.addEventListener('click', () => {
        stopAutoRun();
        bar.remove();
        styleEl.remove();
        window.__SORASCAN_BOOKMARKLET_ACTIVE__ = false;
      });
    }
  }

  function attachDoneEvents() {
    const btnFinish = document.getElementById('ss-btn-finish');
    if (btnFinish) {
      btnFinish.addEventListener('click', () => {
        const text = appliedSerials.join('\\n');
        if (navigator.clipboard) {
          navigator.clipboard.writeText(text).then(() => {
            alert('🎉 登録完了したシリアル（' + appliedSerials.length + '件）をクリップボードにコピーしました！\\nSoraScanに戻って「応募済みに更新」できます。');
            bar.remove();
            styleEl.remove();
            window.__SORASCAN_BOOKMARKLET_ACTIVE__ = false;
          });
        } else {
          alert('登録完了: ' + appliedSerials.length + '件');
          bar.remove();
          styleEl.remove();
          window.__SORASCAN_BOOKMARKLET_ACTIVE__ = false;
        }
      });
    }

    const btnClose = document.getElementById('ss-btn-close');
    if (btnClose) {
      btnClose.addEventListener('click', () => {
        bar.remove();
        styleEl.remove();
        window.__SORASCAN_BOOKMARKLET_ACTIVE__ = false;
      });
    }
  }

  document.body.appendChild(bar);
  render();
})();`;

    return 'javascript:' + encodeURIComponent(runnerCode);
  }
}
