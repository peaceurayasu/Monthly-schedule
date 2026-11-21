/**
 * 通知・TV稼働チェック（v1.6.0〜）
 * ------------------------------------------------------------
 *  - TV稼働チェック：TV画面がデータを取りに来た時刻を記録し、一定時間来なければ管理者にメール。復旧したら復旧メール
 *  - 前日通知：毎日決まった時刻に「明日の予定」と「期限が近いタスク」を送る
 *  - 送信先：メール／Chatwork／LINE WORKS（Incoming Webhook）／Googleチャット・Slack・Teams（Webhook）
 * Chatworkのトークン・Webhook URLは漏れると困るため、シートではなくスクリプトプロパティに保存する。
 */

const HB_PREFIX = 'HB_';         // 最終アクセス時刻
const HB_ALERT_PREFIX = 'HBA_';  // 停止メール送信済みの印
const HB_TRIGGER = 'checkTvHeartbeat';
const DAILY_TRIGGER = 'sendDailyNotice';
const SECRET_KEYS = ['CW_TOKEN', 'CW_ROOM', 'WEBHOOK_URL'];

/* ============================================================
 * TV稼働チェック
 * ============================================================ */

/** TV画面からのアクセスを記録（1分に1回まで）。停止メール送信済みなら復旧メールを送る */
function recordHeartbeat_(site) {
  try {
    const name = site || '(全拠点)';
    const cache = CacheService.getScriptCache();
    if (cache.get('hbw_' + name)) return;
    cache.put('hbw_' + name, '1', 60);
    // 拠点シートに無い名前（URLの打ち間違い・関係ない人のアクセス）は記録しない。
    // 記録すると監視対象に入り、30分後に「TVが止まっている」メールが誤って届くため。
    if (site && !readSites_().some(x => x.name === site)) return;
    const props = PropertiesService.getScriptProperties();
    props.setProperty(HB_PREFIX + name, String(Date.now()));
    if (props.getProperty(HB_ALERT_PREFIX + name)) {
      props.deleteProperty(HB_ALERT_PREFIX + name);
      sendMailToAdmin_('【電子予定表】TV画面が復旧しました（' + name + '）',
        'TV画面「' + name + '」の表示が再開しました。\n' + fmtNow_() + ' 確認');
    }
  } catch (e) {
    console.warn('稼働記録に失敗: ' + e);
  }
}

/** 各TVの最終アクセス [{name, last, minutes, alerted}] */
function getHeartbeats_() {
  const all = PropertiesService.getScriptProperties().getProperties();
  const now = Date.now();
  return Object.keys(all).filter(k => k.indexOf(HB_PREFIX) === 0).map(k => {
    const name = k.slice(HB_PREFIX.length);
    const last = Number(all[k]) || 0;
    return { name: name, last: last ? Utilities.formatDate(new Date(last), tz_(), 'M/d HH:mm') : '-',
      minutes: last ? Math.floor((now - last) / 60000) : null, alerted: !!all[HB_ALERT_PREFIX + name] };
  }).sort((a, b) => a.name.localeCompare(b.name, 'ja'));
}

/** トリガー（15分ごと）から呼ばれる */
function checkTvHeartbeat() {
  const s = getSettings_();
  if (String(s['稼働チェック']) !== 'ON') return;
  if (!inWatchTime_(s, new Date())) return;
  const limit = Math.max(10, Number(s['稼働チェック_分']) || 30);
  const props = PropertiesService.getScriptProperties();
  getHeartbeats_().forEach(hb => {
    // 7日以上来ていないTVは「撤去済み」とみなして通知しない
    if (hb.minutes == null || hb.minutes < limit || hb.minutes > 7 * 24 * 60 || hb.alerted) return;
    props.setProperty(HB_ALERT_PREFIX + hb.name, '1');
    sendMailToAdmin_('【電子予定表】TV画面が止まっている可能性があります（' + hb.name + '）',
      'TV画面「' + hb.name + '」から ' + hb.minutes + ' 分間アクセスがありません。\n' +
      '最終確認：' + hb.last + '\n\n確認すること：\n・TVの電源が入っているか\n・Wi-Fiにつながっているか\n・ブラウザが固まっていないか（再読み込み）\n\n' +
      '復旧すると自動でお知らせします。');
  });
}

/** 監視する時間帯か（土日を除く設定にも対応） */
function inWatchTime_(s, d) {
  const dow = d.getDay();
  if (String(s['土日も監視']) !== 'ON' && (dow === 0 || dow === 6)) return false;
  const toMin = t => { const m = String(t || '').match(/^(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  const st = toMin(s['監視開始']), en = toMin(s['監視終了']);
  if (st == null || en == null) return true;
  const cur = d.getHours() * 60 + d.getMinutes();
  return st <= en ? cur >= st && cur < en : cur >= st || cur < en;
}

/** 撤去したTVなどを一覧から消す */
function resetHeartbeat(key, name) {
  checkKey_(key);
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty(HB_PREFIX + name);
  props.deleteProperty(HB_ALERT_PREFIX + name);
  return getHeartbeats_();
}

/* ============================================================
 * 前日通知
 * ============================================================ */

/** トリガー（毎日 指定時刻）から呼ばれる */
function sendDailyNotice() {
  const s = getSettings_();
  if (String(s['前日通知']) !== 'ON') return;
  const r = buildDailyMessage_();
  sendAll_(r.title, r.text);
}

/** 明日の予定＋期限が近いタスクの文面 */
function buildDailyMessage_() {
  const today = todayStr_();
  const tomorrow = addDaysStr_(today, 1);
  const WD = '日月火水木金土';
  const label = d => Number(d.slice(5, 7)) + '/' + Number(d.slice(8, 10)) + '(' + WD.charAt(parseDate_(d).getDay()) + ')';
  const evs = collectEvents_(tomorrow, tomorrow).sort((a, b) => (timeKey_(a.time) || '99').localeCompare(timeKey_(b.time) || '99'));
  const warn = Number(getSettings_()['期限警告日数']) || 3;
  const tasks = readTasks_().filter(t => !t.done && diffDays_(today, t.due) <= warn).sort((a, b) => a.due.localeCompare(b.due));
  const lines = ['■ 明日 ' + label(tomorrow) + ' の予定（' + evs.length + '件）'];
  if (!evs.length) lines.push('　予定なし');
  evs.forEach(e => lines.push('・' + (e.time ? e.time + ' ' : '') + (e.badge ? '[' + e.badge + '] ' : '') + e.title +
    (e.end > e.start ? '（〜' + label(e.end) + '）' : '') + (e.owner ? ' ／ ' + e.owner : '') + (e.site ? ' ＠' + e.site : '')));
  if (tasks.length) {
    lines.push('', '■ 期限が近いタスク');
    tasks.forEach(t => {
      const n = diffDays_(today, t.due);
      lines.push('・' + t.title + '　' + label(t.due) + (n < 0 ? '（' + (-n) + '日超過）' : n === 0 ? '（今日）' : '（あと' + n + '日）'));
    });
  }
  return { title: '【予定表】明日 ' + label(tomorrow) + ' の予定', text: lines.join('\n') };
}

/* ============================================================
 * 送信（メール／Chatwork／LINE WORKS／Webhook）
 * ============================================================ */

/** 設定されている全部の送信先に送る。結果を文字列の配列で返す */
function sendAll_(title, text) {
  const res = [];
  const s = getSettings_();
  const p = PropertiesService.getScriptProperties();
  if (String(s['通知先メール'] || '').trim()) res.push(trySend_('メール', () => sendMailToAdmin_(title, text)));
  if (p.getProperty('CW_TOKEN') && p.getProperty('CW_ROOM')) res.push(trySend_('Chatwork', () => sendChatwork_(title, text)));
  if (p.getProperty('WEBHOOK_URL')) res.push(trySend_('Webhook', () => sendWebhook_(title, text)));
  if (!res.length) res.push('送信先が1つも設定されていません');
  return res;
}

function trySend_(name, fn) {
  try { fn(); return '○ ' + name + '：送信しました'; }
  catch (e) { console.error(name + '送信失敗: ' + e); return '✕ ' + name + '：' + (e.message || e); }
}

function sendMailToAdmin_(subject, body) {
  const to = String(getSettings_()['通知先メール'] || '').split(/[,、\s]+/).filter(x => /@/.test(x)).join(',');
  if (!to) return;
  MailApp.sendEmail({ to: to, subject: subject, body: body + '\n\n--\n電子予定表 自動送信', name: '電子予定表' });
}

function sendChatwork_(title, text) {
  const p = PropertiesService.getScriptProperties();
  const res = UrlFetchApp.fetch('https://api.chatwork.com/v2/rooms/' + encodeURIComponent(p.getProperty('CW_ROOM')) + '/messages', {
    method: 'post', headers: { 'X-ChatWorkToken': p.getProperty('CW_TOKEN') },
    payload: { body: '[info][title]' + title + '[/title]' + text + '[/info]' }, muteHttpExceptions: true
  });
  if (res.getResponseCode() >= 300) throw new Error('Chatworkの応答エラー HTTP ' + res.getResponseCode() + '（トークン・ルームIDを確認）');
}

/** LINE WORKS（webhook.worksmobile.com）とそれ以外（Googleチャット・Slack・Teams）で形式を変える */
function sendWebhook_(title, text) {
  const url = PropertiesService.getScriptProperties().getProperty('WEBHOOK_URL');
  const body = /worksmobile\.com/.test(url) ? { title: title, body: { text: text } } : { text: '*' + title + '*\n' + text };
  const res = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json; charset=UTF-8',
    payload: JSON.stringify(body), muteHttpExceptions: true });
  if (res.getResponseCode() >= 300) throw new Error('Webhookの応答エラー HTTP ' + res.getResponseCode() + '（URLを確認）');
}

function fmtNow_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy/MM/dd HH:mm'); }

/* ============================================================
 * 入力画面「表示設定 → 通知」から呼ばれるAPI
 * ============================================================ */

const NOTIFY_KEYS = ['通知先メール', '稼働チェック', '稼働チェック_分', '監視開始', '監視終了', '土日も監視', '前日通知', '前日通知_時刻'];

function getNotifySettings(key) {
  checkKey_(key);
  const s = getSettings_();
  const p = PropertiesService.getScriptProperties();
  const o = {};
  NOTIFY_KEYS.forEach(k => { o[k] = s[k] == null ? '' : String(s[k]); });
  o.cwRoom = p.getProperty('CW_ROOM') || '';
  o.cwTokenSet = !!p.getProperty('CW_TOKEN');           // トークン自体は画面に返さない
  const wh = p.getProperty('WEBHOOK_URL') || '';
  o.webhookSet = !!wh;
  o.webhookKind = !wh ? '' : /worksmobile\.com/.test(wh) ? 'LINE WORKS' : /chat\.googleapis\.com/.test(wh) ? 'Googleチャット' :
    /slack\.com/.test(wh) ? 'Slack' : /office|logic\.azure|webhook\.office/.test(wh) ? 'Teams' : 'Webhook';
  o.heartbeats = getHeartbeats_();
  return o;
}

function saveNotifySettings(key, o) {
  checkKey_(key);
  o = o || {};
  const clean = {};
  const mails = String(o['通知先メール'] || '').split(/[,、\s]+/).filter(String);
  if (mails.some(m => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m))) throw new Error('メールアドレスの形式が正しくありません');
  clean['通知先メール'] = mails.join(',');
  ['稼働チェック', '土日も監視', '前日通知'].forEach(k => { clean[k] = o[k] === 'ON' ? 'ON' : 'OFF'; });
  clean['稼働チェック_分'] = Math.max(10, Math.min(720, Math.floor(Number(o['稼働チェック_分']) || 30)));
  ['監視開始', '監視終了'].forEach(k => {
    const v = cut_(o[k], 5);
    if (v && !/^\d{1,2}:\d{2}$/.test(v)) throw new Error(k + 'は「8:00」の形式で入力してください');
    clean[k] = v;
  });
  // 0時も選べるように、空欄・数字以外のときだけ初期値17時にする（「|| 17」だと0が17になっていた）
  const hour = String(o['前日通知_時刻'] == null ? '' : o['前日通知_時刻']).trim() === '' ? NaN : Math.floor(Number(o['前日通知_時刻']));
  clean['前日通知_時刻'] = isNaN(hour) ? 17 : Math.max(0, Math.min(23, hour));
  if ((clean['稼働チェック'] === 'ON') && !clean['通知先メール']) throw new Error('TV稼働チェックには通知先メールが必要です');

  writeSettings_(clean);

  const p = PropertiesService.getScriptProperties();
  if (o.cwToken) p.setProperty('CW_TOKEN', cut_(o.cwToken, 100));
  if (o.cwClear) { p.deleteProperty('CW_TOKEN'); p.deleteProperty('CW_ROOM'); }
  else if (o.cwRoom != null) {
    const room = String(o.cwRoom).replace(/\D/g, '');
    if (room) p.setProperty('CW_ROOM', room); else p.deleteProperty('CW_ROOM');
  }
  if (o.webhookUrl) {
    if (!/^https:\/\//.test(o.webhookUrl)) throw new Error('Webhook URLは https:// で始まるURLを入れてください');
    p.setProperty('WEBHOOK_URL', String(o.webhookUrl).trim());
  }
  if (o.webhookClear) p.deleteProperty('WEBHOOK_URL');

  syncNotifyTriggers_(clean);
  return getNotifySettings(key);
}

/** ON/OFFに合わせてトリガーを作る・消す（このパッケージのトリガーだけ触る） */
function syncNotifyTriggers_(s) {
  ScriptApp.getProjectTriggers().forEach(t => {
    const fn = t.getHandlerFunction();
    if (fn === HB_TRIGGER || fn === DAILY_TRIGGER) ScriptApp.deleteTrigger(t);
  });
  if (s['稼働チェック'] === 'ON') ScriptApp.newTrigger(HB_TRIGGER).timeBased().everyMinutes(15).create();
  if (s['前日通知'] === 'ON') ScriptApp.newTrigger(DAILY_TRIGGER).timeBased().everyDays(1).atHour(Number(s['前日通知_時刻'])).create();
}

/** 「テスト送信」：明日の予定を今すぐ送る */
function sendTestNotice(key) {
  checkKey_(key);
  const r = buildDailyMessage_();
  return sendAll_('（テスト）' + r.title, r.text);
}

/** 設定シートに書く（無い項目は追加）。saveDisplaySettings と共通 */
function writeSettings_(clean) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = ss_().getSheetByName(SHEET.SETTINGS);
    const vals = sh.getDataRange().getValues();
    Object.keys(clean).forEach(k => {
      let r = -1;
      for (let i = 1; i < vals.length; i++) if (vals[i][0] === k) { r = i + 1; break; }
      if (r > 0) sh.getRange(r, 2).setNumberFormat('@').setValue(String(clean[k]));
      else { sh.appendRow([k, String(clean[k]), '']); vals.push([k]); }
    });
    SETTINGS_MEMO_ = null;
    bumpDataVersion_();
  } finally {
    lock.releaseLock();
  }
}