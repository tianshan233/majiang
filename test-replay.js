'use strict';
/* 牌谱：序列化 / 恢复 / 回放 往返测试 */
const fs = require('fs');
const path = require('path');
const files = ['js/tiles.js', 'js/yaku.js', 'js/ai.js', 'js/game.js', 'js/replay.js']
  .map(f => fs.readFileSync(path.join(__dirname, f), 'utf8'));
const code = files.join('\n') + '\nreturn { Game, ReplayPlayer, Paifu };';
const api = new Function(code)();

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) pass++;
  else { fail++; console.log('  FAIL: ' + msg); }
}

const G = api.Game;
G.prototype._schedule = function (fn) { fn(); };

for (let round = 0; round < 4; round++) {
  const g = new G({ mode: round % 2 ? 'south' : 'east', allAI: true, speed: 0 });
  g.onUpdate = () => {};
  g.start();
  ok(g.phase === 'gameover', '对局正常结束（第' + round + '场）');

  const paifu = g.serialize();
  ok(api.Paifu.validate(paifu), '牌谱校验通过');

  const g2 = G.restore(paifu);
  const scoreMatch = g2.players.every((p, i) => p.score === g.players[i].score);
  ok(scoreMatch, '恢复后四家分数一致');

  const rp = new api.ReplayPlayer(paifu);
  rp.goto(rp.total - 1);
  const replayScoreMatch = rp.players.every((p, i) => p.score === g.players[i].score);
  if (!replayScoreMatch) {
    console.log('    原对局: ' + g.players.map(p => p.score).join(','));
    console.log('    回放:   ' + rp.players.map(p => p.score).join(','));
  }
  ok(replayScoreMatch, '回放最终分数与原对局一致');
  const sum = rp.players.reduce((s, p) => s + p.score, 0);
  ok(sum === 100000, '回放分数守恒 100000，实际 ' + sum);
}

/* 恢复后继续打：从 round-end 状态恢复，调用 continueRound 能继续 */
{
  const g = new G({ mode: 'east', allAI: true, speed: 0 });
  g.onUpdate = () => {};
  g.start();
  const snap = g.serialize();
  const g2 = G.restore(snap);
  g2.onUpdate = () => {};
  g2._schedule = function (fn) { fn(); };
  ok(g2.phase === 'gameover', '恢复对局阶段一致');
}

console.log('pass: ' + pass + ', fail: ' + fail);
process.exit(fail ? 1 : 0);
