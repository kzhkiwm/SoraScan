/**
 * SoraScan - Main Application Controller
 * 日向坂46シリアルナンバー自動抽出・登録管理
 */

import { Storage } from './storage.js';
import { ScannerEngine } from './scanner.js';
import { TicketSimulator } from './simulator.js';
import { BookmarkletEngine } from './bookmarklet.js';

class SoraScanApp {
  constructor() {
    this.currentTab = 'viewScanner';
    this.activeFilter = 'all';
    this.selectedCampaignFilter = 'all';
    this.searchQuery = '';
    this.isProcessing = false;
    this.lastScannedSerial = null;
    this.lastScanTimestamp = 0;

    // 現在のモーダル編集対象
    this.pendingRecord = null;

    // シーケンサー状態
    this.sequencer = {
      active: false,
      campaignId: null,
      queue: [],
      currentIndex: 0,
      currentRecord: null,
      waitingFocusReturn: false
    };

    this.initElements();
    this.initScanner();
    this.initEventListeners();
    this.initAutoApply();
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

    // 作品（Campaign）セレクター要素
    this.selectActiveCampaign = document.getElementById('selectActiveCampaign');
    this.btnManageCampaigns = document.getElementById('btnManageCampaigns');

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
    this.selectFilterCampaign = document.getElementById('selectFilterCampaign');
    this.btnOpenAutoApplyModal = document.getElementById('btnOpenAutoApplyModal');
    this.btnCopyUnused = document.getElementById('btnCopyUnused');
    this.btnExportCSV = document.getElementById('btnExportCSV');
    this.btnOpenLotterySite = document.getElementById('btnOpenLotterySite');
    this.btnOpenLotterySiteLabel = document.getElementById('btnOpenLotterySiteLabel');
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
    this.modalCampaignSelect = document.getElementById('modalCampaignSelect');
    this.btnModalAddCampaign = document.getElementById('btnModalAddCampaign');
    this.modalNoteInput = document.getElementById('modalNoteInput');
    this.btnModalSave = document.getElementById('btnModalSave');
    this.btnModalSaveAndNext = document.getElementById('btnModalSaveAndNext');

    // 作品管理モーダル要素
    this.modalCampaigns = document.getElementById('modalCampaigns');
    this.btnCloseCampaignsModal = document.getElementById('btnCloseCampaignsModal');
    this.btnAutoScanCampaignCamera = document.getElementById('btnAutoScanCampaignCamera');
    this.fileCampaignPhoto = document.getElementById('fileCampaignPhoto');
    this.formCampaignEdit = document.getElementById('formCampaignEdit');
    this.inputCampaignEditId = document.getElementById('inputCampaignEditId');
    this.inputCampaignTitle = document.getElementById('inputCampaignTitle');
    this.inputCampaignShortTitle = document.getElementById('inputCampaignShortTitle');
    this.inputCampaignUrl = document.getElementById('inputCampaignUrl');
    this.inputCampaignPeriod = document.getElementById('inputCampaignPeriod');
    this.checkCampaignSetActive = document.getElementById('checkCampaignSetActive');
    this.btnCancelEditCampaign = document.getElementById('btnCancelEditCampaign');
    this.btnSaveCampaign = document.getElementById('btnSaveCampaign');
    this.campaignsManageList = document.getElementById('campaignsManageList');

    // 設定モーダル
    this.modalSettings = document.getElementById('modalSettings');
    this.btnOpenSettings = document.getElementById('btnOpenSettings');
    this.btnCloseSettingsModal = document.getElementById('btnCloseSettingsModal');
    this.checkSoundEnabled = document.getElementById('checkSoundEnabled');
    this.checkVibrationEnabled = document.getElementById('checkVibrationEnabled');
    this.btnBackupExport = document.getElementById('btnBackupExport');
    this.fileBackupImport = document.getElementById('fileBackupImport');
    this.btnClearAllSerials = document.getElementById('btnClearAllSerials');
    this.inputGeminiApiKey = document.getElementById('inputGeminiApiKey');

    // 応募サイト自動登録モーダル
    this.modalAutoApply = document.getElementById('modalAutoApply');
    this.btnCloseAutoApplyModal = document.getElementById('btnCloseAutoApplyModal');
    this.selectAutoApplyCampaign = document.getElementById('selectAutoApplyCampaign');
    this.autoApplyUnusedCount = document.getElementById('autoApplyUnusedCount');
    this.tabBtnBookmarklet = document.getElementById('tabBtnBookmarklet');
    this.tabBtnSequencer = document.getElementById('tabBtnSequencer');
    this.panelBookmarklet = document.getElementById('panelBookmarklet');
    this.panelSequencer = document.getElementById('panelSequencer');
    this.btnCopyBookmarklet = document.getElementById('btnCopyBookmarklet');
    this.btnOpenMockSite = document.getElementById('btnOpenMockSite');
    this.btnOpenRealSiteFromModal = document.getElementById('btnOpenRealSiteFromModal');
    this.textAppliedSerialsSync = document.getElementById('textAppliedSerialsSync');
    this.btnSyncFromClipboard = document.getElementById('btnSyncFromClipboard');
    this.btnApplySyncSerials = document.getElementById('btnApplySyncSerials');

    // シーケンサーUI要素
    this.sequencerStatusCard = document.getElementById('sequencerStatusCard');
    this.seqPulseDot = document.getElementById('seqPulseDot');
    this.seqStatusLabel = document.getElementById('seqStatusLabel');
    this.seqCurrentCodeDisplay = document.getElementById('seqCurrentCodeDisplay');
    this.seqProgressFill = document.getElementById('seqProgressFill');
    this.seqMetaInfo = document.getElementById('seqMetaInfo');
    this.btnStartSequencer = document.getElementById('btnStartSequencer');
    this.seqActiveControls = document.getElementById('seqActiveControls');
    this.btnSeqSkipCurrent = document.getElementById('btnSeqSkipCurrent');
    this.btnStopSequencer = document.getElementById('btnStopSequencer');

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
    if (this.inputGeminiApiKey) {
      this.inputGeminiApiKey.value = settings.geminiApiKey || '';
    }

    // 作品セレクターの初期化
    this.renderCampaignSelectors();

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
    // 作品（Campaign）アクティブ切り替え
    if (this.selectActiveCampaign) {
      this.selectActiveCampaign.addEventListener('change', (e) => {
        Storage.setActiveCampaignId(e.target.value);
        this.renderCampaignSelectors();
        this.renderList();
        const camp = Storage.getActiveCampaign();
        this.showToast(`🎯 対象作品: ${camp.shortTitle || camp.title}`);
      });
    }

    // 作品管理モーダル開閉
    if (this.btnManageCampaigns) {
      this.btnManageCampaigns.addEventListener('click', () => this.openCampaignsModal());
    }
    if (this.btnCloseCampaignsModal) {
      this.btnCloseCampaignsModal.addEventListener('click', () => this.closeCampaignsModal());
    }

    // シリアル確認モーダルからの作品追加
    if (this.btnModalAddCampaign) {
      this.btnModalAddCampaign.addEventListener('click', () => this.openCampaignsModal());
    }

    // 作品管理：カメラからスマート自動読取
    if (this.btnAutoScanCampaignCamera) {
      this.btnAutoScanCampaignCamera.addEventListener('click', () => this.executeAutoScanCampaignFromCamera());
    }

    // 作品管理：写真からスマート自動読取
    if (this.fileCampaignPhoto) {
      this.fileCampaignPhoto.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          this.executeAutoScanCampaignFromFile(e.target.files[0]);
          e.target.value = '';
        }
      });
    }

    // 作品登録・編集フォーム
    if (this.formCampaignEdit) {
      this.formCampaignEdit.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveCampaignRecord();
      });
    }

    // 作品編集キャンセル
    if (this.btnCancelEditCampaign) {
      this.btnCancelEditCampaign.addEventListener('click', () => this.resetCampaignForm());
    }

    // 一覧画面：作品絞り込みセレクター
    if (this.selectFilterCampaign) {
      this.selectFilterCampaign.addEventListener('change', (e) => {
        this.selectedCampaignFilter = e.target.value;
        this.renderList();
      });
    }

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
      const text = Storage.exportAsText('unused', this.selectedCampaignFilter);
      if (!text) {
        this.showToast('コピー可能な未応募シリアルがありません');
        return;
      }
      navigator.clipboard.writeText(text).then(() => {
        const count = text.split('\n').length;
        const activeCamp = Storage.getActiveCampaign();
        const campLabel = this.selectedCampaignFilter === 'all' ? '全体' : (activeCamp.shortTitle || activeCamp.title);
        this.showToast(`📋 [${campLabel}] 未応募シリアル ${count} 件を一括コピーしました！`);
      });
    });

    // CSVエクスポート
    this.btnExportCSV.addEventListener('click', () => {
      const csv = Storage.exportAsCSV(this.selectedCampaignFilter);
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

    if (this.inputGeminiApiKey) {
      this.inputGeminiApiKey.addEventListener('change', (e) => {
        const val = e.target.value.trim();
        Storage.saveSettings({ geminiApiKey: val });
        this.showToast(val ? '✨ Gemini AI高精度認識が有効になりました' : '端末内OCRモードに切り替えました');
      });
    }

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
            this.renderCampaignSelectors();
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

    const httpsBanner = document.getElementById('httpsWarningBanner');
    if (httpsBanner) {
      httpsBanner.style.display = info.isHttpsIssue ? 'block' : 'none';
    }

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
    const identifier = result.serial || result.url || result.raw;
    // 直前のスキャンと同一で1.5秒以内の連打は無視
    if (this.lastScannedSerial === identifier && (now - this.lastScanTimestamp) < 1500) {
      return;
    }
    this.lastScannedSerial = identifier;
    this.lastScanTimestamp = now;

    // もしシリアル番号がなく、純粋な応募サイトURLだった場合
    if (!result.serial && result.url) {
      const campaigns = Storage.getCampaigns();
      const matched = campaigns.find(c => c.applyUrl && (c.applyUrl === result.url || result.url.startsWith(c.applyUrl)));
      if (matched) {
        if (Storage.getActiveCampaignId() !== matched.id) {
          Storage.setActiveCampaignId(matched.id);
          this.renderCampaignSelectors();
          this.renderList();
          this.showToast(`🎯 QRコードから検知: 対象作品を「${matched.shortTitle || matched.title}」に切り替えました`);
        }
        // 既に選択中の作品と同じ公式応募URLの場合はトーストもサウンドも出さず静かにスルー
      } else {
        // 未登録のURLの場合はスキャンを邪魔しないようログのみ
        console.log('QR detected URL:', result.url);
      }
      return;
    }

    // 重複チェック
    const duplicate = Storage.checkDuplicate(result.serial);

    if (this.checkContinuous.checked) {
      // 連続スキャンモード
      if (duplicate) {
        this.showToast(`⚠️ 重複: ${Storage.formatSerialForDisplay(result.serial)} は登録済みです`);
      } else {
        const activeCamp = Storage.getActiveCampaign();
        Storage.add({
          serial: result.serial,
          rawText: result.raw,
          type: '',
          campaignId: activeCamp.id,
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
      const apiKey = Storage.getSettings().geminiApiKey;
      const res = await this.scanner.captureAndRecognize(this.videoElement, {
        cropToGuide: true,
        geminiApiKey: apiKey
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
      const apiKey = Storage.getSettings().geminiApiKey;
      const res = await this.scanner.captureAndRecognize(file, {
        cropToGuide: false,
        geminiApiKey: apiKey
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
        const activeCamp = Storage.getActiveCampaign();
        Storage.add({
          serial: serial,
          rawText: res.rawText,
          type: '',
          campaignId: activeCamp.id,
          campaignTitle: activeCamp.title,
          singleTitle: activeCamp.title,
          applyUrl: activeCamp.applyUrl,
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
    if (this.modalTypeSelect) {
      this.modalTypeSelect.value = data.type || '';
    }
    this.modalNoteInput.value = data.note || '';

    // 作品セレクターの同期
    if (this.modalCampaignSelect) {
      const activeId = data.campaignId || Storage.getActiveCampaignId();
      this.modalCampaignSelect.value = activeId;
    }

    this.validateModalDuplicate();
    this.modalConfirm.classList.add('open');
  }

  closeConfirmModal() {
    this.modalConfirm.classList.remove('open');
    this.pendingRecord = null;
  }

  /**
   * モーダル入力中の重複チェック & 14文字カウンター検証
   */
  validateModalDuplicate() {
    const rawVal = this.modalSerialInput.value;
    const clean = Storage.normalizeSerial(rawVal);
    const existing = Storage.checkDuplicate(clean, this.pendingRecord?.id);

    // 14文字カウンターの更新
    const counter = document.getElementById('modalCharCounter');
    if (counter) {
      if (clean.length === 14) {
        counter.innerHTML = `<span style="color:#10B981;">✓ 14 / 14文字（日向坂46正規仕様）</span>`;
      } else {
        counter.innerHTML = `<span style="color:#F59E0B;">文字数: ${clean.length} / 14文字</span>`;
      }
    }

    if (existing) {
      this.modalDuplicateAlert.style.display = 'flex';
      this.modalSerialInput.style.borderColor = '#EF4444';
    } else {
      this.modalDuplicateAlert.style.display = 'none';
      this.modalSerialInput.style.borderColor = clean.length === 14 ? '#10B981' : 'var(--sky-blue)';
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
    const type = this.modalTypeSelect ? this.modalTypeSelect.value : (this.pendingRecord?.type || '');
    const campaignId = this.modalCampaignSelect ? this.modalCampaignSelect.value : Storage.getActiveCampaignId();
    const campaigns = Storage.getCampaigns();
    const targetCamp = campaigns.find(c => c.id === campaignId) || Storage.getActiveCampaign();
    const note = this.modalNoteInput.value;

    if (this.pendingRecord && this.pendingRecord.id) {
      // 既存編集
      Storage.update(this.pendingRecord.id, {
        serial: clean,
        type,
        campaignId: targetCamp.id,
        campaignTitle: targetCamp.title,
        singleTitle: targetCamp.title,
        applyUrl: targetCamp.applyUrl,
        note
      });
      this.showToast(`シリアル情報を更新しました`);
    } else {
      // 新規登録
      Storage.add({
        serial: clean,
        rawText: this.pendingRecord?.rawText || '',
        type,
        campaignId: targetCamp.id,
        campaignTitle: targetCamp.title,
        singleTitle: targetCamp.title,
        applyUrl: targetCamp.applyUrl,
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
    const stats = Storage.getStats(this.selectedCampaignFilter);
    this.statTotal.textContent = stats.total;
    this.statUnused.textContent = stats.unused;
    this.statUsed.textContent = stats.used;

    if (stats.unused > 0) {
      this.navBadgeCount.textContent = stats.unused;
      this.navBadgeCount.style.display = 'inline-block';
    } else {
      this.navBadgeCount.style.display = 'none';
    }

    let allItems = Storage.getAll(this.selectedCampaignFilter);

    // ステータスフィルター
    if (this.activeFilter !== 'all') {
      allItems = allItems.filter(item => item.status === this.activeFilter);
    }

    // 検索クエリ
    if (this.searchQuery) {
      allItems = allItems.filter(item => {
        const fullStr = (item.serial + ' ' + (item.type || '') + ' ' + (item.campaignTitle || item.singleTitle || '') + ' ' + (item.note || '')).toLowerCase();
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
      const campTitle = item.campaignTitle || item.singleTitle || '';
      const safeApplyUrl = Storage.sanitizeUrl(item.applyUrl || '');

      card.innerHTML = `
        <div class="serial-info">
          <div class="serial-code-text">${formattedSerial}</div>
          <div class="serial-meta">
            ${campTitle ? `<span style="background:rgba(124,199,232,0.15); color:var(--sky-blue); font-size:0.7rem; font-weight:700; padding:2px 6px; border-radius:4px;">${this.escapeHtml(campTitle)}</span>` : ''}
            ${item.type ? `<span class="type-tag">${this.escapeHtml(item.type)}</span>` : ''}
            <span class="status-badge ${isUsed ? 'used' : 'unused'}">${isUsed ? '応募済' : '未応募'}</span>
            <span>${new Date(item.createdAt).toLocaleDateString('ja-JP')}</span>
            ${item.note ? `<span>💬 ${this.escapeHtml(item.note)}</span>` : ''}
          </div>
        </div>
        <div class="serial-card-actions">
          ${safeApplyUrl ? `
            <button class="btn-card-visit" title="シリアルをコピーして応募サイトを開く" data-serial="${item.serial}" data-url="${this.escapeHtml(safeApplyUrl)}">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                <polyline points="15 3 21 3 21 9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
              </svg>
              応募
            </button>
          ` : ''}
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

      // 応募サイト直行ボタン
      const btnVisit = card.querySelector('.btn-card-visit');
      if (btnVisit) {
        btnVisit.addEventListener('click', (e) => {
          e.stopPropagation();
          const targetUrl = Storage.sanitizeUrl(item.applyUrl);
          if (!targetUrl) {
            this.showToast('⚠️ 登録されている応募URLが無効または安全ではありません');
            return;
          }
          navigator.clipboard.writeText(item.serial).then(() => {
            this.showToast(`📋 ${formattedSerial} をコピーし、公式応募サイトを開きます`);
            window.open(targetUrl, '_blank', 'noopener,noreferrer');
          });
        });
      }

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
   * 作品セレクター（ヘッダー・一覧・モーダル）の同期描画
   */
  renderCampaignSelectors() {
    const campaigns = Storage.getCampaigns();
    const activeId = Storage.getActiveCampaignId();
    const activeCamp = Storage.getActiveCampaign();

    // 1. ヘッダー直下アクティブセレクター
    if (this.selectActiveCampaign) {
      this.selectActiveCampaign.innerHTML = '';
      campaigns.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.title;
        opt.selected = (c.id === activeId);
        this.selectActiveCampaign.appendChild(opt);
      });
    }

    // 2. 一覧画面：作品絞り込みセレクター
    if (this.selectFilterCampaign) {
      const currentVal = this.selectFilterCampaign.value || 'all';
      this.selectFilterCampaign.innerHTML = '<option value="all">すべての作品</option>';
      campaigns.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.shortTitle || c.title;
        opt.selected = (c.id === currentVal);
        this.selectFilterCampaign.appendChild(opt);
      });
    }

    // 3. シリアル確認モーダル内セレクター
    if (this.modalCampaignSelect) {
      this.modalCampaignSelect.innerHTML = '';
      campaigns.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.title;
        opt.selected = (c.id === activeId);
        this.modalCampaignSelect.appendChild(opt);
      });
    }

    // 4. 一覧画面の「公式応募サイトを開く」ボタンのURLと表示更新
    if (this.btnOpenLotterySite) {
      let targetCamp = activeCamp;
      if (this.selectedCampaignFilter && this.selectedCampaignFilter !== 'all') {
        targetCamp = campaigns.find(c => c.id === this.selectedCampaignFilter) || activeCamp;
      }
      this.btnOpenLotterySite.href = targetCamp.applyUrl || 'https://ticket.fortunemeets.app/';
      if (this.btnOpenLotterySiteLabel) {
        this.btnOpenLotterySiteLabel.textContent = `${targetCamp.shortTitle || '公式'} 応募サイトを開く ↗`;
      }
    }
  }

  /**
   * 作品管理モーダルを開く
   */
  openCampaignsModal(editId = null) {
    this.renderCampaignsManageList();
    if (editId) {
      const campaigns = Storage.getCampaigns();
      const target = campaigns.find(c => c.id === editId);
      if (target) {
        this.inputCampaignEditId.value = target.id;
        this.inputCampaignTitle.value = target.title;
        this.inputCampaignShortTitle.value = target.shortTitle || '';
        this.inputCampaignUrl.value = target.applyUrl || '';
        this.inputCampaignPeriod.value = target.period || '';
        this.checkCampaignSetActive.checked = (target.id === Storage.getActiveCampaignId());
        this.btnCancelEditCampaign.style.display = 'inline-block';
        this.btnSaveCampaign.textContent = '作品情報を更新';
      }
    } else {
      this.resetCampaignForm();
    }
    this.modalCampaigns.classList.add('open');
  }

  closeCampaignsModal() {
    this.modalCampaigns.classList.remove('open');
    this.resetCampaignForm();
  }

  /**
   * 作品管理モーダル内の登録済み作品リストを描画
   */
  renderCampaignsManageList() {
    if (!this.campaignsManageList) return;
    const campaigns = Storage.getCampaigns();
    const activeId = Storage.getActiveCampaignId();
    this.campaignsManageList.innerHTML = '';

    campaigns.forEach(c => {
      const isActive = (c.id === activeId);
      const card = document.createElement('div');
      card.className = `campaign-item-card ${isActive ? 'is-active' : ''}`;

      const stats = Storage.getStats(c.id);
      const safeCampUrl = Storage.sanitizeUrl(c.applyUrl || '');

      card.innerHTML = `
        <div class="campaign-item-info">
          <div class="campaign-item-title">${this.escapeHtml(c.title)}</div>
          ${safeCampUrl ? `
            <a href="${this.escapeHtml(safeCampUrl)}" target="_blank" rel="noopener noreferrer" class="campaign-item-url" title="${this.escapeHtml(safeCampUrl)}">
              🔗 ${this.escapeHtml(safeCampUrl)}
            </a>
          ` : `
            <span class="campaign-item-url" style="opacity:0.6;">🔗 URL未設定または無効</span>
          `}
          <div class="campaign-item-meta">
            ${isActive ? '<span class="badge-active-campaign">選択中</span>' : ''}
            <span>登録: <b>${stats.total}</b>枚 (未応募: <b>${stats.unused}</b>枚)</span>
            ${c.period ? `<span>⏳ ${this.escapeHtml(c.period)}</span>` : ''}
          </div>
        </div>
        <div class="campaign-item-actions">
          ${!isActive ? `<button type="button" class="btn-campaign-action btn-set-active" data-id="${c.id}">選択</button>` : ''}
          <button type="button" class="btn-campaign-action btn-edit" data-id="${c.id}">編集</button>
          ${campaigns.length > 1 ? `<button type="button" class="btn-campaign-action btn-danger btn-delete" data-id="${c.id}">削除</button>` : ''}
        </div>
      `;

      // 選択ボタン
      const btnSetActive = card.querySelector('.btn-set-active');
      if (btnSetActive) {
        btnSetActive.addEventListener('click', () => {
          Storage.setActiveCampaignId(c.id);
          this.renderCampaignSelectors();
          this.renderCampaignsManageList();
          this.renderList();
          this.showToast(`🎯 対象作品を「${c.shortTitle || c.title}」に変更しました`);
        });
      }

      // 編集ボタン
      card.querySelector('.btn-edit').addEventListener('click', () => {
        this.openCampaignsModal(c.id);
      });

      // 削除ボタン
      const btnDel = card.querySelector('.btn-delete');
      if (btnDel) {
        btnDel.addEventListener('click', () => {
          if (confirm(`作品「${c.title}」を削除しますか？\n（登録されたシリアルナンバーは保持されます）`)) {
            try {
              Storage.deleteCampaign(c.id);
              this.renderCampaignSelectors();
              this.renderCampaignsManageList();
              this.renderList();
              this.showToast('作品を削除しました');
            } catch (err) {
              alert(err.message);
            }
          }
        });
      }

      this.campaignsManageList.appendChild(card);
    });
  }

  /**
   * 作品の保存（新規または更新）
   */
  saveCampaignRecord() {
    const editId = this.inputCampaignEditId.value;
    const title = this.inputCampaignTitle.value.trim();
    const shortTitle = this.inputCampaignShortTitle.value.trim();
    const applyUrl = this.inputCampaignUrl.value.trim();
    const period = this.inputCampaignPeriod.value.trim();
    const setActive = this.checkCampaignSetActive.checked;

    if (!title || !applyUrl) {
      this.showToast('作品名と応募サイトURLは必須です');
      return;
    }

    const safeUrl = Storage.sanitizeUrl(applyUrl);
    if (!safeUrl) {
      this.showToast('⚠️ 有効な応募URL（http:// または https://）を入力してください');
      return;
    }

    if (editId) {
      Storage.updateCampaign(editId, { title, shortTitle, applyUrl: safeUrl, period });
      if (setActive) Storage.setActiveCampaignId(editId);
      this.showToast(`作品「${shortTitle || title}」を更新しました`);
    } else {
      const created = Storage.addCampaign({ title, shortTitle, applyUrl: safeUrl, period });
      if (setActive) Storage.setActiveCampaignId(created.id);
      this.showToast(`🎉 作品「${shortTitle || title}」を登録しました！`);
    }

    this.renderCampaignSelectors();
    this.renderCampaignsManageList();
    this.renderList();
    this.resetCampaignForm();
  }

  resetCampaignForm() {
    this.inputCampaignEditId.value = '';
    this.inputCampaignTitle.value = '';
    this.inputCampaignShortTitle.value = '';
    this.inputCampaignUrl.value = '';
    this.inputCampaignPeriod.value = '';
    this.checkCampaignSetActive.checked = true;
    this.btnCancelEditCampaign.style.display = 'none';
    this.btnSaveCampaign.textContent = '作品を保存・登録';
  }

  /**
   * カメラ映像から作品情報をスマート自動読取
   */
  async executeAutoScanCampaignFromCamera() {
    if (!this.videoElement) return;
    this.showToast('券面から作品名と応募サイトURLを解析中...');

    try {
      const apiKey = Storage.getSettings().geminiApiKey;
      const res = await this.scanner.extractCampaignInfo(this.videoElement, { geminiApiKey: apiKey });
      
      this.applyDetectedCampaignInfo(res);
      this.showToast('✨ 券面から作品名と応募サイトURLを自動入力しました！');
    } catch (e) {
      console.error('Auto scan error:', e);
      this.showToast('券面の解析に失敗しました。写真から選択するか、手動で入力してください。');
    }
  }

  /**
   * 写真ファイルから作品情報をスマート自動読取
   */
  async executeAutoScanCampaignFromFile(file) {
    this.showToast('アップロード画像を解析中...');

    try {
      const apiKey = Storage.getSettings().geminiApiKey;
      const res = await this.scanner.extractCampaignInfo(file, { geminiApiKey: apiKey });

      this.applyDetectedCampaignInfo(res);
      this.showToast('✨ 券面から作品名と応募サイトURLを自動入力しました！');
    } catch (e) {
      console.error('Auto scan file error:', e);
      this.showToast('画像の解析に失敗しました。手動で入力してください。');
    }
  }

  applyDetectedCampaignInfo(info) {
    if (info.title) this.inputCampaignTitle.value = info.title;
    if (info.shortTitle) this.inputCampaignShortTitle.value = info.shortTitle;
    if (info.applyUrl) this.inputCampaignUrl.value = info.applyUrl;
    if (info.period) this.inputCampaignPeriod.value = info.period;
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
   * 応募サイト自動登録機能の初期化
   */
  initAutoApply() {
    if (this.btnOpenAutoApplyModal) {
      this.btnOpenAutoApplyModal.addEventListener('click', () => this.openAutoApplyModal());
    }
    if (this.btnCloseAutoApplyModal) {
      this.btnCloseAutoApplyModal.addEventListener('click', () => this.closeAutoApplyModal());
    }
    if (this.modalAutoApply) {
      this.modalAutoApply.addEventListener('click', (e) => {
        if (e.target === this.modalAutoApply) this.closeAutoApplyModal();
      });
    }

    // 作品切り替え
    if (this.selectAutoApplyCampaign) {
      this.selectAutoApplyCampaign.addEventListener('change', () => this.updateAutoApplyView());
    }

    // タブ切り替え
    if (this.tabBtnBookmarklet && this.tabBtnSequencer) {
      this.tabBtnBookmarklet.addEventListener('click', () => {
        this.tabBtnBookmarklet.classList.add('active');
        this.tabBtnSequencer.classList.remove('active');
        this.panelBookmarklet.style.display = 'flex';
        this.panelSequencer.style.display = 'none';
      });

      this.tabBtnSequencer.addEventListener('click', () => {
        this.tabBtnSequencer.classList.add('active');
        this.tabBtnBookmarklet.classList.remove('active');
        this.panelSequencer.style.display = 'flex';
        this.panelBookmarklet.style.display = 'none';
      });
    }

    // ブックマークレットコードコピー
    if (this.btnCopyBookmarklet) {
      this.btnCopyBookmarklet.addEventListener('click', () => this.copyBookmarkletCode());
    }

    // クリップボードから貼付
    if (this.btnSyncFromClipboard) {
      this.btnSyncFromClipboard.addEventListener('click', async () => {
        try {
          const text = await navigator.clipboard.readText();
          if (text) {
            this.textAppliedSerialsSync.value = text;
            this.showToast('📋 クリップボードからシリアルを貼り付けました');
          } else {
            this.showToast('クリップボードが空です');
          }
        } catch (e) {
          this.showToast('⚠️ クリップボードの読み取りが許可されていません。手動で貼り付けてください');
        }
      });
    }

    // 貼り付けシリアルの反映
    if (this.btnApplySyncSerials) {
      this.btnApplySyncSerials.addEventListener('click', () => this.applySyncSerials());
    }

    // シーケンサー操作
    if (this.btnStartSequencer) {
      this.btnStartSequencer.addEventListener('click', () => this.startSequencer());
    }
    if (this.btnSeqSkipCurrent) {
      this.btnSeqSkipCurrent.addEventListener('click', () => this.skipSequencerStep());
    }
    if (this.btnStopSequencer) {
      this.btnStopSequencer.addEventListener('click', () => this.stopSequencer());
    }

    // タブ復帰検知（シーケンサー動作中）
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.sequencer.active && this.sequencer.waitingFocusReturn) {
        this.handleSequencerFocusReturn();
      }
    });
    window.addEventListener('focus', () => {
      if (this.sequencer.active && this.sequencer.waitingFocusReturn) {
        this.handleSequencerFocusReturn();
      }
    });
  }

  /**
   * 自動登録モーダルを開く
   */
  openAutoApplyModal(targetCampaignId = null) {
    const campaigns = Storage.getCampaigns();
    const activeCampId = targetCampaignId || Storage.getActiveCampaignId();

    this.selectAutoApplyCampaign.innerHTML = campaigns.map(c => `
      <option value="${c.id}" ${c.id === activeCampId ? 'selected' : ''}>
        ${this.escapeHtml(c.shortTitle || c.title)}
      </option>
    `).join('');

    this.updateAutoApplyView();
    this.modalAutoApply.classList.add('open');
  }

  closeAutoApplyModal() {
    this.modalAutoApply.classList.remove('open');
  }

  /**
   * 選択中作品に応じた未応募件数・URLの更新
   */
  updateAutoApplyView() {
    const campId = this.selectAutoApplyCampaign.value;
    const campaigns = Storage.getCampaigns();
    const camp = campaigns.find(c => c.id === campId) || Storage.getActiveCampaign();
    const unusedList = Storage.getUnused(campId);

    this.autoApplyUnusedCount.textContent = `${unusedList.length} 件`;

    // 本番リンクと模擬リンク
    const safeUrl = Storage.sanitizeUrl(camp.applyUrl);
    if (this.btnOpenRealSiteFromModal) {
      this.btnOpenRealSiteFromModal.href = safeUrl || 'https://ticket.fortunemeets.app/';
    }

    // シーケンサーカードの表示更新（非稼働時）
    if (!this.sequencer.active) {
      this.seqStatusLabel.textContent = `待機中 (${unusedList.length}件 未応募)`;
      this.seqCurrentCodeDisplay.textContent = unusedList.length > 0 ? '準備完了' : '未応募シリアルなし';
      this.seqProgressFill.style.width = '0%';
      this.seqMetaInfo.textContent = unusedList.length > 0 ? '「シーケンサーを開始」ボタンを押してください' : 'この作品には未応募シリアルがありません';
      this.btnStartSequencer.disabled = unusedList.length === 0;
      this.seqActiveControls.style.display = 'none';
      this.btnStartSequencer.style.display = 'block';
    }
  }

  /**
   * ブックマークレットコードの生成とコピー
   */
  copyBookmarkletCode() {
    const campId = this.selectAutoApplyCampaign.value;
    const campaigns = Storage.getCampaigns();
    const camp = campaigns.find(c => c.id === campId) || Storage.getActiveCampaign();
    const unusedList = Storage.getUnused(campId);

    if (unusedList.length === 0) {
      this.showToast(`⚠️ 「${camp.shortTitle || camp.title}」には未応募のシリアルがありません`);
      return;
    }

    const code = BookmarkletEngine.generateCode(unusedList, camp);
    navigator.clipboard.writeText(code).then(() => {
      this.showToast(`⚡ 未応募${unusedList.length}件を含むブックマークレットをコピーしました！`);
    }).catch(() => {
      prompt('以下のブックマークレットコードをコピーしてください:', code);
    });
  }

  /**
   * 登録完了シリアルの手動反映
   */
  applySyncSerials() {
    const text = this.textAppliedSerialsSync.value.trim();
    if (!text) {
      this.showToast('シリアルコードが入力されていません');
      return;
    }

    const extracted = text.match(/[A-Za-z0-9]{14}/g);
    if (!extracted || extracted.length === 0) {
      this.showToast('⚠️ 14桁のシリアルナンバーが見つかりませんでした');
      return;
    }

    const updatedCount = Storage.markSerialsAsUsedByCode(extracted);
    this.showToast(`🎉 ${updatedCount} 件のシリアルを「応募済」に更新しました！`);
    this.textAppliedSerialsSync.value = '';
    this.updateAutoApplyView();
    this.renderList();
  }

  /**
   * 連続応募シーケンサーの開始
   */
  startSequencer() {
    const campId = this.selectAutoApplyCampaign.value;
    const campaigns = Storage.getCampaigns();
    const camp = campaigns.find(c => c.id === campId) || Storage.getActiveCampaign();
    const unusedList = Storage.getUnused(campId);

    if (unusedList.length === 0) {
      this.showToast('⚠️ 未応募のシリアルがありません');
      return;
    }

    this.sequencer.active = true;
    this.sequencer.campaignId = campId;
    this.sequencer.queue = unusedList;
    this.sequencer.currentIndex = 0;
    this.sequencer.total = unusedList.length;

    this.btnStartSequencer.style.display = 'none';
    this.seqActiveControls.style.display = 'grid';

    // 1件目をセット
    this.advanceSequencerStep(0);

    // 応募サイトを開く
    const targetUrl = Storage.sanitizeUrl(camp.applyUrl) || './mock-apply.html';
    window.open(targetUrl, '_blank', 'noopener,noreferrer');
  }

  /**
   * シーケンサーのステップ進行
   */
  advanceSequencerStep(index) {
    if (index >= this.sequencer.queue.length) {
      this.completeSequencer();
      return;
    }

    const targetRecord = this.sequencer.queue[index];
    this.sequencer.currentIndex = index;
    this.sequencer.currentRecord = targetRecord;
    this.sequencer.waitingFocusReturn = true;

    // クリップボードへコピー
    navigator.clipboard.writeText(targetRecord.serial).catch(() => {});

    // UI更新
    this.seqStatusLabel.textContent = `🚀 応募中 (${index + 1} / ${this.sequencer.total} 件目)`;
    this.seqCurrentCodeDisplay.textContent = Storage.formatSerialForDisplay(targetRecord.serial);
    const progressPercent = Math.round((index / this.sequencer.total) * 100);
    this.seqProgressFill.style.width = `${progressPercent}%`;
    this.seqMetaInfo.innerHTML = `📋 <b>${targetRecord.serial}</b> をコピーしました。<br>応募サイトで登録後、<b>この画面に戻ると自動で次へ進みます</b>。`;

    this.showToast(`📋 ${index + 1}件目 (${targetRecord.serial}) をコピーしました`);
  }

  /**
   * SoraScanタブ復帰時のハンドラ
   */
  handleSequencerFocusReturn() {
    if (!this.sequencer.active || !this.sequencer.waitingFocusReturn) return;
    this.sequencer.waitingFocusReturn = false;

    // 前のシリアルを「応募済」に更新
    const prevRecord = this.sequencer.currentRecord;
    if (prevRecord) {
      Storage.update(prevRecord.id, { status: 'used' });
      this.renderList();
    }

    const nextIdx = this.sequencer.currentIndex + 1;
    if (nextIdx < this.sequencer.total) {
      // わずかなディレイ後に次のシリアルをコピーして進行
      setTimeout(() => {
        this.advanceSequencerStep(nextIdx);
        this.showToast(`✅ 前のシリアルを応募済みに更新！次のシリアルをコピーしました`);
      }, 500);
    } else {
      this.completeSequencer();
    }
  }

  skipSequencerStep() {
    if (!this.sequencer.active) return;
    const nextIdx = this.sequencer.currentIndex + 1;
    if (nextIdx < this.sequencer.total) {
      this.advanceSequencerStep(nextIdx);
      this.showToast('今のシリアルをスキップしました');
    } else {
      this.completeSequencer();
    }
  }

  stopSequencer() {
    this.sequencer.active = false;
    this.sequencer.waitingFocusReturn = false;
    this.btnStartSequencer.style.display = 'block';
    this.seqActiveControls.style.display = 'none';
    this.updateAutoApplyView();
    this.showToast('⏹ シーケンサーを終了しました');
  }

  completeSequencer() {
    this.sequencer.active = false;
    this.sequencer.waitingFocusReturn = false;
    this.seqProgressFill.style.width = '100%';
    this.seqStatusLabel.textContent = '🎉 全件完了！';
    this.seqCurrentCodeDisplay.textContent = '完了';
    this.seqMetaInfo.textContent = `すべてのシリアル（${this.sequencer.total}件）を処理しました！`;
    this.btnStartSequencer.style.display = 'block';
    this.seqActiveControls.style.display = 'none';
    this.updateAutoApplyView();
    this.renderList();
    this.showToast(`🎉 全${this.sequencer.total}件のシリアル応募フローが完了しました！`);
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
