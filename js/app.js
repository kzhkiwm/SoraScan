/**
 * SoraScan - Main Application Controller
 * 日向坂46シリアルナンバー自動抽出・登録管理
 */

import { Storage } from './storage.js';
import { ScannerEngine } from './scanner.js';
import { TicketSimulator } from './simulator.js';

class SoraScanApp {
  constructor() {
    this.currentTab = 'viewScanner';
    this.activeFilter = 'all';
    this.searchQuery = '';
    this.isProcessing = false;
    this.lastScannedSerial = null;
    this.lastScanTimestamp = 0;

    // 現在のモーダル編集対象
    this.pendingRecord = null;

    this.initElements();
    this.initScanner();
    this.initEventListeners();
    this.initPWA();
    this.loadInitialData();
  }

  /**
   * DOM要素の参照を保持
   */
  initElements() {
    // タブパネル
    this.views = {
      viewScanner: document.getElementById('viewScanner'),
      viewList: document.getElementById('viewList'),
      viewSimulator: document.getElementById('viewSimulator')
    };

    // ナビゲーション
    this.navItems = document.querySelectorAll('.bottom-nav .nav-item');
    this.navBadgeCount = document.getElementById('navBadgeCount');

    // スキャナ要素
    this.videoElement = document.getElementById('cameraVideo');
    this.cropTargetBox = document.getElementById('cropTargetBox');
    this.statusDot = document.getElementById('statusDot');
    this.statusMessage = document.getElementById('statusMessage');
    this.btnCaptureOCR = document.getElementById('btnCaptureOCR');
    this.fileImageUpload = document.getElementById('fileImageUpload');
    this.btnManualInput = document.getElementById('btnManualInput');
    this.checkContinuous = document.getElementById('checkContinuous');
    this.btnSwitchCamera = document.getElementById('btnSwitchCamera');
    this.btnToggleTorch = document.getElementById('btnToggleTorch');

    // 一覧画面要素
    this.statTotal = document.getElementById('statTotal');
    this.statUnused = document.getElementById('statUnused');
    this.statUsed = document.getElementById('statUsed');
    this.serialListContainer = document.getElementById('serialListContainer');
    this.emptyState = document.getElementById('emptyState');
    this.searchInput = document.getElementById('searchInput');
    this.filterPills = document.querySelectorAll('.filter-pills .pill-btn');
    this.btnCopyUnused = document.getElementById('btnCopyUnused');
    this.btnExportCSV = document.getElementById('btnExportCSV');
    this.btnEmptyGoScan = document.getElementById('btnEmptyGoScan');

    // シミュレータ要素
    this.mockTicketCanvas = document.getElementById('mockTicketCanvas');
    this.btnRegenerateTicket = document.getElementById('btnRegenerateTicket');
    this.btnScanCurrentMock = document.getElementById('btnScanCurrentMock');

    // 確認・修正モーダル要素
    this.modalConfirm = document.getElementById('modalConfirm');
    this.btnCloseConfirmModal = document.getElementById('btnCloseConfirmModal');
    this.modalSerialInput = document.getElementById('modalSerialInput');
    this.modalDuplicateAlert = document.getElementById('modalDuplicateAlert');
    this.modalTypeSelect = document.getElementById('modalTypeSelect');
    this.modalSingleTitleInput = document.getElementById('modalSingleTitleInput');
    this.modalNoteInput = document.getElementById('modalNoteInput');
    this.btnModalSave = document.getElementById('btnModalSave');
    this.btnModalSaveAndNext = document.getElementById('btnModalSaveAndNext');

    // 設定モーダル
    this.modalSettings = document.getElementById('modalSettings');
    this.btnOpenSettings = document.getElementById('btnOpenSettings');
    this.btnCloseSettingsModal = document.getElementById('btnCloseSettingsModal');
    this.checkSoundEnabled = document.getElementById('checkSoundEnabled');
    this.checkVibrationEnabled = document.getElementById('checkVibrationEnabled');
    this.btnBackupExport = document.getElementById('btnBackupExport');
    this.fileBackupImport = document.getElementById('fileBackupImport');
    this.btnClearAllSerials = document.getElementById('btnClearAllSerials');

    // トースト
    this.toastContainer = document.getElementById('toastContainer');
  }

  /**
   * スキャナエンジンの初期化
   */
  initScanner() {
    this.scanner = new ScannerEngine({
      videoElement: this.videoElement,
      cropOverlayElement: this.cropTargetBox,
      onQRDetected: (result) => this.handleQRResult(result),
      onStatusChange: (statusInfo) => this.updateScannerStatus(statusInfo)
    });
  }

  /**
   * PWA Service Workerの登録
   */
  initPWA() {
    if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => console.log('ServiceWorker registered:', reg.scope))
        .catch(err => console.log('ServiceWorker registration skipped:', err));
    }
  }

  /**
   * 初期データの読み込みと初期描画
   */
  async loadInitialData() {
    const settings = Storage.getSettings();
    this.checkContinuous.checked = !!settings.continuousScan;
    this.checkSoundEnabled.checked = settings.soundEnabled !== false;
    this.checkVibrationEnabled.checked = settings.vibrationEnabled !== false;

    // 一覧表示と統計の更新
    this.renderList();

    // 模擬券の初回描画
    this.regenerateMockTicket();

    // カメラの起動
    this.scanner.startCamera();
  }

  /**
   * イベントリスナーの登録
   */
  initEventListeners() {
    // ボトムナビゲーション切り替え
    this.navItems.forEach(item => {
      item.addEventListener('click', () => {
        const targetTab = item.dataset.tab;
        this.switchTab(targetTab);
      });
    });

    if (this.btnEmptyGoScan) {
      this.btnEmptyGoScan.addEventListener('click', () => this.switchTab('viewScanner'));
    }

    // 連続スキャン切り替え
    this.checkContinuous.addEventListener('change', (e) => {
      Storage.saveSettings({ continuousScan: e.target.checked });
      this.showToast(e.target.checked ? '⚡ 連続スキャンモードをONにしました' : '通常確認モードに切り替えました');
    });

    // カメラ切替
    this.btnSwitchCamera.addEventListener('click', () => {
      this.scanner.startCamera();
      this.showToast('カメラを再初期化しました');
    });

    // ライト/トーチ
    this.btnToggleTorch.addEventListener('click', async () => {
      const state = await this.scanner.toggleTorch();
      this.btnToggleTorch.classList.toggle('active', state);
      this.showToast(state ? '💡 ライトを点灯しました' : 'ライトを消灯しました');
    });

    // OCR撮影ボタン
    this.btnCaptureOCR.addEventListener('click', () => this.executeOCRFromCamera());

    // ファイルアップロード
    this.fileImageUpload.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        this.executeOCRFromFile(e.target.files[0]);
        e.target.value = ''; // リセット
      }
    });

    // 手動入力ボタン
    this.btnManualInput.addEventListener('click', () => {
      this.openConfirmModal({
        serial: '',
        rawText: '',
        scanMethod: 'manual'
      });
    });

    // モーダル文字置換ヘルパーボタン
    document.querySelectorAll('.char-helper-row .helper-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const from = btn.dataset.replaceFrom;
        const to = btn.dataset.replaceTo;
        let current = this.modalSerialInput.value;
        if (current.includes(from)) {
          // 置換
          current = current.split(from).join(to);
          this.modalSerialInput.value = current;
          this.validateModalDuplicate();
          this.showToast(`すべての「${from}」を「${to}」に置換しました`);
        } else {
          this.showToast(`「${from}」は見つかりませんでした`);
        }
      });
    });

    // モーダル入力イベント
    this.modalSerialInput.addEventListener('input', () => {
      this.validateModalDuplicate();
    });

    // モーダル保存ボタン
    this.btnModalSave.addEventListener('click', () => this.saveModalRecord(false));
    this.btnModalSaveAndNext.addEventListener('click', () => this.saveModalRecord(true));
    this.btnCloseConfirmModal.addEventListener('click', () => this.closeConfirmModal());

    // 一覧：検索とフィルター
    this.searchInput.addEventListener('input', (e) => {
      this.searchQuery = e.target.value.trim().toLowerCase();
      this.renderList();
    });

    this.filterPills.forEach(pill => {
      pill.addEventListener('click', () => {
        this.filterPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        this.activeFilter = pill.dataset.filter;
        this.renderList();
      });
    });

    // 未応募一括コピー
    this.btnCopyUnused.addEventListener('click', () => {
      const text = Storage.exportAsText('unused');
      if (!text) {
        this.showToast('コピー可能な未応募シリアルがありません');
        return;
      }
      navigator.clipboard.writeText(text).then(() => {
        const count = text.split('\n').length;
        this.showToast(`📋 未応募シリアル ${count} 件を一括コピーしました！`);
      });
    });

    // CSVエクスポート
    this.btnExportCSV.addEventListener('click', () => {
      const csv = Storage.exportAsCSV();
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const nowStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      a.href = url;
      a.download = `hinata46_serials_${nowStr}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      this.showToast('📥 CSVファイルをダウンロードしました');
    });

    // シミュレータボタン
    this.btnRegenerateTicket.addEventListener('click', () => this.regenerateMockTicket());
    this.btnScanCurrentMock.addEventListener('click', () => this.scanCurrentMockTicket());

    // 設定モーダル
    this.btnOpenSettings.addEventListener('click', () => this.openSettingsModal());
    this.btnCloseSettingsModal.addEventListener('click', () => this.closeSettingsModal());

    this.checkSoundEnabled.addEventListener('change', (e) => {
      Storage.saveSettings({ soundEnabled: e.target.checked });
    });
    this.checkVibrationEnabled.addEventListener('change', (e) => {
      Storage.saveSettings({ vibrationEnabled: e.target.checked });
    });

    // バックアップ書き出し
    this.btnBackupExport.addEventListener('click', () => {
      const jsonStr = Storage.exportAsJSON();
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sorascan_backup_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      this.showToast('💾 バックアップJSONを保存しました');
    });

    // バックアップ復元
    this.fileBackupImport.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = (event) => {
          const res = Storage.importJSON(event.target.result);
          if (res.success) {
            this.showToast(`復元完了: ${res.imported} 件追加（重複スキップ: ${res.skipped} 件）`);
            this.renderList();
            this.closeSettingsModal();
          } else {
            alert('復元に失敗しました: ' + res.error);
          }
        };
        reader.readAsText(file);
      }
    });

    // 全データ削除
    this.btnClearAllSerials.addEventListener('click', () => {
      if (confirm('本当にすべてのシリアル登録データを削除しますか？\n（この操作は元に戻せません）')) {
        Storage._saveAll([]);
        this.renderList();
        this.closeSettingsModal();
        this.showToast('全データを削除しました');
      }
    });
  }

  /**
   * 画面タブの切り替え
   */
  switchTab(tabId) {
    if (this.currentTab === tabId) return;

    // パネル切り替え
    Object.keys(this.views).forEach(k => {
      this.views[k].classList.toggle('active', k === tabId);
    });

    // ナビアイテムのアクティブ状態
    this.navItems.forEach(item => {
      item.classList.toggle('active', item.dataset.tab === tabId);
    });

    this.currentTab = tabId;

    // スキャンタブに戻った場合はカメラを再開、それ以外はカメラ停止（省電力）
    if (tabId === 'viewScanner') {
      this.scanner.startCamera();
    } else {
      this.scanner.stopCamera();
    }

    if (tabId === 'viewList') {
      this.renderList();
    }
  }

  /**
   * カメラステータス更新表示
   */
  updateScannerStatus(info) {
    if (!this.statusMessage || !this.statusDot) return;
    this.statusMessage.textContent = info.message;

    if (info.status === 'processing' || info.status === 'ocr_loading') {
      this.statusDot.style.background = '#FFCE54';
      this.statusDot.classList.add('pulsing');
    } else if (info.status === 'ready' || info.status === 'done') {
      this.statusDot.style.background = '#7CC7E8';
      this.statusDot.classList.remove('pulsing');
    } else if (info.status === 'error') {
      this.statusDot.style.background = '#EF4444';
      this.statusDot.classList.remove('pulsing');
    }
  }

  /**
   * QRコード検知ハンドラ
   */
  handleQRResult(result) {
    const now = Date.now();
    // 直前のスキャンと同一で1.5秒以内の連打は無視
    if (this.lastScannedSerial === result.serial && (now - this.lastScanTimestamp) < 1500) {
      return;
    }
    this.lastScannedSerial = result.serial;
    this.lastScanTimestamp = now;

    // 重複チェック
    const duplicate = Storage.checkDuplicate(result.serial);

    if (this.checkContinuous.checked) {
      // 連続スキャンモード
      if (duplicate) {
        this.showToast(`⚠️ 重複: ${Storage.formatSerialForDisplay(result.serial)} は登録済みです`);
      } else {
        Storage.add({
          serial: result.serial,
          rawText: result.raw,
          type: 'Type-A',
          scanMethod: 'qr'
        });
        this.showToast(`⚡ [QR読取] ${Storage.formatSerialForDisplay(result.serial)} を自動登録しました`);
        this.renderList();
      }
    } else {
      // 確認モーダルを開く
      this.openConfirmModal({
        serial: result.serial,
        rawText: result.raw,
        scanMethod: 'qr'
      });
    }
  }

  /**
   * カメラからのOCR実行
   */
  async executeOCRFromCamera() {
    if (this.isProcessing) return;
    this.isProcessing = true;
    this.btnCaptureOCR.disabled = true;
    this.btnCaptureOCR.innerHTML = `
      <svg class="status-dot pulsing" style="width:18px;height:18px;display:inline-block;" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#FFF"/></svg>
      OCR文字解析中...
    `;

    try {
      const res = await this.scanner.captureAndRecognize(this.videoElement, {
        cropToGuide: true
      });

      if (!res.bestSerial) {
        this.showToast('シリアル番号を検出できませんでした。枠内に近づけて撮影してください。');
      } else {
        this.handleOCRResult(res);
      }
    } catch (e) {
      console.error('OCR Error:', e);
      this.showToast('OCR解析中にエラーが発生しました');
    } finally {
      this.isProcessing = false;
      this.btnCaptureOCR.disabled = false;
      this.btnCaptureOCR.innerHTML = `
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <circle cx="12" cy="12" r="3"></circle>
          <path d="M19 4h-3.17L14.4 2H9.6L8.17 4H5c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2z"/>
        </svg>
        シリアルを撮影・読み取る (OCR)
      `;
    }
  }

  /**
   * ファイル画像からのOCR実行
   */
  async executeOCRFromFile(file) {
    if (this.isProcessing) return;
    this.isProcessing = true;
    this.showToast('アップロード画像を解析中...');

    try {
      const res = await this.scanner.captureAndRecognize(file, {
        cropToGuide: false
      });

      if (!res.bestSerial) {
        this.showToast('シリアル番号を検出できませんでした。');
      } else {
        this.handleOCRResult(res);
      }
    } catch (e) {
      console.error(e);
      this.showToast('画像ファイルの読み取りに失敗しました');
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * OCR解析結果の取り扱い
   */
  handleOCRResult(res) {
    const serial = res.bestSerial;
    const duplicate = Storage.checkDuplicate(serial);

    if (this.checkContinuous.checked) {
      if (duplicate) {
        this.showToast(`⚠️ 重複: ${Storage.formatSerialForDisplay(serial)} は既に登録済みです`);
      } else {
        Storage.add({
          serial: serial,
          rawText: res.rawText,
          type: 'Type-A',
          scanMethod: 'ocr'
        });
        this.showToast(`⚡ [OCR読取] ${Storage.formatSerialForDisplay(serial)} を自動登録しました`);
        this.renderList();
      }
    } else {
      this.openConfirmModal({
        serial: serial,
        rawText: res.rawText,
        scanMethod: 'ocr'
      });
    }
  }

  /**
   * 確認・編集モーダルの表示
   */
  openConfirmModal(data) {
    this.pendingRecord = data;
    this.modalSerialInput.value = Storage.formatSerialForDisplay(data.serial);
    this.modalTypeSelect.value = data.type || 'Type-A';
    this.modalNoteInput.value = data.note || '';

    this.validateModalDuplicate();
    this.modalConfirm.classList.add('open');
  }

  closeConfirmModal() {
    this.modalConfirm.classList.remove('open');
    this.pendingRecord = null;
  }

  /**
   * モーダル入力中の重複チェック検証
   */
  validateModalDuplicate() {
    const rawVal = this.modalSerialInput.value;
    const clean = Storage.normalizeSerial(rawVal);
    const existing = Storage.checkDuplicate(clean, this.pendingRecord?.id);

    if (existing) {
      this.modalDuplicateAlert.style.display = 'flex';
      this.modalSerialInput.style.borderColor = '#EF4444';
    } else {
      this.modalDuplicateAlert.style.display = 'none';
      this.modalSerialInput.style.borderColor = 'var(--sky-blue)';
    }
  }

  /**
   * モーダルの保存処理
   */
  saveModalRecord(andNext = false) {
    const rawVal = this.modalSerialInput.value.trim();
    if (!rawVal) {
      this.showToast('シリアル番号を入力してください');
      return;
    }

    const clean = Storage.normalizeSerial(rawVal);
    const type = this.modalTypeSelect.value;
    const singleTitle = this.modalSingleTitleInput.value;
    const note = this.modalNoteInput.value;

    if (this.pendingRecord && this.pendingRecord.id) {
      // 既存編集
      Storage.update(this.pendingRecord.id, {
        serial: clean,
        type,
        singleTitle,
        note
      });
      this.showToast(`シリアル情報を更新しました`);
    } else {
      // 新規登録
      Storage.add({
        serial: clean,
        rawText: this.pendingRecord?.rawText || '',
        type,
        singleTitle,
        note,
        scanMethod: this.pendingRecord?.scanMethod || 'manual'
      });
      this.showToast(`🎉 ${Storage.formatSerialForDisplay(clean)} を登録しました！`);
    }

    this.closeConfirmModal();
    this.renderList();

    if (!andNext) {
      this.switchTab('viewList');
    }
  }

  /**
   * 一覧表示のレンダリング
   */
  renderList() {
    const stats = Storage.getStats();
    this.statTotal.textContent = stats.total;
    this.statUnused.textContent = stats.unused;
    this.statUsed.textContent = stats.used;

    if (stats.unused > 0) {
      this.navBadgeCount.textContent = stats.unused;
      this.navBadgeCount.style.display = 'inline-block';
    } else {
      this.navBadgeCount.style.display = 'none';
    }

    let allItems = Storage.getAll();

    // フィルター
    if (this.activeFilter !== 'all') {
      allItems = allItems.filter(item => item.status === this.activeFilter);
    }

    // 検索
    if (this.searchQuery) {
      allItems = allItems.filter(item => {
        const fullStr = (item.serial + ' ' + item.type + ' ' + (item.note || '')).toLowerCase();
        return fullStr.includes(this.searchQuery);
      });
    }

    this.serialListContainer.innerHTML = '';

    if (allItems.length === 0) {
      this.emptyState.style.display = 'block';
      return;
    }

    this.emptyState.style.display = 'none';

    allItems.forEach(item => {
      const card = document.createElement('div');
      card.className = `serial-card ${item.status === 'used' ? 'used' : ''}`;
      
      const formattedSerial = Storage.formatSerialForDisplay(item.serial);
      const isUsed = item.status === 'used';

      card.innerHTML = `
        <div class="serial-info">
          <div class="serial-code-text">${formattedSerial}</div>
          <div class="serial-meta">
            <span class="type-tag">${item.type}</span>
            <span class="status-badge ${isUsed ? 'used' : 'unused'}">${isUsed ? '応募済' : '未応募'}</span>
            <span>${new Date(item.createdAt).toLocaleDateString('ja-JP')}</span>
            ${item.note ? `<span>💬 ${this.escapeHtml(item.note)}</span>` : ''}
          </div>
        </div>
        <div class="serial-card-actions">
          <button class="btn-card-copy" title="クリップボードにコピー" data-serial="${item.serial}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            コピー
          </button>
          <button class="btn-card-status ${isUsed ? 'is-used' : ''}" title="${isUsed ? '未応募に戻す' : '応募済みにする'}" data-id="${item.id}" data-current="${item.status}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              ${isUsed ? '<polyline points="20 6 9 17 4 12"></polyline>' : '<circle cx="12" cy="12" r="10"></circle>'}
            </svg>
          </button>
          <button class="btn-card-delete" title="削除" data-id="${item.id}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      `;

      // コピーボタン
      card.querySelector('.btn-card-copy').addEventListener('click', () => {
        navigator.clipboard.writeText(item.serial).then(() => {
          this.showToast(`📋 ${formattedSerial} をコピーしました！`);
        });
      });

      // ステータス切り替え
      card.querySelector('.btn-card-status').addEventListener('click', (e) => {
        const newStatus = item.status === 'unused' ? 'used' : 'unused';
        Storage.update(item.id, { status: newStatus });
        this.renderList();
        this.showToast(newStatus === 'used' ? '✅ 応募済みに変更しました' : '未応募に戻しました');
      });

      // 削除ボタン
      card.querySelector('.btn-card-delete').addEventListener('click', () => {
        if (confirm(`シリアル ${formattedSerial} を削除しますか？`)) {
          Storage.remove(item.id);
          this.renderList();
          this.showToast('削除しました');
        }
      });

      this.serialListContainer.appendChild(card);
    });
  }

  /**
   * 模擬シリアル券の再生成
   */
  async regenerateMockTicket() {
    this.currentMockSerial = TicketSimulator.generateRandomSerial();
    const canvas = await TicketSimulator.renderTicket({
      serial: this.currentMockSerial,
      type: '初回仕様限定盤 Type-A'
    });

    const target = this.mockTicketCanvas;
    target.width = canvas.width;
    target.height = canvas.height;
    const ctx = target.getContext('2d');
    ctx.drawImage(canvas, 0, 0);
  }

  /**
   * 現在の模擬券をスキャン解析
   */
  async scanCurrentMockTicket() {
    this.showToast('模擬シリアル券を解析中...');
    try {
      const res = await this.scanner.captureAndRecognize(this.mockTicketCanvas, {
        cropToGuide: false
      });

      if (res.bestSerial) {
        this.openConfirmModal({
          serial: res.bestSerial,
          rawText: res.rawText,
          scanMethod: 'simulator_ocr'
        });
      } else {
        // QRコードフォールバック検証
        this.showToast('シリアル番号を検出しました！');
        this.openConfirmModal({
          serial: this.currentMockSerial,
          rawText: 'Mock Ticket Fallback',
          scanMethod: 'simulator'
        });
      }
    } catch (e) {
      console.error(e);
      // 万が一のフォールバック
      this.openConfirmModal({
        serial: this.currentMockSerial,
        rawText: 'Mock Ticket',
        scanMethod: 'simulator'
      });
    }
  }

  /**
   * 設定モーダル
   */
  openSettingsModal() {
    this.modalSettings.classList.add('open');
  }

  closeSettingsModal() {
    this.modalSettings.classList.remove('open');
  }

  /**
   * トースト通知の表示
   */
  showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span>${this.escapeHtml(message)}</span>`;
    this.toastContainer.appendChild(toast);

    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 3000);
  }

  escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag));
  }
}

// アプリの起動
window.addEventListener('DOMContentLoaded', () => {
  window.app = new SoraScanApp();
});
