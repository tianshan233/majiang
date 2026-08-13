'use strict';
/* ============ 麻将牌定义 ============
 * 牌 ID: 0-8   万子1-9, 9-17 筒子1-9, 18-26 索子1-9
 *        27-30 东南西北, 31-33 白发中
 *        34-36 赤五万 / 赤五筒 / 赤五索（赤宝牌，各 +1 宝牌）
 * 每种牌 4 张，共 136 张。赤五在牌墙上各替换一张普通五。
 * 「家族 family」：赤五在结构上等价于普通五（仅宝牌/显示不同），family(34)=4 等。
 */
const NUM_CJK = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const WIND_CJK = ['东', '南', '西', '北'];
const DRAGON_CJK = ['白', '发', '中'];
const SUIT_CHAR = { man: '万', pin: '筒', sou: '索' };

function family(t) { return t === 34 ? 4 : t === 35 ? 13 : t === 36 ? 22 : t; }
function isRed(t) { return t >= 34; }

function suitOf(t) {
  const f = family(t);
  return f < 9 ? 'man' : f < 18 ? 'pin' : f < 27 ? 'sou' : f < 31 ? 'wind' : 'dragon';
}
function numOf(t) { return (family(t) % 9) + 1; }
function isTerminal(t) { const f = family(t); return f < 27 && (f % 9 === 0 || f % 9 === 8); }
function isHonor(t) { return family(t) >= 27; }
function isTermHonor(t) { const f = family(t); return f >= 27 || isTerminal(f); }
function isYakuhai(t, seatWind, roundWind) {
  const f = family(t);
  if (f >= 31) return true;
  if (f >= 27) { const w = f - 27; return w === seatWind || w === roundWind; }
  return false;
}
function tileName(t) {
  const f = family(t);
  const red = isRed(t) ? '赤' : '';
  if (f < 27) return red + NUM_CJK[f % 9] + SUIT_CHAR[suitOf(f)];
  if (f < 31) return WIND_CJK[f - 27];
  return DRAGON_CJK[f - 31];
}
/* 宝牌指示牌 -> 宝牌 */
function doraOf(t) {
  const f = family(t);
  if (f < 27) return (f % 9 === 8) ? f - 8 : f + 1;
  if (f < 31) return f === 30 ? 27 : f + 1;
  return f === 31 ? 33 : f === 32 ? 31 : 32;
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
  }
  return a;
}
function buildWall() {
  const a = [];
  for (let t = 0; t < 34; t++) for (let i = 0; i < 4; i++) a.push(t);
  const rep = (from, to) => { const i = a.indexOf(from); if (i >= 0) a[i] = to; };
  rep(4, 34); rep(13, 35); rep(22, 36); /* 赤五万/筒/索 各一枚 */
  return shuffle(a);
}
/* 结构计数（34 长，赤五折叠进普通五） */
function counts(tiles) {
  const c = new Array(34).fill(0);
  for (const t of tiles) c[family(t)]++;
  return c;
}
/* 赤宝牌数量 */
function countRed(tiles) {
  let n = 0;
  for (const t of tiles) if (isRed(t)) n++;
  return n;
}
function tilesFromCounts(c) {
  const a = [];
  for (let i = 0; i < 34; i++) for (let j = 0; j < c[i]; j++) a.push(i);
  return a;
}
function tileCompare(a, b) {
  return (family(a) - family(b)) || ((isRed(a) ? 1 : 0) - (isRed(b) ? 1 : 0));
}
function sortTiles(tiles) { return tiles.slice().sort(tileCompare); }
/* 从数组中取一张家族匹配的实体牌（优先非赤，保留赤宝牌价值）；找不到返回 -1 */
function pickTile(arr, fam) {
  let red = -1;
  for (const t of arr) if (family(t) === fam) { if (!isRed(t)) return t; else red = t; }
  return red;
}
/* 从数组中移除 n 张家族匹配的牌 */
function removeTilesByFamily(arr, fam, n) {
  let removed = 0;
  for (let i = arr.length - 1; i >= 0 && removed < n; i--) {
    if (family(arr[i]) === fam) { arr.splice(i, 1); removed++; }
  }
  return removed;
}
