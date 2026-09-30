/**
 * SoraScan Bookmarklet Generator & Auto-Apply Assistant
 * 
 * 日向坂46・坂道グループのCDシリアル応募サイト（forTUNE meets / 模擬応募サイト等）において、
 * シリアルの自動入力・送信・連続自動登録を行うモバイル対応ブックマークレットの生成モジュール。
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

    // ブックマークレット本体のロジック（UI構築、フォーム検知、自動入力、連続送信）
    const runnerCode = `(function() {
  if (window.__SORASCAN_BOOKMARKLET_ACTIVE__) {
    const existing = document.getElementById('sorascan-floating-bar');
    if (existing) {
      existing.style.display = 'block';
      existing.scrollIntoView({ behavior: 'smooth', block: 'end' });
      alert('SoraScan 自動登録バーは既に起動しています');
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
      width: calc(100% - 24px);
      max-width: 480px;
      background: rgba(15, 23, 42, 0.92);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1.5px solid rgba(124, 199, 232, 0.5);
      border-radius: 16px;
      padding: 12px 14px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6), 0 0 20px rgba(124, 199, 232, 0.2);
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      z-index: 9999999;
      box-sizing: border-box;
      transition: all 0.3s ease;
    }
    #sorascan-floating-bar.minimized {
      padding: 6px 12px;
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
      font-size: 0.82rem;
      font-weight: 700;
      color: #7cc7e8;
    }
    .ss-count-badge {
      background: rgba(124, 199, 232, 0.2);
      color: #7cc7e8;
      border: 1px solid rgba(124, 199, 232, 0.4);
      padding: 1px 6px;
      border-radius: 10px;
      font-size: 0.72rem;
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
      width: 24px;
      height: 24px;
      border-radius: 50%;
      cursor: pointer;
      font-size: 0.75rem;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .ss-body {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .ss-current-card {
      background: rgba(0, 0, 0, 0.4);
      border: 1px dashed rgba(124, 199, 232, 0.3);
      border-radius: 8px;
      padding: 8px 10px;
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
      height: 40px;
      border-radius: 8px;
      font-size: 0.85rem;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      border: none;
      transition: all 0.2s ease;
    }
    .ss-btn-primary {
      background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
      color: #ffffff;
    }
    .ss-btn-auto {
      background: linear-gradient(135deg, #10b981 0%, #047857 100%);
      color: #ffffff;
    }
    .ss-btn-auto.active {
      background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%);
      animation: ss-pulse 1.5s infinite;
    }
    .ss-btn-secondary {
      background: rgba(255, 255, 255, 0.1);
      color: #e2e8f0;
      border: 1px solid rgba(255, 255, 255, 0.15);
    }
    .ss-status-msg {
      font-size: 0.72rem;
      color: #94a3b8;
      text-align: center;
      line-height: 1.3;
      min-height: 16px;
    }
    @keyframes ss-pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.85; transform: scale(0.98); }
    }
  \`;
  document.head.appendChild(styleEl);

  // フローティングバーのDOM生成
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
            <span class="ss-count-badge">完了</span>
          </div>
          <button class="ss-icon-btn" id="ss-btn-close">✕</button>
        </div>
        <div class="ss-body">
          <div class="ss-current-card" style="justify-content:center; color:#34d399; font-weight:700;">
            🎉 すべてのシリアル（\${total}件）を処理しました！
          </div>
          <button class="ss-btn ss-btn-primary" id="ss-btn-finish">
            完了シリアルをコピーして閉じる
          </button>
        </div>
      \`;
      attachDoneEvents();
      return;
    }

    bar.innerHTML = \`
      <div class="ss-header">
        <div class="ss-title-row">
          <span>☀️ SoraScan</span>
          <span class="ss-count-badge">\${currentIndex + 1} / \${total} 件</span>
          <span style="font-size:0.7rem; color:#94a3b8; max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">\${campTitle}</span>
        </div>
        <div class="ss-controls-top">
          <button class="ss-icon-btn" id="ss-btn-minimize" title="最小化">_</button>
          <button class="ss-icon-btn" id="ss-btn-close" title="閉じる">✕</button>
        </div>
      </div>

      <div class="ss-body" id="ss-body-content">
        <div class="ss-current-card">
          <span class="ss-serial-text">\${formatCode(currentCode)}</span>
          <span style="font-size:0.7rem; color:#7cc7e8; cursor:pointer;" id="ss-btn-skip">スキップ ↷</span>
        </div>

        <div class="ss-actions-grid">
          <button class="ss-btn ss-btn-primary" id="ss-btn-step">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
            入力して送信
          </button>
          <button class="ss-btn ss-btn-auto \${isAutoRunning ? 'active' : ''}" id="ss-btn-auto">
            \${isAutoRunning ? '⏹ 連続登録 停止' : '⚡ 連続自動登録'}
          </button>
        </div>

        <div class="ss-status-msg" id="ss-status-msg">
          \${isAutoRunning ? '🔄 自動登録実行中... (1.5秒間隔)' : '「入力して送信」または「連続自動登録」を押してください'}
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

  // ページ内のシリアル入力フィールドを自動検出
  function findInputField() {
    const selectors = [
      'input#serial_code',
      'input[name="serial_code"]',
      'input[name*="serial" i]',
      'input[id*="serial" i]',
      'input[placeholder*="シリアル" i]',
      'input[name*="code" i]',
      'input[id*="code" i]',
      'input[type="text"]:not([readonly]):not([type="hidden"])'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null) return el;
    }
    return null;
  }

  // ページ内の送信ボタンを自動検出
  function findSubmitButton(form) {
    const selectors = [
      'button#btnSubmitSerial',
      'button[type="submit"]',
      'input[type="submit"]',
      'button[class*="submit" i]',
      'button[class*="apply" i]'
    ];
    if (form) {
      for (const sel of selectors) {
        const el = form.querySelector(sel);
        if (el && el.offsetParent !== null) return el;
      }
    }
    // ボタンのテキスト内容から探す
    const buttons = Array.from(document.querySelectorAll('button, a.btn, input[type="button"]'));
    for (const b of buttons) {
      const text = b.textContent.trim();
      if ((text.includes('登録') || text.includes('応募') || text.includes('送信')) && b.offsetParent !== null) {
        return b;
      }
    }
    return null;
  }

  // 入力フィールドに値を注入し、React/Vue等の仮想DOMにも認識させる
  function injectSerial(input, serial) {
    input.focus();
    // Reactのvalueトラッカーをバイパス
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    if (nativeSetter) {
      nativeSetter.call(input, serial);
    } else {
      input.value = serial;
    }
    // 入力イベント発火
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // 1件を登録実行
  function executeCurrentStep() {
    const currentCode = serialsQueue[currentIndex];
    if (!currentCode) return false;

    const input = findInputField();
    if (!input) {
      setStatus('⚠️ シリアル入力欄が見つかりません', true);
      stopAutoRun();
      return false;
    }

    injectSerial(input, currentCode);
    setStatus(\`✍️ \${currentCode} を入力しました\`);

    const submitBtn = findSubmitButton(input.form);
    if (!submitBtn) {
      setStatus('⚠️ 送信ボタンが見つかりません。手動で押してください。', true);
      stopAutoRun();
      return false;
    }

    // ボタンクリック
    setTimeout(() => {
      submitBtn.click();
      appliedSerials.push(currentCode);
      currentIndex++;
      render();

      if (isAutoRunning) {
        setStatus('⏳ 送信完了を待機中...');
        waitForResponseAndNext();
      }
    }, 400);

    return true;
  }

  // 送信後の画面応答を待機して次のシリアルへ進む
  function waitForResponseAndNext() {
    let checkCount = 0;
    const maxChecks = 25; // 最大5秒待機

    const interval = setInterval(() => {
      checkCount++;
      const resultBox = document.querySelector('#resultBox, .result-box, .alert-success, .complete-message');
      const pageText = document.body.innerText;
      
      const isSuccess = (resultBox && resultBox.classList.contains('success')) || 
                        pageText.includes('登録が完了') || 
                        pageText.includes('登録しました') || 
                        pageText.includes('受付を完了');

      const isError = (resultBox && resultBox.classList.contains('error')) || 
                      pageText.includes('既に使用') || 
                      pageText.includes('無効なシリアル') ||
                      pageText.includes('エラー');

      if (isSuccess || isError || checkCount >= maxChecks) {
        clearInterval(interval);
        if (isError) {
          setStatus('⚠️ エラーを検知したため自動進行を一時停止しました', true);
          stopAutoRun();
          return;
        }

        // 次のシリアルへ（1.5秒の安全ウェイト）
        autoTimer = setTimeout(() => {
          if (isAutoRunning && currentIndex < serialsQueue.length) {
            executeCurrentStep();
          } else {
            stopAutoRun();
          }
        }, 1500);
      }
    }, 200);
  }

  function startAutoRun() {
    isAutoRunning = true;
    render();
    executeCurrentStep();
  }

  function stopAutoRun() {
    isAutoRunning = false;
    if (autoTimer) clearTimeout(autoTimer);
    render();
  }

  function attachActiveEvents() {
    const btnStep = document.getElementById('ss-btn-step');
    if (btnStep) btnStep.addEventListener('click', () => executeCurrentStep());

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
            alert('登録完了したシリアル（' + appliedSerials.length + '件）をクリップボードにコピーしました！\\nSoraScanに戻って「応募済みに更新」できます。');
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

    // 圧縮・URLエンコードしたブックマークレット文字列
    return 'javascript:' + encodeURIComponent(runnerCode);
  }
}
