/**
 * 繰り返し予定（v1.4.0〜）
 * ------------------------------------------------------------
 * 「繰り返し予定」シートにルールを1行で登録し、表示するときに日付へ展開する。
 * 予定シートには書き込まないので、ルールを直すと全回に反映される。
 *
 * 繰り返しの種類
 *  - 毎週          ：曜日列の曜日（例「月,木」）
 *  - 平日          ：月〜金
 *  - 毎月（日付）  ：日列の日（31など月末を超える日は月末日に表示）
 *  - 毎月（第N曜日）：第N週列（1〜4、5＝最終）＋曜日列
 * 除外日列（カンマ区切りの日付）に入れた日は表示しない（「この日だけ休み」）。
 */

const RECUR_PATTERNS = ['毎週', '平日', '毎月（日付）', '毎月（第N曜日）'];
const WD_CHARS = '日月火水木金土';

/** ルール一覧を読む */
function readRecurring_() {
  const sh = ss_().getSheetByName(SHEET.RECUR);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getDataRange().getValues().slice(1)
    .filter(r => r[0] && r[3] && r[10])
    .map(r => ({
      id: String(r[0]),
      type: EVENT_TYPES.indexOf(String(r[1])) >= 0 ? String(r[1]) : 'イベント',
      badge: String(r[2] || ''),
      pattern: String(r[3]),
      dows: String(r[4] || ''),
      day: Number(r[5]) || 0,
      nth: Number(r[6]) || 0,
      from: fmtYmd_(r[7]),
      to: fmtYmd_(r[8]),
      time: fmtTime_(r[9]),
      title: String(r[10]),
      owner: String(r[11] || ''),
      site: String(r[12] || ''),
      color: safeColor_(r[13]),
      except: String(r[14] || '').split(/[,、\s]+/).map(fmtYmd_).filter(String)
    }));
}

/**
 * ルールを期間 [a, b] の予定に展開する。
 * @return {Array<Object>} 予定と同じ形（recurring:true, ruleId 付き）
 */
function expandRecurring_(rules, a, b) {
  if (!rules.length) return [];
  const out = [];
  const end = parseDate_(b);
  let d = parseDate_(a);
  for (let guard = 0; d <= end && guard < 400; guard++) {
    const ds = ymdLocal_(d);
    rules.forEach(r => {
      if (r.from && ds < r.from) return;
      if (r.to && ds > r.to) return;
      if (r.except.indexOf(ds) >= 0) return;
      if (!recurMatches_(r, d)) return;
      out.push({
        id: 'r_' + r.id + '_' + ds, ruleId: r.id, recurring: true,
        type: r.type, badge: r.badge, start: ds, end: ds, time: r.time, title: r.title,
        detail: '', owner: r.owner, color: r.color, site: r.site
      });
    });
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  }
  return out;
}

/** その日がルールに当てはまるか */
function recurMatches_(r, d) {
  const dow = d.getDay();
  const date = d.getDate();
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const hasDow = () => r.dows.indexOf(WD_CHARS.charAt(dow)) >= 0;
  switch (r.pattern) {
    case '毎週': return hasDow();
    case '平日': return dow >= 1 && dow <= 5;
    case '毎月（日付）': return r.day > 0 && (date === r.day || (r.day > daysInMonth && date === daysInMonth));
    case '毎月（第N曜日）':
      if (!hasDow()) return false;
      if (r.nth >= 5) return date + 7 > daysInMonth;          // 最終週
      return Math.ceil(date / 7) === r.nth;
    default: return false;
  }
}

/** Date → 'yyyy-MM-dd'（ループ内で使うため Utilities を使わない） */
function ymdLocal_(d) {
  return d.getFullYear() + '-' + pad_(d.getMonth() + 1) + '-' + pad_(d.getDate());
}

/* ---------- 入力画面から呼ばれるAPI ---------- */

function saveRecurring(key, r) {
  checkKey_(key);
  const v = validateRecurring_(r);
  const sh = ss_().getSheetByName(SHEET.RECUR);
  if (!sh) throw new Error('「繰り返し予定」シートがありません。メニューの初期設定を実行してください');
  // 除外日は既存の値を引き継ぐ（フォームでは扱わない）
  const old = readRecurring_().find(x => x.id === v.id);
  const except = old ? old.except.join(',') : '';
  const row = [v.id, v.type, v.badge, v.pattern, v.dows, v.day || '', v.nth || '',
    v.from ? parseDate_(v.from) : '', v.to ? parseDate_(v.to) : '', v.time, v.title, v.owner, v.site, v.color, except, new Date()];
  upsertRow_(SHEET.RECUR, HEADERS.RECUR.length, v.id, row);
  return v.id;
}

function deleteRecurring(key, id) {
  checkKey_(key);
  deleteRowById_(SHEET.RECUR, id);
  return true;
}

/** 「この日だけ休み」：除外日に追加 */
function skipRecurringDate(key, id, ds) {
  checkKey_(key);
  ds = fmtYmd_(ds);
  if (!ds) throw new Error('日付が正しくありません');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = ss_().getSheetByName(SHEET.RECUR);
    const row = findRowById_(sh, id);
    if (row < 0) throw new Error('繰り返し予定が見つかりません');
    const col = HEADERS.RECUR.indexOf('除外日') + 1;
    const cur = String(sh.getRange(row, col).getValue() || '').split(/[,、\s]+/).filter(String);
    if (cur.indexOf(ds) < 0) cur.push(ds);
    sh.getRange(row, col).setNumberFormat('@').setValue(cur.join(','));
    bumpDataVersion_();
  } finally {
    lock.releaseLock();
  }
  return true;
}

function validateRecurring_(r) {
  if (!r) throw new Error('データがありません');
  const pattern = String(r.pattern || '');
  if (RECUR_PATTERNS.indexOf(pattern) < 0) throw new Error('繰り返しの種類が正しくありません');
  const type = EVENT_TYPES.indexOf(String(r.type)) >= 0 ? String(r.type) : 'イベント';
  const title = cut_(r.title, 100);
  if (!title) throw new Error('件名を入力してください');
  const dows = String(r.dows || '').split('').filter(c => WD_CHARS.indexOf(c) >= 0)
    .filter((c, i, arr) => arr.indexOf(c) === i).join(',');
  const day = Math.floor(Number(r.day) || 0);
  const nth = Math.floor(Number(r.nth) || 0);
  if ((pattern === '毎週' || pattern === '毎月（第N曜日）') && !dows) throw new Error('曜日を1つ以上選んでください');
  if (pattern === '毎月（日付）' && (day < 1 || day > 31)) throw new Error('日付は1〜31で入力してください');
  if (pattern === '毎月（第N曜日）' && (nth < 1 || nth > 5)) throw new Error('第何週かを選んでください');
  const from = fmtYmd_(r.from);
  const to = fmtYmd_(r.to);
  if (from && to && to < from) throw new Error('終了日が開始日より前になっています');
  const time = cut_(r.time, 10);
  if (time && !/^\d{1,2}:\d{2}$/.test(time)) throw new Error('時刻は「8:30」の形式で入力してください');
  return {
    id: (r.id && String(r.id)) || newId_(), type: type, badge: cut_(r.badge, 20), pattern: pattern,
    dows: dows, day: day, nth: nth, from: from, to: to, time: time, title: title,
    owner: cut_(r.owner, 50), site: cut_(r.site, 30), color: safeColor_(r.color)
  };
}