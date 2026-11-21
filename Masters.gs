/**
 * 拠点・担当者マスタ（v1.4.0〜）
 * ------------------------------------------------------------
 *  - 拠点シート：TVごとに表示内容を分けるための拠点一覧。拠点ごとに天気の地域も変えられる
 *  - 担当者シート：担当者ごとの色（設定「色分け」＝担当者 のときに使う）
 * Code.gs の SHEET / HEADERS 定数を使う。
 */

/** 拠点一覧 [{name, wxCode, wxIdx, wxName, order}] */
function readSites_() {
  const sh = ss_().getSheetByName(SHEET.SITES);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getDataRange().getValues().slice(1)
    .filter(r => String(r[0]).trim())
    .map(r => ({
      name: String(r[0]).trim(),
      wxCode: String(r[1] || '').trim() ? ('000000' + String(r[1]).trim()).slice(-6) : '',
      wxIdx: r[2] === '' || r[2] == null ? null : Number(r[2]) || 0,
      wxName: String(r[3] || '').trim(),
      order: Number(r[4]) || 99
    }))
    .sort((a, b) => a.order - b.order);
}

/** 担当者一覧 [{name, color, order}] */
function readOwners_() {
  const sh = ss_().getSheetByName(SHEET.OWNERS);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getDataRange().getValues().slice(1)
    .filter(r => String(r[0]).trim())
    .map(r => ({ name: String(r[0]).trim(), color: safeColor_(r[1]) || '#607d8b', order: Number(r[2]) || 99 }))
    .sort((a, b) => a.order - b.order);
}

/**
 * 拠点の絞り込み。拠点が空のデータは「全拠点共通」として、どの拠点のTVにも出す。
 * @param {{site:string}} item
 * @param {string} site 表示中の拠点（空なら全件）
 */
function matchSite_(item, site) {
  return !site || !item.site || item.site === site;
}

/**
 * 既存シートの1行目に足りない見出しを右端に追加する（既存の列は動かさない）。
 * v1.3.0以前のシートに「拠点」列などを足すために使う。
 */
function ensureHeaderColumns_(sheetName, headers) {
  const sh = ss_().getSheetByName(sheetName);
  if (!sh) return;
  const width = Math.max(sh.getLastColumn(), 1);
  const cur = sh.getRange(1, 1, 1, width).getValues()[0];
  headers.forEach((h, i) => {
    if (i >= cur.length || !String(cur[i]).trim()) {
      sh.getRange(1, i + 1).setValue(h).setFontWeight('bold').setBackground('#e8eef5');
    }
  });
}

/* ============================================================
 * 入力画面「表示設定 → 連携・マスタ」から呼ばれるAPI（v1.5.0〜）
 * ============================================================ */

/** カレンダー連携の全行（無効も含む） */
function readCalendarLinksAll_() {
  const sh = ss_().getSheetByName(SHEET.CALS);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getDataRange().getValues().slice(1)
    .filter(r => String(r[0]).trim())
    .map(r => ({
      id: String(r[0]).trim(), name: String(r[1] || '').trim(), site: String(r[2] || '').trim(), color: safeColor_(r[3]),
      singleType: EVENT_TYPES.indexOf(String(r[4])) >= 0 ? String(r[4]) : 'イベント',
      multiType: EVENT_TYPES.indexOf(String(r[5])) >= 0 ? String(r[5]) : '工事',
      enabled: !(r[6] === false || String(r[6]).toUpperCase() === 'FALSE' || String(r[6]) === 'OFF')
    }));
}

/**
 * 1列目をキーにして行を追加・更新する（拠点名・担当者名・カレンダーIDなど、IDの無いシート用）
 * @param {string} origKey 編集前のキー（新規は空）
 */
function upsertByKey_(sheetName, width, origKey, row) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = ss_().getSheetByName(sheetName);
    if (!sh) throw new Error('シート「' + sheetName + '」がありません。メニューの初期設定を実行してください');
    const keys = sh.getLastRow() < 2 ? [] : sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(r => String(r[0]).trim());
    const newKey = String(row[0]).trim();
    const dup = keys.indexOf(newKey);
    const at = origKey ? keys.indexOf(String(origKey).trim()) : -1;
    if (dup >= 0 && dup !== at) throw new Error('「' + newKey + '」はすでに登録されています');
    if (at >= 0) sh.getRange(at + 2, 1, 1, width).setValues([row]);
    else sh.getRange(sh.getLastRow() + 1, 1, 1, width).setValues([row]);
    bumpDataVersion_();
  } finally {
    lock.releaseLock();
  }
}

function deleteByKey_(sheetName, key) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = ss_().getSheetByName(sheetName);
    if (!sh || sh.getLastRow() < 2) throw new Error('対象が見つかりません');
    const keys = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(r => String(r[0]).trim());
    const at = keys.indexOf(String(key).trim());
    if (at < 0) throw new Error('対象が見つかりません（他の人が削除した可能性があります）');
    sh.deleteRow(at + 2);
    bumpDataVersion_();
  } finally {
    lock.releaseLock();
  }
}

/* ---------- Googleカレンダー連携 ---------- */

function saveCalendarLink(key, c) {
  checkKey_(key);
  const id = cut_(c && c.id, 200);
  if (!id) throw new Error('カレンダーを選ぶか、カレンダーIDを入力してください');
  const single = EVENT_TYPES.indexOf(c.singleType) >= 0 ? c.singleType : 'イベント';
  const multi = EVENT_TYPES.indexOf(c.multiType) >= 0 ? c.multiType : '工事';
  upsertByKey_(SHEET.CALS, HEADERS.CALS.length, c.origId || '',
    [id, cut_(c.name, 30) || 'カレンダー', cut_(c.site, 30), safeColor_(c.color), single, multi, c.enabled !== false]);
  return true;
}

function deleteCalendarLink(key, id) {
  checkKey_(key);
  deleteByKey_(SHEET.CALS, id);
  return true;
}

/** 持ち主のアカウントで見られるカレンダー一覧（選択用） */
function listMyCalendars(key) {
  checkKey_(key);
  return CalendarApp.getAllCalendars()
    .filter(c => c.getId() !== HOLIDAY_CAL_ID)
    .map(c => ({ id: c.getId(), name: c.getName(), color: safeColor_(c.getColor()) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'));
}

/** 入力画面からの接続テスト。各カレンダーの結果を文字列で返す */
function testCalendarLinks(key) {
  checkKey_(key);
  const links = readCalendarLinks_();
  if (!links.length) return ['有効なカレンダーが登録されていません'];
  const today = todayStr_();
  const lines = links.map(link => {
    try {
      const cal = CalendarApp.getCalendarById(link.id);
      if (!cal) return '✕ ' + link.name + '：見つからないか、見る権限がありません';
      const n = cal.getEvents(parseDate_(today), parseDate_(addDaysStr_(today, 31))).length;
      return '○ ' + link.name + '：今後31日で ' + n + ' 件';
    } catch (err) {
      return '✕ ' + link.name + '：' + (err.message || err);
    }
  });
  bumpDataVersion_();
  return lines;
}

/* ---------- 拠点 ---------- */

function saveSite(key, x) {
  checkKey_(key);
  const name = cut_(x && x.name, 30);
  if (!name) throw new Error('拠点名を入力してください');
  const code = String(x.wxCode || '').trim();
  if (code && !/^\d{6}$/.test(code)) throw new Error('天気の地域コードは6桁の数字か空欄にしてください');
  const idx = x.wxIdx === '' || x.wxIdx == null ? '' : Math.max(0, Math.min(20, Math.floor(Number(x.wxIdx) || 0)));
  upsertByKey_(SHEET.SITES, HEADERS.SITES.length, x.origName || '', [name, code, idx, cut_(x.wxName, 20), Number(x.order) || '']);
  return true;
}

function deleteSite(key, name) {
  checkKey_(key);
  deleteByKey_(SHEET.SITES, name);
  return true;
}

/* ---------- 担当者 ---------- */

function saveOwner(key, x) {
  checkKey_(key);
  const name = cut_(x && x.name, 30);
  if (!name) throw new Error('担当者名を入力してください');
  const color = safeColor_(x.color);
  if (!color) throw new Error('色を選んでください');
  upsertByKey_(SHEET.OWNERS, HEADERS.OWNERS.length, x.origName || '', [name, color, Number(x.order) || '']);
  return true;
}

function deleteOwner(key, name) {
  checkKey_(key);
  deleteByKey_(SHEET.OWNERS, name);
  return true;
}