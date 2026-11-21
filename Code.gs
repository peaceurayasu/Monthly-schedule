/**
 * 電子予定表パッケージ v2.1.2
 * ------------------------------------------------------------
 * スプレッドシートにバインドして使うGASパッケージ。
 *  - TV表示画面（Display.html）：閲覧専用。自動更新・月切替・夜間暗転・天気予報・お知らせテロップ
 *  - 入力画面（Input.html）  ：スマホ向け。URLの編集キーで保護
 * 機能ごとのファイル：Masters.gs（拠点・担当者）／Recurring.gs（繰り返し予定）／
 *   CalendarSync.gs（Googleカレンダー連携）／Archive.gs（過去予定のアーカイブ）／
 *   Notify.gs（通知・TV稼働チェック）／Media.gs（写真・図面・動画）／QrLib.gs（QRコード）
 * 使い方は README.md を参照。
 */

const APP = { NAME: '電子予定表', VERSION: '2.1.2' };

const SHEET = {
  SETTINGS: '設定', EVENTS: '予定', TASKS: '期限タスク', BADGES: 'バッジ', NOTICES: 'お知らせ',
  RECUR: '繰り返し予定', SITES: '拠点', OWNERS: '担当者', CALS: 'カレンダー連携', ARCHIVE: '予定_過去'
};

const HEADERS = {
  SETTINGS: ['項目', '値', '説明'],
  // 「拠点」列は v1.4.0 で右端に追加（既存の列は動かしていない）
  EVENTS: ['ID', '種別', 'バッジ', '開始日', '終了日', '時刻', '件名', '詳細', '担当', '色', '更新日時', '拠点'],
  TASKS: ['ID', '件名', '期限', '完了', '担当', '更新日時', '拠点'],
  BADGES: ['バッジ名', '背景色', '文字色', '表示順'],
  NOTICES: ['ID', '内容', '開始日', '終了日', '重要', '更新日時', '拠点', '画像'],
  RECUR: ['ID', '種別', 'バッジ', '繰り返し', '曜日', '日', '第N週', '有効開始', '有効終了', '時刻', '件名', '担当', '拠点', '色', '除外日', '更新日時'],
  SITES: ['拠点名', '天気_地域コード', '天気_エリア番号', '天気_地点名', '表示順'],
  OWNERS: ['担当者名', '色', '表示順'],
  CALS: ['カレンダーID', '表示名', '拠点', '色', '単日の種別', '複数日の種別', '有効']
};

/** 種別＝TV画面のレーン。イベント：日付ごとの予定／工事：期間バー／人：出張・休みなど */
const EVENT_TYPES = ['イベント', '工事', '人'];

const DEFAULT_SETTINGS = [
  ['表示タイトル', '予定表', 'TV画面のタイトル'],
  ['会社名', '', 'タイトル横に小さく表示（空欄可）'],
  ['更新間隔(分)', 2, 'TV画面がデータを取り直す間隔'],
  ['月切替(秒)', 0, '0＝今月のみ表示。30にすると今月／来月を30秒ごとに切替'],
  ['期限警告日数', 3, '期限まで残りこの日数以内ならオレンジ表示'],
  ['夜間暗転開始', '20:00', 'この時刻から画面を暗くする（空欄で無効）'],
  ['夜間暗転終了', '07:00', 'この時刻に元に戻す'],
  ['レーン名_イベント', '予定', 'TV画面の1段目の名前'],
  ['レーン名_工事', '工事・案件', 'TV画面の2段目の名前'],
  ['レーン名_人', '人・出張', 'TV画面の3段目の名前'],
  ['編集キー', '', '入力画面URLに付けるキー（初期設定で自動生成）'],
  ['公開URL', '', 'デプロイを管理で表示される「/exec」で終わるURLを貼る（URL確認で使う）'],
  ['テーマ', 'ダーク', 'ダーク／ライト／ハイコントラスト／カスタム'],
  ['文字サイズ', '標準', '標準／大／特大'],
  ['カスタム_背景色', '#0e1621', 'テーマ＝カスタムのときの画面背景'],
  ['カスタム_パネル色', '#152030', '表とサイドパネルの背景'],
  ['カスタム_文字色', '#eef3f8', 'メインの文字色'],
  ['カスタム_補助文字色', '#9fb2c6', '見出し・日付など'],
  ['カスタム_罫線色', '#2b3b4e', '日付の区切り線'],
  ['カスタム_強調色', '#ffd54f', '時刻・今日の枠'],
  ['天気_表示', 'ON', 'ON／OFF。気象庁の天気予報を画面上部に表示'],
  ['天気_地点名', '那覇', '画面に出す地点名'],
  ['天気_地域コード', '471000', '気象庁の府県予報区コード（例：沖縄本島地方 471000／東京都 130000）README参照'],
  ['天気_エリア番号', 0, '地域内の何番目の地域を使うか（0＝最初）'],
  ['天気_日数', 5, '表示する日数（3〜5）'],
  ['テロップ表示', 'ON', 'ON／OFF。画面下にお知らせを流す'],
  ['テロップ速度', '標準', '遅い／標準／速い'],
  ['色分け', '種別・バッジ', '種別・バッジ／担当者（担当者シートの色で塗る）'],
  ['アーカイブ月数', 3, '終了からこの月数を過ぎた予定を「予定_過去」へ移す'],
  ['表示モード', '月', '月／2週間（今週と来週を大きく表示）／人の動き（担当者ごとの2週間）'],
  ['朝の読み上げ時刻', '', '例 08:00。この時刻に今日の予定を音声で読み上げ（空欄＝しない）'],
  ['お知らせチャイム', 'ON', 'ON／OFF。重要なお知らせが新しく出たらチャイム＋読み上げ'],
  ['写真表示_間隔(分)', 5, '写真付きお知らせを何分おきに大きく表示するか'],
  ['写真表示_秒', 15, '写真1枚を何秒表示するか'],
  ['段の並び', '工事・案件が上', '工事・案件が上／予定が上（TV画面の段の順番）'],
  ['名前マグネット', 'ON', 'ON／OFF。人・出張の段に担当者の名前札を表示'],
  ['動画の音', 'OFF', 'ON／OFF。お知らせの動画を音ありで流す（TVで音声ONが必要）'],
  ['QRコード', 'ON', 'ON／OFF。TV画面の右上（時計の左）に、スマホ入力用のQRコードを表示'],
  ['QRコード_説明', 'スマホで読み取ると予定を入力できます', 'QRコードの横に出す説明文（短めに）'],
  ['YouTube_URL', '', '焼付防止に流すYouTubeのURL（動画または再生リスト）。空欄なら流さない'],
  ['YouTube_間隔(分)', 60, '何分おきに流すか（0＝間隔では流さない）'],
  ['YouTube_再生(分)', 3, '1回に流す長さ（分）'],
  ['YouTube_時間帯', '', 'この時間は流し続ける（例 12:00-13:00、空欄でなし）'],
  ['YouTube_音', 'OFF', 'ON／OFF。YouTubeを音ありで流す（TVで音声ONが必要）'],
  ['焼付防止_ずらし', 'ON', 'ON／OFF。数分ごとに画面全体をわずかにずらして焼き付きを防ぐ'],
  ['BGM_URL', '', 'BGMで流すYouTubeのURL（動画または再生リスト）。右欄の小窓で再生。空欄なら流さない'],
  ['BGM_音量', 30, 'BGMの音量（0〜100）'],
  ['BGM_時間帯', '', 'BGMを流す時間（例 8:00-17:00、空欄なら夜間暗転以外ずっと）'],
  ['右欄_今日の予定', 'ON', 'ON／OFF。TV右側の「今日の予定」'],
  ['右欄_明日の予定', 'ON', 'ON／OFF。TV右側の「明日の予定」'],
  ['右欄_期限タスク', 'ON', 'ON／OFF。TV右側の「期限タスク」'],
  ['右欄_その後の予定', 'ON', 'ON／OFF。TV右側の「来月・その後の予定」（全部OFFで予定表を横いっぱいに表示）'],
  ['通知先メール', '', 'TV停止・前日通知のメール送信先（カンマ区切りで複数可）'],
  ['稼働チェック', 'OFF', 'ON／OFF。TV画面が止まったらメールで知らせる'],
  ['稼働チェック_分', 30, 'この分数アクセスが無ければ停止とみなす'],
  ['監視開始', '07:30', '稼働チェックをする時間帯（開始）'],
  ['監視終了', '18:00', '稼働チェックをする時間帯（終了）'],
  ['土日も監視', 'OFF', 'ON／OFF'],
  ['前日通知', 'OFF', 'ON／OFF。毎日、明日の予定を送る'],
  ['前日通知_時刻', 17, '送る時刻（0〜23時）']
];

/** 表示設定として入力画面から変更できる項目 */
const DISPLAY_SETTING_KEYS = ['表示タイトル', '会社名', 'テーマ', '文字サイズ', 'カスタム_背景色', 'カスタム_パネル色',
  'カスタム_文字色', 'カスタム_補助文字色', 'カスタム_罫線色', 'カスタム_強調色', '月切替(秒)', '夜間暗転開始', '夜間暗転終了',
  '天気_表示', '天気_地点名', '天気_地域コード', '天気_エリア番号', '天気_日数', 'テロップ表示', 'テロップ速度',
  '色分け', 'アーカイブ月数', '表示モード', '朝の読み上げ時刻', 'お知らせチャイム', '写真表示_間隔(分)', '写真表示_秒',
  '段の並び', '右欄_今日の予定', '右欄_明日の予定', '右欄_期限タスク', '右欄_その後の予定', '名前マグネット', '動画の音',
  'QRコード', 'QRコード_説明', 'YouTube_URL', 'YouTube_間隔(分)', 'YouTube_再生(分)', 'YouTube_時間帯', 'YouTube_音', '焼付防止_ずらし',
  'BGM_URL', 'BGM_音量', 'BGM_時間帯'];
const THEMES = ['ダーク', 'ライト', 'ハイコントラスト', 'カスタム'];
const FONT_SIZES = ['標準', '大', '特大'];
const ON_OFF = ['ON', 'OFF'];
const TICKER_SPEEDS = ['遅い', '標準', '速い'];
const COLOR_MODES = ['種別・バッジ', '担当者'];
const VIEW_MODES = ['月', '2週間', '人の動き'];
const LANE_ORDERS = ['工事・案件が上', '予定が上'];
const SIDE_KEYS = ['右欄_今日の予定', '右欄_明日の予定', '右欄_期限タスク', '右欄_その後の予定'];
/** ON/OFF だけの表示設定（プルダウンと入力チェックに使う） */
const ONOFF_DISPLAY_KEYS = SIDE_KEYS.concat(['名前マグネット', '動画の音', 'QRコード', 'YouTube_音', '焼付防止_ずらし']);

const DEFAULT_BADGES = [
  ['入札', '#d32f2f', '#ffffff', 1],
  ['電入', '#c2185b', '#ffffff', 2],
  ['見積提出', '#1565c0', '#ffffff', 3],
  ['会議', '#2e7d32', '#ffffff', 4],
  ['休み', '#616161', '#ffffff', 5]
];

const HOLIDAY_CAL_ID = 'ja.japanese#holiday@group.v.calendar.google.com';
const WEATHER_CACHE_SEC = 3600;  // 天気のキャッシュ秒数（1時間）
const CACHE_SEC = 300;          // 表示データのキャッシュ秒数
const HOLIDAY_CACHE_SEC = 21600; // 祝日のキャッシュ秒数（6時間）

/* ============================================================
 * メニュー・初期設定
 * ============================================================ */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📅 電子予定表')
    .addItem('初期設定（シート作成）', 'setupApp')
    .addItem('サンプルデータ投入', 'insertSampleData')
    .addSeparator()
    .addItem('表示・入力URLを確認', 'showUrls')
    .addItem('表示キャッシュをクリア', 'clearDisplayCache')
    .addItem('天気予報の接続テスト', 'testWeather')
    .addItem('カレンダー連携の接続テスト', 'testCalendar')
    .addSeparator()
    .addItem('過去予定を今すぐアーカイブ', 'archiveNow')
    .addItem('自動アーカイブをON（毎月1日）', 'enableAutoArchive')
    .addItem('自動アーカイブをOFF', 'disableAutoArchive')
    .addToUi();
}

/**
 * 画面（ダイアログ）を返す。エディタやトリガーから実行したときは画面が使えないため、
 * 代わりに実行ログへ出す代用品を返す。確認ダイアログ（はい／いいえ）は「いいえ」扱いになり、処理は中止される。
 */
function uiOrLog_() {
  try {
    return SpreadsheetApp.getUi();
  } catch (e) {
    return {
      alert: function () { console.log([].slice.call(arguments).filter(a => typeof a === 'string' && a !== 'OK' && a !== 'YES_NO').join('\n')); return null; },
      showModalDialog: function () { console.log('この操作はスプレッドシートのメニューから実行してください'); },
      ButtonSet: { OK: 'OK', YES_NO: 'YES_NO' },
      Button: { YES: 'YES', NO: 'NO' }
    };
  }
}

/** 足りないシート・設定項目・バッジだけを作る（既存データは上書きしない） */
function setupApp() {
  const ss = ss_();
  ensureSheet_(SHEET.SETTINGS, HEADERS.SETTINGS);
  ensureSheet_(SHEET.EVENTS, HEADERS.EVENTS);
  ensureSheet_(SHEET.TASKS, HEADERS.TASKS);
  const badgeSheet = ensureSheet_(SHEET.BADGES, HEADERS.BADGES);
  ensureSheet_(SHEET.NOTICES, HEADERS.NOTICES);
  [SHEET.RECUR, SHEET.SITES, SHEET.OWNERS, SHEET.CALS].forEach(n => ensureSheet_(n, HEADERS[Object.keys(SHEET).find(k => SHEET[k] === n)]));
  // 旧バージョンのシートに足りない列（拠点など）を右端に追加
  ensureHeaderColumns_(SHEET.EVENTS, HEADERS.EVENTS);
  ensureHeaderColumns_(SHEET.TASKS, HEADERS.TASKS);
  ensureHeaderColumns_(SHEET.NOTICES, HEADERS.NOTICES);

  // 設定：無い項目だけ追加
  const setSheet = ss.getSheetByName(SHEET.SETTINGS);
  const existKeys = setSheet.getDataRange().getValues().slice(1).map(r => String(r[0]));
  const addRows = DEFAULT_SETTINGS.filter(r => existKeys.indexOf(r[0]) < 0).map(r => r.slice());
  addRows.forEach(r => { if (r[0] === '編集キー') r[1] = Utilities.getUuid().replace(/-/g, '').slice(0, 16); });
  if (addRows.length) setSheet.getRange(setSheet.getLastRow() + 1, 1, addRows.length, 3).setValues(addRows);
  // 編集キーが空なら生成／テーマ・文字サイズはプルダウンにする
  const setVals = setSheet.getDataRange().getValues();
  for (let i = 1; i < setVals.length; i++) {
    const k = setVals[i][0];
    if (k === '編集キー' && !String(setVals[i][1]).trim()) {
      setSheet.getRange(i + 1, 2).setValue(Utilities.getUuid().replace(/-/g, '').slice(0, 16));
    }
    if (k === '天気_地域コード') setSheet.getRange(i + 1, 2).setNumberFormat('@');
    const LISTS = { 'テーマ': THEMES, '文字サイズ': FONT_SIZES, '天気_表示': ON_OFF, 'テロップ表示': ON_OFF, 'テロップ速度': TICKER_SPEEDS, '色分け': COLOR_MODES, '表示モード': VIEW_MODES,
      'お知らせチャイム': ON_OFF, '稼働チェック': ON_OFF, '土日も監視': ON_OFF, '前日通知': ON_OFF, '段の並び': LANE_ORDERS };
    ONOFF_DISPLAY_KEYS.forEach(sk => { LISTS[sk] = ON_OFF; });
    if (LISTS[k]) {
      const list = LISTS[k];
      setSheet.getRange(i + 1, 2).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(list, true).build());
    }
  }

  // バッジ：空なら初期値
  if (badgeSheet.getLastRow() < 2) {
    badgeSheet.getRange(2, 1, DEFAULT_BADGES.length, 4).setValues(DEFAULT_BADGES);
  }

  // 書式：日付列・時刻列（時刻は文字列で保持して自動変換を防ぐ）
  const ev = ss.getSheetByName(SHEET.EVENTS);
  ev.getRange('D:E').setNumberFormat('yyyy/mm/dd');
  ev.getRange('F:F').setNumberFormat('@');
  ss.getSheetByName(SHEET.TASKS).getRange('C:C').setNumberFormat('yyyy/mm/dd');
  ss.getSheetByName(SHEET.NOTICES).getRange('C:D').setNumberFormat('yyyy/mm/dd');

  // 種別の入力規則
  const rule = SpreadsheetApp.newDataValidation().requireValueInList(EVENT_TYPES, true).build();
  ev.getRange('B2:B').setDataValidation(rule);

  // 繰り返し予定・カレンダー連携の入力規則と書式
  const rc = ss.getSheetByName(SHEET.RECUR);
  rc.getRange('B2:B').setDataValidation(rule);
  rc.getRange('D2:D').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(RECUR_PATTERNS, true).build());
  rc.getRange('H:I').setNumberFormat('yyyy/mm/dd');
  rc.getRange('J:J').setNumberFormat('@');
  rc.getRange('O:O').setNumberFormat('@');
  const cl = ss.getSheetByName(SHEET.CALS);
  cl.getRange('E2:F').setDataValidation(rule);
  cl.getRange('G2:G').insertCheckboxes();
  ss.getSheetByName(SHEET.SITES).getRange('B:B').setNumberFormat('@');

  bumpDataVersion_();
  uiOrLog_().alert('初期設定が完了しました。\n次に「デプロイ → 新しいデプロイ（ウェブアプリ）」を行ってください。');
}

function ensureSheet_(name, headers) {
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#e8eef5');
    sh.setFrozenRows(1);
  }
  return sh;
}

/**
 * サンプルデータ（ホワイトボードの内容がもと）。
 * 日付は「実行した週の日曜日」からの日数で作るので、いつ実行しても今月・2週間・人の動きの各表示に出る。
 * 担当者シートが空なら、担当者4人（色つき）も登録する。
 */
function insertSampleData() {
  const ui = uiOrLog_();
  const res = ui.alert('サンプルデータを追加します（予定・期限タスク・お知らせ（写真つき）・繰り返し予定、担当者が空なら担当者も）。\n' +
    '件名に「（サンプル）」が付くので、あとで消せます。写真はドライブの「電子予定表_画像」に入ります。よろしいですか？', ui.ButtonSet.YES_NO);
  if (res !== ui.Button.YES) return;

  const today = todayStr_();
  const sun = addDaysStr_(today, -parseDate_(today).getDay());   // 今週の日曜
  const d = n => addDaysStr_(sun, n);                               // 日曜からn日後
  const S = '（サンプル）';

  // [種別, バッジ, 開始, 終了, 時刻, 件名, 担当, 色]
  const events = [
    // 工事・案件（期間）
    ['工事', '', d(1), d(18), '', '屋良虎地原線' + S, '佐藤', ''],
    ['工事', '', d(1), d(3), '', '管D扱う' + S, '新垣', ''],
    ['工事', '', d(-3), d(9), '', '棚原配水管布設' + S, '比嘉', ''],
    ['工事', '', d(8), d(12), '', '宇良ポンプ場 改修' + S, '山田', ''],
    ['工事', '', d(15), d(19), '', '古町リフォーム' + S, '佐藤', ''],
    ['工事', '', d(13), d(24), '', '国道58号 側溝修繕' + S, '比嘉', ''],
    // 予定（日付の決まった行事）
    ['イベント', '入札', d(2), d(2), '13:30', '国有地借用駐車場' + S, '平安', ''],
    ['イベント', '電入', d(5), d(5), '8:30', '宇良取水ポンプ場 沈砂池土砂除去' + S, '山田', ''],
    ['イベント', '見積提出', d(10), d(10), '', '棚原地区 給水工事' + S, '平安', ''],
    ['イベント', '', d(12), d(12), '10:00', '美化センター修理' + S, '佐藤、新垣', ''],
    ['イベント', '入札', d(16), d(16), '10:00', '屋良団地 給水管更新' + S, '平安', ''],
    ['イベント', '', d(20), d(20), '14:00', '安全大会' + S, '', ''],
    // 人・出張
    ['人', '', d(1), d(3), '', '海淡' + S, '平安', '#c62828'],
    ['人', '', d(3), d(5), '', '京都出張' + S, '平安、山田', ''],
    ['人', '休み', d(8), d(9), '', '有給' + S, '山田', '#616161'],
    ['人', '', d(4), d(4), '9:00', '宮古 現場確認' + S, '新垣', ''],
    ['人', '', d(10), d(10), '', '屋良中継P' + S, '新垣', '#c62828'],
    ['人', '', d(11), d(12), '', '技術研修' + S, '比嘉、新垣', ''],
    ['人', '', d(15), d(15), '', '健康診断' + S, '佐藤', ''],
    ['人', '休み', d(18), d(18), '', '代休' + S, '比嘉', '#616161']
  ];
  // [件名, 期限, 担当]
  const tasks = [
    ['棚原給水引込' + S, addDaysStr_(today, 2), '平安'],
    ['桝修繕切下げ' + S, addDaysStr_(today, 7), '佐藤'],
    ['側溝清掃（その2）' + S, addDaysStr_(today, 14), '新垣'],
    ['請求書の提出' + S, addDaysStr_(today, 1), '山田'],
    ['安全書類の更新' + S, addDaysStr_(today, -1), '比嘉']
  ];
  const owners = [['平安', '#e65100', 1], ['山田', '#2e7d32', 2], ['佐藤', '#6a1b9a', 3], ['新垣', '#1565c0', 4], ['比嘉', '#00838f', 5]];

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const now = new Date();
    const evRows = events.map(e => [newId_(), e[0], e[1], parseDate_(e[2]), parseDate_(e[3]), e[4], e[5], '', e[6], e[7], now, '']);
    const evSh = ss_().getSheetByName(SHEET.EVENTS);
    evSh.getRange(evSh.getLastRow() + 1, 1, evRows.length, HEADERS.EVENTS.length).setValues(evRows);

    const tRows = tasks.map(t => [newId_(), t[0], parseDate_(t[1]), false, t[2], now, '']);
    const tSh = ss_().getSheetByName(SHEET.TASKS);
    tSh.getRange(tSh.getLastRow() + 1, 1, tRows.length, HEADERS.TASKS.length).setValues(tRows);

    const nSh = ss_().getSheetByName(SHEET.NOTICES);
    if (nSh) {
      const t = parseDate_(today), t2 = parseDate_(addDaysStr_(today, 13));
      // 写真つきのお知らせ（ドライブに保存できなかったときは写真なしで入れる）
      let poster = '', map = '';
      try { poster = saveSampleSvg_(sampleSafetyPosterSvg_(), 'サンプル_安全標語'); map = saveSampleSvg_(sampleSiteMapSvg_(), 'サンプル_現場案内図'); }
      catch (e) { console.warn('サンプル画像の保存に失敗: ' + e); }
      const nRows = [
        [newId_(), '本日17時から安全会議を行います' + S, t, t, true, now, '', ''],
        [newId_(), '現場への移動は時間に余裕をもって。安全第一でお願いします' + S, t, t2, false, now, '', ''],
        [newId_(), '今月の安全標語「指差し確認 ヨシ！」' + S, t, t2, false, now, '', poster],
        [newId_(), '屋良虎地原線は片側交互通行です。誘導員の指示に従ってください' + S, t, t2, false, now, '', map]
      ];
      nSh.getRange(nSh.getLastRow() + 1, 1, nRows.length, HEADERS.NOTICES.length).setValues(nRows);
    }

    const rSh = ss_().getSheetByName(SHEET.RECUR);
    if (rSh) {
      // [ID, 種別, バッジ, 繰り返し, 曜日, 日, 第N週, 有効開始, 有効終了, 時刻, 件名, 担当, 拠点, 色, 除外日, 更新日時]
      const rRows = [
        [newId_(), 'イベント', '会議', '毎週', '月', '', '', '', '', '8:00', '朝礼' + S, '', '', '', '', now],
        [newId_(), 'イベント', '会議', '毎月（第N曜日）', '火', '', 2, '', '', '15:00', '定例会議' + S, '平安、山田', '', '', '', now],
        [newId_(), 'イベント', '', '毎月（日付）', '', 25, '', '', '', '', '月末締め・請求書' + S, '山田', '', '', '', now]
      ];
      rSh.getRange(rSh.getLastRow() + 1, 1, rRows.length, HEADERS.RECUR.length).setValues(rRows);
    }

    // 担当者は、まだ1人も登録されていないときだけ入れる（既存の担当者を上書きしない）
    const oSh = ss_().getSheetByName(SHEET.OWNERS);
    if (oSh && oSh.getLastRow() < 2) {
      oSh.getRange(2, 1, owners.length, HEADERS.OWNERS.length).setValues(owners);
    }
    bumpDataVersion_();
  } finally {
    lock.releaseLock();
  }
  ui.alert('サンプルデータを追加しました（予定20件・期限5件・お知らせ4件（写真2枚）・繰り返し3件）。\n' +
    '「設定 → 画面の配置 → 人の動き」で、担当者ごとの表示も試せます。');
}

/**
 * 表示・入力URLを表示する。
 * スプレッドシートから getUrl() を呼ぶと「/dev（テスト用）」や別デプロイのURLが返ることがあるため、
 * 設定シートの「公開URL」（/exec）を優先して使う。
 */
function showUrls() {
  const ui = uiOrLog_();
  const s = getSettings_();
  const saved = String(s['公開URL'] || '').trim();
  const auto = ScriptApp.getService().getUrl() || '';
  const base = (saved || auto).replace(/\?.*$/, '');

  if (!base) {
    ui.alert('まだウェブアプリとしてデプロイされていません。\n「デプロイ → 新しいデプロイ」を行ってください。');
    return;
  }
  const warn = [];
  if (!saved) warn.push('設定シートの「公開URL」が空のため、自動取得したURLを表示しています。動かない場合は「デプロイ → デプロイを管理」に出ている「/exec」で終わるURLを「公開URL」に貼ってください。');
  if (/\/dev$/.test(base)) warn.push('このURLは「/dev（テスト用）」です。編集者しか開けません。「/exec」のURLを使ってください。');
  if (!/\/exec$/.test(base) && !/\/dev$/.test(base)) warn.push('URLが「/exec」で終わっていません。貼り間違いがないか確認してください。');

  const inputUrl = base + '?page=input&key=' + encodeURIComponent(s['編集キー']);
  const sites = readSites_();
  const link = (u) => '<a href="' + esc_(u) + '" target="_blank" style="word-break:break-all">' + esc_(u) + '</a>';
  const html = HtmlService.createHtmlOutput(
    '<div style="font-family:sans-serif;font-size:13px;line-height:1.7">' +
    (warn.length ? '<div style="background:#fff3e0;border:1px solid #ffb74d;padding:8px;border-radius:6px;margin-bottom:8px">' + warn.map(esc_).join('<br>') + '</div>' : '') +
    '<b>TV表示用URL</b>（クリックで開いて確認）<br>' + link(base) + (sites.length ? '<br><small>（全拠点の予定をまとめて表示）</small>' : '') + '<br><br>' +
    (sites.length ? '<b>拠点別のTV表示用URL</b><br>' + sites.map(x => esc_(x.name) + '：' + link(base + '?site=' + encodeURIComponent(x.name))).join('<br>') + '<br><br>' : '') +
    '<b>入力用URL（社内のみで共有）</b><br>' + link(inputUrl) +
    '<p style="color:#c62828">入力用URLを知っている人は誰でも編集できます。漏れた場合は設定シートの編集キーを変更してください。</p></div>'
  ).setWidth(600).setHeight(sites.length ? 480 : 380);
  ui.showModalDialog(html, '表示・入力URL');
}

function clearDisplayCache() {
  bumpDataVersion_();
  uiOrLog_().alert('表示キャッシュをクリアしました。TV画面は次回更新時に最新になります。');
}

/* ============================================================
 * Webアプリ
 * ============================================================ */

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.page === 'input') {
    const key = String(getSettings_()['編集キー'] || '');
    if (!key || String(p.key || '') !== key) {
      return HtmlService.createHtmlOutput(
        '<div style="font-family:sans-serif;padding:24px"><h2>編集キーが正しくありません</h2>' +
        '<p>管理者に入力用URLを確認してください。</p></div>'
      ).setTitle(APP.NAME).addMetaTag('viewport', 'width=device-width, initial-scale=1');
    }
    const t = HtmlService.createTemplateFromFile('Input');
    t.keyJson = JSON.stringify(key).replace(/</g, '\\u003c');
    return t.evaluate()
      .setTitle(APP.NAME + ' 入力')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  const t = HtmlService.createTemplateFromFile('Display');
  t.siteJson = JSON.stringify(cut_(p.site, 30)).replace(/</g, '\\u003c');
  return t.evaluate()
    .setTitle(APP.NAME + (p.site ? '（' + cut_(p.site, 30) + '）' : ''))
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* ============================================================
 * 表示用API（TV画面から呼ばれる）
 * ============================================================ */

/**
 * TV画面に必要なデータを1回でまとめて返す。キャッシュあり。
 * @param {string} ym 'yyyy-MM'（省略時は今月）
 */
function getDisplayData(ym, site, next) {
  ym = normalizeYm_(ym);
  site = cut_(site, 30);
  next = !!next;
  recordHeartbeat_(site);
  const today = todayStr_();
  const cache = CacheService.getScriptCache();
  const key = 'disp_' + getDataVersion_() + '_' + ym + '_' + today + '_' + (next ? 'n' : 'c') + '_' +
    Utilities.base64EncodeWebSafe(site, Utilities.Charset.UTF_8);
  const hit = cache.get(key);
  if (hit) return JSON.parse(hit);

  const data = buildDisplayData_(ym, today, site, next);
  const json = JSON.stringify(data);
  if (json.length < 95000) cache.put(key, json, CACHE_SEC);
  return data;
}

function buildDisplayData_(ym, today, site, next) {
  const settings = getSettings_();
  const viewMode = VIEW_MODES.indexOf(String(settings['表示モード'])) >= 0 ? String(settings['表示モード']) : '月';
  const weekMode = viewMode !== '月';   // 2週間・人の動き は14日分
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7));
  let first, last, nFirst, nLast, label, isCurrent;
  if (weekMode) {
    // 2週間：今週の日曜から14日間（next なら次の14日間）
    const t = parseDate_(today);
    first = addDaysStr_(today, -t.getDay() + (next ? 14 : 0));
    last = addDaysStr_(first, 13);
    nFirst = addDaysStr_(last, 1);
    nLast = addDaysStr_(last, 30);
    isCurrent = !next;
    label = Number(first.slice(5, 7)) + '/' + Number(first.slice(8, 10)) + '〜' + Number(last.slice(5, 7)) + '/' + Number(last.slice(8, 10));
  } else {
    first = ym + '-01';
    last = ym + '-' + pad_(new Date(y, m, 0).getDate());
    nFirst = fmtYmd_(new Date(y, m, 1));
    nLast = fmtYmd_(new Date(y, m + 1, 0));
    isCurrent = ym === today.slice(0, 7);
    label = '';
  }
  const dates = [];
  for (let d = first; d <= last; d = addDaysStr_(d, 1)) dates.push(d);
  const tomorrow = addDaysStr_(today, 1);

  // 予定シート＋繰り返し予定＋Googleカレンダーを、表示に必要な期間だけまとめて取得
  const lo = first < today ? first : today;
  const hi = nLast > tomorrow ? nLast : tomorrow;
  const all = collectEvents_(lo, hi).filter(e => matchSite_(e, site));
  const overlap = (e, a, b) => e.start <= b && e.end >= a;
  const sortEv = (a, b) => (a.start + timeKey_(a.time)).localeCompare(b.start + timeKey_(b.time));

  // TVのURLは誰でも開けるため、通知先などの設定は渡さない
  ['編集キー', '公開URL'].concat(typeof NOTIFY_KEYS !== 'undefined' ? NOTIFY_KEYS : []).forEach(k => delete settings[k]);

  const warnDays = Number(settings['期限警告日数']) || 3;
  const tasks = readTasks_().filter(t => !t.done && matchSite_(t, site)).sort((a, b) => a.due.localeCompare(b.due));
  // お知らせは1回だけ読む（テロップと写真の両方で使う）
  const activeNotices = readNotices_().filter(n => n.start <= today && (!n.end || n.end >= today) && matchSite_(n, site));
  const siteInfo = site ? readSites_().find(x => x.name === site) : null;
  const wxCode = siteInfo && siteInfo.wxCode ? siteInfo.wxCode : ('000000' + String(settings['天気_地域コード'] || '').trim()).slice(-6);
  const wxIdx = siteInfo && siteInfo.wxIdx != null ? siteInfo.wxIdx : (Number(settings['天気_エリア番号']) || 0);
  if (siteInfo && siteInfo.wxName) settings['天気_地点名'] = siteInfo.wxName;

  return {
    app: APP,
    settings: settings,
    month: { y: y, m: m, first: first, last: last, isCurrent: isCurrent },
    range: { mode: viewMode, first: first, last: last, dates: dates, label: label, isCurrent: isCurrent },
    site: site,
    owners: readOwners_(),
    today: today,
    holidays: getHolidaysRange_(first, last),
    badges: readBadges_(),
    events: all.filter(e => overlap(e, first, last)).sort(sortEv),
    todayEvents: all.filter(e => overlap(e, today, today)).sort(sortEv),
    tomorrowEvents: all.filter(e => overlap(e, tomorrow, tomorrow)).sort(sortEv),
    nextEvents: all.filter(e => overlap(e, nFirst, nLast)).sort(sortEv).slice(0, 8),
    tasks: tasks.map(t => Object.assign(t, { remain: diffDays_(today, t.due), warnDays: warnDays })),
    notices: String(settings['テロップ表示']) === 'OFF' ? [] : activeNotices,
    photos: activeNotices.filter(n => n.image).map(n => ({ id: n.image, text: n.text })),
    qr: String(settings['QRコード']) === 'OFF' ? null : qrRows_(inputUrl_()),
    youtube: parseYouTube_(settings['YouTube_URL']),
    bgm: parseYouTube_(settings['BGM_URL']),
    weather: String(settings['天気_表示']) === 'OFF' ? null : getWeather_(wxCode, wxIdx, today)
  };
}

/** 入力画面のURL（設定の「公開URL」を優先。無ければこのWebアプリのURL） */
function inputUrl_() {
  const s = getSettings_();
  const base = (String(s['公開URL'] || '').trim() || ScriptApp.getService().getUrl() || '').replace(/\?.*$/, '');
  return base ? base + '?page=input&key=' + encodeURIComponent(s['編集キー']) : '';
}

/**
 * QRコードの模様を '1'(黒)/'0'(白) の文字列の配列で返す（QrLib.gs を使う）。6時間キャッシュ。
 * 画面側はこの点を描くだけなので、外部サービスもブラウザ側のライブラリも要らない。
 */
function qrRows_(text) {
  if (!text) return null;
  const cache = CacheService.getScriptCache();
  const key = 'qr_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, text));
  const hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  try {
    // 画面表示は汚れ・欠けが無いので誤り訂正は最小（L）にして点を減らし、小さくても読めるようにする
    const q = qrcode(0, 'L');
    q.addData(text);
    q.make();
    const n = q.getModuleCount(), rows = [];
    for (let r = 0; r < n; r++) {
      let line = '';
      for (let c = 0; c < n; c++) line += q.isDark(r, c) ? '1' : '0';
      rows.push(line);
    }
    cache.put(key, JSON.stringify(rows), 21600);
    return rows;
  } catch (e) {
    console.warn('QRコードの作成に失敗: ' + e);
    return null;
  }
}

/**
 * YouTubeのURLから動画ID・再生リストIDを取り出す（watch?v= / youtu.be / shorts / embed / list= に対応）
 * @return {{id:string, list:string}|null}
 */
function parseYouTube_(url) {
  url = String(url || '').trim();
  if (!url || !/^https?:\/\/([\w-]+\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com)\//i.test(url)) return null;
  const id = (url.match(/(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([\w-]{11})/) || [])[1] || '';
  const list = (url.match(/[?&]list=([\w-]+)/) || [])[1] || '';
  return id || list ? { id: id, list: list } : null;
}

/**
 * 期間 [a, b] にかかる予定をまとめて返す：予定シート＋繰り返し予定（展開）＋Googleカレンダー（読み取り専用）
 */
function collectEvents_(a, b) {
  const sheetEvents = readEvents_().filter(e => e.start <= b && e.end >= a);
  return sheetEvents
    .concat(expandRecurring_(readRecurring_(), a, b))
    .concat(getCalendarEvents_(a, b));
}

/* ============================================================
 * 入力用API（スマホ画面から呼ばれる。全て編集キー必須）
 * ============================================================ */

function getEditData(key, ym) {
  checkKey_(key);
  ym = normalizeYm_(ym);
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7));
  const first = ym + '-01';
  const last = ym + '-' + pad_(new Date(y, m, 0).getDate());
  return {
    ym: ym,
    today: todayStr_(),
    types: EVENT_TYPES,
    badges: readBadges_(),
    events: collectEvents_(first, last).sort((a, b) => (a.start + timeKey_(a.time)).localeCompare(b.start + timeKey_(b.time))),
    recurring: readRecurring_(),
    patterns: RECUR_PATTERNS,
    sites: readSites_().map(x => x.name),
    owners: readOwners_(),
    calStatus: getCalStatus_(),
    calLinks: readCalendarLinksAll_(),
    siteList: readSites_(),
    tasks: readTasks_().sort((a, b) => (a.done - b.done) || a.due.localeCompare(b.due)),
    notices: readNotices_().sort((a, b) => b.start.localeCompare(a.start)),
    display: pickDisplaySettings_(getSettings_()),
    weatherStatus: getWeatherStatus_()
  };
}

function pickDisplaySettings_(s) {
  const o = {};
  DISPLAY_SETTING_KEYS.forEach(k => { o[k] = s[k] == null ? '' : s[k]; });
  return o;
}

/** 入力画面の「表示設定」タブから保存。許可した項目だけ設定シートに書く */
function saveDisplaySettings(key, obj) {
  checkKey_(key);
  obj = obj || {};
  const clean = {};
  DISPLAY_SETTING_KEYS.forEach(k => {
    if (!(k in obj)) return;
    let v = obj[k];
    if (k === 'テーマ' && THEMES.indexOf(v) < 0) throw new Error('テーマが正しくありません');
    if (k === '文字サイズ' && FONT_SIZES.indexOf(v) < 0) throw new Error('文字サイズが正しくありません');
    if ((k === '天気_表示' || k === 'テロップ表示') && ON_OFF.indexOf(v) < 0) throw new Error(k + 'はONかOFFで指定してください');
    if (k === 'テロップ速度' && TICKER_SPEEDS.indexOf(v) < 0) throw new Error('テロップ速度が正しくありません');
    if (k === '天気_地域コード') { v = cut_(v, 6); if (!/^\d{6}$/.test(v)) throw new Error('地域コードは6桁の数字で入力してください'); }
    if (k === '天気_エリア番号') v = Math.max(0, Math.min(20, Math.floor(Number(v) || 0)));
    if (k === '天気_日数') v = Math.max(3, Math.min(5, Math.floor(Number(v) || 5)));
    if (k === '天気_地点名') v = cut_(v, 20);
    if (k === '色分け' && COLOR_MODES.indexOf(v) < 0) throw new Error('色分けの指定が正しくありません');
    if (k === 'アーカイブ月数') v = Math.max(1, Math.min(24, Math.floor(Number(v) || 3)));
    if (k === '表示モード' && VIEW_MODES.indexOf(v) < 0) throw new Error('表示モードが正しくありません');
    if (k === '段の並び' && LANE_ORDERS.indexOf(v) < 0) throw new Error('段の並びが正しくありません');
    if (ONOFF_DISPLAY_KEYS.indexOf(k) >= 0 && ON_OFF.indexOf(v) < 0) throw new Error(k + 'はONかOFFで指定してください');
    if (k === 'QRコード_説明') v = cut_(v, 40);
    if (k === 'YouTube_URL') { v = cut_(v, 300); if (v && !parseYouTube_(v)) throw new Error('YouTubeの動画または再生リストのURLを入れてください'); }
    if (k === 'BGM_URL') { v = cut_(v, 300); if (v && !parseYouTube_(v)) throw new Error('BGMにはYouTubeの動画または再生リストのURLを入れてください'); }
    if (k === 'BGM_音量') v = Math.max(0, Math.min(100, Math.floor(Number(v) || 0)));
    if (k === 'BGM_時間帯') { v = cut_(v, 11).replace(/[〜~ー－]/g, '-'); if (v && !/^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/.test(v)) throw new Error('BGMの時間帯は「8:00-17:00」の形式で入力してください'); }
    if (k === 'YouTube_間隔(分)') v = Math.max(0, Math.min(1440, Math.floor(Number(v) || 0)));
    if (k === 'YouTube_再生(分)') v = Math.max(1, Math.min(120, Math.floor(Number(v) || 3)));
    if (k === 'YouTube_時間帯') { v = cut_(v, 11).replace(/[〜~ー－]/g, '-'); if (v && !/^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/.test(v)) throw new Error('時間帯は「12:00-13:00」の形式で入力してください'); }
    if (k === 'お知らせチャイム' && ON_OFF.indexOf(v) < 0) throw new Error('お知らせチャイムはONかOFFで指定してください');
    if (k === '朝の読み上げ時刻') { v = cut_(v, 5); if (v && !/^\d{1,2}:\d{2}$/.test(v)) throw new Error('読み上げ時刻は「8:00」の形式で入力してください'); }
    if (k === '写真表示_間隔(分)') v = Math.max(1, Math.min(120, Math.floor(Number(v) || 5)));
    if (k === '写真表示_秒') v = Math.max(5, Math.min(120, Math.floor(Number(v) || 15)));
    if (k.indexOf('カスタム_') === 0) { v = safeColor_(v); if (!v) throw new Error(k + 'の色が正しくありません'); }
    if (k === '月切替(秒)') v = Math.max(0, Math.min(600, Number(v) || 0));
    if (k === '夜間暗転開始' || k === '夜間暗転終了') { v = cut_(v, 5); if (v && !/^\d{1,2}:\d{2}$/.test(v)) throw new Error('暗転時刻は「20:00」の形式で入力してください'); }
    if (k === '表示タイトル' || k === '会社名') v = cut_(v, 40);
    clean[k] = v;
  });

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = ss_().getSheetByName(SHEET.SETTINGS);
    const vals = sh.getDataRange().getValues();
    Object.keys(clean).forEach(k => {
      let r = -1;
      for (let i = 1; i < vals.length; i++) if (vals[i][0] === k) { r = i + 1; break; }
      // 時刻が日付に自動変換されないよう文字列で保存
      if (r > 0) sh.getRange(r, 2).setNumberFormat('@').setValue(String(clean[k]));
      else { sh.appendRow([k, String(clean[k]), '']); vals.push([k]); }
    });
    SETTINGS_MEMO_ = null;
    bumpDataVersion_();
  } finally {
    lock.releaseLock();
  }
  return true;
}

function saveEvent(key, ev) {
  checkKey_(key);
  const v = validateEvent_(ev);
  const row = [v.id, v.type, v.badge, parseDate_(v.start), parseDate_(v.end), v.time, v.title, v.detail, v.owner, v.color, new Date(), v.site];
  upsertRow_(SHEET.EVENTS, HEADERS.EVENTS.length, v.id, row);
  return v.id;
}

function deleteEvent(key, id) {
  checkKey_(key);
  deleteRowById_(SHEET.EVENTS, id);
  return true;
}

function saveTask(key, t) {
  checkKey_(key);
  const title = cut_(t && t.title, 100);
  const due = fmtYmd_(t && t.due);
  if (!title) throw new Error('件名を入力してください');
  if (!due) throw new Error('期限を入力してください');
  const id = (t.id && String(t.id)) || newId_();
  const row = [id, title, parseDate_(due), !!t.done, cut_(t.owner, 50), new Date(), cut_(t.site, 30)];
  upsertRow_(SHEET.TASKS, HEADERS.TASKS.length, id, row);
  return id;
}

function setTaskDone(key, id, done) {
  checkKey_(key);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = ss_().getSheetByName(SHEET.TASKS);
    const r = findRowById_(sh, id);
    if (r < 0) throw new Error('対象のタスクが見つかりません');
    sh.getRange(r, 4).setValue(!!done);
    sh.getRange(r, 6).setValue(new Date());
    bumpDataVersion_();
  } finally {
    lock.releaseLock();
  }
  return true;
}

function deleteTask(key, id) {
  checkKey_(key);
  deleteRowById_(SHEET.TASKS, id);
  return true;
}

function saveNotice(key, n) {
  checkKey_(key);
  const text = cut_(n && n.text, 200);
  const start = fmtYmd_(n && n.start);
  const end = fmtYmd_(n && n.end);
  if (!text) throw new Error('内容を入力してください');
  if (!start) throw new Error('開始日を入力してください');
  if (end && end < start) throw new Error('終了日が開始日より前になっています');
  const id = (n.id && String(n.id)) || newId_();
  const old = n.id ? readNotices_().find(x => x.id === id) : null;
  let image = old ? old.image : '';
  if (n.imageData) {                     // 新しい画像に差し替え
    const newImg = saveImage_(n.imageData, 'お知らせ');
    if (image) trashImage_(image);
    image = newImg;
  } else if (n.removeImage && image) {    // 画像を外す
    trashImage_(image);
    image = '';
  }
  const row = [id, text, parseDate_(start), end ? parseDate_(end) : '', !!n.important, new Date(), cut_(n.site, 30), image];
  upsertRow_(SHEET.NOTICES, HEADERS.NOTICES.length, id, row);
  return id;
}

function deleteNotice(key, id) {
  checkKey_(key);
  const old = readNotices_().find(x => x.id === String(id));
  deleteRowById_(SHEET.NOTICES, id);
  if (old && old.image) trashImage_(old.image);
  return true;
}

/* ============================================================
 * 天気予報（気象庁の公開データ。登録不要）
 * ============================================================ */

/** 天気コードの主な文言（それ以外は百の位で 晴／曇／雨／雪 に丸める） */
const WEATHER_LABELS = {
  100: '晴れ', 101: '晴時々曇', 102: '晴一時雨', 103: '晴時々雨', 104: '晴一時雪', 110: '晴のち曇', 111: '晴のち曇',
  112: '晴のち雨', 113: '晴のち雨', 114: '晴のち雨', 115: '晴のち雪', 200: 'くもり', 201: '曇時々晴', 202: '曇一時雨',
  203: '曇時々雨', 204: '曇一時雪', 210: '曇のち晴', 211: '曇のち晴', 212: '曇のち雨', 213: '曇のち雨', 214: '曇のち雨',
  215: '曇のち雪', 300: '雨', 301: '雨時々晴', 302: '雨時々止む', 303: '雨時々雪', 308: '大雨', 311: '雨のち晴',
  313: '雨のち曇', 314: '雨のち雪', 400: '雪', 401: '雪時々晴', 402: '雪時々止む', 403: '雪時々雨', 411: '雪のち晴',
  413: '雪のち曇', 414: '雪のち雨'
};

function weatherLabel_(code) {
  const c = Number(code);
  if (WEATHER_LABELS[c]) return WEATHER_LABELS[c];
  return ({ 1: '晴れ', 2: 'くもり', 3: '雨', 4: '雪' })[Math.floor(c / 100)] || '';
}

/**
 * 週間予報を日ごとに整理して返す（1時間キャッシュ）。失敗時は null（画面側で非表示）。
 * @return {{area:string, days:Array<{date,code,label,max,min,pop}>}|null}
 */
function getWeather_(officeCode, areaIdx, today) {
  if (!/^\d{6}$/.test(officeCode)) { setWeatherStatus_(false, '地域コードが6桁の数字ではありません: ' + officeCode); return null; }
  const cache = CacheService.getScriptCache();
  const key = weatherCacheKey_(officeCode, areaIdx, today);
  const hit = cache.get(key);
  if (hit) return hit === 'NG' ? null : JSON.parse(hit);
  try {
    const data = fetchWeather_(officeCode, areaIdx, today);
    cache.put(key, JSON.stringify(data), WEATHER_CACHE_SEC);
    setWeatherStatus_(true, data.area + ' ' + data.days.length + '日分');
    return data;
  } catch (err) {
    console.error('天気予報の取得に失敗: ' + (err && err.stack || err));
    setWeatherStatus_(false, String(err && err.message || err));
    cache.put(key, 'NG', 600); // 失敗時は10分おいて再試行
    return null;
  }
}

function weatherCacheKey_(officeCode, areaIdx, today) {
  return 'wx_' + officeCode + '_' + areaIdx + '_' + today;
}

/** 気象庁から取得して解析。失敗時は原因が分かるメッセージで例外を投げる */
function fetchWeather_(officeCode, areaIdx, today) {
  const url = 'https://www.jma.go.jp/bosai/forecast/data/forecast/' + officeCode + '.json';
  let res;
  try {
    res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: { 'Accept': 'application/json' } });
  } catch (e) {
    if (/権限|permission|authoriz/i.test(String(e))) {
      throw new Error('外部接続の権限がありません。エディタで setupApp を実行して承認し、新バージョンでデプロイしてください');
    }
    throw new Error('気象庁に接続できません: ' + e.message);
  }
  const code = res.getResponseCode();
  if (code === 404) throw new Error('地域コード ' + officeCode + ' の予報が見つかりません（コードを確認してください）');
  if (code !== 200) throw new Error('気象庁サーバーの応答エラー HTTP ' + code);
  let json;
  try { json = JSON.parse(res.getContentText('UTF-8')); }
  catch (e) { throw new Error('気象庁データの形式が読み取れません'); }
  const data = parseJmaForecast_(json, areaIdx, today);
  if (!data.days.length) throw new Error('予報データが空でした（エリア番号を確認してください）');
  return data;
}

function setWeatherStatus_(ok, msg) {
  try {
    PropertiesService.getScriptProperties().setProperty('WX_STATUS', JSON.stringify({
      ok: ok, msg: msg, time: Utilities.formatDate(new Date(), tz_(), 'M/d HH:mm')
    }));
  } catch (e) { /* 状態記録の失敗は無視 */ }
}

function getWeatherStatus_() {
  const v = PropertiesService.getScriptProperties().getProperty('WX_STATUS');
  return v ? JSON.parse(v) : null;
}

/**
 * メニュー「天気予報の接続テスト」。キャッシュを消して取得し直し、結果と地域内のエリア一覧を表示する。
 * 権限の承認もこの実行で行える。
 */
/**
 * 権限の承認状態を調べ、未承認なら承認用リンクのダイアログを出す。
 * @return {boolean} 承認済みなら true
 */
function ensureAuthorized_() {
  let info;
  try { info = ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL); } catch (e) { return true; }
  if (info.getAuthorizationStatus() !== ScriptApp.AuthorizationStatus.REQUIRED) return true;
  const url = info.getAuthorizationUrl();
  const html = HtmlService.createHtmlOutput(
    '<div style="font-family:sans-serif;font-size:14px;line-height:1.8">' +
    '<p><b>天気予報などに必要な権限がまだ承認されていません。</b></p>' +
    '<p>下のボタンを押すと承認画面が開きます。<br>このスプレッドシートの<b>持ち主のアカウント</b>を選んで「許可」してください。</p>' +
    '<p style="text-align:center"><a href="' + esc_(url) + '" target="_blank" style="display:inline-block;background:#1565c0;color:#fff;' +
    'padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:bold">権限を承認する</a></p>' +
    '<p style="font-size:12px;color:#666">「Googleで確認されていません」と出たら「詳細」→「〜に移動」で進めます。<br>' +
    '承認後、このダイアログを閉じて「天気予報の接続テスト」をもう一度実行してください。<br>' +
    '承認画面に「外部サービスへの接続」が出ない場合は、appsscript.json の更新が保存されていません（README参照）。</p></div>'
  ).setWidth(480).setHeight(340);
  try { SpreadsheetApp.getUi().showModalDialog(html, '権限の承認が必要です'); }
  catch (e) { console.log('権限の承認が必要です。次のURLを開いて許可してください：\n' + url); }
  return false;
}

/**
 * エディタから実行して全権限をまとめて承認する用。
 * appsscript.json に権限が書かれていない場合は、ここで同じ権限エラーになる（＝マニフェストの更新漏れが分かる）。
 */
function authorizeAll() {
  UrlFetchApp.fetch('https://www.jma.go.jp/bosai/common/const/area.json', { muteHttpExceptions: true });
  CalendarApp.getCalendarById(HOLIDAY_CAL_ID);
  ScriptApp.getProjectTriggers();
  DriveApp.getRootFolder();
  MailApp.getRemainingDailyQuota();
  console.log('権限の承認はすべて完了しています。デプロイを新バージョンで更新してください。');
}

function testWeather() {
  if (!ensureAuthorized_()) return;
  const ui = uiOrLog_();
  const s = getSettings_();
  const officeCode = ('000000' + String(s['天気_地域コード'] || '').trim()).slice(-6);
  const areaIdx = Number(s['天気_エリア番号']) || 0;
  const today = todayStr_();
  CacheService.getScriptCache().remove(weatherCacheKey_(officeCode, areaIdx, today));
  try {
    const res = UrlFetchApp.fetch('https://www.jma.go.jp/bosai/forecast/data/forecast/' + officeCode + '.json', { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) throw new Error('HTTP ' + res.getResponseCode() + '（地域コード ' + officeCode + ' を確認）');
    const json = JSON.parse(res.getContentText('UTF-8'));
    const names = (ts) => (ts && ts.areas || []).map((a, i) => i + ': ' + (a.area && a.area.name)).join('　');
    const data = parseJmaForecast_(json, areaIdx, today);
    setWeatherStatus_(data.days.length > 0, data.area + ' ' + data.days.length + '日分');
    bumpDataVersion_();
    ui.alert('天気予報の接続テスト',
      '取得OK（地域コード ' + officeCode + '／エリア番号 ' + areaIdx + '）\n\n' +
      '使用中のエリア：' + data.area + '\n' +
      data.days.map(d => d.date.slice(5) + '  ' + d.label + '  ' + (d.max == null ? '-' : d.max) + '℃/' + (d.min == null ? '-' : d.min) + '℃  降水' + (d.pop == null ? '-' : d.pop + '%')).join('\n') +
      '\n\n▼エリア番号の候補（週間予報）\n' + names(json[1] && json[1].timeSeries[0]) +
      '\n▼エリア番号の候補（短期予報）\n' + names(json[0] && json[0].timeSeries[0]) +
      '\n\nTV画面は次の自動更新で反映されます。', ui.ButtonSet.OK);
  } catch (err) {
    setWeatherStatus_(false, String(err.message || err));
    const scopeErr = /external_request/.test(String(err.message || err));
    ui.alert('天気予報の接続テスト', '取得に失敗しました\n\n' + (err.message || err) +
      (scopeErr ? '\n\n【対処】プロジェクトの設定ファイル appsscript.json の oauthScopes に\n' +
        'https://www.googleapis.com/auth/script.external_request\nを追加し、エディタで setupApp を実行して承認してください（README「権限エラーが出るとき」参照）' : '') +
      '\n\n確認すること：\n・地域コード（設定シート「天気_地域コード」）が6桁か\n・このテストで権限の承認を求められたら許可したか\n・承認後に「新バージョン」でデプロイし直したか', ui.ButtonSet.OK);
  }
}

/** 気象庁JSON（[0]=短期予報, [1]=週間予報）から日ごとの天気を作る */
function parseJmaForecast_(json, areaIdx, today) {
  const map = {}; // date -> {code,max,min,pop}
  const day = s => String(s).slice(0, 10);
  const pick = (areas) => areas[Math.min(areaIdx, areas.length - 1)] || areas[0];
  const num = v => (v === '' || v == null || isNaN(Number(v))) ? null : Number(v);
  const get = d => (map[d] = map[d] || { code: null, max: null, min: null, pop: null });
  let areaName = '';

  // 週間予報（7日分）
  const weekly = json[1] && json[1].timeSeries;
  if (weekly && weekly[0]) {
    const a = pick(weekly[0].areas);
    areaName = a.area && a.area.name || '';
    weekly[0].timeDefines.forEach((t, i) => {
      const o = get(day(t));
      if (a.weatherCodes && a.weatherCodes[i]) o.code = a.weatherCodes[i];
      if (a.pops) o.pop = num(a.pops[i]);
    });
    if (weekly[1]) {
      const ta = pick(weekly[1].areas);
      weekly[1].timeDefines.forEach((t, i) => {
        const o = get(day(t));
        if (ta.tempsMax) o.max = num(ta.tempsMax[i]);
        if (ta.tempsMin) o.min = num(ta.tempsMin[i]);
      });
    }
  }

  // 短期予報で今日・明日を上書き（より詳しいため）
  const short = json[0] && json[0].timeSeries;
  if (short) {
    if (short[0]) {
      const a = pick(short[0].areas);
      if (!areaName) areaName = a.area && a.area.name || '';
      short[0].timeDefines.forEach((t, i) => { if (a.weatherCodes && a.weatherCodes[i]) get(day(t)).code = a.weatherCodes[i]; });
    }
    if (short[1]) { // 6時間ごとの降水確率 → 日ごとの最大
      const a = pick(short[1].areas);
      short[1].timeDefines.forEach((t, i) => {
        const v = num(a.pops && a.pops[i]);
        if (v == null) return;
        const o = get(day(t));
        o.pop = o.pop == null ? v : Math.max(o.pop, v);
      });
    }
    if (short[2]) { // 地点の気温：00時台＝最低、09時台＝最高
      const a = pick(short[2].areas);
      short[2].timeDefines.forEach((t, i) => {
        const v = num(a.temps && a.temps[i]);
        if (v == null) return;
        const o = get(day(t));
        if (String(t).slice(11, 13) === '00') o.min = v; else o.max = v;
      });
    }
  }

  const days = Object.keys(map).filter(d => d >= today).sort().map(d => {
    const o = map[d];
    // 短期予報の「今日の最低気温」は朝のうちしか出ないため、最高＝最低になったら最低を消す
    if (o.max != null && o.min != null && o.max === o.min && d === today) o.min = null;
    return { date: d, code: o.code, label: weatherLabel_(o.code), max: o.max, min: o.min, pop: o.pop };
  }).filter(o => o.code);
  return { area: areaName, days: days };
}

/* ============================================================
 * 読み込み
 * ============================================================ */

function readEvents_() {
  const sh = ss_().getSheetByName(SHEET.EVENTS);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getDataRange().getValues().slice(1)
    .filter(r => r[0] && r[3])
    .map(r => {
      const start = fmtYmd_(r[3]);
      let end = fmtYmd_(r[4]) || start;
      if (end < start) end = start;
      return {
        id: String(r[0]),
        type: EVENT_TYPES.indexOf(String(r[1])) >= 0 ? String(r[1]) : 'イベント',
        badge: String(r[2] || ''),
        start: start,
        end: end,
        time: fmtTime_(r[5]),
        title: String(r[6] || ''),
        detail: String(r[7] || ''),
        owner: String(r[8] || ''),
        color: safeColor_(r[9]),
        site: String(r[11] || '').trim()
      };
    })
    .filter(e => e.start);
}

function readTasks_() {
  const sh = ss_().getSheetByName(SHEET.TASKS);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getDataRange().getValues().slice(1)
    .filter(r => r[0] && r[1])
    .map(r => ({
      id: String(r[0]),
      title: String(r[1]),
      due: fmtYmd_(r[2]),
      done: r[3] === true || String(r[3]).toUpperCase() === 'TRUE',
      owner: String(r[4] || ''),
      site: String(r[6] || '').trim()
    }))
    .filter(t => t.due);
}

function readNotices_() {
  const sh = ss_().getSheetByName(SHEET.NOTICES);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getDataRange().getValues().slice(1)
    .filter(r => r[0] && r[1] && r[2])
    .map(r => ({
      id: String(r[0]),
      text: String(r[1]),
      start: fmtYmd_(r[2]),
      end: fmtYmd_(r[3]),
      important: r[4] === true || String(r[4]).toUpperCase() === 'TRUE',
      site: String(r[6] || '').trim(),
      image: String(r[7] || '').trim()
    }))
    .filter(n => n.start);
}

function readBadges_() {
  const sh = ss_().getSheetByName(SHEET.BADGES);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getDataRange().getValues().slice(1)
    .filter(r => r[0])
    .map(r => ({ name: String(r[0]), bg: safeColor_(r[1]) || '#455a64', fg: safeColor_(r[2]) || '#ffffff', order: Number(r[3]) || 99 }))
    .sort((a, b) => a.order - b.order);
}

/** 設定は1回の実行内で何度も読むため、実行中だけメモリに保持する（返すのはコピー） */
let SETTINGS_MEMO_ = null;
function getSettings_() {
  if (SETTINGS_MEMO_) return Object.assign({}, SETTINGS_MEMO_);
  const sh = ss_().getSheetByName(SHEET.SETTINGS);
  const obj = {};
  DEFAULT_SETTINGS.forEach(r => { obj[r[0]] = r[1]; });
  if (!sh) return obj;
  sh.getDataRange().getValues().slice(1).forEach(r => {
    if (!r[0]) return;
    obj[String(r[0])] = r[1] instanceof Date ? fmtTime_(r[1]) : r[1];
  });
  SETTINGS_MEMO_ = obj;
  return Object.assign({}, obj);
}

/** 日本の祝日をGoogleカレンダーから取得（6時間キャッシュ）。{日: 祝日名} */
/** 期間内の祝日 {'yyyy-MM-dd': 祝日名}。月ごとのキャッシュを組み合わせる */
function getHolidaysRange_(first, last) {
  const out = {};
  let y = Number(first.slice(0, 4)), m = Number(first.slice(5, 7));
  const ey = Number(last.slice(0, 4)), em = Number(last.slice(5, 7));
  for (let guard = 0; (y < ey || (y === ey && m <= em)) && guard < 3; guard++) {
    const map = getHolidays_(y, m);
    Object.keys(map).forEach(d => { out[y + '-' + pad_(m) + '-' + pad_(d)] = map[d]; });
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}

function getHolidays_(y, m) {
  const cache = CacheService.getScriptCache();
  const key = 'hol_' + y + '_' + m;
  const hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  const map = {};
  try {
    let cal = CalendarApp.getCalendarById(HOLIDAY_CAL_ID);
    if (!cal) cal = CalendarApp.subscribeToCalendar(HOLIDAY_CAL_ID);
    if (cal) {
      cal.getEvents(new Date(y, m - 1, 1), new Date(y, m, 1)).forEach(ev => {
        const d = ev.getAllDayStartDate();
        if (d.getMonth() === m - 1) map[d.getDate()] = ev.getTitle();
      });
    }
    cache.put(key, JSON.stringify(map), HOLIDAY_CACHE_SEC);
  } catch (err) {
    console.warn('祝日の取得に失敗: ' + err);
  }
  return map;
}

/* ============================================================
 * 書き込み共通
 * ============================================================ */

function upsertRow_(sheetName, width, id, row) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = ss_().getSheetByName(sheetName);
    if (!sh) throw new Error('シート「' + sheetName + '」がありません。初期設定を実行してください');
    const r = findRowById_(sh, id);
    if (r > 0) sh.getRange(r, 1, 1, width).setValues([row]);
    else sh.getRange(sh.getLastRow() + 1, 1, 1, width).setValues([row]);
    bumpDataVersion_();
  } finally {
    lock.releaseLock();
  }
}

function deleteRowById_(sheetName, id) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = ss_().getSheetByName(sheetName);
    const r = findRowById_(sh, id);
    if (r < 0) throw new Error('対象のデータが見つかりません（他の人が削除した可能性があります）');
    sh.deleteRow(r);
    bumpDataVersion_();
  } finally {
    lock.releaseLock();
  }
}

function findRowById_(sh, id) {
  if (!id || sh.getLastRow() < 2) return -1;
  const ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return -1;
}

function validateEvent_(ev) {
  if (!ev) throw new Error('データがありません');
  const type = String(ev.type || '');
  if (EVENT_TYPES.indexOf(type) < 0) throw new Error('種別が正しくありません');
  const start = fmtYmd_(ev.start);
  if (!start) throw new Error('開始日を入力してください');
  let end = fmtYmd_(ev.end) || start;
  if (end < start) throw new Error('終了日が開始日より前になっています');
  const title = cut_(ev.title, 100);
  if (!title) throw new Error('件名を入力してください');
  const time = cut_(ev.time, 10);
  if (time && !/^\d{1,2}:\d{2}$/.test(time)) throw new Error('時刻は「8:30」の形式で入力してください');
  return {
    id: (ev.id && String(ev.id)) || newId_(),
    type: type,
    badge: cut_(ev.badge, 20),
    start: start,
    end: end,
    time: time,
    title: title,
    detail: cut_(ev.detail, 300),
    owner: cut_(ev.owner, 50),
    color: safeColor_(ev.color),
    site: cut_(ev.site, 30)
  };
}

function checkKey_(key) {
  const k = String(getSettings_()['編集キー'] || '');
  if (!k || String(key || '') !== k) throw new Error('編集キーが正しくありません。URLを確認してください');
}

/* ============================================================
 * ユーティリティ
 * ============================================================ */

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function tz_() { return ss_().getSpreadsheetTimeZone() || Session.getScriptTimeZone(); }
function pad_(n) { return ('0' + n).slice(-2); }
function newId_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 10); }
function cut_(v, n) { return String(v == null ? '' : v).trim().slice(0, n); }

function todayStr_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd'); }

/** Date / 'yyyy/m/d' / 'yyyy-mm-dd' → 'yyyy-MM-dd'（不正なら空文字） */
function fmtYmd_(v) {
  if (!v) return '';
  if (v instanceof Date) return isNaN(v) ? '' : Utilities.formatDate(v, tz_(), 'yyyy-MM-dd');
  const m = String(v).trim().match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  return m ? m[1] + '-' + pad_(m[2]) + '-' + pad_(m[3]) : '';
}

/**
 * 並べ替え用の時刻キー。'8:30' → '08:30'（文字列のまま比べると '13:30' が '8:30' より前に来るため）。
 * 時刻なし（終日）は '' を返すので、同じ日の中で先頭に並ぶ。
 */
function timeKey_(t) {
  const m = String(t || '').trim().match(/^(\d{1,2}):(\d{2})/);
  return m ? pad_(m[1]) + ':' + m[2] : '';
}

function fmtTime_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, tz_(), 'H:mm');
  return String(v == null ? '' : v).trim();
}

function parseDate_(s) {
  const p = String(s).split('-').map(Number);
  return new Date(p[0], p[1] - 1, p[2]);
}

function addDaysStr_(s, n) {
  const d = parseDate_(s);
  d.setDate(d.getDate() + n);
  return fmtYmd_(d);
}

function diffDays_(a, b) {
  return Math.round((parseDate_(b) - parseDate_(a)) / 86400000);
}

function normalizeYm_(ym) {
  const m = String(ym || '').match(/^(\d{4})-(\d{1,2})$/);
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) return m[1] + '-' + pad_(m[2]);
  return todayStr_().slice(0, 7);
}

function safeColor_(v) {
  const s = String(v || '').trim();
  return /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(s) ? s : '';
}

function esc_(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** データ更新のたびに番号を上げて、表示キャッシュを無効化する */
function getDataVersion_() {
  return PropertiesService.getScriptProperties().getProperty('DATA_VER') || '1';
}
function bumpDataVersion_() {
  // 同じミリ秒に2回保存しても必ず変わるように、乱数も付ける
  PropertiesService.getScriptProperties().setProperty('DATA_VER', Date.now() + '_' + Math.floor(Math.random() * 1e6));
}