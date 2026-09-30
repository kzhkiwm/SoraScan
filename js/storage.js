/**
 * SoraScan - Local Storage Manager
 * 日向坂46シリアルナンバー管理モジュール
 */

const STORAGE_KEY = 'sorascan_serials_v1';
const SETTINGS_KEY = 'sorascan_settings_v1';
const CAMPAIGNS_KEY = 'sorascan_campaigns_v1';
const ACTIVE_CAMPAIGN_KEY = 'sorascan_active_campaign_id';

export const DEFAULT_CAMPAIGNS = [
  {
    id: 'camp_18th_single',
    title: '日向坂46 18thシングル『イチャイチャ虫』',
    shortTitle: '18th「イチャイチャ虫」',
    applyUrl: 'https://ticket.fortunemeets.app/hinatazaka46/18th#/registration',
    period: '2026/09/30 10:00 〜 2026/11/30 23:59',
    createdAt: '2026-09-30T10:00:00.000Z'
  }
];

export const Storage = {
  /**
   * 保存されているすべてのシリアルレコードを取得
   * @param {string} [campaignId] - 特定の作品で絞り込む場合
   * @returns {Array} レコード一覧（最新順）
   */
  getAll(campaignId = null) {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      let list = data ? JSON.parse(data) : [];
      // 下位互換マイグレーション: campaignId が無い古いレコードを補完
      let modified = false;
      const campaigns = this.getCampaigns();
      const defaultCamp = campaigns[0] || DEFAULT_CAMPAIGNS[0];

      list = list.map(item => {
        if (!item.campaignId) {
          modified = true;
          // singleTitleに合致するキャンペーンを探す
          const matched = campaigns.find(c => item.singleTitle && c.title.includes(item.singleTitle));
          item.campaignId = matched ? matched.id : defaultCamp.id;
          item.campaignTitle = matched ? matched.title : (item.singleTitle || defaultCamp.title);
          item.applyUrl = matched ? matched.applyUrl : defaultCamp.applyUrl;
        }
        return item;
      });

      if (modified) {
        this._saveAll(list);
      }

      if (campaignId && campaignId !== 'all') {
        return list.filter(item => item.campaignId === campaignId);
      }
      return list;
    } catch (e) {
      console.error('Storage get error:', e);
      return [];
    }
  },

  /**
   * 作品・キャンペーン一覧の取得
   */
  getCampaigns() {
    try {
      const data = localStorage.getItem(CAMPAIGNS_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
      // 初期データを保存
      this.saveCampaigns(DEFAULT_CAMPAIGNS);
      return [...DEFAULT_CAMPAIGNS];
    } catch (e) {
      console.error('Failed to get campaigns:', e);
      return [...DEFAULT_CAMPAIGNS];
    }
  },

  /**
   * 作品一覧の保存
   */
  saveCampaigns(list) {
    try {
      localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify(list));
      return list;
    } catch (e) {
      console.error('Failed to save campaigns:', e);
      return list;
    }
  },

  /**
   * 現在アクティブな作品IDの取得
   */
  getActiveCampaignId() {
    const campaigns = this.getCampaigns();
    const stored = localStorage.getItem(ACTIVE_CAMPAIGN_KEY);
    if (stored && campaigns.some(c => c.id === stored)) {
      return stored;
    }
    const defaultId = campaigns[0] ? campaigns[0].id : DEFAULT_CAMPAIGNS[0].id;
    this.setActiveCampaignId(defaultId);
    return defaultId;
  },

  /**
   * 現在アクティブな作品オブジェクトの取得
   */
  getActiveCampaign() {
    const id = this.getActiveCampaignId();
    const campaigns = this.getCampaigns();
    return campaigns.find(c => c.id === id) || campaigns[0] || DEFAULT_CAMPAIGNS[0];
  },

  /**
   * アクティブな作品IDを設定
   */
  setActiveCampaignId(id) {
    localStorage.setItem(ACTIVE_CAMPAIGN_KEY, id);
  },

  /**
   * 安全なHTTP/HTTPS URLか検証し、安全なら正規化されたURLを、不正または危険なプロトコルなら空文字を返す
   * @param {string} urlStr
   * @returns {string}
   */
  sanitizeUrl(urlStr) {
    if (!urlStr || typeof urlStr !== 'string') return '';
    const trimmed = urlStr.trim();
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        return parsed.href;
      }
      return '';
    } catch (e) {
      return '';
    }
  },

  /**
   * シリアル登録画面へ直行するURLを取得
   * forTUNE meets (ticket.fortunemeets.app) でハッシュ指定がない場合は自動で #/registration を付与
   * @param {string} urlStr
   * @returns {string}
   */
  getDirectRegistrationUrl(urlStr) {
    const safe = this.sanitizeUrl(urlStr);
    if (!safe) return '';
    try {
      const u = new URL(safe);
      if (u.hostname.includes('fortunemeets.app') && (!u.hash || u.hash === '#/' || u.hash === '')) {
        u.hash = '#/registration';
        return u.href;
      }
      return safe;
    } catch (e) {
      return safe;
    }
  },

  /**
   * 新しい作品（シングル・アルバム）を追加
   */
  addCampaign(data) {
    const campaigns = this.getCampaigns();
    const id = data.id || ('camp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6));

    // 短縮タイトル生成
    let shortTitle = data.shortTitle;
    if (!shortTitle) {
      const match = data.title.match(/『([^』]+)』|「([^」]+)」/);
      if (match) {
        shortTitle = match[1] || match[2];
      } else {
        shortTitle = data.title.substring(0, 20);
      }
    }

    const safeUrl = this.sanitizeUrl(data.applyUrl || '');

    const newCampaign = {
      id,
      title: data.title.trim(),
      shortTitle: shortTitle.trim(),
      applyUrl: safeUrl,
      period: (data.period || '').trim(),
      createdAt: new Date().toISOString()
    };

    campaigns.unshift(newCampaign);
    this.saveCampaigns(campaigns);
    return newCampaign;
  },

  /**
   * 作品情報の更新
   */
  updateCampaign(id, updates) {
    const campaigns = this.getCampaigns();
    const idx = campaigns.findIndex(c => c.id === id);
    if (idx === -1) return null;

    if (updates.applyUrl !== undefined) {
      updates.applyUrl = this.sanitizeUrl(updates.applyUrl);
    }

    campaigns[idx] = { ...campaigns[idx], ...updates };
    this.saveCampaigns(campaigns);

    // 紐付くシリアルナンバー側の非正規化データも同期更新
    if (updates.title || updates.applyUrl) {
      const serials = this.getAll();
      let updatedSerials = false;
      serials.forEach(s => {
        if (s.campaignId === id) {
          if (updates.title) s.campaignTitle = updates.title;
          if (updates.applyUrl) s.applyUrl = updates.applyUrl;
          updatedSerials = true;
        }
      });
      if (updatedSerials) {
        this._saveAll(serials);
      }
    }

    return campaigns[idx];
  },

  /**
   * 作品の削除
   */
  deleteCampaign(id) {
    let campaigns = this.getCampaigns();
    if (campaigns.length <= 1) {
      throw new Error('最低1つの作品は必要です。削除できません。');
    }

    campaigns = campaigns.filter(c => c.id !== id);
    this.saveCampaigns(campaigns);

    // 削除されたものがアクティブだった場合は先頭に切り替え
    if (this.getActiveCampaignId() === id) {
      this.setActiveCampaignId(campaigns[0].id);
    }
    return true;
  },

  /**
   * IDによるレコード取得
   */
  getById(id) {
    const list = this.getAll();
    return list.find(item => item.id === id) || null;
  },

  /**
   * シリアル番号が既に存在するか重複チェック
   * @param {string} serial - 正規化されたシリアル文字列
   * @param {string} [excludeId] - 自身を除外する場合のID
   * @param {string} [campaignId] - 作品単位で重複判定する場合（省略時は全件対象）
   * @returns {Object|null} 既存レコード、存在しなければnull
   */
  checkDuplicate(serial, excludeId = null, campaignId = null) {
    if (!serial) return null;
    const clean = this.normalizeSerial(serial);
    const list = this.getAll();
    return list.find(item => {
      const match = this.normalizeSerial(item.serial) === clean && item.id !== excludeId;
      if (!match) return false;
      if (campaignId && item.campaignId !== campaignId) return false;
      return true;
    }) || null;
  },

  /**
   * 新規シリアルを保存
   * @param {Object} item
   * @returns {Object} 保存されたレコード
   */
  add(item) {
    const list = this.getAll();
    const cleanSerial = this.normalizeSerial(item.serial);
    const activeCamp = this.getActiveCampaign();

    const campaignId = item.campaignId || activeCamp.id;
    const campaigns = this.getCampaigns();
    const targetCamp = campaigns.find(c => c.id === campaignId) || activeCamp;

    const record = {
      id: 'sn_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      serial: cleanSerial,
      rawText: item.rawText || '',
      type: item.type || '',
      campaignId: targetCamp.id,
      campaignTitle: targetCamp.title,
      singleTitle: targetCamp.title, // 後方互換性
      applyUrl: targetCamp.applyUrl,
      status: item.status || 'unused', // 'unused' | 'used'
      scanMethod: item.scanMethod || 'ocr', // 'ocr' | 'qr' | 'manual'
      createdAt: new Date().toISOString(),
      usedAt: item.status === 'used' ? new Date().toISOString() : null,
      note: item.note || ''
    };

    list.unshift(record);
    this._saveAll(list);
    return record;
  },

  /**
   * 既存レコードの更新
   */
  update(id, updates) {
    const list = this.getAll();
    const index = list.findIndex(item => item.id === id);
    if (index === -1) return null;

    if (updates.serial) {
      updates.serial = this.normalizeSerial(updates.serial);
    }

    if (updates.status === 'used' && list[index].status !== 'used') {
      updates.usedAt = new Date().toISOString();
    } else if (updates.status === 'unused') {
      updates.usedAt = null;
    }

    list[index] = { ...list[index], ...updates };
    this._saveAll(list);
    return list[index];
  },

  /**
   * レコードの削除
   */
  remove(id) {
    const list = this.getAll();
    const filtered = list.filter(item => item.id !== id);
    this._saveAll(filtered);
    return filtered.length !== list.length;
  },

  /**
   * 複数件の一括ステータス変更
   */
  batchUpdateStatus(ids, newStatus) {
    const list = this.getAll();
    const now = new Date().toISOString();
    let updatedCount = 0;

    const newList = list.map(item => {
      if (ids.includes(item.id)) {
        updatedCount++;
        return {
          ...item,
          status: newStatus,
          usedAt: newStatus === 'used' ? now : null
        };
      }
      return item;
    });

    this._saveAll(newList);
    return updatedCount;
  },

  /**
   * 複数件の一括削除
   */
  batchDelete(ids) {
    const list = this.getAll();
    const filtered = list.filter(item => !ids.includes(item.id));
    this._saveAll(filtered);
    return list.length - filtered.length;
  },

  /**
   * 指定作品（または全体）の未応募シリアル一覧を取得（登録古い順）
   * @param {string} [campaignId] - 作品ID
   * @returns {Array} 未応募シリアルの配列
   */
  getUnused(campaignId = null) {
    const list = this.getAll(campaignId);
    return list.filter(item => item.status === 'unused').reverse();
  },

  /**
   * シリアルコード文字列のリストを受け取り、一致する未応募レコードを一括で応募済みに更新
   * @param {string[]} serialCodes - 応募完了したシリアルコード文字列の配列
   * @returns {number} 更新された件数
   */
  markSerialsAsUsedByCode(serialCodes = []) {
    if (!Array.isArray(serialCodes) || serialCodes.length === 0) return 0;
    const cleanCodes = new Set(serialCodes.map(s => this.normalizeSerial(s)));
    const list = this.getAll();
    const now = new Date().toISOString();
    let updatedCount = 0;

    const newList = list.map(item => {
      const clean = this.normalizeSerial(item.serial);
      if (cleanCodes.has(clean) && item.status !== 'used') {
        updatedCount++;
        return {
          ...item,
          status: 'used',
          usedAt: now
        };
      }
      return item;
    });

    if (updatedCount > 0) {
      this._saveAll(newList);
    }
    return updatedCount;
  },

  /**
   * シーケンサー用: 次の未応募シリアルを1件取得し、ステータスを'used'に更新して返す
   * @param {string} [campaignId] - 作品ID
   * @returns {Object|null} 消費されたシリアルオブジェクト、無ければnull
   */
  consumeNextUnused(campaignId = null) {
    const unusedList = this.getUnused(campaignId);
    if (unusedList.length === 0) return null;
    const target = unusedList[0];
    const updated = this.update(target.id, { status: 'used' });
    return updated;
  },

  /**
   * 統計情報の集計
   * @param {string} [campaignId] - 特定の作品で絞り込む場合
   */
  getStats(campaignId = null) {
    const list = this.getAll(campaignId);
    const total = list.length;
    const unused = list.filter(i => i.status === 'unused').length;
    const used = list.filter(i => i.status === 'used').length;

    const typeBreakdown = {};
    list.forEach(i => {
      typeBreakdown[i.type] = (typeBreakdown[i.type] || 0) + 1;
    });

    return { total, unused, used, typeBreakdown };
  },

  /**
   * シリアル番号の正規化（ハイフン除去・大文字化・トリム）
   */
  normalizeSerial(str) {
    if (!str) return '';
    return str.toString().trim().toUpperCase().replace(/[\s\-_]/g, '');
  },

  /**
   * 表示用フォーマット（日向坂46公式仕様: ハイフンなしの連続文字列）
   */
  formatSerialForDisplay(str) {
    return this.normalizeSerial(str);
  },

  /**
   * 全シリアルまたは条件合致シリアルのプレーンテキスト（改行区切り）
   */
  exportAsText(filterStatus = 'all', campaignId = null) {
    let list = this.getAll(campaignId);
    if (filterStatus !== 'all') {
      list = list.filter(item => item.status === filterStatus);
    }
    return list.map(item => item.serial).join('\n');
  },

  /**
   * CSVデータ生成 (UTF-8 BOM付きでExcel対応)
   */
  exportAsCSV(campaignId = null) {
    const list = this.getAll(campaignId);
    const headers = ['シリアルナンバー', 'ステータス', '形態・盤種', '対象作品', '応募サイトURL', '登録方式', '登録日時', '使用日時', 'メモ'];

    const rows = list.map(item => [
      `"${this.formatSerialForDisplay(item.serial)}"`,
      `"${item.status === 'unused' ? '未応募' : '応募済'}"`,
      `"${item.type || ''}"`,
      `"${item.campaignTitle || item.singleTitle || ''}"`,
      `"${item.applyUrl || ''}"`,
      `"${item.scanMethod === 'qr' ? 'QRスキャン' : item.scanMethod === 'ocr' ? 'OCR文字読取' : '手動入力'}"`,
      `"${new Date(item.createdAt).toLocaleString('ja-JP')}"`,
      `"${item.usedAt ? new Date(item.usedAt).toLocaleString('ja-JP') : '-'}"`,
      `"${(item.note || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    return csvContent;
  },

  /**
   * JSONバックアップの生成（作品リストも含む）
   */
  exportAsJSON() {
    return JSON.stringify({
      version: 2,
      campaigns: this.getCampaigns(),
      activeCampaignId: this.getActiveCampaignId(),
      serials: this.getAll()
    }, null, 2);
  },

  /**
   * JSONからのインポート復元（旧バージョン配列形式・新バージョンオブジェクト形式両対応）
   */
  importJSON(jsonString) {
    try {
      const parsed = JSON.parse(jsonString);
      let serialItems = [];
      let importedCampaignsCount = 0;

      if (Array.isArray(parsed)) {
        serialItems = parsed;
      } else if (parsed && typeof parsed === 'object') {
        serialItems = parsed.serials || [];
        if (Array.isArray(parsed.campaigns)) {
          const currentCampaigns = this.getCampaigns();
          parsed.campaigns.forEach(c => {
            if (c.id && !currentCampaigns.some(cc => cc.id === c.id)) {
              currentCampaigns.push({
                ...c,
                applyUrl: this.sanitizeUrl(c.applyUrl || '')
              });
              importedCampaignsCount++;
            }
          });
          this.saveCampaigns(currentCampaigns);
        }
        if (parsed.activeCampaignId) {
          this.setActiveCampaignId(parsed.activeCampaignId);
        }
      } else {
        throw new Error('データ形式が無効です');
      }

      const currentList = this.getAll();
      const existingSerials = new Set(currentList.map(item => this.normalizeSerial(item.serial)));
      const activeCamp = this.getActiveCampaign();

      let imported = 0;
      let skipped = 0;

      serialItems.forEach(item => {
        if (!item.serial) return;
        const norm = this.normalizeSerial(item.serial);
        if (existingSerials.has(norm)) {
          skipped++;
        } else {
          currentList.unshift({
            id: item.id || ('sn_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7)),
            serial: norm,
            rawText: item.rawText || '',
            type: item.type || '',
            campaignId: item.campaignId || activeCamp.id,
            campaignTitle: item.campaignTitle || item.singleTitle || activeCamp.title,
            singleTitle: item.singleTitle || activeCamp.title,
            applyUrl: this.sanitizeUrl(item.applyUrl || activeCamp.applyUrl || ''),
            status: item.status || 'unused',
            scanMethod: item.scanMethod || 'import',
            createdAt: item.createdAt || new Date().toISOString(),
            usedAt: item.usedAt || null,
            note: item.note || ''
          });
          existingSerials.add(norm);
          imported++;
        }
      });

      this._saveAll(currentList);
      return { success: true, imported, skipped, importedCampaigns: importedCampaignsCount };
    } catch (e) {
      console.error('Import error:', e);
      return { success: false, error: e.message };
    }
  },

  /**
   * 設定情報の取得
   */
  getSettings() {
    try {
      const data = localStorage.getItem(SETTINGS_KEY);
      const defaults = {
        soundEnabled: true,
        vibrationEnabled: true,
        continuousScan: false,
        autoCopyOnScan: false,
        defaultType: '',
        defaultTitle: '日向坂46 18thシングル『イチャイチャ虫』',
        geminiApiKey: ''
      };
      return data ? { ...defaults, ...JSON.parse(data) } : defaults;
    } catch (e) {
      return {};
    }
  },

  /**
   * 設定情報の保存
   */
  saveSettings(newSettings) {
    try {
      const current = this.getSettings();
      const updated = { ...current, ...newSettings };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
      return updated;
    } catch (e) {
      console.error('Settings save error:', e);
      return null;
    }
  },

  /**
   * 内部保存用
   */
  _saveAll(list) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      console.error('Local storage quota exceeded or failed:', e);
      alert('保存容量の上限に達したか、ストレージへのアクセスが拒否されました。');
    }
  }
};
