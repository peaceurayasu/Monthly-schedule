/**
 * 過去予定のアーカイブ（v1.4.0〜）
 * ------------------------------------------------------------
 * 終了日から「アーカイブ月数」（設定シート、初期3か月）を過ぎた予定を「予定_過去」シートへ移す。
 * 予定シートが軽くなり、TV表示・入力画面の読み込みが速いまま保てる。
 *  - 手動：メニュー「過去予定を今すぐアーカイブ」
 *  - 自動：メニュー「自動アーカイブをON（毎月1日）」で月1回のトリガーを作る。OFFメニューで削除
 */

/** メニュー：今すぐアーカイブ（件数を確認してから実行） */
function archiveNow() {
  const ui = uiOrLog_();
  const months = archiveMonths_();
  const n = countArchiveTargets_();
  if (!n) { ui.alert('アーカイブ', '終了から' + months + 'か月を過ぎた予定はありません。', ui.ButtonSet.OK); return; }
  const res = ui.alert('アーカイブ', '終了から' + months + 'か月を過ぎた予定 ' + n + ' 件を「予定_過去」シートへ移動します。よろしいですか？', ui.ButtonSet.YES_NO);
  if (res !== ui.Button.YES) return;
  const moved = archiveOldEvents_();
  ui.alert('アーカイブ', moved + ' 件を移動しました。', ui.ButtonSet.OK);
}

/** トリガーから呼ばれる（画面なし） */
function autoArchive() {
  try {
    const n = archiveOldEvents_();
    console.log('自動アーカイブ: ' + n + '件');
  } catch (err) {
    console.error('自動アーカイブ失敗: ' + (err && err.stack || err));
  }
}

/** メニュー：自動アーカイブON（毎月1日 3時台） */
function enableAutoArchive() {
  const ui = uiOrLog_();
  const res = ui.alert('自動アーカイブ', '毎月1日の深夜3時台に、終了から' + archiveMonths_() + 'か月を過ぎた予定を自動で「予定_過去」へ移動します。\n（定期実行のトリガーを1つ作成します）\nよろしいですか？', ui.ButtonSet.YES_NO);
  if (res !== ui.Button.YES) return;
  removeArchiveTriggers_();
  ScriptApp.newTrigger('autoArchive').timeBased().onMonthDay(1).atHour(3).create();
  ui.alert('自動アーカイブをONにしました。');
}

/** メニュー：自動アーカイブOFF */
function disableAutoArchive() {
  const n = removeArchiveTriggers_();
  uiOrLog_().alert(n ? '自動アーカイブをOFFにしました。' : '自動アーカイブは設定されていません。');
}

function removeArchiveTriggers_() {
  let n = 0;
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'autoArchive') { ScriptApp.deleteTrigger(t); n++; }
  });
  return n;
}

function archiveMonths_() {
  return Math.max(1, Math.min(24, Number(getSettings_()['アーカイブ月数']) || 3));
}

/**
 * この日付より前に終わった予定が対象。
 * 月末は日をその月の最終日に合わせる（5/31 の3か月前を「2/31＝3/3」ではなく 2/28 にする）。
 */
function archiveCutoff_() {
  const t = parseDate_(todayStr_());
  const first = new Date(t.getFullYear(), t.getMonth() - archiveMonths_(), 1);
  const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return fmtYmd_(new Date(first.getFullYear(), first.getMonth(), Math.min(t.getDate(), lastDay)));
}

function countArchiveTargets_() {
  const sh = ss_().getSheetByName(SHEET.EVENTS);
  if (!sh || sh.getLastRow() < 2) return 0;
  const cutoff = archiveCutoff_();
  return sh.getDataRange().getValues().slice(1).filter(r => isArchiveTarget_(r, cutoff)).length;
}

function isArchiveTarget_(row, cutoff) {
  const end = fmtYmd_(row[4]) || fmtYmd_(row[3]);
  return !!row[0] && !!end && end < cutoff;
}

/**
 * 対象行を予定_過去へ追記し、予定シートは残す行だけで書き直す（1行ずつ削除するより速い）。
 * @return {number} 移動した件数
 */
function archiveOldEvents_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sh = ss_().getSheetByName(SHEET.EVENTS);
    if (!sh || sh.getLastRow() < 2) return 0;
    const width = HEADERS.EVENTS.length;
    const rows = sh.getRange(2, 1, sh.getLastRow() - 1, width).getValues();
    const cutoff = archiveCutoff_();
    const old = rows.filter(r => isArchiveTarget_(r, cutoff));
    if (!old.length) return 0;
    const keep = rows.filter(r => !isArchiveTarget_(r, cutoff));

    const arc = ensureSheet_(SHEET.ARCHIVE, HEADERS.EVENTS);
    arc.getRange(arc.getLastRow() + 1, 1, old.length, width).setValues(old);

    sh.getRange(2, 1, rows.length, width).clearContent();
    if (keep.length) sh.getRange(2, 1, keep.length, width).setValues(keep);
    bumpDataVersion_();
    logChange_('アーカイブ', '予定', old.length + '件を「' + SHEET.ARCHIVE + '」へ移動', '');
    return old.length;
  } finally {
    lock.releaseLock();
  }
}