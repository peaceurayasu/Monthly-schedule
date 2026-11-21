/**
 * 自動バックアップ（v2.2.0〜）
 * ------------------------------------------------------------
 * スプレッドシートを丸ごとコピーして、持ち主のドライブ「電子予定表_バックアップ」フォルダに保存する。
 * 入力URLを知っている人なら誰でも消せる仕組みなので、間違って消したときに戻せるようにする。
 *  - 手動：メニュー「バックアップを今すぐ作成」
 *  - 自動：メニュー「自動バックアップをON（毎週月曜）」で週1回のトリガーを作る。OFFメニューで削除
 *  - 古いものは設定「バックアップ世代数」（初期12＝約3か月分）を超えたらゴミ箱へ
 * 戻し方：バックアップのファイルを開き、必要なシートの行をコピーして元のシートに貼る（README参照）。
 */

const BACKUP_FOLDER_NAME = '電子予定表_バックアップ';
const BACKUP_TRIGGER = 'autoBackup';

function backupFolder_() {
  const p = PropertiesService.getScriptProperties();
  const id = p.getProperty('BACKUP_FOLDER_ID');
  if (id) {
    try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) { /* 作り直す */ }
  }
  const f = DriveApp.createFolder(BACKUP_FOLDER_NAME);
  p.setProperty('BACKUP_FOLDER_ID', f.getId());
  return f;
}

function backupKeep_() {
  return Math.max(1, Math.min(100, Math.floor(Number(getSettings_()['バックアップ世代数']) || 12)));
}

/**
 * コピーを1つ作り、古いものを整理する。
 * @return {{name:string, url:string, trashed:number}}
 */
function createBackup_() {
  const ss = ss_();
  const name = ss.getName() + '_バックアップ_' + Utilities.formatDate(new Date(), tz_(), 'yyyyMMdd_HHmm');
  const folder = backupFolder_();
  const file = DriveApp.getFileById(ss.getId()).makeCopy(name, folder);

  // 新しい順に並べて、世代数を超えた分をゴミ箱へ（このフォルダのスプレッドシートだけ対象）
  const list = [];
  const it = folder.getFilesByType(MimeType.GOOGLE_SHEETS);
  while (it.hasNext()) list.push(it.next());
  list.sort((a, b) => b.getDateCreated() - a.getDateCreated());
  let trashed = 0;
  list.slice(backupKeep_()).forEach(f => { try { f.setTrashed(true); trashed++; } catch (e) { console.warn('古いバックアップの削除に失敗: ' + e); } });
  return { name: name, url: file.getUrl(), trashed: trashed };
}

/** メニュー：今すぐバックアップ */
function backupNow() {
  const ui = uiOrLog_();
  const r = createBackup_();
  ui.alert('バックアップ', 'ドライブの「' + BACKUP_FOLDER_NAME + '」に保存しました。\n' + r.name +
    (r.trashed ? '\n（古いバックアップ ' + r.trashed + ' 件をゴミ箱へ移しました）' : ''), ui.ButtonSet.OK);
}

/** トリガーから呼ばれる（画面なし） */
function autoBackup() {
  try {
    const r = createBackup_();
    console.log('自動バックアップ: ' + r.name);
  } catch (err) {
    console.error('自動バックアップ失敗: ' + (err && err.stack || err));
    try { sendMailToAdmin_('【電子予定表】自動バックアップに失敗しました', String(err && err.message || err)); } catch (e) { /* 通知先が無ければ何もしない */ }
  }
}

/** メニュー：自動バックアップON（毎週月曜 2時台） */
function enableAutoBackup() {
  const ui = uiOrLog_();
  const res = ui.alert('自動バックアップ', '毎週月曜の深夜2時台に、このスプレッドシートのコピーをドライブの「' + BACKUP_FOLDER_NAME + '」に保存します。\n' +
    '新しい順に ' + backupKeep_() + ' 個を残し、それより古いものはゴミ箱へ移します。\n（定期実行のトリガーを1つ作成します）\nよろしいですか？', ui.ButtonSet.YES_NO);
  if (res !== ui.Button.YES) return;
  removeBackupTriggers_();
  ScriptApp.newTrigger(BACKUP_TRIGGER).timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(2).create();
  ui.alert('自動バックアップをONにしました。');
}

/** メニュー：自動バックアップOFF */
function disableAutoBackup() {
  const n = removeBackupTriggers_();
  uiOrLog_().alert(n ? '自動バックアップをOFFにしました。' : '自動バックアップは設定されていません。');
}

function removeBackupTriggers_() {
  let n = 0;
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === BACKUP_TRIGGER) { ScriptApp.deleteTrigger(t); n++; }
  });
  return n;
}