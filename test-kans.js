'use strict';
/* 杠相关规则测试：明杠 / 抢杠 / 国士抢暗杠 / 三杠子 / 四杠子 / 四杠流局 */
const fs = require('fs');
const path = require('path');

const files = ['js/tiles.js', 'js/yaku.js', 'js/ai.js', 'js/expert-ai.js', 'js/game.js']
  .map(f => fs.readFileSync(path.join(__dirname, f), 'utf8'));
const code = files.join('\n') + '\nreturn { evaluateWin, counts, tileName, Game, AI };';
const api = new Function(code)();

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; }
  else { fail++; console.log('  FAIL: ' + msg); }
}

function ctxOf(concealed, extra) {
  return Object.assign({
    concealed, calls: [], winTile: concealed[concealed.length - 1], tsumo: false,
    seatWind: 0, roundWind: 0, riichi: false, ippatsu: false, rinshan: false,
    chankan: false, haitei: false, houtei: false, doraInds: [], uraInds: [],
  }, extra || {});
}

function mkPlayers() {
  return [0, 1, 2, 3].map((_, i) => ({
    name: 'P' + i, isHuman: false,
    concealed: [], melds: [], discards: [], tsumogiri: [],
    riichi: false, riichiTile: null, ippatsu: false, riichiTurnCount: -1,
    lastDrawn: null, score: 25000, seatWind: i, delta: 0,
    riichiFuriten: false, furitenTmp: false, drawnCount: 0,
  }));
}

/* ---------- 役种：抢杠 / 三杠子 / 四杠子 ---------- */
{
  // 抢杠役：平和 + 抢杠
  const c = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 12];
  const r = api.evaluateWin(ctxOf(c, { winTile: 9, chankan: true }));
  ok(r && r.yaku.some(y => y.name === '抢杠'), '抢杠役判定');
  ok(r && r.yaku.some(y => y.name === '平和'), '抢杠可叠加平和');
}
{
  // 三杠子：3 杠 + 顺子 + 雀头
  const calls = [
    { type: 'kan', tiles: [0, 0, 0, 0], open: false, from: -1 },
    { type: 'kan', tiles: [9, 9, 9, 9], open: true, from: 0 },
    { type: 'kan', tiles: [18, 18, 18, 18], open: false, from: -1 },
  ];
  const concealed = [1, 2, 3, 12, 12];
  const r = api.evaluateWin(ctxOf(concealed, { calls, winTile: 2 }));
  ok(r && r.yaku.some(y => y.name === '三杠子'), '三杠子(2番)判定');
}
{
  // 四杠子：4 杠 + 雀头 = 役满
  const calls = [
    { type: 'kan', tiles: [0, 0, 0, 0], open: false, from: -1 },
    { type: 'kan', tiles: [9, 9, 9, 9], open: true, from: 0 },
    { type: 'kan', tiles: [18, 18, 18, 18], open: false, from: -1 },
    { type: 'kan', tiles: [27, 27, 27, 27], open: true, from: 1 },
  ];
  const concealed = [12, 12];
  const r = api.evaluateWin(ctxOf(concealed, { calls, winTile: 12 }));
  ok(r && r.yaku.some(y => y.name === '四杠子' && y.yakuman), '四杠子役满判定');
}

/* ---------- 明杠 ---------- */
{
  const g = new api.Game({ mode: 'east', allAI: true, speed: 0 });
  g.players = mkPlayers();
  const p1 = g.players[1];
  p1.concealed = [9, 9, 9, 0, 1, 2, 12, 12];
  g.dead = [30, 31, 32, 33, 27];
  g.doraInds = [30];
  g._schedule = () => {};
  g.onUpdate = () => {};
  const before = p1.concealed.length;
  g._minkan(1, 9, 0);
  ok(p1.melds.some(m => m.type === 'kan' && m.open === true), '明杠成立 open=true');
  ok(p1.concealed.length === before - 3 + 1, '明杠后手牌 -3 并摸 1 张岭上（实际: ' + p1.concealed.length + '）');
  ok(g.doraInds.length === 2, '明杠后翻开新宝牌指示');
  ok(g.players.reduce((s, p) => s + p.score, 0) === 100000, '明杠不破坏点数守恒');
}

/* ---------- 明杠候选收集 + 人类明杠 ---------- */
{
  const g = new api.Game({ mode: 'east', allAI: false, speed: 0, humanSeat: 1 });
  g.players = mkPlayers();
  g.players[1].isHuman = true;
  g.humanSeat = 1;
  g.players[1].concealed = [9, 9, 9, 0, 1, 2];
  g.players[0].concealed = [5, 5];
  g.doraInds = [30]; g.dead = [30, 31, 32, 33, 27];
  g._schedule = () => {};
  g.onUpdate = () => {};
  g._resolveClaims(0, 9);
  ok(g.pending && g.pending.claims.kans.indexOf(1) >= 0, '明杠候选收集');
  ok(g.pending && g.pending.claims.pons.indexOf(1) >= 0, '碰候选收集');
  g.humanClaim('kan');
  ok(g.players[1].melds.some(m => m.type === 'kan' && m.open), '人类明杠执行');
}

/* ---------- 抢杠（加杠被荣和） ---------- */
{
  const g = new api.Game({ mode: 'east', allAI: true, speed: 0 });
  g.players = mkPlayers();
  g.players[0].melds = [{ type: 'pon', tiles: [9, 9, 9], open: true, from: 1 }];
  g.players[0].concealed = [9, 0, 1, 2, 12, 12];
  // seat1 听 1p：123m456m789m 99p 北北
  g.players[1].concealed = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 9, 30, 30];
  g.doraInds = [30]; g.dead = [30, 31, 32, 33, 27];
  g._schedule = () => {};
  g.onUpdate = () => {};
  g._doKan(0, { type: 'chakan', tile: 9 });
  ok(g.pending && g.pending.chankan === true, '加杠触发抢杠判定');
  ok(g.pending && g.pending.claims.rons.indexOf(1) >= 0, '抢杠候选 seat1');
  ok(g.players[0].melds.some(m => m.type === 'pon'), '抢杠未成立时加杠不执行（仍是碰）');
}

/* ---------- 国士无双抢暗杠 ---------- */
{
  const g = new api.Game({ mode: 'east', allAI: true, speed: 0 });
  g.players = mkPlayers();
  g.players[0].concealed = [0, 0, 0, 0, 12, 12, 1, 2, 3];
  // seat1 国士 13 种缺 1m(0)，听 1m
  g.players[1].concealed = [8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33, 8];
  g.doraInds = [30]; g.dead = [30, 31, 32, 33, 27];
  g._schedule = () => {};
  g.onUpdate = () => {};
  g._doKan(0, { type: 'ankan', tile: 0 });
  ok(g.pending && g.pending.chankan === true, '国士无双抢暗杠判定');
  ok(g.pending && g.pending.claims.rons.indexOf(1) >= 0, '国士抢暗杠候选 seat1');
}

/* ---------- 四杠流局 ---------- */
{
  const g = new api.Game({ mode: 'east', allAI: true, speed: 0 });
  g.players = mkPlayers();
  g.players[0].melds = [
    { type: 'kan', tiles: [0, 0, 0, 0], open: false, from: -1 },
    { type: 'kan', tiles: [9, 9, 9, 9], open: true, from: 0 },
  ];
  g.players[1].melds = [{ type: 'kan', tiles: [18, 18, 18, 18], open: false, from: -1 }];
  g.players[1].concealed = [27, 27, 27, 1, 2, 3];
  g.doraInds = [30]; g.dead = [30, 31, 32, 33, 27];
  g._schedule = () => {};
  g.onUpdate = () => {};
  let ryuukyokuReason = null;
  g._ryuukyoku = (reason) => { ryuukyokuReason = reason; };
  g._minkan(1, 27, 0);
  ok(ryuukyokuReason === '四杠散了', '四杠流局（四杠散了）');
}

console.log('pass: ' + pass + ', fail: ' + fail);
process.exit(fail ? 1 : 0);
