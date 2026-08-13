'use strict';
/* ============ 外挂模式（仿万宁象棋的整活「大招」） ============
 * 开挂局与正常对局隔离：开挂不计入段位/战绩（单独记「开挂战绩」）。
 * 每个外挂有 type（触发方式）与 uses/cooldown（有限模式下生效）。
 */

/* 役满牌型库（14 张和牌，win 为和牌张） */
const YAKUMAN_PATTERNS = [
  { name: '国士无双', tiles: [0, 0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33], win: 33 },
  { name: '国士无双十三面', tiles: [0, 0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33], win: 0 },
  { name: '大三元', tiles: [31, 31, 31, 32, 32, 32, 33, 33, 33, 0, 1, 2, 17, 17], win: 17 },
  { name: '大四喜', tiles: [27, 27, 27, 28, 28, 28, 29, 29, 29, 30, 30, 30, 17, 17], win: 17 },
  { name: '小四喜', tiles: [27, 27, 27, 28, 28, 28, 29, 29, 29, 30, 30, 0, 0, 0], win: 30 },
  { name: '字一色', tiles: [27, 27, 27, 28, 28, 28, 29, 29, 29, 31, 31, 31, 33, 33], win: 33 },
  { name: '绿一色', tiles: [19, 20, 21, 19, 19, 19, 23, 23, 23, 25, 25, 25, 32, 32], win: 32 },
  { name: '清老头', tiles: [0, 0, 0, 8, 8, 8, 9, 9, 9, 17, 17, 17, 18, 18], win: 18 },
  { name: '纯正九莲宝灯', tiles: [0, 0, 0, 1, 2, 3, 4, 4, 5, 6, 7, 8, 8, 8], win: 4 },
  { name: '九莲宝灯', tiles: [0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 8, 8], win: 8 },
  { name: '四暗刻单骑', tiles: [0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 13, 13], win: 13 },
  { name: '四暗刻', tiles: [0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 13, 13], win: 3 },
];

/* 外挂定义：type = toggle 开关 / instant 一次性 / pattern 选役满 / tile 选牌 / opp 选对手 */
const CHEATS = [
  { id: 'peek', name: '透视之眼', icon: '👁️', cat: '手牌', type: 'toggle', desc: '看穿所有对手手牌与牌山', usage: '开关型：开启后，所有对手的手牌与牌山都会明牌显示，每步实时更新。' },
  { id: 'godHand', name: '神之一手', icon: '🎴', cat: '手牌', type: 'pattern', uses: 3, desc: '把手牌变成指定役满听牌', usage: '选择一种役满牌型，手牌直接替换成该役满的听牌形态（还差最后一张）。限 3 次。' },
  { id: 'wish', name: '心想事成', icon: '🎯', cat: '手牌', type: 'tile', uses: 5, desc: '摸到任意想要的一张牌', usage: '选择任意一张牌，立即摸到它（从牌山移除，不占正常摸牌）。限 5 次。' },
  { id: 'clone', name: '无限复制', icon: '♾️', cat: '手牌', type: 'handtile', uses: 3, desc: '复制手里的一张牌（无视四张上限）', usage: '选择手里的一张牌，复制一张加到手牌，可突破同牌 4 张上限。限 3 次。' },
  { id: 'wishDora', name: '心想事成+', icon: '✨', cat: '手牌', type: 'toggle', desc: '下一次摸牌必是宝牌', usage: '开关型：开启后，你下一次摸牌必定摸到宝牌。' },
  { id: 'tenhou', name: '开局天胡', icon: '☀️', cat: '胜负', type: 'instant', uses: 3, desc: '立刻天和，随机役满', usage: '立即天和，随机一个役满牌型直接结算。限 3 次。' },
  { id: 'instaWin', name: '一键胡牌', icon: '💥', cat: '胜负', type: 'pattern', uses: 5, desc: '立刻自摸指定的役满', usage: '选择一种役满牌型，立即自摸结算。限 5 次。' },
  { id: 'money', name: '印钞机', icon: '💰', cat: '胜负', type: 'instant', uses: 5, desc: '自己 +10000 点', usage: '立即给自己 +10000 点。限 5 次。' },
  { id: 'alwaysDealer', name: '永远连庄', icon: '♻️', cat: '胜负', type: 'toggle', desc: '每局强制自己做庄家', usage: '开关型：开启后每局都强制你坐庄。' },
  { id: 'bomb', name: '炸牌', icon: '💣', cat: '破坏', type: 'opp', uses: 5, desc: '炸掉对手随机一张手牌', usage: '选择一名对手，随机炸掉他一张手牌。限 5 次。' },
  { id: 'steal', name: '偷天换日', icon: '🕶️', cat: '破坏', type: 'opp', uses: 5, desc: '把对手一张牌偷到自己手里', usage: '选择一名对手，随机偷他一张手牌到自己手里。限 5 次。' },
  { id: 'doraHack', name: '篡改宝牌', icon: '🔥', cat: '破坏', type: 'tile', uses: 3, desc: '把宝牌指示牌改成指定牌', usage: '选择一张牌，把当前宝牌指示牌改成它。限 3 次。' },
  { id: 'reshuffle', name: '掀桌重洗', icon: '🃏', cat: '破坏', type: 'instant', uses: 3, desc: '重新洗一遍整座牌山', usage: '重新洗一遍整座牌山（含王牌），宝牌指示重新翻开。限 3 次。' },
  { id: 'mindRead', name: '读心术', icon: '🔮', cat: '操控', type: 'toggle', desc: '显示对手听什么牌与危险牌', usage: '开关型：开启后显示每名对手在听什么牌、哪些是危险牌。' },
  { id: 'hypnotize', name: '催眠大师', icon: '😴', cat: '操控', type: 'toggle', desc: 'AI 无法碰/吃/杠/和', usage: '开关型：开启后 AI 无法碰/吃/杠/荣和。' },
  { id: 'puppet', name: '傀儡线', icon: '🪡', cat: '操控', type: 'opptile', uses: 3, desc: '指定对手打出某张牌（喂牌/放铳）', usage: '先选一名对手，再选一张牌，强制他下一手打出这张牌（可用于喂牌或放铳）。限 3 次。' },
  { id: 'undo', name: '时光倒流', icon: '⏪', cat: '整活', type: 'instant', uses: 5, desc: '撤销上一步', usage: '撤销上一步操作，回到上一回合状态。限 5 次。' },
];

const Cheats = {
  /* 初始化某局的外挂状态 */
  init(game) {
    const c = game.cheat;
    c.flags = { peek: false, mindRead: false, hypnotize: false, alwaysDealer: false, wishDora: false };
    c.uses = {};
    c.cooldown = {};
    c.used = {};
    c.puppet = null; /* { seat, tile } */
    CHEATS.forEach(ch => { if (ch.uses) c.uses[ch.id] = ch.uses; });
  },

  def(id) { return CHEATS.find(c => c.id === id); },

  /* 是否可用（次数/冷却/时机） */
  canUse(game, id) {
    const c = game.cheat;
    const ch = this.def(id);
    if (!ch) return false;
    if (c.limited) {
      if (ch.uses && (c.uses[id] || 0) <= 0) return false;
      if ((c.cooldown[id] || 0) > 0) return false;
    }
    return true;
  },

  /* 消耗次数、进入冷却 */
  consume(game, id) {
    const c = game.cheat;
    const ch = this.def(id);
    if (c.limited && ch.uses) c.uses[id] = (c.uses[id] || 0) - 1;
    if (ch.cooldown) c.cooldown[id] = ch.cooldown;
  },

  /* 每回合推进冷却 */
  tickCooldown(game) {
    const c = game.cheat;
    for (const k in c.cooldown) if (c.cooldown[k] > 0) c.cooldown[k]--;
  },

  /* 触发外挂 */
  activate(game, id, params) {
    if (!this.canUse(game, id)) return false;
    const human = game.humanSeat;
    if (human < 0) return false;
    const ok = this.apply(game, id, params, human);
    if (ok) {
      this.consume(game, id);
      game.cheat.used[id] = (game.cheat.used[id] || 0) + 1;
      game._log('【外挂】' + this.def(id).name);
      game._update();
      return true;
    }
    return false;
  },

  apply(game, id, params, seat) {
    const p = game.players[seat];
    const c = game.cheat;
    switch (id) {
      case 'peek':
      case 'mindRead':
      case 'hypnotize':
      case 'alwaysDealer':
      case 'wishDora':
        c.flags[id] = !c.flags[id];
        return true;
      case 'godHand': {
        const pat = YAKUMAN_PATTERNS.find(x => x.name === params);
        if (!pat) return false;
        const tiles = pat.tiles.slice();
        const wi = tiles.indexOf(pat.win);
        if (wi >= 0) tiles.splice(wi, 1);
        p.concealed = sortTiles(tiles);
        p.melds = []; p.riichi = false;
        return true;
      }
      case 'instaWin': {
        const pat = YAKUMAN_PATTERNS.find(x => x.name === params);
        if (!pat) return false;
        this.forceWin(game, seat, pat);
        return true;
      }
      case 'tenhou': {
        const pat = YAKUMAN_PATTERNS[Math.floor(Math.random() * YAKUMAN_PATTERNS.length)];
        this.forceWin(game, seat, pat);
        return true;
      }
      case 'wish': {
        const tile = params;
        if (tile < 0 || tile > 33) return false;
        const wi = game.wall.indexOf(tile);
        if (wi >= 0) game.wall.splice(wi, 1);
        p.concealed.push(tile); p.concealed.sort(tileCompare);
        game.drawnTile = tile; p.lastDrawn = tile;
        return true;
      }
      case 'clone': {
        const tile = params;
        const has = p.concealed.some(t => family(t) === family(tile));
        if (!has) return false;
        const base = p.concealed.find(t => family(t) === family(tile));
        p.concealed.push(base); p.concealed.sort(tileCompare);
        game.drawnTile = base; p.lastDrawn = base;
        return true;
      }
      case 'money': {
        p.score += 10000;
        return true;
      }
      case 'bomb': {
        const opp = game.players[params];
        if (!opp || !opp.concealed.length) return false;
        opp.concealed.splice(Math.floor(Math.random() * opp.concealed.length), 1);
        return true;
      }
      case 'steal': {
        const opp = game.players[params];
        if (!opp || !opp.concealed.length) return false;
        const tile = opp.concealed.splice(Math.floor(Math.random() * opp.concealed.length), 1)[0];
        p.concealed.push(tile); p.concealed.sort(tileCompare);
        game.drawnTile = tile; p.lastDrawn = tile;
        return true;
      }
      case 'doraHack': {
        const tile = params;
        if (tile < 0 || tile > 33 || !game.doraInds.length) return false;
        game.doraInds[0] = tile;
        return true;
      }
      case 'reshuffle': {
        const wall = buildWall();
        game.wall = wall.slice(0, 122);
        game.dead = wall.slice(122);
        game.doraInds = [game.dead[0]];
        return true;
      }
      case 'puppet': {
        c.puppet = params; /* { seat, tile } */
        return true;
      }
      case 'undo': {
        return game.cheatUndo();
      }
    }
    return false;
  },

  /* 强制自摸某役满 */
  forceWin(game, seat, pat) {
    const p = game.players[seat];
    p.concealed = sortTiles(pat.tiles.slice());
    p.melds = []; p.riichi = false;
    game.drawnTile = pat.win;
    p.lastDrawn = pat.win;
    game._tsumo(seat);
  },
};
