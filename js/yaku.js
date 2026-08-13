'use strict';
/* ============ 日麻规则引擎 ============
 * 和牌判定 / 向听计算 / 听牌 / 役种 / 符数 / 得点
 */

/* ---------- 和牌判定 ---------- */
function removeMelds(c, n) {
  if (n === 0) return c.every(x => x === 0);
  let i = 0;
  while (i < 34 && c[i] === 0) i++;
  if (i >= 34) return false;
  if (c[i] >= 3) {
    const c2 = c.slice(); c2[i] -= 3;
    if (removeMelds(c2, n - 1)) return true;
  }
  if (i < 27 && i % 9 <= 6 && c[i + 1] > 0 && c[i + 2] > 0) {
    const c2 = c.slice(); c2[i]--; c2[i + 1]--; c2[i + 2]--;
    if (removeMelds(c2, n - 1)) return true;
  }
  return false;
}
function isChiitoi(c34) {
  let pairs = 0;
  for (let i = 0; i < 34; i++) {
    if (c34[i] % 2 !== 0) return false;
    pairs += c34[i] / 2;
  }
  return pairs === 7;
}
const KOKUSHI_KINDS = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
function isKokushi(c34) {
  let hasPair = false;
  for (const k of KOKUSHI_KINDS) {
    if (c34[k] < 1) return false;
    if (c34[k] >= 2) hasPair = true;
  }
  return hasPair;
}
/* canWin: c34 为计数数组；callCount 为已鸣牌组数（杠算 1 组） */
function canWin(c34, callCount) {
  const total = c34.reduce((a, b) => a + b, 0);
  if (callCount === 0 && total === 14 && (isKokushi(c34) || isChiitoi(c34))) return true;
  for (let p = 0; p < 34; p++) if (c34[p] >= 2) {
    const c = c34.slice(); c[p] -= 2;
    if (removeMelds(c, 4 - callCount)) return true;
  }
  return false;
}
/* 听牌：tiles 为手牌数组（13 张等价），callCount 同 canWin */
function waitsFor(tiles, callCount) {
  const c = counts(tiles);
  const w = [];
  for (let t = 0; t < 34; t++) if (c[t] < 4) {
    c[t]++;
    if (canWin(c, callCount)) w.push(t);
    c[t]--;
  }
  return w;
}

/* ---------- 向听数 ---------- */
function chiitoiPairs(c34) {
  let p = 0;
  for (let i = 0; i < 34; i++) p += Math.floor(c34[i] / 2);
  return p;
}
function chiitoiKinds(c34) {
  let k = 0;
  for (let i = 0; i < 34; i++) if (c34[i] >= 1) k++;
  return k;
}
function kokushiShanten(c34) {
  let kinds = 0, pair = 0;
  for (const k of KOKUSHI_KINDS) {
    if (c34[k] >= 1) kinds++;
    if (c34[k] >= 2) pair = 1;
  }
  return 13 - kinds - pair;
}
/* shanten: c34 手牌计数；locked 为已成型组数（含杠）。完成态为 -1
 * 精确公式（经暴力验证）：
 *   有雀头: 8 - 2m - t - p + max(0, m+t+p-5)
 *   无雀头: (m+t >= 5 ? 9 : 8) - 2m - t + max(0, m+t-5)
 */
function shanten(c34, locked) {
  let best = 99;
  function dfs(c, idx, sets, pair, taatsu) {
    while (idx < 34 && c[idx] === 0) idx++;
    if (idx >= 34) {
      const m = sets + locked;
      let sh;
      if (pair) {
        const blocks = m + taatsu + 1;
        sh = 8 - (2 * m + taatsu + 1) + (blocks > 5 ? blocks - 5 : 0);
      } else {
        const base = (m + taatsu >= 5 ? 9 : 8);
        sh = base - (2 * m + taatsu) + (m + taatsu > 5 ? m + taatsu - 5 : 0);
      }
      if (sh < best) best = sh;
      return;
    }
    const c1 = c.slice(); c1[idx]--; dfs(c1, idx, sets, pair, taatsu);
    if (c[idx] >= 2) {
      if (!pair) { const c2 = c.slice(); c2[idx] -= 2; dfs(c2, idx, sets, 1, taatsu); }
      const c3 = c.slice(); c3[idx] -= 2; dfs(c3, idx, sets, pair, taatsu + 1);
    }
    if (c[idx] >= 3) {
      const c4 = c.slice(); c4[idx] -= 3; dfs(c4, idx, sets + 1, pair, taatsu);
    }
    if (idx < 27 && idx % 9 <= 6) {
      if (c[idx + 1] > 0) {
        const c5 = c.slice(); c5[idx]--; c5[idx + 1]--;
        dfs(c5, idx, sets, pair, taatsu + 1);
      }
      if (idx % 9 <= 5 && c[idx + 2] > 0) {
        const c6 = c.slice(); c6[idx]--; c6[idx + 2]--;
        dfs(c6, idx, sets, pair, taatsu + 1);
      }
      if (c[idx + 1] > 0 && c[idx + 2] > 0) {
        const c7 = c.slice(); c7[idx]--; c7[idx + 1]--; c7[idx + 2]--;
        dfs(c7, idx, sets + 1, pair, taatsu);
      }
    }
  }
  dfs(c34.slice(), 0, 0, 0, 0);
  let chiitoi = 99, kokushi = 99;
  if (locked === 0) {
    chiitoi = 6 - chiitoiPairs(c34) + Math.max(0, 7 - chiitoiKinds(c34));
    kokushi = kokushiShanten(c34);
  }
  return Math.min(best, chiitoi, kokushi);
}

/* ---------- 拆牌（枚举所有分解） ---------- */
function allDecomps(c34, meldsTarget) {
  const out = [];
  const melds = [];
  function rec(c, pairTile) {
    if (melds.length === meldsTarget) {
      let idx = -1;
      for (let i = 0; i < 34; i++) if (c[i] !== 0) {
        if (idx !== -1 || c[i] !== 2) return;
        idx = i;
      }
      if (pairTile < 0) return;
      out.push({ melds: melds.map(m => m.slice()), pair: [pairTile, pairTile] });
      return;
    }
    let i = 0;
    while (i < 34 && c[i] === 0) i++;
    if (i >= 34) return;
    if (c[i] >= 3) {
      const c2 = c.slice(); c2[i] -= 3;
      melds.push([i, i, i]); rec(c2, pairTile); melds.pop();
    }
    if (i < 27 && i % 9 <= 6 && c[i + 1] > 0 && c[i + 2] > 0) {
      const c2 = c.slice(); c2[i]--; c2[i + 1]--; c2[i + 2]--;
      melds.push([i, i + 1, i + 2]); rec(c2, pairTile); melds.pop();
    }
  }
  for (let p = 0; p < 34; p++) if (c34[p] >= 2) {
    const c = c34.slice(); c[p] -= 2;
    rec(c, p);
  }
  return out;
}

/* ---------- 符数 ---------- */
function meldFu(m) {
  if (m.type === 'chi') return 0;
  const term = isTermHonor(m.tiles[0]);
  if (m.type === 'pon') return m.open ? (term ? 4 : 2) : (term ? 8 : 4);
  return m.open ? (term ? 16 : 8) : (term ? 32 : 16);
}
function pairFu(pairTile, ctx) {
  if (pairTile >= 27) {
    if (pairTile >= 31) return 2;
    const w = pairTile - 27;
    return (w === ctx.seatWind ? 2 : 0) + (w === ctx.roundWind ? 2 : 0);
  }
  return 0;
}
/* 待牌符：两面 0，边张/嵌张/单骑 2 */
function waitFu(d, winTile) {
  for (const m of d.melds) {
    if (m[0] === m[1] && m[1] === m[2]) continue;
    if (m.indexOf(winTile) < 0) continue;
    if (winTile === m[0]) return (m[0] % 9) <= 5 ? 0 : 2;
    if (winTile === m[2]) return (m[0] % 9) >= 1 && (m[0] % 9) <= 6 ? 0 : 2;
    return 2;
  }
  return 2;
}
function calcFu(d, ctx, calls, menzen) {
  let fu = 20;
  if (ctx.tsumo) fu += 2;
  else if (menzen) fu += 10;
  for (const m of calls) fu += meldFu(m);
  for (const m of d.melds) {
    if (m[0] === m[1] && m[1] === m[2]) fu += isTermHonor(m[0]) ? 8 : 4;
  }
  fu += pairFu(d.pair[0], ctx);
  fu += waitFu(d, ctx.winTile);
  if (!menzen && fu <= 20) fu = 30;
  fu = Math.ceil(fu / 10) * 10;
  return fu;
}

/* ---------- 役种 ---------- */
function hasRyanmenWait(d, x) {
  for (const m of d.melds) {
    if (m[1] === m[0] + 1 && m[2] === m[0] + 2) {
      if (x === m[0]) { if ((m[0] % 9) <= 5) return true; }
      else if (x === m[2]) { if ((m[0] % 9) >= 1 && (m[0] % 9) <= 6) return true; }
    }
  }
  return false;
}
function isTripletMeld(m) {
  return m.tiles[0] === m.tiles[1] && m.tiles[1] === m.tiles[2];
}
function blockHasTermHonor(m) {
  return isTripletMeld(m) ? isTermHonor(m.tiles[0]) : ((m.tiles[0] % 9 === 0) || (m.tiles[2] % 9 === 8));
}
function blockHasTerm(m) {
  return isTripletMeld(m) ? isTerminal(m.tiles[0]) : ((m.tiles[0] % 9 === 0) || (m.tiles[2] % 9 === 8));
}

function addBasicYaku(yaku, ctx, menzen) {
  if (ctx.riichi) yaku.push({ name: '立直', han: 1 });
  if (ctx.riichi && ctx.ippatsu) yaku.push({ name: '一发', han: 1 });
  if (menzen && ctx.tsumo) yaku.push({ name: '门前清自摸', han: 1 });
  if (ctx.rinshan) yaku.push({ name: '岭上开花', han: 1 });
  if (ctx.haitei) yaku.push({ name: '海底摸月', han: 1 });
  if (ctx.houtei) yaku.push({ name: '河底捞鱼', han: 1 });
}

/* 对一个分解计算役 + 符 */
function evaluateDecomp(d, ctx, calls, menzen, allTiles) {
  const yaku = [];
  const melds = calls.map(m => ({ tiles: m.tiles, open: m.open }))
    .concat(d.melds.map(m => ({ tiles: m, open: false })));
  const allSeq = melds.every(m => !isTripletMeld(m));
  const allTri = melds.every(m => isTripletMeld(m));
  const concealedTri = d.melds.filter(m => m[0] === m[1] && m[1] === m[2]).length
    + calls.filter(m => m.type === 'kan' && !m.open).length;
  const pair = d.pair[0];

  if (menzen && allSeq && !isYakuhai(pair, ctx.seatWind, ctx.roundWind)
    && pair !== ctx.winTile && hasRyanmenWait(d, ctx.winTile)) {
    yaku.push({ name: '平和', han: 1 });
  }
  if (menzen) {
    const seqs = d.melds.filter(m => m[0] !== m[1]);
    const group = {};
    for (const s of seqs) group[s.join(',')] = (group[s.join(',')] || 0) + 1;
    const dup = Object.values(group).filter(v => v >= 2).length;
    if (dup >= 2 && seqs.length === 4) yaku.push({ name: '二杯口', han: 3 });
    else if (dup >= 1) yaku.push({ name: '一杯口', han: 1 });
  }
  if (allTiles.every(t => !isTermHonor(t))) yaku.push({ name: '断幺九', han: 1 });

  for (const m of melds) if (isTripletMeld(m)) {
    const t = m.tiles[0];
    if (t >= 31) yaku.push({ name: tileName(t) + '刻', han: 1 });
    else if (t >= 27) {
      const w = t - 27;
      if (w === ctx.seatWind) yaku.push({ name: '自风刻', han: 1 });
      if (w === ctx.roundWind) yaku.push({ name: '场风刻', han: 1 });
    }
  }

  const seqByStart = {};
  for (const m of melds) if (!isTripletMeld(m)) {
    const a = m.tiles[0];
    if (a < 27 && a % 9 <= 6) {
      const key = a % 9, suit = Math.floor(a / 9);
      (seqByStart[key] = seqByStart[key] || {})[suit] = true;
    }
  }
  if (Object.values(seqByStart).some(ss => ss[0] && ss[1] && ss[2])) {
    yaku.push({ name: '三色同顺', han: 2 });
  }
  for (let suit = 0; suit < 3; suit++) {
    const need = { 0: false, 3: false, 6: false };
    for (const m of melds) if (!isTripletMeld(m)) {
      const a = m.tiles[0];
      if (a < 27 && Math.floor(a / 9) === suit && (a % 9 === 0 || a % 9 === 3 || a % 9 === 6)) {
        need[a % 9] = true;
      }
    }
    if (need[0] && need[3] && need[6]) yaku.push({ name: '一气通贯', han: menzen ? 2 : 1 });
  }

  if (melds.every(blockHasTermHonor) && isTermHonor(pair)) {
    if (melds.every(blockHasTerm) && isTerminal(pair)) {
      yaku.push({ name: '纯全带幺九', han: menzen ? 3 : 2 });
    } else {
      yaku.push({ name: '混全带幺九', han: menzen ? 2 : 1 });
    }
  }
  if (allTri) yaku.push({ name: '对对和', han: 2 });
  if (concealedTri === 4) {
    const tanki = family(ctx.winTile) === pair;
    yaku.push({ name: tanki ? '四暗刻单骑' : '四暗刻', han: tanki ? 26 : 13, yakuman: true });
  }
  else if (concealedTri >= 3) yaku.push({ name: '三暗刻', han: 2 });
  if (allTiles.every(isTermHonor)) yaku.push({ name: '混老头', han: 2 });

  const suitCount = [0, 0, 0];
  for (const t of allTiles) if (t < 27) suitCount[Math.floor(t / 9)]++;
  const noHonor = allTiles.every(t => t < 27);
  const oneSuit = (suitCount[0] > 0 ? 1 : 0) + (suitCount[1] > 0 ? 1 : 0) + (suitCount[2] > 0 ? 1 : 0) === 1;
  if (oneSuit && noHonor) yaku.push({ name: '清一色', han: menzen ? 6 : 5 });
  else if (oneSuit) yaku.push({ name: '混一色', han: menzen ? 3 : 2 });

  addBasicYaku(yaku, ctx, menzen);
  const fu = calcFu(d, ctx, calls, menzen);
  const han = yaku.reduce((s, y) => s + y.han, 0);
  return { yaku, han, fu };
}

/* ---------- 得点 ---------- */
function basicPoints(han, fu) {
  if (han >= 13) return Math.floor(han / 13) * 8000;
  if (han >= 11) return 6000;
  if (han >= 8) return 4000;
  if (han >= 6) return 3000;
  if (han >= 5) return 2000;
  const b = fu * Math.pow(2, han + 2);
  return b >= 2000 ? 2000 : b;
}
function limitName(han, fu, basic) {
  if (han >= 13) {
    const k = Math.floor(han / 13);
    return k === 1 ? '役满' : k === 2 ? '双倍役满' : k + '倍役满';
  }
  if (han >= 11) return '三倍满';
  if (han >= 8) return '倍满';
  if (han >= 6) return '跳满';
  if (han >= 5 || basic >= 2000) return '满贯';
  return '';
}
function doraCount(allCounts, doraTiles) {
  let n = 0;
  for (const t of doraTiles) n += allCounts[t];
  return n;
}

/* ---------- 役满（含双倍役满） ---------- */
const GREEN_TILES = [19, 20, 21, 23, 25, 32];
function detectChuuren(allTiles, winF) {
  if (allTiles.some(t => family(t) >= 27)) return null;
  const suit = Math.floor(family(allTiles[0]) / 9);
  if (allTiles.some(t => Math.floor(family(t) / 9) !== suit)) return null;
  const base = [3, 1, 1, 1, 1, 1, 1, 1, 3];
  const ranks = new Array(9).fill(0);
  for (const t of allTiles) ranks[family(t) % 9]++;
  let extra = -1;
  for (let i = 0; i < 9; i++) {
    const diff = ranks[i] - base[i];
    if (diff === 0) continue;
    if (diff === 1 && extra < 0) { extra = i; continue; }
    return null;
  }
  if (extra < 0) return null;
  const pure = (extra === (winF % 9));
  return { name: pure ? '纯正九莲宝灯' : '九莲宝灯', han: pure ? 26 : 13, yakuman: true };
}
function detectGlobalYakuman(allTiles, ctx) {
  const c = counts(allTiles);
  const yaku = [];
  if (c[31] >= 3 && c[32] >= 3 && c[33] >= 3) yaku.push({ name: '大三元', han: 13, yakuman: true });
  const windTri = [27, 28, 29, 30].filter(w => c[w] >= 3).length;
  const windPair = [27, 28, 29, 30].filter(w => c[w] >= 2).length;
  if (windTri === 4) yaku.push({ name: '大四喜', han: 26, yakuman: true });
  else if (windTri === 3 && windPair === 4) yaku.push({ name: '小四喜', han: 13, yakuman: true });
  if (allTiles.every(t => family(t) >= 27)) yaku.push({ name: '字一色', han: 13, yakuman: true });
  if (allTiles.every(t => GREEN_TILES.indexOf(family(t)) >= 0)) yaku.push({ name: '绿一色', han: 13, yakuman: true });
  if (allTiles.every(t => isTerminal(family(t)))) yaku.push({ name: '清老头', han: 13, yakuman: true });
  const chuuren = detectChuuren(allTiles, family(ctx.winTile));
  if (chuuren) yaku.push(chuuren);
  if (ctx.tenhou) yaku.push({ name: '天和', han: 13, yakuman: true });
  if (ctx.chiihou) yaku.push({ name: '地和', han: 13, yakuman: true });
  return yaku;
}

/* ---------- 和牌判定总入口 ----------
 * ctx: {
 *   concealed: 手牌数组（荣和时已包含和牌张）
 *   calls: 副露 [{type:'chi'|'pon'|'kan', tiles, open}]
 *   winTile, tsumo, seatWind(0东1南2西3北), roundWind,
 *   riichi, ippatsu, rinshan, haitei, houtei,
 *   doraInds, uraInds
 * }
 * 返回 {yaku, han, fu, basic, limit, doraHan, uraHan} 或 null
 */
function evaluateWin(ctx) {
  const { concealed, calls } = ctx;
  const openMelds = calls.filter(m => m.open);
  const menzen = openMelds.length === 0;
  const allTiles = concealed.concat(calls.reduce((a, m) => a.concat(m.tiles), []));
  const allCounts = counts(allTiles);

  const redBonus = countRed(allTiles);
  const doraHan = doraCount(allCounts, (ctx.doraInds || []).map(doraOf)) + redBonus;
  const uraHan = ctx.riichi ? doraCount(allCounts, (ctx.uraInds || []).map(doraOf)) : 0;

  if (calls.length === 0 && allTiles.length === 14) {
    if (isKokushi(allCounts)) {
      const thirteen = allCounts[family(ctx.winTile)] >= 2;
      const han = thirteen ? 26 : 13;
      return { yaku: [{ name: thirteen ? '国士无双十三面' : '国士无双', han, yakuman: true }], han, fu: 0, basic: basicPoints(han, 0), limit: limitName(han, 0, 0), doraHan: 0, uraHan: 0 };
    }
    if (isChiitoi(allCounts)) {
      const yaku = [{ name: '七对子', han: 2 }];
      addBasicYaku(yaku, ctx, menzen);
      const han = yaku.reduce((s, y) => s + y.han, 0);
      const basic = basicPoints(han, 25);
      return { yaku, han, fu: 25, basic, limit: limitName(han, 25, basic), doraHan, uraHan };
    }
  }

  const meldsTarget = 4 - calls.length;
  const concealedForDecomp = concealed.slice();
  for (const m of calls) if (m.type === 'kan' && !m.open) {
    const i = concealedForDecomp.indexOf(m.tiles[0]);
    if (i >= 0) concealedForDecomp.splice(i, 1);
  }
  const decomps = allDecomps(counts(concealedForDecomp), meldsTarget);
  if (!decomps.length) return null;

  const globalYaku = detectGlobalYakuman(allTiles, ctx);

  let best = null;
  for (const d of decomps) {
    const res = evaluateDecomp(d, ctx, calls, menzen, allTiles);
    if (res.yaku.some(y => y.yakuman)) {
      const han = res.yaku.reduce((s, y) => s + y.han, 0);
      const r = { yaku: res.yaku, han, fu: 0, basic: basicPoints(han, 0), limit: limitName(han, 0, 0), doraHan: 0, uraHan: 0 };
      if (!best || r.han > best.han) best = r;
      continue;
    }
    const han = res.han;
    const basic = basicPoints(han, res.fu);
    const r = { yaku: res.yaku, han, fu: res.fu, basic, limit: limitName(han, res.fu, basic), doraHan, uraHan };
    if (!best || r.han > best.han || (r.han === best.han && r.fu > best.fu)) best = r;
  }

  const yakumanList = [];
  for (const y of globalYaku) yakumanList.push(y);
  if (best && best.yaku) for (const y of best.yaku) if (y.yakuman) yakumanList.push(y);
  if (yakumanList.length) {
    const han = yakumanList.reduce((s, y) => s + y.han, 0);
    return { yaku: yakumanList, han, fu: 0, basic: basicPoints(han, 0), limit: limitName(han, 0, 0), doraHan: 0, uraHan: 0 };
  }
  return best;
}
