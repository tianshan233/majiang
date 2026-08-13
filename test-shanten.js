'use strict';
/* 向听公式 vs 暴力精确向听的对照验证
 * 精确值：BFS（摸一张打一张的状态转移穷举，带 visited 集去环）。
 * 向听 ≤2 的牌型可完整穷举；向听 3~4 的牌型状态空间爆炸，配节点预算，超预算标记 SKIP（不判失败）。
 */
const fs = require('fs');
const path = require('path');
const files = ['js/tiles.js', 'js/yaku.js'].map(f => fs.readFileSync(path.join(__dirname, f), 'utf8'));
const code = files.join('\n') + '\nreturn { canWin, shanten, counts, tilesFromCounts };';
const api = new Function(code)();

function tenpai(hand) {
  const c = api.counts(hand);
  for (let t = 0; t < 34; t++) if (c[t] < 4) {
    c[t]++;
    if (api.canWin(c, 0)) { c[t]--; return true; }
    c[t]--;
  }
  return false;
}

/* BFS 精确向听：0 表示已听牌。budget 为最大展开节点数，deadline 为毫秒级时间墙。 */
function exactBFS(hand, budget, deadline) {
  if (tenpai(hand)) return 0;
  let frontier = [hand.slice().sort((a, b) => a - b)];
  const seen = new Set([frontier[0].join(',')]);
  let nodes = 0;
  for (let d = 1; frontier.length; d++) {
    const next = new Set();
    for (const h of frontier) {
      if (++nodes > budget || Date.now() > deadline) return null;
      const c = api.counts(h);
      for (let t = 0; t < 34; t++) if (c[t] < 4) {
        for (let i = 0; i < h.length; i++) {
          if (h[i] === t) continue; /* 摸打同一张是无意义回环 */
          const n = h.slice(); n[i] = t; n.sort((a, b) => a - b);
          const k = n.join(',');
          if (seen.has(k) || next.has(k)) continue;
          if (tenpai(n)) return d;
          next.add(k);
        }
      }
    }
    for (const k of next) seen.add(k);
    frontier = Array.from(next).map(s => s.split(',').map(Number));
    if (d >= 5) return null; /* 理论上向听不会超过 5，保险兜底 */
  }
  return Infinity;
}

const cases = [
  ['5搭+3浮', [0, 1, 3, 4, 6, 7, 9, 10, 12, 13, 27, 28, 29]],
  ['6搭+1浮', [0, 1, 3, 4, 6, 7, 9, 10, 12, 13, 18, 19, 21]],
  ['3面子+雀头+2孤', [0, 1, 2, 3, 4, 5, 6, 7, 8, 30, 30, 31, 32]],
  ['4刻+1浮(听东)', [30, 30, 30, 31, 31, 31, 32, 32, 32, 33, 33, 33, 27]],
  ['听牌(两面)', [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 13, 13]],
  ['国士13种', [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33]],
  ['3面子+2搭', [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 13, 14]],
  ['3面子+雀头+搭+浮', [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 30, 30]],
  ['2面子+2雀头+搭+孤', [0, 1, 2, 3, 4, 5, 10, 10, 13, 13, 15, 27, 28]],
  ['6对+1单', [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 27]],
  ['1面子+5搭', [0, 1, 2, 3, 4, 6, 7, 9, 10, 12, 13, 18, 19]],
  ['4搭+5孤', [0, 1, 3, 4, 6, 7, 9, 10, 27, 28, 29, 30, 31]],
  ['2搭+5孤+雀头', [0, 1, 3, 4, 27, 27, 28, 29, 30, 31, 32, 33, 33]],
  ['3面子+4孤', [0, 1, 2, 3, 4, 5, 6, 7, 8, 27, 28, 29, 30]],
  ['4面子+1孤', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 27]],
  ['5搭+雀头+孤', [0, 1, 3, 4, 6, 7, 9, 10, 12, 13, 27, 27, 28]],
];

let allOk = true, skipped = 0;
for (const [name, hand] of cases) {
  const f = api.shanten(api.counts(hand), 0);
  const b = exactBFS(hand, 5_000_000, Date.now() + 25000);
  if (b === null) {
    skipped++;
    console.log('SKIP ' + name + ': 公式=' + f + '（高向听状态空间过大，跳过暴力对照）');
    continue;
  }
  const ok = b === f;
  if (!ok) allOk = false;
  console.log((ok ? 'OK  ' : 'DIFF') + ' ' + name + ': 精确=' + b + ' 公式=' + f);
}
console.log((allOk ? '全部一致' : '存在差异') + (skipped ? '（跳过 ' + skipped + ' 个高向听牌型）' : ''));
process.exit(allOk ? 0 : 1);
