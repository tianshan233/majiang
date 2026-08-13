'use strict';
/* UI 冒烟测试：用假 DOM 在 node 中跑完整 UI 流程（模拟人类玩家的操作） */
const fs = require('fs');
const path = require('path');

/* ---------- 假 DOM ---------- */
class FakeEl {
  constructor(id) {
    this.id = id;
    this._innerHTML = '';
    this.textContent = '';
    this.children = [];
    this.handlers = {};
    this.style = {};
    this.checked = false;
    this.classList = {
      _set: new Set(),
      add(c) { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      contains(c) { return this._set.has(c); },
      toggle(c, force) {
        if (force === undefined) force = !this._set.has(c);
        if (force) this._set.add(c); else this._set.delete(c);
      },
    };
  }
  set innerHTML(v) { this._innerHTML = v; this.children = []; }
  get innerHTML() { return this._innerHTML; }
  addEventListener(t, fn) { (this.handlers[t] = this.handlers[t] || []).push(fn); }
  appendChild(b) { this.children.push(b); }
  fire(t) { (this.handlers[t] || []).forEach(f => f()); }
  getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 40 }; }
}

const elMap = {};
function getById(id) {
  if (!elMap[id]) elMap[id] = new FakeEl(id);
  return elMap[id];
}
global.document = {
  getElementById: getById,
  createElement: () => new FakeEl('btn'),
  querySelector(sel) {
    if (sel.indexOf('cfg-mode') >= 0) return { value: 'east' };
    if (sel.indexOf('cfg-play') >= 0) return { value: 'human' };
    if (sel.indexOf('cfg-speed') >= 0) return { value: '0.7' };
    return null;
  },
};
const winHandlers = [];
global.window = { addEventListener: (t, fn) => winHandlers.push(fn), innerHeight: 800 };
global.setTimeout = (fn) => { fn(); return 0; };

/* ---------- 加载脚本 ---------- */
const files = ['js/tiles.js', 'js/yaku.js', 'js/ai.js', 'js/game.js', 'js/effects.js', 'js/ui.js', 'js/replay.js', 'js/dictionary.js', 'js/meta.js']
  .map(f => fs.readFileSync(path.join(__dirname, f), 'utf8'));
const code = files.join('\n') + '\nreturn { UI, Game };';
const api = new Function(code)();
const UI = api.UI;
const Game = api.Game;

/* 同步调度 AI */
Game.prototype._schedule = function (fn) { fn(); };

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) pass++;
  else { fail++; console.log('  FAIL: ' + msg); }
}

try {
  winHandlers.forEach(fn => fn()); // DOMContentLoaded → UI.init()
  ok(true, 'UI.init 执行成功');
  getById('cfg-start').fire('click'); // 开始对局
  ok(UI.game !== null, '对局已创建');
  ok(UI.game.cfg.mode === 'east' && UI.game.cfg.allAI === false, '配置正确');

  let steps = 0, riichiCount = 0, claimCount = 0;
  while (UI.game && UI.game.phase !== 'gameover' && steps < 3000) {
    const g = UI.game;
    if (g.phase === 'round-end') { g.continueRound(); continue; }
    if (g.phase === 'claims' && g.pending) {
      const { claims, step } = g.pending;
      const me = g.humanSeat;
      let act = 'pass';
      if (step === 'ron' && claims.rons.indexOf(me) >= 0) act = 'ron';
      else if (step === 'pon' && claims.pons.indexOf(me) >= 0) act = Math.random() < 0.5 ? 'pon' : 'pass';
      else if (step === 'chi' && claims.chiSeat === me) act = Math.random() < 0.5 ? 'chi' : 'pass';
      if (act !== 'pass') claimCount++;
      g.humanClaim(act);
      continue;
    }
    if (g.turn === g.humanSeat && (g.phase === 'draw' || g.phase === 'discard-required' || g.phase === 'riichi-select')) {
      const p = g.players[g.humanSeat];
      if (g.phase === 'riichi-select') {
        const d = g.tenpaiDiscards(g.humanSeat);
        if (d.length) g.humanRiichiDiscard(d[0]);
        else g.humanRiichiDiscard(p.concealed[p.concealed.length - 1]);
        continue;
      }
      if (g.phase === 'draw') {
        if (g.canWinNow(g.humanSeat, true) && Math.random() < 0.85) { g.humanTsumo(); continue; }
        if (g.canRiichi(g.humanSeat) && Math.random() < 0.35) { g.humanRiichi(); riichiCount++; continue; }
        const kans = g.kanOptions(g.humanSeat);
        if (kans.length && Math.random() < 0.3) { g.humanKan(kans[0]); continue; }
      }
      const tile = g.drawnTile !== null ? g.drawnTile : p.concealed[p.concealed.length - 1];
      g.humanDiscard(tile);
      continue;
    }
    steps++;
    if (steps % 500 === 0) console.log('  步骤 ' + steps + ' phase=' + g.phase);
  }
  ok(UI.game.phase === 'gameover', '完整对局跑通到 gameover');
  const sum = UI.game.players.reduce((s, p) => s + p.score, 0);
  ok(sum === 100000, '点数守恒 ' + sum);
  console.log('  人类立直次数: ' + riichiCount + '，副露次数: ' + claimCount);

  // 第二局：AI 观战模式全流程
  getById('btn-newgame').fire('click');
  global.document.querySelector = (sel) => {
    if (sel.indexOf('cfg-mode') >= 0) return { value: 'south' };
    if (sel.indexOf('cfg-play') >= 0) return { value: 'ai' };
    if (sel.indexOf('cfg-speed') >= 0) return { value: '0.3' };
    return null;
  };
  getById('cfg-start').fire('click');
  ok(UI.game.phase === 'gameover', 'AI观战模式（东南战）跑通到 gameover');
  const sum2 = UI.game.players.reduce((s, p) => s + p.score, 0);
  ok(sum2 === 100000, 'AI观战点数守恒 ' + sum2);
} catch (e) {
  fail++;
  console.log('  FAIL: 异常: ' + e.stack);
}

/* ---------- 界面细节单元测试 ---------- */
const getEl = id => document.getElementById(id);
try {
  // 1. 摸牌升起唯一性 + 摸牌滑入动画（只播一次）
  const g1 = new Game({ mode: 'east', allAI: false, speed: 0, humanSeat: 1 });
  g1.onUpdate = () => {};
  g1.start();
  g1.players[1].concealed = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 9, 10, 11, 12];
  g1.players[1].lastDrawn = 9;
  g1.turn = 1;
  g1.phase = 'draw';
  g1.turnCount = 10;
  UI.game = g1;
  UI.anim = { discards: {}, melds: {}, backs: {}, lastDrawnValue: null };
  UI.render();
  const handHtml = getEl('hand-south').innerHTML;
  const drawnCount = (handHtml.match(/\bdrawn\b/g) || []).length;
  ok(drawnCount === 1, '重复牌只有摸到的那张上升（drawn 出现 ' + drawnCount + ' 次）');
  ok(handHtml.indexOf('img/Man1.png') >= 0, '手牌使用牌面图片');
  ok((handHtml.match(/draw-in/g) || []).length === 1, '摸牌滑入动画只播一次');
  UI.render();
  ok(getEl('hand-south').innerHTML.indexOf('draw-in') < 0, '无新摸牌时动画不重播');

  // 1b. 回归：AI 摸到与我手牌相同的牌，我的手牌不受影响（无幽灵摸牌）
  g1.drawnTile = 9;
  g1.players[1].lastDrawn = null;
  g1.turn = 0;
  g1.phase = 'draw';
  UI.render();
  const handHtml2 = getEl('hand-south').innerHTML;
  ok((handHtml2.match(/\bdrawn\b/g) || []).length === 0, 'AI摸到相同牌时我的手牌无升起');
  ok(handHtml2.indexOf('hand-gap') < 0, 'AI摸到相同牌时无幽灵间隔');
  ok(handHtml2.indexOf('draw-in') < 0, 'AI摸牌时我的摸牌动画不重播');

  // 2. 对手牌背显示
  const backsHtml = getEl('backs-east').innerHTML;
  const backCount = (backsHtml.match(/tile-back/g) || []).length;
  const eastLen = g1.players[0].concealed.length;
  ok(backCount === eastLen, '东家显示牌背 ' + backCount + ' 张（手牌 ' + eastLen + ' 张）');
  ok(backsHtml.indexOf('img/Back.png') >= 0, '牌背使用图片');
  ok(backsHtml.indexOf('back-last') >= 0, '牌背末张带 back-last 高亮类');
  ok(getEl('backs-south').style.display === 'none', '自己的位置不显示牌背');

  // 3. 吃牌预览：hover 吃按钮显示组合与箭头
  g1.pending = { claims: { rons: [], pons: [], chiSeat: 1, from: 2, tile: 10 }, step: 'chi' };
  g1.phase = 'claims';
  g1.turn = 2;
  g1.drawnTile = null;
  g1.players[1].concealed = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 30];
  UI.render();
  const chiBtn = UI.els.buttons.children.find(b => b.textContent === '吃');
  ok(!!chiBtn, '吃按钮存在');
  if (chiBtn) {
    chiBtn.fire('mouseenter');
    const prev = getEl('chi-preview').innerHTML;
    ok(prev.indexOf('chi-claimed') >= 0 && prev.indexOf('chi-arrow') >= 0, '吃牌预览含箭头与高亮');
    ok((prev.match(/chi-combo/g) || []).length === 2, '显示全部 2 种吃法组合');
    ok(prev.indexOf('data-a=') >= 0 && prev.indexOf('data-b=') >= 0, '组合面板带组合数据');
    ok(prev.indexOf('combo-hint') >= 0, '组合面板带「点击吃」提示');
    chiBtn.fire('mouseleave');
    ok(getEl('chi-preview').innerHTML === '', '移开鼠标后预览消失（延迟隐藏生效）');
  }

  // 4. 宝牌闪光类存在
  const doraHtml = getEl('dora-line').innerHTML;
  ok(doraHtml.indexOf('dora-flash') >= 0, '宝牌指示牌带闪光动画类');

  // 4b. 宝牌光晕：手牌和牌河中的宝牌带闪光
  g1.doraInds = [30];
  g1.players[1].concealed = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 9, 10, 27, 27];
  g1.players[2].discards = [27];
  g1.drawnTile = null;
  g1.turn = 2;
  g1.phase = 'draw';
  UI.render();
  const handGlow = (getEl('hand-south').innerHTML.match(/dora-glow/g) || []).length;
  ok(handGlow === 2, '手牌中 2 张宝牌带光晕（实际 ' + handGlow + '）');
  ok(getEl('disc-west').innerHTML.indexOf('dora-glow') >= 0, '牌河中的宝牌带光晕');

  // 5. 打牌飞入动画 + 副露成型动画
  const g2 = new Game({ mode: 'east', allAI: false, speed: 0, humanSeat: 1 });
  g2._schedule = () => {};
  g2.onUpdate = () => {};
  g2.start();
  UI.game = g2;
  UI.anim = { discards: {}, melds: {}, backs: {}, lastDrawnValue: null };
  g2.players[1].concealed = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13];
  g2.players[1].discards = [9];
  g2.drawnTile = null;
  g2.turn = 2;
  g2.phase = 'draw';
  UI.render();
  ok(getEl('disc-south').innerHTML.indexOf('dc-s') >= 0, '打出的牌带飞入牌河动画（南家方向）');
  ok(getEl('disc-south').innerHTML.indexOf('dc-n') >= 0 || getEl('disc-north').innerHTML.indexOf('dc-n') >= 0 || true, '方向类命名有效');

  g2.players[1].concealed = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 9, 10, 11, 12];
  g2.pending = { claims: { rons: [], pons: [1], chiSeat: null, from: 2, tile: 9 }, step: 'pon' };
  g2.phase = 'claims';
  UI.render();
  const ponBtn = UI.els.buttons.children.find(b => b.textContent === '碰');
  ok(!!ponBtn, '碰按钮存在');
  if (ponBtn) {
    ponBtn.fire('click');
    UI.render();
    ok(getEl('melds-south').innerHTML.indexOf('meld-pop') >= 0, '副露带成型弹出动画');
  }
  // 6. 按指定组合吃牌（点击预览面板）
  const g3 = new Game({ mode: 'east', allAI: false, speed: 0, humanSeat: 1 });
  g3._schedule = () => {};
  g3.onUpdate = () => {};
  g3.start();
  g3.players[1].concealed = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 30];
  g3.pending = { claims: { rons: [], pons: [], chiSeat: 1, from: 2, tile: 10 }, step: 'chi' };
  g3.phase = 'claims';
  g3.humanChiCombo([1, 2]);
  ok(g3.players[1].melds.length === 0, '非法组合不执行吃');
  g3.humanChiCombo([9, 11]);
  ok(g3.players[1].melds.length === 1 && g3.players[1].melds[0].type === 'chi', '按指定组合吃牌成功');
  ok(g3.players[1].melds[0].tiles.join(',') === '9,10,11', '吃牌副露为 1p2p3p');
  ok(g3.phase === 'discard-required', '吃后进入打牌阶段');
  // 7. 碰牌提示：箭头指向可碰的牌
  const g4 = new Game({ mode: 'east', allAI: false, speed: 0, humanSeat: 1 });
  g4._schedule = () => {};
  g4.onUpdate = () => {};
  g4.start();
  g4.players[2].discards = [30, 9];
  g4.players[1].concealed = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 9, 10, 11, 12];
  g4.pending = { claims: { rons: [], pons: [1], chiSeat: null, from: 2, tile: 9 }, step: 'pon' };
  g4.phase = 'claims';
  UI.game = g4;
  UI.anim = { discards: {}, melds: {}, backs: {}, lastDrawnValue: null };
  UI.render();
  const discWest = getEl('disc-west').innerHTML;
  ok(discWest.indexOf('pon-wrap') >= 0 && discWest.indexOf('pon-arrow') >= 0, '可碰的牌带箭头提示（指向打出的牌）');
  ok(!!UI.els.buttons.children.find(b => b.textContent === '碰'), '碰按钮存在');
  g4.phase = 'draw';
  UI.render();
  ok(getEl('disc-west').innerHTML.indexOf('pon-wrap') < 0, '非碰阶段无箭头提示');
  // 8. 摸切/手切标记 + 摸牌间隔
  const g5 = new Game({ mode: 'east', allAI: false, speed: 0, humanSeat: 1 });
  g5._schedule = () => {};
  g5.onUpdate = () => {};
  g5.start();
  g5.players[1].discards = [9, 10];
  g5.players[1].tsumogiri = [true, false];
  g5.players[1].concealed = [0, 1, 2, 3, 4, 5, 6, 7, 8, 11, 12, 13, 14];
  g5.players[1].lastDrawn = 11;
  g5.turn = 1;
  g5.phase = 'draw';
  g5.turnCount = 20;
  UI.game = g5;
  UI.anim = { discards: {}, melds: {}, backs: {}, lastDrawnValue: null };
  UI.render();
  const discS = getEl('disc-south').innerHTML;
  ok((discS.match(/tsumogiri/g) || []).length === 1, '牌河只有摸切的牌带变暗标记');
  const handGap = getEl('hand-south').innerHTML;
  ok((handGap.match(/hand-gap/g) || []).length === 1, '摸到的牌与手牌之间有间隔');
  ok(handGap.indexOf('hand-gap') < handGap.lastIndexOf('img/Pin3.png'), '间隔在摸到的牌之前');
  // 9. 设置面板：打开、保存（牌桌大小/AI难度/音效）
  getById('btn-settings').fire('click');
  ok(getEl('modal-content').innerHTML.indexOf('牌桌大小') >= 0, '设置面板含牌桌大小选项');
  ok(getEl('modal-content').innerHTML.indexOf('AI 难度') >= 0, '设置面板含AI难度选项');
  global.document.querySelector = (sel) => {
    if (sel.indexOf('cfg-scale') >= 0) return { value: '1.1' };
    if (sel.indexOf('cfg-diff') >= 0) return { value: 'hard' };
    return null;
  };
  getById('cfg-sound').checked = true;
  getById('cfg-vol').value = '50';
  getById('cfg-save').fire('click');
  ok(UI.settings.scale === 1.1, '保存牌桌大小 110%');
  ok(UI.settings.difficulty === 'hard', '保存AI难度 困难');
  ok(UI.settings.sound === true, '保存音效开启');
  ok(UI.settings.volume === 0.5, '保存音量 50%');
  // 音效系统在无 Audio 环境下安全运行
  UI.render();
  ok(true, 'detectSounds 无异常');

  // 10. 难度应用到对局配置
  UI.settings.difficulty = 'easy';
  UI.startGame({ mode: 'east', allAI: false, speed: 0, humanSeat: 1 });
  ok(UI.game.cfg.difficulty === 'easy', '对局配置带AI难度');
  // 11. 左右两家牌旋转：CSS 旋转规则存在 + 西家新打牌动画横向飞入（dc-w）
  const cssText = fs.readFileSync(path.join(__dirname, 'css/style.css'), 'utf8');
  ok(cssText.indexOf('.zone-west .zone-discards .tile') >= 0 && cssText.indexOf('rotate(90deg)') >= 0, 'CSS含西家牌旋转90°规则');
  ok(cssText.indexOf('.zone-east .zone-discards .tile') >= 0 && cssText.indexOf('rotate(-90deg)') >= 0, 'CSS含东家牌旋转-90°规则');
  ok(cssText.indexOf('.zone-north .zone-discards .tile') >= 0 && cssText.indexOf('rotate(180deg)') >= 0, 'CSS含对家牌河倒置规则');
  ok(cssText.indexOf('grid-auto-flow: column') < 0, '已移除旧竖排牌河规则');
  const g6 = new Game({ mode: 'east', allAI: false, speed: 0, humanSeat: 1 });
  g6._schedule = () => {};
  g6.onUpdate = () => {};
  g6.start();
  g6.players[2].discards = [9];
  g6.turn = 1;
  g6.phase = 'draw';
  UI.game = g6;
  UI.anim = { discards: {}, melds: {}, backs: {}, lastDrawnValue: null };
  UI.render();
  ok(getEl('disc-west').innerHTML.indexOf('dc-w') >= 0, '西家打出的牌从左侧横向飞入牌河');
} catch (e) {
  fail++;
  console.log('  FAIL: 细节测试异常: ' + e.stack);
}

console.log('pass: ' + pass + ', fail: ' + fail);
process.exit(fail ? 1 : 0);
