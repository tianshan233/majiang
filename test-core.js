'use strict';
/* 核心逻辑测试 + AI 全自动对局冒烟测试 */
const fs = require('fs');
const path = require('path');

const files = ['js/tiles.js', 'js/yaku.js', 'js/ai.js', 'js/expert-ai.js', 'js/game.js']
  .map(f => fs.readFileSync(path.join(__dirname, f), 'utf8'));
const code = files.join('\n') + '\nreturn { canWin, shanten, waitsFor, evaluateWin, counts, tileName, doraOf, allDecomps, basicPoints, Game, AI, ExpertAI, isChiitoi, isKokushi, tilesFromCounts };';
const api = new Function(code)();

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; }
  else { fail++; console.log('  FAIL: ' + msg); }
}

/* ---------- 和牌判定 ---------- */
{
  const win = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 30, 30]; // 123m456m789m 123p 北北
  ok(api.canWin(api.counts(win), 0), '标准4面子+雀头和牌');
  const notWin = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 9, 10, 30]; // 123m456m789m 11p22p 北
  ok(!api.canWin(api.counts(notWin), 0), '非和牌');
  const kokushi = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33, 0];
  ok(api.canWin(api.counts(kokushi), 0), '国士无双');
  const chiitoi = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6];
  ok(api.canWin(api.counts(chiitoi), 0), '七对子');
  const chiitoi4 = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5];
  ok(api.canWin(api.counts(chiitoi4), 0), '七对子（含4张同牌）');
  const sevenPairs = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6];
  ok(api.isChiitoi(api.counts(sevenPairs)), 'isChiitoi');
  ok(api.isKokushi(api.counts(kokushi)), 'isKokushi');
}

/* ---------- 听牌 ---------- */
{
  const hand = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 13, 13]; // 123m456m789m 23p 55p
  const w = api.waitsFor(hand, 0);
  ok(w.indexOf(9) >= 0 && w.indexOf(12) >= 0, '两面听 1p/4p，得到: ' + w.join(','));
}

/* ---------- 向听 ---------- */
{
  ok(api.shanten(api.counts([0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 13, 13]), 0) === 0, '听牌形向听=0');
  ok(api.shanten(api.counts([0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33]), 0) === 0, '国士13种=听牌');
  ok(api.shanten(api.counts([0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 27]), 0) === 0, '七对6对+1单=听牌');
  ok(api.shanten(api.counts([0, 1, 3, 4, 6, 7, 9, 10, 12, 13, 18, 19, 21]), 0) === 4, '6搭+1浮=向听4，实际: ' + api.shanten(api.counts([0, 1, 3, 4, 6, 7, 9, 10, 12, 13, 18, 19, 21]), 0));
}

/* ---------- 拆牌 ---------- */
{
  const c = api.counts([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 30, 30]);
  const ds = api.allDecomps(c, 4);
  ok(ds.length > 0, 'allDecomps 能找到分解');
  ok(ds[0].pair[0] === 30, '分解的雀头为北');
}

/* ---------- 得点 ---------- */
{
  ok(api.basicPoints(1, 30) === 240, '30符1番 basic=240');
  ok(api.basicPoints(2, 30) === 480, '30符2番 basic=480');
  ok(api.basicPoints(4, 40) === 2000, '40符4番 = 满贯');
  ok(api.basicPoints(5, 20) === 2000, '5番 = 满贯');
  ok(api.basicPoints(7, 20) === 3000, '6-7番 = 跳满');
  ok(api.basicPoints(13, 0) === 8000, '役满 8000');
}

/* ---------- 役种/符数 ---------- */
function ctxOf(concealed, extra) {
  return Object.assign({
    concealed, calls: [], winTile: concealed[concealed.length - 1], tsumo: false,
    seatWind: 0, roundWind: 0, riichi: false, ippatsu: false, rinshan: false,
    haitei: false, houtei: false, doraInds: [], uraInds: [],
  }, extra || {});
}
{
  // 平和 荣和: 123m456m789m 123p55p, 和1p(9)；还有一气通贯(万子123456789)
  const c = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 12];
  const r = api.evaluateWin(ctxOf(c, { winTile: 9 }));
  ok(r && r.yaku.some(y => y.name === '平和'), '平和判定');
  ok(r && r.yaku.some(y => y.name === '一气通贯'), '一气通贯判定');
  ok(r && r.han === 3, '平和+一气通贯 = 3番，实际: ' + (r && r.han));
  ok(r && r.fu === 30, '平和荣和 30符，实际: ' + (r && r.fu));
  ok(r && r.basic === 960, '平和+一气通贯 basic 960，实际: ' + (r && r.basic));
}
{
  // 断幺九: 234p567p 234s567s 22s, 和2s(19)
  const c = [10, 11, 12, 13, 14, 15, 19, 20, 21, 22, 23, 24, 19, 19];
  const r = api.evaluateWin(ctxOf(c, { winTile: 19 }));
  ok(r && r.yaku.some(y => y.name === '断幺九'), '断幺九判定');
}
{
  // 役牌: 123m456m789m 中中中 55p
  const c = [0, 1, 2, 3, 4, 5, 6, 7, 8, 33, 33, 33, 12, 12];
  const r = api.evaluateWin(ctxOf(c, { winTile: 0 }));
  ok(r && r.yaku.some(y => y.name === '中刻'), '役牌(中刻)判定');
}
{
  // 立直+一发+平和+一气通贯 = 5番
  const c = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 12];
  const r = api.evaluateWin(ctxOf(c, { winTile: 9, riichi: true, ippatsu: true }));
  ok(r && r.yaku.some(y => y.name === '立直'), '立直判定');
  ok(r && r.yaku.some(y => y.name === '一发'), '一发判定');
  ok(r && r.han === 5, '立直+一发+平和+一气通贯 = 5番，实际: ' + (r && r.han));
}
{
  // 宝牌: 指示 北(30) -> 东(27), 手牌有东刻
  const c = [27, 27, 27, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 9];
  const r = api.evaluateWin(ctxOf(c, { winTile: 27, doraInds: [30] }));
  ok(r && r.doraHan === 3, '宝牌3张，实际: ' + (r && r.doraHan));
}
{
  // 清一色: 123m456m789m + 123m44m, 和1m: 清一色6+一气通贯2+一杯口1+平和1 = 10番
  const c = [0, 1, 2, 3, 4, 5, 6, 7, 8, 0, 1, 2, 3, 3];
  const r = api.evaluateWin(ctxOf(c, { winTile: 0 }));
  ok(r && r.yaku.some(y => y.name === '清一色'), '清一色判定');
  ok(r && r.han === 10, '清一色合计10番(门清)，实际: ' + (r && r.han));
}
{
  // 无役（只有宝牌）→ 无效: 123m456m 567p 789s 33s, 和8s(25) 嵌张
  const c = [0, 1, 2, 3, 4, 5, 12, 13, 14, 24, 25, 26, 20, 20];
  const r = api.evaluateWin(ctxOf(c, { winTile: 25, doraInds: [30] }));
  ok(r && r.yaku.length === 0, '只有宝牌无役 → yaku为空');
}
{
  // 七对子 25符
  const c = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6];
  const r = api.evaluateWin(ctxOf(c, { winTile: 6 }));
  ok(r && r.fu === 25, '七对子25符，实际: ' + (r && r.fu));
}
{
  // 小三元：白发两刻 + 中雀头
  const c = [31, 31, 31, 32, 32, 32, 0, 1, 2, 3, 4, 5, 33, 33];
  const r = api.evaluateWin(ctxOf(c, { winTile: 33 }));
  ok(r && r.yaku.some(y => y.name === '小三元'), '小三元判定');
  ok(r && r.yaku.some(y => y.name === '中刻') === false, '小三元雀头的中不作刻');
}
{
  // 三色同刻：2m2p2s 三刻 + 456m + 东对
  const c = [1, 1, 1, 10, 10, 10, 19, 19, 19, 3, 4, 5, 30, 30];
  const r = api.evaluateWin(ctxOf(c, { winTile: 1 }));
  ok(r && r.yaku.some(y => y.name === '三色同刻'), '三色同刻判定');
}
{
  // 三连刻：2m3m4m 三刻 + 789m + 东对
  const c = [1, 1, 1, 2, 2, 2, 3, 3, 3, 6, 7, 8, 30, 30];
  const r = api.evaluateWin(ctxOf(c, { winTile: 1 }));
  ok(r && r.yaku.some(y => y.name === '三连刻'), '三连刻判定');
}
{
  // 双立直：2番（不叠加普通立直）
  const c = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 12];
  const r = api.evaluateWin(ctxOf(c, { winTile: 9, riichi: true, doubleRiichi: true }));
  ok(r && r.yaku.some(y => y.name === '双立直' && y.han === 2), '双立直 2番判定');
  ok(r && !r.yaku.some(y => y.name === '立直'), '双立直不叠加普通立直');
}
{
  // 普通立直仍 1番
  const c = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 12];
  const r = api.evaluateWin(ctxOf(c, { winTile: 9, riichi: true }));
  ok(r && r.yaku.some(y => y.name === '立直' && y.han === 1), '普通立直 1番判定');
}

/* ---------- AI 全自动对局冒烟测试 ---------- */
{
  const g = api.Game;
  g.prototype._schedule = function (fn) { fn(); };
  let rounds = 0;
  const orig = g.prototype.continueRound;
  g.prototype.continueRound = function () {
    if (++rounds > 30) throw new Error('对局轮数异常');
    return orig.call(this);
  };
  let gamesDone = 0, wins = 0, draws = 0, riichis = 0;
  for (let i = 0; i < 6; i++) {
    const game = new g({ mode: 'east', allAI: true, speed: 0 });
    game.onUpdate = () => {};
    rounds = 0;
    try {
      game.start();
    } catch (e) {
      ok(false, 'AI对局异常: ' + e.message);
      continue;
    }
    ok(game.phase === 'gameover', 'AI对局正常结束（第' + (i + 1) + '场）');
    const sum = game.players.reduce((s, p) => s + p.score, 0);
    ok(sum === 100000, '总点数守恒 100000，实际: ' + sum);
    wins += game.lastResult && game.lastResult.type !== 'draw' ? 1 : 0;
    draws += game.lastResult && game.lastResult.type === 'draw' ? 1 : 0;
    gamesDone++;
  }
  // 统计多场对局中的立直次数
  let totalRiichi = 0;
  const origLogFn = g.prototype._log;
  g.prototype._log = function (msg) {
    if (msg.indexOf('立直') >= 0) totalRiichi++;
    return origLogFn.call(this, msg);
  };
  for (let i = 0; i < 5; i++) {
    const probe = new g({ mode: 'east', allAI: true, speed: 0 });
    probe.onUpdate = () => {};
    rounds = 0;
    probe.start();
  }
  g.prototype._log = origLogFn;
  ok(totalRiichi > 0, 'AI会使用立直（立直次数: ' + totalRiichi + '）');
  ok(wins > 0, '有对局以和牌结束（和牌场数: ' + wins + '）');

  // 各难度全自动对局完整性与点数守恒
  for (const diff of ['easy', 'hard']) {
    let bad = 0, done = 0;
    for (let i = 0; i < 6; i++) {
      const game = new g({ mode: 'east', allAI: true, speed: 0, difficulty: diff });
      game.onUpdate = () => {};
      rounds = 0;
      game.start();
      const sum = game.players.reduce((s, p) => s + p.score, 0);
      if (sum !== 100000) bad++;
      if (game.phase === 'gameover') done++;
    }
    ok(done === 6 && bad === 0, diff + '难度对局完整且点数守恒（不守恒: ' + bad + '）');
  }
}

/* ---------- AI 难度行为 ---------- */
{
  const g = new api.Game({ mode: 'east', allAI: true, speed: 0, difficulty: 'easy' });
  g.players = [0, 1, 2, 3].map((_, i) => ({
    name: 'AI' + i, isHuman: false,
    concealed: [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 13, 13, 14],
    melds: [], discards: [], tsumogiri: [],
    riichi: false, riichiTile: null, ippatsu: false, riichiTurnCount: -1,
    lastDrawn: null, score: 25000, seatWind: i, delta: 0,
  }));
  g.wall = []; g.dead = []; g.doraInds = [0]; g.lastTile = false; g.houtei = false;
  g.rinshan = false; g.turnCount = 5; g.drawnTile = 14; g.roundNo = 0;
  ok(api.AI.chooseRiichi(g, 0) === null, '简单AI听牌也不立直');
  ok(api.AI.wantPon(g, 0, 9) === false, '简单AI不碰');
  const d = api.AI.chooseDiscard(g, 0);
  ok(d >= 0 && d < 34 && g.players[0].concealed.indexOf(d) >= 0, '简单AI打牌合法');
  g.cfg.difficulty = 'hard';
  const r = api.AI.chooseRiichi(g, 0);
  ok(r !== null, '困难AI听牌即立直');
}

/* ---------- 专家 AI ---------- */
{
  const g = new api.Game({ mode: 'east', allAI: true, speed: 0, difficulty: 'expert' });
  g.players = [0, 1, 2, 3].map((_, i) => ({
    name: 'AI' + i, isHuman: false,
    concealed: [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 13, 13, 14],
    melds: [], discards: [], tsumogiri: [],
    riichi: false, riichiTile: null, ippatsu: false, riichiTurnCount: -1,
    lastDrawn: null, score: 25000, seatWind: i, delta: 0,
  }));
  g.wall = [5, 6, 7, 8]; g.dead = [0, 1, 2, 3, 4]; g.doraInds = [0]; g.lastTile = false; g.houtei = false;
  g.rinshan = false; g.turnCount = 5; g.drawnTile = 14; g.roundNo = 0;
  const d = api.ExpertAI.chooseDiscard(g, 0);
  ok(d >= 0 && d < 34 && g.players[0].concealed.indexOf(d) >= 0, '专家AI打牌合法（' + d + '）');
}

console.log('pass: ' + pass + ', fail: ' + fail);
process.exit(fail ? 1 : 0);
