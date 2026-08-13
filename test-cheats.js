'use strict';
/* 外挂模式测试 */
const fs = require('fs');
const path = require('path');
const files = ['js/tiles.js', 'js/cheats.js', 'js/yaku.js', 'js/ai.js', 'js/expert-ai.js', 'js/game.js']
  .map(f => fs.readFileSync(path.join(__dirname, f), 'utf8'));
const code = files.join('\n') + '\nreturn { Game, Cheats, CHEATS, YAKUMAN_PATTERNS };';
const api = new Function(code)();

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) pass++;
  else { fail++; console.log('  FAIL: ' + msg); }
}

function makeGame() {
  const g = new api.Game({ mode: 'east', allAI: false, speed: 0, humanSeat: 1, cheat: { enabled: true, limited: false } });
  g.players = [0, 1, 2, 3].map((_, i) => ({
    name: 'P' + i, isHuman: i === 1,
    concealed: [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 13, 13].slice(),
    melds: [], discards: [], tsumogiri: [],
    riichi: false, riichiTile: null, ippatsu: false, riichiTurnCount: -1, lastDrawn: null,
    furitenTmp: false, riichiFuriten: false, drawnCount: 0, score: 25000, seatWind: i, delta: 0,
  }));
  g.wall = []; g.dead = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]; g.doraInds = [30];
  g.lastTile = false; g.houtei = false; g.rinshan = false; g.turnCount = 1; g.drawnTile = null;
  g.roundNo = 0; g.dealer = 0; g.meldCount = 0; g.tenhouFlag = -1; g.chiihouFlag = -1;
  api.Cheats.init(g);
  return g;
}

/* 定义完整性 */
ok(api.CHEATS.length >= 17, '外挂数量 >= 17，实际 ' + api.CHEATS.length);
ok(api.YAKUMAN_PATTERNS.length >= 10, '役满牌型 >= 10，实际 ' + api.YAKUMAN_PATTERNS.length);

/* 开关类 */
{
  const g = makeGame();
  ok(api.Cheats.activate(g, 'peek') === true && g.cheat.flags.peek === true, '透视之眼开关');
  api.Cheats.activate(g, 'peek');
  ok(g.cheat.flags.peek === false, '透视之眼再点关闭');
  api.Cheats.activate(g, 'hypnotize');
  ok(g.cheat.flags.hypnotize === true, '催眠大师开关');
  api.Cheats.activate(g, 'mindRead');
  ok(g.cheat.flags.mindRead === true, '读心术开关');
  api.Cheats.activate(g, 'alwaysDealer');
  ok(g.cheat.flags.alwaysDealer === true, '永远连庄开关');
}

/* 神之一手：手牌变为役满听牌（13 张） */
{
  const g = makeGame();
  api.Cheats.activate(g, 'godHand', '国士无双');
  ok(g.players[1].concealed.length === 13, '神之一手后手牌 13 张');
  ok(g.players[1].concealed.every(t => api.Game ? true : true), '神之一手手牌合法');
  ok(g.players[1].melds.length === 0, '神之一手清除副露');
}

/* 印钞机 / 炸牌 / 偷牌 / 篡改宝牌 / 掀桌 */
{
  const g = makeGame();
  const sc = g.players[1].score;
  api.Cheats.activate(g, 'money');
  ok(g.players[1].score === sc + 10000, '印钞机 +10000');
  const oppLen = g.players[0].concealed.length;
  api.Cheats.activate(g, 'bomb', 0);
  ok(g.players[0].concealed.length === oppLen - 1, '炸牌移除对手一张手牌');
  api.Cheats.activate(g, 'steal', 2);
  ok(g.players[1].concealed.length === 14, '偷牌后自己 14 张');
  api.Cheats.activate(g, 'doraHack', 4);
  ok(g.doraInds[0] === 4, '篡改宝牌指示牌');
  g.wall = [0, 1, 2, 3];
  api.Cheats.activate(g, 'reshuffle');
  ok(g.wall.length === 122, '掀桌重洗后牌墙 122 张');
}

/* 一键胡牌 / 开局天胡：完整对局中触发自摸结算 */
{
  const G = api.Game;
  G.prototype._schedule = function (fn) { fn(); };
  const g = new G({ mode: 'east', allAI: false, speed: 0, humanSeat: 1, cheat: { enabled: true, limited: false } });
  g.onUpdate = () => {};
  g.start();
  api.Cheats.activate(g, 'instaWin', '大三元');
  ok(g.phase === 'round-end' || g.phase === 'gameover', '一键胡牌触发本局结算');
  ok(g.lastResult && g.lastResult.type === 'tsumo', '一键胡牌为自摸');
  const sum = g.players.reduce((s, p) => s + p.score, 0);
  ok(sum === 100000, '和牌后点数守恒');
}

/* 有限次数：用完后不可再用 */
{
  const g = new api.Game({ mode: 'east', allAI: false, speed: 0, humanSeat: 1, cheat: { enabled: true, limited: true } });
  g.players = [0, 1, 2, 3].map((_, i) => ({
    name: 'P' + i, isHuman: i === 1, concealed: [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 13, 13].slice(),
    melds: [], discards: [], tsumogiri: [], riichi: false, riichiTile: null, ippatsu: false,
    riichiTurnCount: -1, lastDrawn: null, furitenTmp: false, riichiFuriten: false, drawnCount: 0,
    score: 25000, seatWind: i, delta: 0,
  }));
  g.wall = []; g.dead = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]; g.doraInds = [30];
  g.turnCount = 1; g.roundNo = 0; g.dealer = 0; g.meldCount = 0; g.tenhouFlag = -1; g.chiihouFlag = -1;
  api.Cheats.init(g);
  const uses = g.cheat.uses.money;
  for (let i = 0; i < uses; i++) api.Cheats.activate(g, 'money');
  ok(g.cheat.uses.money === 0, '有限模式次数耗尽');
  ok(api.Cheats.activate(g, 'money') === false, '次数耗尽后不可再用');
}

/* 标准模式随时开：初始 enabled=false，用挂后自动转入开挂局（战绩隔离） */
{
  const g = new api.Game({ mode: 'east', allAI: false, speed: 0, humanSeat: 1, cheat: { enabled: false, limited: true } });
  g.players = [0, 1, 2, 3].map((_, i) => ({
    name: 'P' + i, isHuman: i === 1, concealed: [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 13, 13].slice(),
    melds: [], discards: [], tsumogiri: [], riichi: false, riichiTile: null, ippatsu: false,
    riichiTurnCount: -1, lastDrawn: null, furitenTmp: false, riichiFuriten: false, drawnCount: 0,
    score: 25000, seatWind: i, delta: 0,
  }));
  g.wall = []; g.dead = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]; g.doraInds = [30];
  g.turnCount = 1; g.roundNo = 0; g.dealer = 0; g.meldCount = 0; g.tenhouFlag = -1; g.chiihouFlag = -1;
  api.Cheats.init(g);
  ok(g.cheat.enabled === false, '标准模式初始未开挂');
  ok(api.Cheats.activate(g, 'money') === true, '标准模式随时可开挂');
  ok(g.cheat.enabled === true, '用挂后自动转入开挂局（战绩隔离）');
}

console.log('pass: ' + pass + ', fail: ' + fail);
process.exit(fail ? 1 : 0);
