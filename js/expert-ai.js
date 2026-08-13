'use strict';
/* ============ 专家 AI：蒙特卡洛（进攻）+ 困难AI防守 ============
 * 用已验证的引擎规则做轻量 roll-out，估算「打出某张牌后最终和牌的概率」。
 * 有人立直且自身向听较远时退回困难AI的防守逻辑（现物优先）。
 */
const _shantenCache = new Map();
function shantenCached(c, locked) {
  const key = c.join(',') + '|' + locked;
  const hit = _shantenCache.get(key);
  if (hit !== undefined) return hit;
  const v = shanten(c, locked);
  if (_shantenCache.size > 300000) _shantenCache.clear();
  _shantenCache.set(key, v);
  return v;
}

const ExpertAI = {
  SIMS: 22,
  MAX_DRAWS: 11,

  chooseDiscard(g, seat) {
    const p = g.players[seat];
    const c = counts(p.concealed);
    const baseS = shantenCached(c, p.melds.length);

    /* 防守：有人立直且自身离听牌较远 */
    const opp = g.players.findIndex((pl, i) => i !== seat && pl.riichi);
    if (opp >= 0 && baseS >= 2) return AI.smartDiscard(g, seat, true);

    /* 候选：打出后向听数最小的牌 */
    let bestS = 99;
    const cands = [];
    for (let t = 0; t < 34; t++) if (c[t] > 0) {
      const c2 = c.slice(); c2[t]--;
      const s = shantenCached(c2, p.melds.length);
      if (s < bestS) { bestS = s; cands.length = 0; cands.push(t); }
      else if (s === bestS) cands.push(t);
    }
    if (cands.length > 5) cands.length = 5;

    let best = null, bestSc = -Infinity;
    for (const t of cands) {
      let sc = this.mcScore(g, seat, t);
      /* 轻微防守加成：打过的牌略微优先 */
      if (p.discards.indexOf(t) >= 0) sc += 0.005;
      if (sc > bestSc) { bestSc = sc; best = t; }
    }
    return best !== null ? best : AI.smartDiscard(g, seat, false);
  },

  /* 剩余牌池（计数）：总 136 - 已见牌 */
  buildPool(g, seat, hand) {
    const pool = new Array(34).fill(4);
    const sub = tiles => { for (const t of tiles) pool[family(t)]--; };
    sub(hand);
    for (let s = 0; s < 4; s++) {
      sub(g.players[s].discards);
      for (const m of g.players[s].melds) sub(m.tiles);
    }
    /* 我的副露在 hand 之外也需扣除 */
    for (const m of g.players[seat].melds) sub(m.tiles);
    for (const ind of g.doraInds) pool[family(ind)]--;
    const list = [];
    for (let t = 0; t < 34; t++) for (let k = 0; k < Math.max(0, pool[t]); k++) list.push(t);
    return list;
  },

  mcScore(g, seat, discardTile) {
    const p = g.players[seat];
    const hand = p.concealed.slice();
    const idx = hand.findIndex(x => family(x) === discardTile);
    if (idx < 0) return -Infinity;
    hand.splice(idx, 1);
    const meldCount = p.melds.length;
    const pool = this.buildPool(g, seat, hand);
    let total = 0;
    for (let s = 0; s < this.SIMS; s++) total += this.simulate(hand.slice(), meldCount, pool.slice());
    return total / this.SIMS;
  },

  /* 单次 roll-out：贪心向听下降 + 随机摸牌，估算和牌价值 */
  simulate(hand, meldCount, pool) {
    let cur = hand.slice();
    let s = shantenCached(counts(cur), meldCount);
    for (let d = 0; d < this.MAX_DRAWS && pool.length; d++) {
      const i = Math.floor(Math.random() * pool.length);
      const drawn = pool.splice(i, 1)[0];
      cur.push(drawn);
      const c = counts(cur);
      if (canWin(c, meldCount)) return 1 + (this.MAX_DRAWS - d) * 0.03;
      const s2 = shantenCached(c, meldCount);
      if (s2 < s) {
        /* 摸到有用的牌：打出最差的牌 */
        let worst = drawn, worstS = s2;
        for (let t = 0; t < 34; t++) if (c[t] > 0) {
          const c2 = c.slice(); c2[t]--;
          const ss = shantenCached(c2, meldCount);
          if (ss > worstS || (ss === worstS && t === drawn)) { worstS = ss; worst = t; }
        }
        const rm = cur.findIndex(x => family(x) === worst);
        if (rm >= 0) cur.splice(rm, 1);
        s = shantenCached(counts(cur), meldCount);
      } else {
        /* 摸到没用的牌：摸切 */
        const rm = cur.indexOf(drawn);
        if (rm >= 0) cur.splice(rm, 1);
      }
    }
    const finalS = shantenCached(counts(cur), meldCount);
    return finalS <= 0 ? 0.4 : finalS <= 1 ? 0.12 : finalS <= 2 ? 0.02 : 0;
  },
};
