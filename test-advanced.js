'use strict';
/* 高级规则测试：赤宝牌 / 役满（含双倍役满）/ 振听 */
const fs = require('fs');
const path = require('path');
const files = ['js/tiles.js', 'js/yaku.js', 'js/ai.js', 'js/game.js']
  .map(f => fs.readFileSync(path.join(__dirname, f), 'utf8'));
const code = files.join('\n') + '\nreturn { evaluateWin, canWin, shanten, counts, tileName, doraOf, buildWall, family, isRed, countRed, basicPoints, limitName, Game, tilesFromCounts };';
const api = new Function(code)();

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) pass++;
  else { fail++; console.log('  FAIL: ' + msg); }
}

function ctxOf(concealed, winTile, extra) {
  return Object.assign({
    concealed, calls: [], winTile, tsumo: false,
    seatWind: 0, roundWind: 0, riichi: false, ippatsu: false, rinshan: false,
    haitei: false, houtei: false, doraInds: [], uraInds: [],
  }, extra || {});
}
function hasYaku(r, name) { return !!(r && r.yaku.some(y => y.name === name)); }

/* ---------- 赤宝牌 ---------- */
{
  const wall = api.buildWall();
  ok(wall.length === 136, '牌墙 136 张');
  const reds = wall.filter(t => api.isRed(t));
  ok(reds.length === 3, '牌墙含 3 枚赤五，实际 ' + reds.length);
  ok(reds.filter(t => t === 34).length === 1 && reds.filter(t => t === 35).length === 1 && reds.filter(t => t === 36).length === 1, '赤五万/筒/索 各一枚');
  ok(api.counts(wall)[4] === 4 && api.counts(wall)[13] === 4 && api.counts(wall)[22] === 4, '五万/筒/索 仍各 4 张（含赤五）');
}
{
  // 123m456m789m123p + 赤五筒5p 对子，荣 5p：仅赤五计 1 宝牌
  const c = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 35];
  const r = api.evaluateWin(ctxOf(c, 13));
  ok(r && r.doraHan === 1, '赤五筒计 1 宝牌，实际 doraHan=' + (r && r.doraHan));
}
{
  // 同上 + 指示 4筒(12)->5筒：普通5筒×1 + 赤五筒(宝+赤) = 3 宝牌
  const c = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 35];
  const r = api.evaluateWin(ctxOf(c, 13, { doraInds: [12] }));
  ok(r && r.doraHan === 3, '赤五筒叠加指示宝牌 = 3 宝牌，实际 ' + (r && r.doraHan));
}

/* ---------- 役满 ---------- */
{
  const c = [31, 31, 31, 32, 32, 32, 33, 33, 33, 0, 1, 2, 17, 17];
  const r = api.evaluateWin(ctxOf(c, 17));
  ok(hasYaku(r, '大三元') && r.han === 13, '大三元 役满');
}
{
  // 大四喜：东家刻子副露，避免触发四暗刻
  const r = api.evaluateWin(ctxOf([28, 28, 28, 29, 29, 29, 30, 30, 30, 17, 17], 17,
    { calls: [{ type: 'pon', tiles: [27, 27, 27], open: true, from: 0 }] }));
  ok(hasYaku(r, '大四喜') && r.han === 26, '大四喜 双倍役满，实际 ' + (r && r.han));
}
{
  const r = api.evaluateWin(ctxOf([28, 28, 28, 29, 29, 29, 30, 30, 0, 0, 0], 30,
    { calls: [{ type: 'pon', tiles: [27, 27, 27], open: true, from: 0 }] }));
  ok(hasYaku(r, '小四喜') && r.han === 13, '小四喜 役满，实际 ' + (r && r.han));
}
{
  const r = api.evaluateWin(ctxOf([28, 28, 28, 29, 29, 29, 31, 31, 31, 33, 33], 33,
    { calls: [{ type: 'pon', tiles: [27, 27, 27], open: true, from: 0 }] }));
  ok(hasYaku(r, '字一色') && r.han === 13, '字一色 役满，实际 ' + (r && r.han));
}
{
  const c = [19, 20, 21, 19, 19, 19, 23, 23, 23, 25, 25, 25, 32, 32];
  const r = api.evaluateWin(ctxOf(c, 32));
  ok(hasYaku(r, '绿一色') && r.han === 13, '绿一色 役满');
}
{
  const r = api.evaluateWin(ctxOf([8, 8, 8, 9, 9, 9, 17, 17, 17, 18, 18], 18,
    { calls: [{ type: 'pon', tiles: [0, 0, 0], open: true, from: 0 }] }));
  ok(hasYaku(r, '清老头') && r.han === 13, '清老头 役满，实际 ' + (r && r.han));
}
{
  const c = [0, 0, 0, 1, 2, 3, 4, 4, 5, 6, 7, 8, 8, 8];
  const r = api.evaluateWin(ctxOf(c, 4));
  ok(hasYaku(r, '纯正九莲宝灯') && r.han === 26, '纯正九莲宝灯 双倍役满，实际 ' + (r && r.yaku.map(y => y.name).join(',')));
}
{
  const c = [0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 8, 8];
  const r = api.evaluateWin(ctxOf(c, 8));
  ok(hasYaku(r, '九莲宝灯') && r.han === 13, '九莲宝灯(非纯正) 役满，实际 ' + (r && r.yaku.map(y => y.name).join(',')));
}
{
  const c = [0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 13, 13];
  const r = api.evaluateWin(ctxOf(c, 13));
  ok(hasYaku(r, '四暗刻单骑') && r.han === 26, '四暗刻单骑 双倍役满');
}
{
  const c = [0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 13, 13];
  const r = api.evaluateWin(ctxOf(c, 3));
  ok(hasYaku(r, '四暗刻') && r.han === 13, '四暗刻 役满');
}
{
  const c = [0, 0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
  const r = api.evaluateWin(ctxOf(c, 33));
  ok(hasYaku(r, '国士无双') && r.han === 13, '国士无双 役满');
}
{
  const c = [0, 0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
  const r = api.evaluateWin(ctxOf(c, 0));
  ok(hasYaku(r, '国士无双十三面') && r.han === 26, '国士无双十三面 双倍役满');
}
{
  // 役满叠加：大四喜(双倍) + 四暗刻单骑(双倍) = 四倍
  const c = [27, 27, 27, 28, 28, 28, 29, 29, 29, 30, 30, 30, 17, 17];
  const r = api.evaluateWin(ctxOf(c, 17));
  ok(hasYaku(r, '大四喜') && hasYaku(r, '四暗刻单骑') && r.han === 52, '大四喜+四暗刻单骑 四倍役满，实际 ' + (r && r.han));
}
{
  ok(api.basicPoints(26, 0) === 16000, '双倍役满 basic=16000');
  ok(api.limitName(26, 0, 0) === '双倍役满', 'limitName 双倍役满');
}

/* ---------- 振听 ---------- */
function makeGame(hand, discards) {
  const g = new api.Game({ mode: 'east', allAI: false, speed: 0, humanSeat: 1 });
  g.players = [0, 1, 2, 3].map((_, i) => ({
    name: 'P' + i, isHuman: i === 1,
    concealed: hand.slice(), melds: [], discards: discards.slice(), tsumogiri: [],
    riichi: false, riichiTile: null, ippatsu: false, riichiTurnCount: -1,
    lastDrawn: null, furitenTmp: false, riichiFuriten: false, drawnCount: 0,
    score: 25000, seatWind: i, delta: 0,
  }));
  g.wall = [5, 6, 7]; g.dead = []; g.doraInds = [0]; g.lastTile = false; g.houtei = false;
  g.rinshan = false; g.turnCount = 5; g.drawnTile = null; g.roundNo = 0; g.dealer = 0;
  g.meldCount = 0; g.tenhouFlag = -1; g.chiihouFlag = -1;
  return g;
}
{
  // 123m456m789m23p55p 听 1p/4p。打出 1p → 舍牌振听，任何荣和都被禁
  const hand = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 13, 13];
  const g = makeGame(hand, [9]);
  ok(g.canWinNow(1, false, 9) === true, '可构成 1p 和牌');
  ok(g.canRon(1, 9) === false, '牌河有 1p → 不能荣和 1p');
  ok(g.canRon(1, 12) === false, '舍牌振听禁止一切荣和（含 4p）');
}
{
  // 牌河无听牌张 → 可荣和
  const hand = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 13, 13];
  const g = makeGame(hand, [27]);
  ok(g.canRon(1, 9) === true, '牌河无关牌 → 可荣和 1p');
  ok(g.canRon(1, 12) === true, '可荣和 4p');
}
{
  // 临时振听：过和后摸牌清除
  const hand = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 13, 13];
  const g = makeGame(hand, []);
  g.players[1].furitenTmp = true;
  ok(g.canRon(1, 9) === false, '临时振听不能荣和');
  g._startTurn(1);
  ok(g.players[1].furitenTmp === false, '摸牌后临时振听清除');
}
{
  // 立直后振听：永久
  const hand = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 13, 13];
  const g = makeGame(hand, []);
  g.players[1].riichi = true;
  g.players[1].riichiFuriten = true;
  ok(g.canRon(1, 9) === false, '立直后振听不能荣和');
  g.players[1].riichiFuriten = false;
  ok(g.canRon(1, 9) === true, '无振听状态可荣和');
}

/* ---------- 流局罚符 ---------- */
{
  const tenpaiHand = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 13, 13]; // 听 1p/4p
  const notenHand = [0, 1, 3, 4, 6, 7, 9, 10, 12, 13, 27, 28, 29]; // 4 向听
  const mk = () => new api.Game({ mode: 'east', allAI: false, speed: 0, humanSeat: 1 });
  // 2 听 + 2 不听：各不听付 1500，各听牌得 1500
  {
    const g = mk();
    g.dealer = 0;
    g.players = [0, 1, 2, 3].map((_, i) => ({
      name: 'P' + i, isHuman: i === 1, concealed: [], melds: [], discards: [], tsumogiri: [],
      riichi: false, riichiTile: null, ippatsu: false, riichiTurnCount: -1, lastDrawn: null,
      furitenTmp: false, riichiFuriten: false, drawnCount: 0, score: 25000, seatWind: i, delta: 0,
    }));
    g.players[2].concealed = tenpaiHand.slice();
    g.players[3].concealed = tenpaiHand.slice();
    g.players[0].concealed = notenHand.slice();
    g.players[1].concealed = notenHand.slice();
    g._ryuukyoku();
    const s = g.players.map(p => p.score);
    ok(s[0] === 23500 && s[1] === 23500 && s[2] === 26500 && s[3] === 26500,
      '流局罚符 2听2不听各1500，实际 ' + s.join(','));
  }
  // 1 听 + 3 不听：不听各付 1000，听牌得 3000
  {
    const g = mk();
    g.dealer = 0;
    g.players = [0, 1, 2, 3].map((_, i) => ({
      name: 'P' + i, isHuman: i === 1, concealed: [], melds: [], discards: [], tsumogiri: [],
      riichi: false, riichiTile: null, ippatsu: false, riichiTurnCount: -1, lastDrawn: null,
      furitenTmp: false, riichiFuriten: false, drawnCount: 0, score: 25000, seatWind: i, delta: 0,
    }));
    g.players[2].concealed = tenpaiHand.slice();
    g.players[0].concealed = notenHand.slice();
    g.players[1].concealed = notenHand.slice();
    g.players[3].concealed = notenHand.slice();
    g._ryuukyoku();
    const s = g.players.map(p => p.score);
    ok(s[2] === 28000 && s[0] === 24000 && s[1] === 24000 && s[3] === 24000,
      '流局罚符 1听3不听（听牌得3000），实际 ' + s.join(','));
  }
}

console.log('pass: ' + pass + ', fail: ' + fail);
process.exit(fail ? 1 : 0);
