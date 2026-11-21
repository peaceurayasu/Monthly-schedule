/**
 * Googleカレンダー連携（v1.4.0〜）
 * ------------------------------------------------------------
 * 「カレンダー連携」シートに登録したGoogleカレンダーの予定を、予定表に読み取り専用で表示する。
 * 予定表側からカレンダーへの書き込みはしない（編集はGoogleカレンダーで行う）。
 *  - カレンダーは、このスクリプトの所有者（デプロイしたアカウント）が見られるものに限る
 *  - 10分キャッシュ。カレンダーを直してからTVに出るまで最大10分＋表示キャッシュ5分
 */

const CAL_CACHE_SEC = 600;

/** 有効なカレンダー連携の一覧 */
function readCalendarLinks_() {
  const sh = ss_().getSheetByName(SHEET.CALS);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getDataRange().getValues().slice(1)
    .filter(r => String(r[0]).trim() && String(r[6]).toUpperCase() !== 'FALSE' && String(r[6]) !== 'OFF')
    .map(r => ({
      id: String(r[0]).trim(),
      name: String(r[1] || '').trim() || 'カレンダー',
      site: String(r[2] || '').trim(),
      color: safeColor_(r[3]),
      singleType: EVENT_TYPES.indexOf(String(r[4])) >= 0 ? String(r[4]) : 'イベント',
      multiType: EVENT_TYPES.indexOf(String(r[5])) >= 0 ? String(r[5]) : '工事'
    }));
}

/**
 * 期間 [a, b] のカレンダー予定を、予定表の形にして返す（readonly:true）。
 * 取得できなかったカレンダーは飛ばして、状況を記録する。
 */
function getCalendarEvents_(a, b) {
  const links = readCalendarLinks_();
  if (!links.length) return [];
  const cache = CacheService.getScriptCache();
  const key = 'cal_' + getDataVersion_() + '_' + a + '_' + b;
  const hit = cache.get(key);
  if (hit) return JSON.parse(hit);

  const out = [], errors = [];
  const start = parseDate_(a), end = parseDate_(addDaysStr_(b, 1));
  links.forEach(link => {
    try {
      const cal = CalendarApp.getCalendarById(link.id);
      if (!cal) throw new Error('見つからないか、見る権限がありません');
      cal.getEvents(start, end).forEach(ev => out.push(calEventToItem_(ev, link)));
    } catch (err) {
      errors.push(link.name + '：' + (err.message || err));
      console.warn('カレンダー取得失敗 ' + link.id + ' ' + err);
    }
  });
  setCalStatus_(errors.length === 0, errors.length ? errors.join(' ／ ') : links.length + '件のカレンダーから' + out.length + '件');
  const json = JSON.stringify(out);
  if (json.length < 90000) cache.put(key, json, CAL_CACHE_SEC);
  return out;
}

/** カレンダーの予定1件 → 予定表の形 */
function calEventToItem_(ev, link) {
  let start, end, time = '';
  if (ev.isAllDayEvent()) {
    start = fmtYmd_(ev.getAllDayStartDate());
    end = fmtYmd_(new Date(ev.getAllDayEndDate().getTime() - 86400000)); // 終了日は翌日0時なので1日戻す
  } else {
    start = fmtYmd_(ev.getStartTime());
    end = fmtYmd_(new Date(ev.getEndTime().getTime() - 60000));
    time = Utilities.formatDate(ev.getStartTime(), tz_(), 'H:mm');
  }
  if (end < start) end = start;
  return {
    id: 'g_' + String(ev.getId()).slice(0, 24) + '_' + start, readonly: true, source: link.name,
    type: end > start ? link.multiType : link.singleType, badge: '', start: start, end: end, time: time,
    title: ev.getTitle() || '（無題）', detail: String(ev.getDescription() || '').slice(0, 200),
    owner: '', color: link.color, site: link.site
  };
}

function setCalStatus_(ok, msg) {
  try {
    PropertiesService.getScriptProperties().setProperty('CAL_STATUS', JSON.stringify({
      ok: ok, msg: msg, time: Utilities.formatDate(new Date(), tz_(), 'M/d HH:mm')
    }));
  } catch (e) { /* 状態記録の失敗は無視 */ }
}

function getCalStatus_() {
  if (!readCalendarLinks_().length) return null;
  const v = PropertiesService.getScriptProperties().getProperty('CAL_STATUS');
  return v ? JSON.parse(v) : null;
}

/** メニュー「カレンダー連携の接続テスト」 */
function testCalendar() {
  const ui = uiOrLog_();
  const links = readCalendarLinks_();
  if (!links.length) {
    ui.alert('カレンダー連携', '「カレンダー連携」シートに有効なカレンダーがありません。\nA列にカレンダーID（Googleカレンダーの設定 →「カレンダーの統合」に出るID）を入れてください。', ui.ButtonSet.OK);
    return;
  }
  const today = todayStr_();
  const lines = links.map(link => {
    try {
      const cal = CalendarApp.getCalendarById(link.id);
      if (!cal) return '✕ ' + link.name + '：見つからないか、見る権限がありません（このアカウントで共有されているか確認）';
      const n = cal.getEvents(parseDate_(today), parseDate_(addDaysStr_(today, 31))).length;
      return '○ ' + link.name + '（' + cal.getName() + '）：今後31日で ' + n + ' 件';
    } catch (err) {
      return '✕ ' + link.name + '：' + (err.message || err);
    }
  });
  bumpDataVersion_();
  ui.alert('カレンダー連携の接続テスト', lines.join('\n') + '\n\nTV画面は次の自動更新で反映されます。', ui.ButtonSet.OK);
}