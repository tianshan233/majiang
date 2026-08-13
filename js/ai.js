'use strict';
/* ============ AI 决策 ============ */
const AI = {
  diff(g) { return g.cfg.difficulty || 'normal'; },

  /* 摸牌后的决策 */
  onDraw(g, seat) {
    const p = g.players[seat];
    if (g.canWinNow(seat, true)) return { type: 'tsumo' };
    if (p.riichi) return { type: 'discard', tile: g.drawnTile };
    if (this.diff(g) !== 'easy') {
      const kan = this.chooseKan(g, seat);
      if (kan) return { type: 'kan', kan };
    }
    const rii = this.chooseRiichi(g, seat);
    if (rii) return { type: 'riichi', tile: rii.discard };
    return { type: 'discard', tile: this.chooseDiscard(g, seat) };
  },

  /* 杠：非听牌时，杠后向听不恶化才杠 */
  chooseKan(g, seat) {
    const p = g.players[seat];
    if (p.riichi) return null;
    const opts = g.kanOptions(seat);
    if (!opts.length) return null;
    const pre = shanten(counts(p.concealed), p.melds.length);
    if (pre <= 0) return null;
    for (const k of opts) {
      const c2 = counts(p.concealed.filter(t => t !== k.tile));
      const post = shanten(c2, p.melds.length + (k.type === 'ankan' ? 1 : 0));
      if (post <= pre) return k;
    }
    return null;
  },

  /* 立直：简单AI不立直；普通听牌数>=2；困难听牌即立 */
  chooseRiichi(g, seat) {
    const p = g.players[seat];
    if (p.riichi || p.score < 1000) return null;
    if (p.melds.some(m => m.open)) return null;
    const diff = this.diff(g);
    const c = counts(p.concealed);
    let best = null;
    for (let t = 0; t < 34; t++) if (c[t] > 0) {
      const c2 = c.slice(); c2[t]--;
      const ws = waitsFor(tilesFromCounts(c2), p.melds.length);
      if (ws.length && (!best || ws.length > best.waits.length)) best = { discard: t, waits: ws };
    }
    if (!best) return null;
    if (diff === 'easy') return null;
    if (diff === 'hard' || diff === 'expert') return best;
    if (best.waits.length < 2) return null;
    return best;
  },

  /* 打牌：按难度分发 */
  chooseDiscard(g, seat) {
    const diff = this.diff(g);
    if (diff === 'easy') return this.easyDiscard(g, seat);
    if (diff === 'expert') return ExpertAI.chooseDiscard(g, seat);
    return this.smartDiscard(g, seat, diff === 'hard');
  },

  /* 简单AI：孤张字牌/幺九优先，偶尔乱打 */
  easyDiscard(g, seat) {
    const p = g.players[seat];
    if (Math.random() < 0.12) {
      return p.concealed[Math.floor(Math.random() * p.concealed.length)];
    }
    const blocks = analyzeBlocks(counts(p.concealed));
    if (blocks.floats.length) {
      const honor = blocks.floats.filter(t => isHonor(t));
      const term = blocks.floats.filter(t => isTerminal(t));
      const pool = honor.length ? honor : term.length ? term : blocks.floats;
      return pool[Math.floor(Math.random() * pool.length)];
    }
    return this.smartDiscard(g, seat, false);
  },

  /* 打牌：向听数最小的牌中选"最没用"的 */
  smartDiscard(g, seat, hardDefense) {
    const p = g.players[seat];
    const c = counts(p.concealed);
    let bestS = 99;
    const cands = [];
    for (let t = 0; t < 34; t++) if (c[t] > 0) {
      const c2 = c.slice(); c2[t]--;
      const s = shanten(c2, p.melds.length);
      if (s < bestS) { bestS = s; cands.length = 0; cands.push(t); }
      else if (s === bestS) cands.push(t);
    }
    const opp = g.players.findIndex((pl, i) => i !== seat && pl.riichi);
    const defensive = opp >= 0 && bestS > (hardDefense ? 1 : 0);
    let bestScore = Infinity, picks = [];
    for (const t of cands) {
      const sc = this.discardScore(g, seat, t, c, defensive, opp, hardDefense);
      if (sc < bestScore) { bestScore = sc; picks = [t]; }
      else if (sc === bestScore) picks.push(t);
    }
    return picks[Math.floor(Math.random() * picks.length)];
  },

  discardScore(g, seat, t, c, defensive, opp, hardDefense) {
    const c2 = c.slice(); c2[t]--;
    const blocks = analyzeBlocks(c2);
    let sc = 0;
    if (blocks.floats.indexOf(t) >= 0) sc += isTermHonor(t) ? 0 : 2;
    else if (blocks.taatsu.some(tt => tt.indexOf(t) >= 0)) sc += 4;
    else if (blocks.pairs.indexOf(t) >= 0) sc += 5;
    else sc += 6;
    if (defensive) {
      if (g.players[opp].discards.indexOf(t) >= 0) sc -= hardDefense ? 10 : 8;
      else if (isHonor(t)) sc -= hardDefense ? 3 : 2;
      else if (isTerminal(t)) sc -= hardDefense ? 2 : 1;
    }
    if (!defensive && t === family(g.drawnTile)) sc -= 1;
    return sc;
  },

  wantPon(g, seat, tile) {
    const p = g.players[seat];
    if (p.riichi) return false;
    if (this.diff(g) === 'easy') return false;
    const pre = shanten(counts(p.concealed), p.melds.length);
    const c2 = counts(p.concealed);
    c2[tile] = Math.max(0, c2[tile] - 2);
    const post = shanten(c2, p.melds.length + 1);
    if (post < pre) return true;
    if (post === pre && isYakuhai(tile, p.seatWind, g.roundWindOf())) return true;
    return false;
  },
};

/* 贪心拆牌（打牌评估用）：面子/对子/搭子/浮牌 */
function analyzeBlocks(c) {
  const cc = c.slice();
  const sets = [], pairs = [], taatsu = [], floats = [];
  for (let i = 0; i < 34; i++) while (cc[i] >= 3) { cc[i] -= 3; sets.push([i, i, i]); }
  for (let i = 0; i < 27; i++) {
    if (i % 9 > 6) continue;
    while (cc[i] > 0 && cc[i + 1] > 0 && cc[i + 2] > 0) {
      cc[i]--; cc[i + 1]--; cc[i + 2]--;
      sets.push([i, i + 1, i + 2]);
    }
  }
  for (let i = 0; i < 34; i++) if (cc[i] >= 2) { cc[i] -= 2; pairs.push(i); }
  for (let i = 0; i < 27; i++) {
    if (cc[i] > 0 && i % 9 <= 6 && cc[i + 1] > 0) { cc[i]--; cc[i + 1]--; taatsu.push([i, i + 1]); }
    else if (cc[i] > 0 && i % 9 <= 5 && cc[i + 2] > 0) { cc[i]--; cc[i + 2]--; taatsu.push([i, i + 2]); }
  }
  for (let i = 0; i < 34; i++) while (cc[i] > 0) { cc[i]--; floats.push(i); }
  return { sets, pairs, taatsu, floats };
}
