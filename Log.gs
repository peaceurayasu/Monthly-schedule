/**
 * 変更履歴（v2.2.0〜）
 * ------------------------------------------------------------
 * 入力画面からの追加・変更・削除を「変更履歴」シートに1行ずつ残す。「誰がこの予定を消した？」が分かるようにする。
 *  - 入力者名：入力画面で最初に選んでもらい（スマホに記憶）、編集キーと一緒に送られてくる（checkKey_ で取り出す）
 *  - 最大 LOG_MAX_ROWS 行。超えたら古い順に消す
 *  - 記録に失敗しても保存・削除そのものは止めない
 */

const LOG_HEADERS = ['日時', '操作', '種類', '件名', '入力者', 'ID'];
const LOG_MAX_ROWS = 3000;
const LOG_TRIM_STEP = 200;   // 1行ずつ消すと遅いので、まとめて消す

/** checkKey_ が入れる、この実行の入力者名（メニュー・自動実行など入力画面以外からは空） */
let EDITOR_ = '';

/**
 * @param {string} op   追加／変更／削除 など
 * @param {string} kind 予定／期限タスク／お知らせ など
 */
function logChange_(op, kind, title, id) {
  try {
    const sh = ensureSheet_(SHEET.LOG, LOG_HEADERS);
    sh.appendRow([new Date(), op, kind, cut_(title, 100), EDITOR_ || '（入力画面以外）', String(id || '')]);
    const extra = sh.getLastRow() - 1 - LOG_MAX_ROWS;
    if (extra >= LOG_TRIM_STEP) sh.deleteRows(2, extra);
  } catch (e) {
    console.warn('変更履歴の記録に失敗: ' + e);
  }
}