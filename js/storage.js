/**
 * SoraScan - Local Storage Manager
 * 日向坂46シリアルナンバー管理モジュール
 */

const STORAGE_KEY = 'sorascan_serials_v1';
const SETTINGS_KEY = 'sorascan_settings_v1';

export const Storage = {
  /**
   * 保存されているすべてのシリアルレコードを取得
   * @returns {Array} レコード一覧（最新順）
   */
  getAll() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Storage get error:', e);
      return [];
    }
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
   * @returns {Object|null} 既存レコード、存在しなければnull
   */
  checkDuplicate(serial, excludeId = null) {
    if (!serial) return null;
    const clean = this.normalizeSerial(serial);
    const list = this.getAll();
    return list.find(item => this.normalizeSerial(item.serial) === clean && item.id !== excludeId) || null;
  },

  /**
   * 新規シリアルを保存
   * @param {Object} item
   * @returns {Object} 保存されたレコード
   */
  add(item) {
    const list = this.getAll();
    const cleanSerial = this.normalizeSerial(item.serial);

    const record = {
      id: 'sn_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      serial: cleanSerial,
      rawText: item.rawText || '',
      type: item.type || 'Type-A',
      singleTitle: item.singleTitle || '13th Single 卒業写真だけが知ってる',
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
   * 統計情報の集計
   */
  getStats() {
    const list = this.getAll();
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
  exportAsText(filterStatus = 'all') {
    let list = this.getAll();
    if (filterStatus !== 'all') {
      list = list.filter(item => item.status === filterStatus);
    }
    return list.map(item => item.serial).join('\n');
  },

  /**
   * CSVデータ生成 (UTF-8 BOM付きでExcel対応)
   */
  exportAsCSV() {
    const list = this.getAll();
    const headers = ['シリアルナンバー', 'ステータス', '形態・盤種', '対象作品', '登録方式', '登録日時', '使用日時', 'メモ'];
    
    const rows = list.map(item => [
      `"${this.formatSerialForDisplay(item.serial)}"`,
      `"${item.status === 'unused' ? '未応募' : '応募済'}"`,
      `"${item.type}"`,
      `"${item.singleTitle}"`,
      `"${item.scanMethod === 'qr' ? 'QRスキャン' : item.scanMethod === 'ocr' ? 'OCR文字読取' : '手動入力'}"`,
      `"${new Date(item.createdAt).toLocaleString('ja-JP')}"`,
      `"${item.usedAt ? new Date(item.usedAt).toLocaleString('ja-JP') : '-'}"`,
      `"${(item.note || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    return csvContent;
  },

  /**
   * JSONバックアップの生成
   */
  exportAsJSON() {
    return JSON.stringify(this.getAll(), null, 2);
  },

  /**
   * JSONからのインポート復元
   */
  importJSON(jsonString) {
    try {
      const parsed = JSON.parse(jsonString);
      if (!Array.isArray(parsed)) throw new Error('データ形式が無効です');
      
      const currentList = this.getAll();
      const existingSerials = new Set(currentList.map(item => this.normalizeSerial(item.serial)));
      
      let imported = 0;
      let skipped = 0;

      parsed.forEach(item => {
        if (!item.serial) return;
        const norm = this.normalizeSerial(item.serial);
        if (existingSerials.has(norm)) {
          skipped++;
        } else {
          currentList.unshift({
            id: item.id || ('sn_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7)),
            serial: norm,
            rawText: item.rawText || '',
            type: item.type || 'Type-A',
            singleTitle: item.singleTitle || '日向坂46 シングル',
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
      return { success: true, imported, skipped };
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
        defaultType: 'Type-A',
        defaultTitle: '13th Single 卒業写真だけが知ってる',
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
