/**
 * 写真・図面・短い動画（お知らせに付けるメディア）（v1.6.0〜、動画は v1.9.0〜）
 * ------------------------------------------------------------
 * 画像は持ち主のGoogleドライブ「電子予定表_画像」フォルダに保存する（一般公開はしない）。
 * TV画面へは、このアプリ経由で画像データを渡すので、ドライブの共有設定は不要。
 * 入力画面側で長辺1600pxのJPEGに縮小してから送るので、1枚あたり数百KBに収まる。
 * 動画は縮小できないため、10MB・60秒までに制限する（スマホで撮った30秒ほどの動画が目安）。
 */

const IMAGE_FOLDER_NAME = '電子予定表_画像';
const IMAGE_MAX_BYTES = 4 * 1024 * 1024;
const VIDEO_MAX_BYTES = 10 * 1024 * 1024;

function imageFolder_() {
  const p = PropertiesService.getScriptProperties();
  const id = p.getProperty('IMAGE_FOLDER_ID');
  if (id) {
    try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) { /* 作り直す */ }
  }
  const f = DriveApp.createFolder(IMAGE_FOLDER_NAME);
  p.setProperty('IMAGE_FOLDER_ID', f.getId());
  return f;
}

/**
 * dataURL（data:image/jpeg;base64,...）をドライブに保存してファイルIDを返す
 */
function saveImage_(dataUrl, name) {
  const m = String(dataUrl || '').match(/^data:((?:image\/(?:jpeg|png|webp|gif))|(?:video\/(?:mp4|webm|quicktime)));base64,(.+)$/);
  if (!m) throw new Error('ファイルの形式が正しくありません（写真はJPEG・PNG、動画はMP4を選んでください）');
  const bytes = Utilities.base64Decode(m[2]);
  const isVideo = m[1].indexOf('video/') === 0;
  if (!isVideo && bytes.length > IMAGE_MAX_BYTES) throw new Error('画像が大きすぎます（4MBまで）');
  if (isVideo && bytes.length > VIDEO_MAX_BYTES) throw new Error('動画が大きすぎます（10MBまで。30秒くらいが目安）');
  const blob = Utilities.newBlob(bytes, m[1], (name || 'image') + '_' + Utilities.formatDate(new Date(), tz_(), 'yyyyMMdd_HHmmss'));
  return imageFolder_().createFile(blob).getId();
}

/** ゴミ箱へ（失敗しても処理は止めない） */
function trashImage_(id) {
  if (!id) return;
  try { DriveApp.getFileById(id).setTrashed(true); } catch (e) { console.warn('画像の削除に失敗: ' + e); }
}

/**
 * TV画面・入力画面から呼ばれる。登録済みのお知らせの画像だけ返す（任意のファイルは読ませない）。
 * @return {string} dataURL
 */
function getNoticeImage(id) {
  id = String(id || '');
  if (!id || !readNotices_().some(n => n.image === id)) throw new Error('画像が見つかりません');
  const cache = CacheService.getScriptCache();
  const hit = cache.get('img_' + id);
  if (hit) return hit;
  const blob = DriveApp.getFileById(id).getBlob();
  const url = 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
  if (url.length < 95000) cache.put('img_' + id, url, 21600);
  return url;
}

/**
 * サンプル用：SVG（文字と図形で描いた画像）をドライブに保存してファイルIDを返す。
 * 入力画面からのアップロードには使わない（サンプルデータ投入専用）。
 */
function saveSampleSvg_(svg, name) {
  const blob = Utilities.newBlob(svg, 'image/svg+xml', name + '.svg');
  return imageFolder_().createFile(blob).getId();
}

/** サンプル画像1：安全標語のポスター */
function sampleSafetyPosterSvg_() {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">' +
    '<rect width="1600" height="900" fill="#fff8e1"/>' +
    '<rect x="40" y="40" width="1520" height="820" rx="30" fill="none" stroke="#f9a825" stroke-width="24"/>' +
    '<text x="800" y="200" font-size="80" text-anchor="middle" font-weight="bold" fill="#5d4037" font-family="sans-serif">今月の安全標語</text>' +
    '<text x="800" y="480" font-size="170" text-anchor="middle" font-weight="bold" fill="#e65100" font-family="sans-serif">指差し確認 ヨシ！</text>' +
    '<text x="800" y="640" font-size="64" text-anchor="middle" fill="#5d4037" font-family="sans-serif">重機の周りでは 声かけ・合図を忘れずに</text>' +
    '<text x="800" y="790" font-size="44" text-anchor="middle" fill="#9e8a6e" font-family="sans-serif">（サンプル画像）</text></svg>';
}

/** サンプル画像2：現場の案内図 */
function sampleSiteMapSvg_() {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">' +
    '<rect width="1600" height="900" fill="#eef3f7"/>' +
    '<text x="60" y="100" font-size="64" font-weight="bold" fill="#1f2a36" font-family="sans-serif">屋良虎地原線　現場案内図</text>' +
    '<rect x="60" y="400" width="1480" height="110" fill="#90a4ae"/>' +
    '<line x1="60" y1="455" x2="1540" y2="455" stroke="#fff" stroke-width="8" stroke-dasharray="40 30"/>' +
    '<text x="80" y="550" font-size="36" fill="#455a64" font-family="sans-serif">県道（片側交互通行）</text>' +
    '<rect x="620" y="380" width="520" height="150" fill="none" stroke="#e53935" stroke-width="10" stroke-dasharray="24 14"/>' +
    '<text x="880" y="360" font-size="44" text-anchor="middle" font-weight="bold" fill="#e53935" font-family="sans-serif">工事区間</text>' +
    '<rect x="200" y="160" width="300" height="180" rx="12" fill="#3b6ea5"/>' +
    '<text x="350" y="265" font-size="44" text-anchor="middle" font-weight="bold" fill="#fff" font-family="sans-serif">資材置場</text>' +
    '<rect x="1180" y="600" width="300" height="180" rx="12" fill="#2e7d32"/>' +
    '<text x="1330" y="705" font-size="44" text-anchor="middle" font-weight="bold" fill="#fff" font-family="sans-serif">駐車場</text>' +
    '<circle cx="560" cy="700" r="50" fill="#f9a825"/><text x="560" y="716" font-size="44" text-anchor="middle" font-weight="bold" fill="#1f2a36" font-family="sans-serif">誘</text>' +
    '<text x="640" y="716" font-size="38" fill="#1f2a36" font-family="sans-serif">＝交通誘導員</text>' +
    '<text x="1540" y="860" font-size="34" text-anchor="end" fill="#78909c" font-family="sans-serif">（サンプル画像）</text></svg>';
}