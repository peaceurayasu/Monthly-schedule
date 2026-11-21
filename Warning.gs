/**
 * 気象警報・注意報（v2.2.0〜）
 * ------------------------------------------------------------
 * 気象庁の公開データ（登録不要）から、天気予報と同じ地域の警報・注意報を取って TV に出す。
 *  - 地域：設定「天気_地域コード」（拠点ごとの指定があればそちら）
 *  - 地域内のどこか：設定「天気_エリア番号」（天気予報の短期予報と同じ並び。0＝最初）
 *  - 10分キャッシュ。取れなかったときは null を返して画面には何も出さない（予定表の表示は止めない）
 * 警報以上（警報・危険警報・特別警報）はチャイム＋読み上げ（設定「お知らせチャイム」がONのとき）、注意報は表示だけ。
 *
 * 2026年5月の気象庁の防災気象情報の見直し（警戒レベルに合わせた「危険警報」の新設など）に対応。
 * データは warning/data/r8/{地域コード}.json。旧データ（warning/data/warning/）は2026年5月で更新が止まっている。
 * コードと名前の対応は気象庁の警報ページ（bosai/warning/）が使っている表と同じ。
 */

const WARN_CACHE_SEC = 600;
const WARN_URL = 'https://www.jma.go.jp/bosai/warning/data/r8/';

/**
 * 気象庁の警報・注意報コード → [名前, 重さ]
 * 重さ：4＝特別警報（レベル5）、3＝危険警報（レベル4）、2＝警報（レベル3）、1＝注意報（レベル2）
 */
const WARNING_TABLE = {
  '33': ['大雨特別警報', 4], '43': ['大雨危険警報', 3], '03': ['大雨警報', 2], '10': ['大雨注意報', 1],
  '39': ['土砂災害特別警報', 4], '49': ['土砂災害危険警報', 3], '09': ['土砂災害警報', 2], '29': ['土砂災害注意報', 1],
  '38': ['高潮特別警報', 4], '48': ['高潮危険警報', 3], '08': ['高潮警報', 2], '19': ['高潮注意報', 1],
  '35': ['暴風特別警報', 4], '05': ['暴風警報', 2], '15': ['強風注意報', 1],
  '32': ['暴風雪特別警報', 4], '02': ['暴風雪警報', 2], '13': ['風雪注意報', 1],
  '36': ['大雪特別警報', 4], '06': ['大雪警報', 2], '12': ['大雪注意報', 1],
  '37': ['波浪特別警報', 4], '07': ['波浪警報', 2], '16': ['波浪注意報', 1],
  '14': ['雷注意報', 1], '17': ['融雪注意報', 1], '20': ['濃霧注意報', 1], '21': ['乾燥注意報', 1], '22': ['なだれ注意報', 1],
  '23': ['低温注意報', 1], '24': ['霜注意報', 1], '25': ['着氷注意報', 1], '26': ['着雪注意報', 1]
};

/** 「解除」「発表警報・注意報はなし」以外は出ている扱い（発表・継続・警報から注意報 など） */
const WARNING_OFF_STATUS = ['解除', '発表警報・注意報はなし'];

/**
 * 今出ている警報・注意報。重い順。
 * @return {{area:string, items:Array<{code,name,level}>, time:string}|null} 取得失敗時は null
 */
function getWarnings_(officeCode, areaIdx) {
  if (!/^\d{6}$/.test(officeCode)) return null;
  const cache = CacheService.getScriptCache();
  const key = 'warn_' + officeCode + '_' + areaIdx;
  const hit = cache.get(key);
  if (hit) return hit === 'NG' ? null : JSON.parse(hit);
  try {
    const res = UrlFetchApp.fetch(WARN_URL + officeCode + '.json', { muteHttpExceptions: true, headers: { 'Accept': 'application/json' } });
    if (res.getResponseCode() !== 200) throw new Error('HTTP ' + res.getResponseCode());
    const data = parseJmaWarning_(JSON.parse(res.getContentText('UTF-8')), areaIdx);
    cache.put(key, JSON.stringify(data), WARN_CACHE_SEC);
    return data;
  } catch (err) {
    console.warn('警報・注意報の取得に失敗: ' + err);
    cache.put(key, 'NG', 300);   // 失敗時は5分おいて再試行
    return null;
  }
}

/**
 * 気象庁の警報JSONを読む。
 * データは「大雨」「強風」「波浪」…と現象ごとの発表の配列で、それぞれ warning.class10Items（予報区。天気予報の
 * 短期予報と同じ並び）に地域ごとの kinds（コードと状態）が入っている。全部の発表から、選んだ予報区の分を集める。
 * 予報区の単位で見る（市町村ごとだとTVに出すには細かすぎるため）。
 */
function parseJmaWarning_(json, areaIdx) {
  const reports = Array.isArray(json) ? json : [];
  const lists = reports.map(r => (r && r.warning && r.warning.class10Items) || []).filter(l => l.length);
  const codes = lists.length ? lists[0].map(a => String(a.areaCode)) : [];
  const area = codes[Math.min(Math.max(0, Number(areaIdx) || 0), codes.length - 1)] || '';
  const seen = {};
  const items = [];
  lists.forEach(list => list.filter(a => String(a.areaCode) === area).forEach(a => (a.kinds || []).forEach(k => {
    const t = WARNING_TABLE[k.code];
    if (!t || WARNING_OFF_STATUS.indexOf(k.status) >= 0 || seen[k.code]) return;
    seen[k.code] = true;
    items.push({ code: k.code, name: t[0], level: t[1] });
  })));
  items.sort((x, y) => y.level - x.level || x.code.localeCompare(y.code));
  const time = reports.map(r => String(r && r.reportDatetime || '')).sort().pop() || '';
  return { area: area, items: items, time: time };
}

/**
 * テロップに流す1件（お知らせと同じ形）。何も出ていなければ null。
 * id は「出ている警報以上の組み合わせ」で決めるので、新しい警報が出たときだけチャイムが鳴る。
 */
function warningNotice_(w, placeName) {
  if (!w || !w.items.length) return null;
  const heavy = w.items.filter(x => x.level >= 2);
  return {
    id: 'jma_' + (heavy.length ? heavy : w.items).map(x => x.code).join('_'),
    text: '【気象情報】' + (placeName ? placeName + 'に' : '') + w.items.map(x => x.name).join('・') + 'が出ています',
    important: heavy.length > 0,
    warning: true,
    level: w.items[0].level,
    start: '', end: '', site: '', image: ''
  };
}