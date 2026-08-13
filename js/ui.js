'use strict';
/* ============ 界面（雀魂风格布局） ============ */
const WIND_LABEL = ['东', '南', '西', '北'];
const TILE_IMG = [
  'Man1', 'Man2', 'Man3', 'Man4', 'Man5', 'Man6', 'Man7', 'Man8', 'Man9',
  'Pin1', 'Pin2', 'Pin3', 'Pin4', 'Pin5', 'Pin6', 'Pin7', 'Pin8', 'Pin9',
  'Sou1', 'Sou2', 'Sou3', 'Sou4', 'Sou5', 'Sou6', 'Sou7', 'Sou8', 'Sou9',
  'Ton', 'Nan', 'Shaa', 'Pei', 'Haku', 'Hatsu', 'Chun',
  'Man5', 'Pin5', 'Sou5', /* 34-36 赤五万/筒/索 */
];
const AVATAR_STYLE = [
  'background: radial-gradient(circle at 32% 28%, #7db1ff, #2f63c0);',
  'background: radial-gradient(circle at 32% 28%, #ffd58a, #c8892b);',
  'background: radial-gradient(circle at 32% 28%, #ff9fc4, #c2437d);',
  'background: radial-gradient(circle at 32% 28%, #7ce6ad, #2c9c62);',
];

function tileEl(t, opts = {}) {
  const cls = ['tile',
    opts.small ? 'small' : '',
    opts.clickable ? 'clickable' : '',
    opts.drawn ? 'drawn' : '',
    opts.hint ? 'hint' : '',
    opts.riichi ? 'riichi-disc' : '',
    opts.win ? 'win-tile' : '',
    opts.flash ? 'dora-flash' : '',
    opts.flash2 ? 'dora-flash2' : '',
    opts.glow ? 'dora-glow' : '',
    opts.tsumo ? 'tsumogiri' : '',
    isRed(t) ? 'red-five' : '',
    opts.anim || ''].filter(Boolean).join(' ');
  return '<div class="' + cls + '"' + (opts.clickable ? ' data-id="' + t + '"' : '')
    + '><img src="img/' + TILE_IMG[t] + '.png" alt="' + tileName(t) + '"></div>';
}
function tileBackEl(pop, last, idx) {
  return '<div class="tile-back' + (pop ? ' back-pop' : '') + (last ? ' back-last' : '')
    + '" style="--i:' + (idx || 0) + '"><img src="img/Back.png" alt=""></div>';
}

const UI = {
  game: null,
  els: {},
  zones: {},
  modalKind: null,
  anim: { discards: {}, melds: {}, backs: {}, lastDrawnValue: null },
  chiTimer: null,
  chiButton: null,
  settings: { scale: 1, difficulty: 'normal', sound: true, volume: 0.7 },
  audio: {},

  init() {
    this.els = {
      windPlate: byId('wind-plate'),
      roundLine: byId('round-line'),
      honbaLine: byId('honba-line'),
      doraLine: byId('dora-line'),
      counterLine: byId('counter-line'),
      hand: byId('hand-south'),
      chiPreview: byId('chi-preview'),
      status: byId('status'),
      hint: byId('hint'),
      buttons: byId('action-buttons'),
      log: byId('log'),
      modal: byId('modal'),
      modalContent: byId('modal-content'),
      btnRules: byId('btn-rules'),
      btnNew: byId('btn-newgame'),
      btnLog: byId('btn-log'),
      btnSettings: byId('btn-settings'),
    };
    const z = pos => ({
      zone: byId('zone-' + pos),
      np: byId('np-' + pos),
      melds: byId('melds-' + pos),
      disc: byId('disc-' + pos),
      backs: byId('backs-' + pos),
      /* 打牌飞入方向：各自从手牌方向飞入牌河 */
      pos: pos === 'east' ? 'e' : pos === 'south' ? 's' : pos === 'west' ? 'w' : 'n',
    });
    this.zones = { 0: z('east'), 1: z('south'), 2: z('west'), 3: z('north') };
    this.els.btnRules.addEventListener('click', () => this.showRules());
    this.els.btnNew.addEventListener('click', () => this.showConfig());
    this.els.btnLog.addEventListener('click', () => this.showLogModal());
    this.els.btnSettings.addEventListener('click', () => this.showSettings());
    byId('btn-dict').addEventListener('click', () => this.showDictionary());
    byId('btn-meta').addEventListener('click', () => this.showMeta());
    const btnVR = byId('btn-vr');
    if (btnVR && typeof VR !== 'undefined') {
      VR.supportedAsync().then(ok => { if (ok) btnVR.style.display = ''; }).catch(() => {});
      btnVR.addEventListener('click', () => { if (VR.active) VR.exit(); else VR.enter(); });
    }
    const btnExport = byId('btn-export');
    const btnImport = byId('btn-import');
    const paifuFile = byId('paifu-file');
    if (btnExport) btnExport.addEventListener('click', () => this.exportPaifu());
    if (btnImport && paifuFile) {
      btnImport.addEventListener('click', () => paifuFile.click());
      paifuFile.addEventListener('change', e => {
        const f = e.target.files && e.target.files[0];
        if (f) this.importPaifu(f);
        e.target.value = '';
      });
    }
    Effects.init();
    this.initSounds();
    this.loadSettings();
    this.initCheat();
    const handEl = byId('hand-south');
    handEl.addEventListener('click', e => {
      const t = e.target.closest('.tile.clickable');
      if (!t) return;
      const id = +t.dataset.id;
      if (this.settings.doubleClick) {
        this.selectHandTile(t, id);
      } else {
        this.discardTile(id);
      }
    });
    handEl.addEventListener('dblclick', e => {
      if (!this.settings.doubleClick) return;
      const t = e.target.closest('.tile.clickable');
      if (!t) return;
      this.discardTile(+t.dataset.id);
    });
    this.els.chiPreview.addEventListener('mouseenter', () => clearTimeout(this.chiTimer));
    this.els.chiPreview.addEventListener('mouseleave', () => this.hideChiPreviewLater(150));
    this.els.chiPreview.addEventListener('click', e => {
      const c = e.target.closest('.chi-combo');
      if (!c) return;
      const g = this.game;
      if (!g) return;
      g.humanChiCombo([+c.dataset.a, +c.dataset.b]);
    });
    this.showConfig();
  },

  checked(name) {
    const el = document.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : null;
  },

  showModal(html, kind) {
    this.modalKind = kind || null;
    this.els.modalContent.innerHTML = html;
    this.els.modal.classList.remove('hidden');
  },
  hideModal() {
    this.modalKind = null;
    this.els.modal.classList.add('hidden');
  },

  showConfig() {
    const s = this.settings;
    const diff = s.difficulty || 'normal';
    const dchk = v => v === diff ? ' checked' : '';
    this.showModal(`
      <h2>新对局</h2>
      <div class="cfg-group">
        <div class="cfg-label">昵称（不填默认「玩家」）</div>
        <input type="text" id="cfg-name" placeholder="玩家" maxlength="10" class="cfg-input">
      </div>
      <div class="cfg-group">
        <div class="cfg-label">AI 难度</div>
        <label><input type="radio" name="cfg-diff" value="easy"${dchk('easy')}> 简单（新手）</label>
        <label><input type="radio" name="cfg-diff" value="normal"${dchk('normal')}> 普通</label>
        <label><input type="radio" name="cfg-diff" value="hard"${dchk('hard')}> 困难</label>
        <label><input type="radio" name="cfg-diff" value="expert"${dchk('expert')}> 专家（蒙特卡洛，思考较久）</label>
      </div>
      <div class="cfg-group">
        <div class="cfg-label">局数</div>
        <label><input type="radio" name="cfg-mode" value="east" checked> 东风战（东1~东4局）</label>
        <label><input type="radio" name="cfg-mode" value="south"> 东南战（东1~东4 + 南1~南4局）</label>
      </div>
      <div class="cfg-group">
        <div class="cfg-label">模式</div>
        <label><input type="radio" name="cfg-play" value="human" checked> 人机对战（你坐南家，对 3 位 AI）</label>
        <label><input type="radio" name="cfg-play" value="ai"> AI 观战（4 位 AI 自动对战，可看多轮）</label>
      </div>
      <div class="cfg-group">
        <div class="cfg-label">行动速度</div>
        <label><input type="radio" name="cfg-speed" value="0.3"> 快（0.3 秒）</label>
        <label><input type="radio" name="cfg-speed" value="0.7" checked> 正常（0.7 秒）</label>
        <label><input type="radio" name="cfg-speed" value="1.2"> 慢（1.2 秒）</label>
      </div>
      <div class="cfg-group">
        <div class="cfg-label">🃏 外挂模式（整活，不计入正常战绩）</div>
        <select id="cfg-cheat" class="cfg-input">
          <option value="" selected disabled>请选择（默认关闭）</option>
          <option value="off">关闭外挂模式</option>
          <option value="limited">开启 · 有限次数 + 冷却</option>
          <option value="unlimited">开启 · 无限随便用</option>
        </select>
      </div>
      <div class="modal-btns">
        <button class="btn-primary" id="cfg-start">开始对局</button>
      </div>`, 'config');
    byId('cfg-name').value = this.settings.playerName || '';
    byId('cfg-start').addEventListener('click', () => {
      const mode = this.checked('cfg-mode');
      const play = this.checked('cfg-play');
      const speed = parseFloat(this.checked('cfg-speed'));
      const difficulty = this.checked('cfg-diff') || 'normal';
      const playerName = (byId('cfg-name').value || '').trim() || '玩家';
      const cheatVal = byId('cfg-cheat').value;
      const cheatEnabled = cheatVal === 'limited' || cheatVal === 'unlimited';
      const cheatLimited = cheatVal === 'limited';
      this.settings.playerName = playerName;
      this.settings.difficulty = difficulty;
      this.saveSettings();
      this.hideModal();
      this.startGame({ mode, allAI: play === 'ai', speed: speed * 1000, humanSeat: play === 'ai' ? -1 : 1, difficulty, playerName, cheat: { enabled: cheatEnabled, limited: cheatLimited } });
    });
  },

  showRules() {
    this.showModal(`
      <h2>规则速览</h2>
      <div class="rule-list">
        <b>基本</b>：四人立直麻将，136 张牌（无赤宝牌）。和牌 = 4 副面子 + 1 对将（七对子 / 国士无双除外）。<br>
        <b>立直</b>：门清听牌时宣言，付 1000 点立直棒，之后只能摸切，和牌后翻开里宝牌，并获得场上的立直棒。<br>
        <b>本场数</b>：庄家连庄或流局庄家听牌时本场 +1，荣和每人加 300×本场，自摸每人加 100×本场。<br>
        <b>流局</b>：无人和牌时，不听的玩家向听牌的玩家支付点数（闲家 3000 / 庄家 4000），无人听牌则不支付。<br>
        <b>役种（简表）</b>：立直1 一发1 门前清自摸1 平和1 断幺九1 一杯口1 役牌刻1/个 三色同顺2 一气通贯2(门清)/1 混全带幺九2/1 对对和2 三暗刻2 混老头2 七对子2 二杯口3 纯全带幺九3/2 混一色3/2 清一色6/5 四暗刻·国士无双=役满。<br>
        <b>满贯表</b>：5番满贯 / 6-7番跳满 / 8-10番倍满 / 11-12番三倍满 / 13番以上役满。<br>
        <b>终局</b>：打完所有局，或任意玩家达到 30000 点以上时结束，点数最高者胜。
      </div>
      <div class="modal-btns"><button class="btn-primary" id="rules-close">知道了</button></div>`, 'rules');
    byId('rules-close').addEventListener('click', () => this.hideModal());
  },

  startGame(cfg) {
    if (this.game) this.game.stop();
    cfg.difficulty = cfg.difficulty || this.settings.difficulty || 'normal';
    this.game = new Game(cfg);
    this.game.onUpdate = () => this.render();
    this.anim = { discards: {}, melds: {}, backs: {}, lastDrawnValue: null };
    this.game.start();
  },

  /* ---------- 设置 ---------- */
  loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem('mahjong-settings') || '{}');
      this.settings = Object.assign({ scale: 1, difficulty: 'normal', sound: true, volume: 0.7, playerName: '', doubleClick: false }, s);
    } catch (e) {
      this.settings = { scale: 1, difficulty: 'normal', sound: true, volume: 0.7, playerName: '', doubleClick: false };
    }
    this.applyScale();
  },
  saveSettings() {
    try { localStorage.setItem('mahjong-settings', JSON.stringify(this.settings)); } catch (e) { /* 忽略 */ }
  },
  applyScale() {
    if (document.body) document.body.style.zoom = String(this.settings.scale);
  },

  showSettings() {
    const s = this.settings;
    const scales = [
      ['0.8', '80%（小）'], ['0.9', '90%'], ['1', '100%（默认）'], ['1.1', '110%'], ['1.2', '120%（大）'],
    ];
    const diffs = [
      ['easy', '简单（AI 不太会打，适合新手）'],
      ['normal', '普通'],
      ['hard', '困难（AI 更强、更会防守）'],
      ['expert', '专家（蒙特卡洛搜索，思考更久）'],
    ];
    this.showModal(`
      <h2>设置</h2>
      <div class="cfg-group">
        <div class="cfg-label">牌桌大小（立即生效）</div>
        ${scales.map(x => '<label><input type="radio" name="cfg-scale" value="' + x[0] + '"'
          + (String(s.scale) === x[0] ? ' checked' : '') + '> ' + x[1] + '</label>').join('')}
      </div>
      <div class="cfg-group">
        <div class="cfg-label">AI 难度（下一局生效）</div>
        ${diffs.map(x => '<label><input type="radio" name="cfg-diff" value="' + x[0] + '"'
          + (s.difficulty === x[0] ? ' checked' : '') + '> ' + x[1] + '</label>').join('')}
      </div>
      <div class="cfg-group">
        <div class="cfg-label">音效</div>
        <label><input type="checkbox" id="cfg-sound"${s.sound ? ' checked' : ''}> 开启音效</label>
        <div class="vol-row">
          <span class="vol-label">音量</span>
          <input type="range" id="cfg-vol" min="0" max="100" value="${Math.round(s.volume * 100)}">
        </div>
      </div>
      <div class="cfg-group">
        <div class="cfg-label">操作</div>
        <label><input type="checkbox" id="cfg-dblclick"${s.doubleClick ? ' checked' : ''}> 双击打牌 / 摸切（单击选中，双击打出）</label>
      </div>
      <div class="modal-btns">
        <button class="btn-primary" id="cfg-save">保存</button>
        <button class="btn-call" id="cfg-try">试听音效</button>
        <button class="btn-pass" id="cfg-cancel">取消</button>
      </div>`, 'settings');
    const applyScalePreview = () => {
      const v = parseFloat(this.checked('cfg-scale') || '1');
      if (document.body) document.body.style.zoom = String(v);
    };
    const scaleInputs = document.querySelectorAll ? document.querySelectorAll('input[name="cfg-scale"]') : [];
    for (const el of scaleInputs) el.addEventListener('change', applyScalePreview);
    byId('cfg-try').addEventListener('click', () => {
      const vol = parseFloat(byId('cfg-vol').value || '70') / 100;
      const saved = this.settings;
      this.settings = Object.assign({}, this.settings, { sound: true, volume: vol });
      this.playSound('discard');
      this.playSound('win');
      this.settings = saved;
    });
    byId('cfg-save').addEventListener('click', () => {
      this.settings.scale = parseFloat(this.checked('cfg-scale') || '1');
      this.settings.difficulty = this.checked('cfg-diff') || 'normal';
      this.settings.sound = !!byId('cfg-sound').checked;
      this.settings.volume = parseFloat(byId('cfg-vol').value || '70') / 100;
      this.settings.doubleClick = !!byId('cfg-dblclick').checked;
      this.saveSettings();
      this.applyScale();
      this.hideModal();
    });
    byId('cfg-cancel').addEventListener('click', () => {
      this.applyScale();
      this.hideModal();
    });
  },

  /* ---------- 音效 ---------- */
  initSounds() {
    if (typeof Audio === 'undefined') { this.audio = {}; return; }
    const map = {
      draw: 'sound/click2.wav',
      discard: 'sound/click4.wav',
      call: 'sound/switch10.wav',
      riichi: 'sound/switch30.wav',
      win: 'sound/high_up.ogg',
      rounddraw: 'sound/low_down.ogg',
    };
    this.audio = {};
    for (const k in map) {
      try {
        const a = new Audio(map[k]);
        a.preload = 'auto';
        this.audio[k] = a;
      } catch (e) { /* 忽略 */ }
    }
  },
  playSound(name) {
    if (!this.settings.sound) return;
    const a = this.audio && this.audio[name];
    if (!a) return;
    try {
      a.volume = Math.max(0, Math.min(1, this.settings.volume));
      a.currentTime = 0;
      a.play().catch(() => {});
    } catch (e) { /* 忽略 */ }
  },
  /* 检测状态变化播放音效（在 render 开头调用，对比上一帧快照） */
  detectSounds(g) {
    if (!this.audio || !this.settings.sound) return;
    const a = this.anim;
    a.sndD = a.sndD || {}; a.sndM = a.sndM || {};
    a.sndB = a.sndB || {}; a.sndR = a.sndR || {};
    let playedDiscard = false;
    for (let s = 0; s < 4; s++) {
      const p = g.players[s];
      const dDelta = p.discards.length - (a.sndD[s] || 0);
      if (dDelta === 1 && !playedDiscard) { this.playSound('discard'); playedDiscard = true; }
      a.sndD[s] = p.discards.length;
      if (p.melds.length - (a.sndM[s] || 0) === 1) this.playSound('call');
      a.sndM[s] = p.melds.length;
      if (!p.isHuman && p.concealed.length - (a.sndB[s] || 0) === 1) this.playSound('draw');
      a.sndB[s] = p.concealed.length;
      if (p.riichi && !a.sndR[s]) this.playSound('riichi');
      a.sndR[s] = p.riichi;
    }
    const me = g.players[1];
    if (!g.cfg.allAI && me.lastDrawn !== null && me.lastDrawn !== a.sndDrawn) this.playSound('draw');
    a.sndDrawn = me.lastDrawn;
    if ((g.phase === 'round-end' || g.phase === 'gameover') && a.sndPhase !== g.phase) {
      const r = g.lastResult;
      if (r && (r.type === 'ron' || r.type === 'tsumo')) this.playSound('win');
      else if (r && r.type === 'draw') this.playSound('rounddraw');
    }
    a.sndPhase = g.phase;
  },

  /* ---------- 渲染 ---------- */
  render() {
    const g = this.game;
    if (!g) return;
    this.detectSounds(g);
    this.els.windPlate.textContent = WIND_LABEL[g.roundWindOf()];
    this.els.roundLine.textContent = g.roundName();
    this.els.honbaLine.textContent = g.honba + '本场';
    let doraHtml = '<span class="dora-label">宝牌指示</span>';
    for (let i = 0; i < g.doraInds.length; i++) {
      const ind = g.doraInds[i];
      doraHtml += '<span class="dora-pair">' + tileEl(ind, { small: true, flash: true })
        + '<span class="arrow">→</span>' + tileEl(doraOf(ind), { small: true, flash2: true }) + '</span>';
    }
    this.els.doraLine.innerHTML = doraHtml;
    clearTimeout(this.chiTimer);
    this.chiButton = null;
    this.els.chiPreview.innerHTML = '';
    this.doraTiles = g.doraInds.map(doraOf);
    this.els.counterLine.textContent = '残牌 ' + g.wall.length
      + (g.riichiSticks ? '　立直棒 ×' + g.riichiSticks : '');
    for (let s = 0; s < 4; s++) this.renderZone(s);
    this.renderHand();
    this.renderStatus();
    this.renderButtons();
    this.renderLog();
    this.renderModal();
    this.updateCheatBall();
    if (typeof VR !== 'undefined' && VR.active) VR.sync(g);
  },

  renderZone(seat) {
    const g = this.game, p = g.players[seat];
    const z = this.zones[seat];
    const isTurn = g.turn === seat
      && (g.phase === 'draw' || g.phase === 'discard-required' || g.phase === 'riichi-select');
    z.zone.classList.toggle('turn', isTurn);
    let npHtml = '<span class="avatar" style="' + AVATAR_STYLE[seat] + '">' + p.name.charAt(0) + '</span>'
      + '<span class="np-name">' + p.name + '</span>'
      + '<span class="np-wind">' + WIND_LABEL[p.seatWind] + '</span>'
      + (seat === g.dealer ? '<span class="badge dealer-badge">庄</span>' : '')
      + (p.riichi ? '<span class="badge riichi-badge">立直</span>' : '')
      + '<span class="np-score">' + p.score + '</span>'
      + (p.delta ? '<span class="np-delta ' + (p.delta > 0 ? 'pos' : 'neg') + '">'
        + (p.delta > 0 ? '+' : '') + p.delta + '</span>' : '');
    if (g.cheat.flags && g.cheat.flags.mindRead && !p.isHuman) {
      const ws = waitsFor(tilesFromCounts(counts(p.concealed)), p.melds.length);
      if (ws.length) npHtml += '<span class="mindread-chip">听 ' + ws.map(tileName).join('') + '</span>';
    }
    z.np.innerHTML = npHtml;

    let meldsHtml = '';
    const prevM = this.anim.melds[seat] || 0;
    const isNewMeld = p.melds.length > prevM;
    for (let i = 0; i < p.melds.length; i++) {
      const m = p.melds[i];
      const label = m.type === 'kan' ? (m.open ? '杠' : '暗杠') : m.type === 'pon' ? '碰' : '吃';
      meldsHtml += '<div class="meld' + (isNewMeld && i === p.melds.length - 1 ? ' meld-pop' : '') + '">'
        + '<span class="meld-label">' + label + '</span>'
        + m.tiles.map(t => tileEl(t, { small: true })).join('') + '</div>';
    }
    z.melds.innerHTML = meldsHtml;
    this.anim.melds[seat] = p.melds.length;

    let discHtml = '';
    const prevD = this.anim.discards[seat] || 0;
    const isNewDiscard = p.discards.length > prevD;
    const doraTiles = this.doraTiles || [];
    const pend = g.pending;
    const ponTip = g.phase === 'claims' && pend && pend.step === 'pon'
      && g.humanSeat >= 0 && !g.cfg.allAI
      && pend.claims.pons.indexOf(g.humanSeat) >= 0
      && pend.claims.from === seat
      && p.discards.length > 0
      && p.discards[p.discards.length - 1] === pend.claims.tile;
    if (p.riichi) discHtml += '<div class="riichi-stick"></div>';
    for (let i = 0; i < p.discards.length; i++) {
      const t = p.discards[i];
      const tEl = tileEl(t, {
        small: true,
        riichi: p.riichi && t === p.riichiTile,
        anim: isNewDiscard && i === p.discards.length - 1 ? 'dc-' + z.pos : '',
        glow: isRed(t) || doraTiles.indexOf(family(t)) >= 0,
        tsumo: p.tsumogiri && p.tsumogiri[i],
      });
      discHtml += (ponTip && i === p.discards.length - 1)
        ? '<span class="pon-wrap">' + tEl + '<span class="pon-arrow">▼</span></span>'
        : tEl;
    }
    z.disc.innerHTML = discHtml;
    this.anim.discards[seat] = p.discards.length;

    if (!p.isHuman) {
      const prevB = this.anim.backs[seat] || 0;
      const isNewBack = p.concealed.length > prevB;
      let backsHtml = '';
      if (g.cheat.flags && g.cheat.flags.peek) {
        /* 透视：对手手牌翻面显示 */
        backsHtml = '<div class="peek-hand">'
          + sortTiles(p.concealed).map(t => tileEl(t, { small: true, glow: isRed(t) || doraTiles.indexOf(family(t)) >= 0 })).join('')
          + '</div>';
      } else {
        for (let i = 0; i < p.concealed.length; i++) {
          backsHtml += tileBackEl(isNewBack && i === p.concealed.length - 1, i === p.concealed.length - 1, i);
        }
      }
      z.backs.innerHTML = backsHtml;
      z.backs.style.display = '';
      this.anim.backs[seat] = p.concealed.length;
    } else {
      z.backs.innerHTML = '';
      z.backs.style.display = 'none';
    }
  },

  renderHand() {
    const g = this.game;
    const seat = 1;
    const p = g.players[seat];
    if (g.cfg.allAI) { this.els.hand.style.display = 'none'; return; }
    this.els.hand.style.display = '';
    const myDrawn = p.lastDrawn;
    const sorted = sortTiles(p.concealed);
    let tiles = sorted.slice();
    let drawnIndex = -1;
    if (myDrawn !== null) {
      const di = sorted.indexOf(myDrawn);
      if (di >= 0) { tiles.splice(di, 1); tiles.push(myDrawn); drawnIndex = tiles.length - 1; }
    }
    let allowed = null;
    if (g.turn === seat) {
      if (g.phase === 'draw') allowed = p.riichi ? [g.drawnTile] : 'all';
      else if (g.phase === 'discard-required') allowed = 'all';
      else if (g.phase === 'riichi-select') allowed = g.tenpaiDiscards(seat);
    }
    const isNewDraw = myDrawn !== null && myDrawn !== this.anim.lastDrawnValue;
    const doraTiles = this.doraTiles || [];
    this.els.hand.innerHTML = tiles.map((t, i) => {
      const gap = i === drawnIndex ? '<span class="hand-gap"></span>' : '';
      return gap + tileEl(t, {
        clickable: allowed !== null && (allowed === 'all' || allowed.indexOf(family(t)) >= 0),
        drawn: i === drawnIndex && myDrawn !== null,
        hint: g.phase === 'riichi-select' && allowed !== null && allowed.indexOf(family(t)) >= 0,
        anim: i === drawnIndex && isNewDraw ? 'draw-in' : '',
        glow: isRed(t) || doraTiles.indexOf(family(t)) >= 0,
      });
    }).join('');
    if (myDrawn !== null) this.anim.lastDrawnValue = myDrawn;
  },

  renderStatus() {
    const g = this.game;
    let s = '';
    const human = g.humanSeat >= 0 && !g.cfg.allAI;
    if (g.phase === 'gameover') s = '本场比赛结束，点击「新对局」再来一局';
    else if (g.phase === 'round-end') s = '本局结算';
    else if (g.phase === 'claims') s = '请选择：';
    else if (g.phase === 'riichi-select') s = '立直宣言：请点击要打出的听牌牌（绿色高亮）';
    else if (g.turn >= 0 && (g.phase === 'draw' || g.phase === 'discard-required')) {
      if (g.turn === g.humanSeat && human) {
        s = g.phase === 'discard-required' ? '请打出一张牌' : '轮到你摸牌';
      } else {
        s = g.players[g.turn].name + ' 行动中…';
      }
    }
    this.els.status.textContent = s;
    this.els.hint.textContent = '';
    if (g.phase === 'draw' && g.turn === g.humanSeat && human) {
      const h = g.humanHint();
      if (h) {
        if (h.shanten === 0) {
          this.els.hint.textContent = '听牌！' + (h.waits ? '听 ' + h.waits.map(tileName).join('、') + '（' + h.waits.length + '张）' : '');
        } else {
          this.els.hint.textContent = '向听数 ' + h.shanten;
        }
      }
    }
  },

  renderButtons() {
    const g = this.game;
    const wrap = this.els.buttons;
    wrap.innerHTML = '';
    const add = (label, cls, fn) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.className = cls;
      b.addEventListener('click', fn);
      wrap.appendChild(b);
    };
    if (!g || g.phase === 'gameover' || g.phase === 'round-end') return;
    const human = g.humanSeat >= 0 && !g.cfg.allAI;
    if (human && g.phase === 'claims' && g.pending) {
      const { claims, step } = g.pending;
      const me = g.humanSeat;
      if (step === 'ron' && claims.rons.indexOf(me) >= 0) add('胡', 'btn-win', () => g.humanClaim('ron'));
      else if (step === 'pon' && (claims.pons.indexOf(me) >= 0 || (claims.kans || []).indexOf(me) >= 0)) {
        if ((claims.kans || []).indexOf(me) >= 0) {
          const b = document.createElement('button');
          b.textContent = '杠';
          b.className = 'btn-call';
          b.addEventListener('click', () => g.humanClaim('kan'));
          wrap.appendChild(b);
        }
        if (claims.pons.indexOf(me) >= 0) {
          const b = document.createElement('button');
          b.textContent = '碰';
          b.className = 'btn-call';
          b.addEventListener('click', () => g.humanClaim('pon'));
          b.addEventListener('mouseenter', () => {
            const w = document.querySelector('.pon-wrap');
            if (w) w.classList.add('active');
          });
          b.addEventListener('mouseleave', () => {
            const w = document.querySelector('.pon-wrap');
            if (w) w.classList.remove('active');
          });
          wrap.appendChild(b);
        }
      }
      else if (step === 'chi' && claims.chiSeat === me) {
        const b = document.createElement('button');
        b.textContent = '吃';
        b.className = 'btn-call';
        b.addEventListener('click', () => this.showChiPreview(claims.tile, b));
        b.addEventListener('mouseenter', () => this.showChiPreview(claims.tile, b));
        b.addEventListener('mouseleave', () => this.hideChiPreviewLater(300));
        wrap.appendChild(b);
      }
      if (wrap.children.length) add('过', 'btn-pass', () => g.humanClaim('pass'));
    }
    if (human && g.turn === g.humanSeat && (g.phase === 'draw')) {
      const o = this.humanOptions();
      if (o) {
        if (o.canTsumo) add('和', 'btn-win', () => g.humanTsumo());
        if (o.canRiichi) add('立直', 'btn-riichi', () => g.humanRiichi());
        for (const k of o.canKan) {
          add((k.type === 'ankan' ? '暗杠' : '加杠') + tileName(k.tile), 'btn-call', () => g.humanKan(k));
        }
      }
    }
  },

  humanOptions() {
    const g = this.game;
    const seat = g.humanSeat;
    return {
      canTsumo: g.canWinNow(seat, true),
      canRiichi: g.canRiichi(seat),
      canKan: g.kanOptions(seat),
    };
  },

  /* 吃牌预览：悬浮气泡显示各种吃法组合，箭头指向被吃的牌 */
  showChiPreview(tile, button) {
    clearTimeout(this.chiTimer);
    this.chiButton = button;
    this.els.chiPreview.innerHTML = this.chiPreviewHTML(tile);
    this.positionChiPreview();
  },
  positionChiPreview() {
    const b = this.chiButton;
    const el = this.els.chiPreview;
    if (!b || !b.getBoundingClientRect || !window.innerHeight) return;
    const r = b.getBoundingClientRect();
    el.style.left = (r.left + r.width / 2) + 'px';
    el.style.bottom = (window.innerHeight - r.top + 14) + 'px';
    el.style.top = 'auto';
    el.style.right = 'auto';
  },
  hideChiPreviewLater(ms) {
    clearTimeout(this.chiTimer);
    this.chiTimer = setTimeout(() => { this.els.chiPreview.innerHTML = ''; }, ms);
  },
  chiPreviewHTML(tile) {
    const g = this.game;
    const combos = g._chiCombos(g.humanSeat, tile);
    if (!combos.length) return '';
    let html = '';
    for (const cb of combos) {
      const seq = [cb[0], cb[1], tile].sort(tileCompare);
      html += '<div class="chi-combo" data-a="' + cb[0] + '" data-b="' + cb[1] + '">'
        + seq.map(t => t === tile
          ? '<span class="chi-claimed">' + tileEl(t) + '<span class="chi-arrow">▼</span></span>'
          : tileEl(t)).join('')
        + '<span class="combo-hint">点击吃</span></div>';
    }
    return html;
  },

  /* ---------- 对局日志导出 ---------- */
  buildLogText(g) {
    const lines = [];
    lines.push('==== 立直麻将对局日志 ====');
    lines.push('导出时间：' + new Date().toString());
    lines.push('配置：' + (g.cfg.mode === 'east' ? '东风战' : '东南战')
      + (g.cfg.allAI ? ' / AI观战' : ' / 人机对战') + ' / 行动间隔' + g.cfg.speed + 'ms');
    lines.push('阶段：' + g.phase + ' / 当前局：' + g.roundName() + ' ' + g.honba + '本场'
      + ' / 残牌：' + g.wall.length + ' / 立直棒：' + g.riichiSticks);
    lines.push('分数：' + g.players.map((p, i) => 'seat' + i + '(' + p.name + ')=' + p.score).join(' '));
    lines.push('');
    lines.push.apply(lines, g.debugLog);
    return lines.join('\n');
  },

  showLogModal() {
    const g = this.game;
    if (!g) { this.showConfig(); return; }
    const text = this.buildLogText(g);
    this.showModal(`
      <h2>对局日志</h2>
      <div class="log-box"><textarea id="log-text" readonly></textarea></div>
      <div class="modal-btns">
        <button class="btn-primary" id="log-copy">一键复制</button>
        <button class="btn-call" id="log-save">下载 .txt</button>
        <button class="btn-pass" id="log-close">关闭</button>
      </div>`, 'log');
    const ta = byId('log-text');
    ta.value = text;
    const copyBtn = byId('log-copy');
    copyBtn.addEventListener('click', () => {
      if (this.copyLogText(text)) {
        copyBtn.textContent = '已复制 ✓';
        setTimeout(() => { copyBtn.textContent = '一键复制'; }, 1500);
      } else {
        ta.focus();
        ta.select();
        copyBtn.textContent = '请手动 Ctrl+C';
      }
    });
    byId('log-save').addEventListener('click', () => {
      try {
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'mahjong-log-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.txt';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      } catch (e) { /* 环境不支持下载时忽略 */ }
    });
    byId('log-close').addEventListener('click', () => this.hideModal());
  },

  copyLogText(text) {
    let ok = false;
    try {
      if (document.body && document.createElement) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        if (document.execCommand) ok = document.execCommand('copy');
        document.body.removeChild(ta);
      }
    } catch (e) { ok = false; }
    if (!ok && navigator.clipboard && navigator.clipboard.writeText) {
      try { navigator.clipboard.writeText(text); ok = true; } catch (e) { ok = false; }
    }
    return ok;
  },

  renderLog() {
    this.els.log.innerHTML = this.game.log.map(m => '<div class="log-line">' + m + '</div>').join('');
  },

  limitClass(limit) {
    if (!limit) return '';
    if (limit.indexOf('役满') >= 0) return 'limit-yakuman';
    return { '满贯': 'limit-mangan', '跳满': 'limit-jumpman', '倍满': 'limit-baiman', '三倍满': 'limit-sanbaiman' }[limit] || '';
  },

  renderModal() {
    const g = this.game;
    if (g.phase !== 'round-end' && g.phase !== 'gameover') {
      if (this.modalKind === 'result') this.hideModal();
      this.anim.fxPlayed = false;
      return;
    }
    const r = g.lastResult;
    if (!r) { this.hideModal(); return; }
    this.els.modalContent.className = '';
    let html = '';
    if (r.gameover) {
      if (!this.anim.metaRecorded) {
        this.anim.metaRecorded = true;
        Meta.recordGame(g);
      }
      html = '<h2>比赛结束</h2>';
      const rank = [0, 1, 2, 3].sort((a, b) => g.players[b].score - g.players[a].score);
      html += '<table class="pay-table"><tr><th>名次</th><th>玩家</th><th>最终点数</th></tr>';
      rank.forEach((s, i) => {
        html += '<tr><td>' + (i + 1) + '</td><td>' + g.players[s].name
          + '</td><td>' + g.players[s].score + '</td></tr>';
      });
      html += '</table>';
      html += '<div class="modal-btns"><button class="btn-primary" id="m-again">再来一局</button></div>';
      this.showModal(html, 'result');
      byId('m-again').addEventListener('click', () => { this.hideModal(); this.showConfig(); });
      return;
    }
    if (r.type === 'ron' || r.type === 'tsumo') {
      this.els.modalContent.className = this.limitClass(r.infos[0] && r.infos[0].limit);
      html = '<h2 class="win-flash">' + (r.type === 'tsumo' ? '自摸！' : '荣和！') + '</h2>';
      html += r.winners.map((w, i) => {
        const info = r.infos[i];
        const p = g.players[w];
        const han = info.han + info.doraHan + info.uraHan;
        let h = '<div class="win-block"><div class="win-title">' + p.name
          + (info.limit ? '（' + info.limit + '）' : '') + '</div>';
        let chipIdx = 0;
        const chip = (name, hanStr, cls, delay) =>
          '<span class="yaku-chip ' + (cls || '') + '" style="animation-delay:' + (delay * 0.3).toFixed(1) + 's">'
          + name + ' ×' + hanStr + '</span>';
        h += '<div class="win-yaku">'
          + info.yaku.map(y => {
            const isYakuman = !!y.yakuman;
            return chip(y.name, y.han, isYakuman ? 'yakuman-chip' : '', chipIdx++);
          }).join('')
          + (info.doraHan ? chip('宝牌', info.doraHan, 'dora', chipIdx++) : '')
          + (info.uraHan ? chip('里宝牌', info.uraHan, 'dora', chipIdx++) : '')
          + '</div>';
        h += '<div class="win-fu">' + info.fu + ' 符 ' + info.han + ' 番（不计宝牌） · 合计 ' + han + ' 番</div>';
        const tiles = sortTiles(p.concealed.concat(r.type === 'ron' ? [r.tile] : []));
        h += '<div class="win-hand">' + tiles.map(t =>
          tileEl(t, { small: true, win: r.type === 'ron' && t === r.tile })).join('') + '</div>';
        if (p.riichi) {
          const uraInds = g.dead.slice(5, 5 + g.doraInds.length);
          h += '<div class="ura-reveal"><span class="ura-label">里宝牌</span>'
            + uraInds.map((ind, ui) =>
              '<span style="animation-delay:' + (ui * 0.25).toFixed(1) + 's">'
              + tileEl(ind, { small: true, flash2: true }) + '<span class="arrow">→</span>'
              + tileEl(doraOf(ind), { small: true, flash: true }) + '</span>').join('')
            + '</div>';
        }
        return h + '</div>';
      }).join('');
    } else {
      html = '<h2>流局</h2>';
      html += '<div class="rule-list">听牌：'
        + (r.tenpaiSeats.map(s => g.players[s].name).join('、') || '无人') + '<br>';
      html += '不听：' + (r.notenSeats.map(s => g.players[s].name).join('、') || '无人') + '</div>';
    }
    html += '<table class="pay-table"><tr><th>玩家</th><th>本局</th><th>点数</th></tr>';
    for (let s = 0; s < 4; s++) {
      const d = r.delta[s];
      html += '<tr><td>' + g.players[s].name + '</td>'
        + '<td class="' + (d > 0 ? 'pos roll-up' : d < 0 ? 'neg roll-down' : '') + '" data-roll="' + d + '">'
        + (d > 0 ? '+' : '') + d + '</td>'
        + '<td data-roll="' + g.players[s].score + '">' + g.players[s].score + '</td></tr>';
    }
    html += '</table>';
    if (!r.gameover) {
      html += '<div class="modal-btns"><button class="btn-primary" id="m-next">下一局</button></div>';
    }
    this.showModal(html, 'result');
    if (!r.gameover) {
      byId('m-next').addEventListener('click', () => { this.hideModal(); g.continueRound(); });
    }
    if (!this.anim.fxPlayed) {
      this.anim.fxPlayed = true;
      Effects.playResult(r);
    }
    this.rollScores();
  },

  /* 分数滚动动画（data-roll 单元格） */
  rollScores() {
    if (typeof requestAnimationFrame !== 'function') return;
    const cells = document.querySelectorAll ? document.querySelectorAll('[data-roll]') : [];
    for (const el of cells) {
      const target = parseInt(el.getAttribute('data-roll'), 10) || 0;
      const from = 0;
      const dur = 420;
      const start = performance.now();
      const step = now => {
        const t = Math.min(1, (now - start) / dur);
        const eased = 1 - Math.pow(1 - t, 3);
        el.textContent = Math.round(from + (target - from) * eased);
        if (t < 1) requestAnimationFrame(step);
        else el.textContent = target;
      };
      requestAnimationFrame(step);
    }
  },

  /* ---------- 牌谱导入导出 ---------- */
  exportPaifu() {
    const g = this.game;
    if (!g) { this.showConfig(); return; }
    const json = JSON.stringify(g.serialize(), null, 1);
    try {
      const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'mahjong-paifu-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) { /* 环境不支持下载时忽略 */ }
  },

  importPaifu(file) {
    const reader = new FileReader();
    reader.onload = () => {
      let paifu;
      try { paifu = JSON.parse(reader.result); } catch (e) { alert('牌谱解析失败：不是合法的 JSON 文件'); return; }
      if (!Paifu.validate(paifu)) { alert('牌谱格式不正确'); return; }
      this.showPaifuChoice(paifu);
    };
    reader.readAsText(file);
  },

  showPaifuChoice(paifu) {
    this.showModal(`
      <h2>牌谱</h2>
      <div class="rule-list">
        导出时间：${paifu.exportedAt || '未知'}<br>
        局数：${paifu.snapshot.cfg.mode === 'east' ? '东风战' : '东南战'} ·
        当前局：${(paifu.snapshot.roundNo < 4 ? '东' : '南') + (paifu.snapshot.roundNo % 4 + 1) + '局'} ·
        阶段：${paifu.snapshot.phase}<br><br>
        请选择处理方式：
      </div>
      <div class="modal-btns">
        <button class="btn-primary" id="paifu-continue">继续对局</button>
        <button class="btn-call" id="paifu-replay">回放观看</button>
        <button class="btn-pass" id="paifu-cancel">取消</button>
      </div>`, 'config');
    byId('paifu-continue').addEventListener('click', () => {
      if (this.game) this.game.stop();
      const g = Game.restore(paifu);
      this.game = g;
      g.onUpdate = () => this.render();
      this.anim = { discards: {}, melds: {}, backs: {}, lastDrawnValue: null };
      this.hideModal();
      g._update();
    });
    byId('paifu-replay').addEventListener('click', () => { this.hideModal(); this.showReplayModal(paifu); });
    byId('paifu-cancel').addEventListener('click', () => this.hideModal());
  },

  /* ---------- 回放播放器 ---------- */
  showReplayModal(paifu) {
    this.rp = new ReplayPlayer(paifu);
    this.showModal('<h2>牌谱回放</h2><div id="replay-view"></div>'
      + '<div class="modal-btns replay-btns">'
      + '<button class="btn-call" id="rp-begin">⏮ 开头</button>'
      + '<button class="btn-call" id="rp-prev">◀ 上一步</button>'
      + '<button class="btn-primary" id="rp-play">▶ 播放</button>'
      + '<button class="btn-call" id="rp-next">下一步 ▶</button>'
      + '<button class="btn-pass" id="rp-close">关闭</button>'
      + '</div>', 'config');
    this.rp.goto(-1);
    this.renderReplay();
    const play = () => {
      if (this.rp && this.rp.atEnd) { this.stopReplay(); return; }
      if (!this.rp) return;
      this.rp.step();
      this.renderReplay();
      this.rpTimer = setTimeout(play, 700);
    };
    byId('rp-play').addEventListener('click', () => {
      const b = byId('rp-play');
      if (this.rpTimer) { this.stopReplay(); b.textContent = '▶ 播放'; return; }
      b.textContent = '⏸ 暂停';
      play();
    });
    byId('rp-prev').addEventListener('click', () => { this.stopReplay(); this.rp.prev(); this.renderReplay(); });
    byId('rp-next').addEventListener('click', () => { this.stopReplay(); this.rp.step(); this.renderReplay(); });
    byId('rp-begin').addEventListener('click', () => { this.stopReplay(); this.rp.goto(-1); this.renderReplay(); });
    byId('rp-close').addEventListener('click', () => { this.stopReplay(); this.hideModal(); });
  },

  stopReplay() {
    if (this.rpTimer) { clearTimeout(this.rpTimer); this.rpTimer = null; }
    const b = document.getElementById && document.getElementById('rp-play');
    if (b) b.textContent = '▶ 播放';
  },

  renderReplay() {
    const rp = this.rp;
    const view = byId('replay-view');
    if (!rp || !view) return;
    if (!rp.players) { view.innerHTML = '<div class="rule-list">回放未开始。</div>'; return; }
    const roundName = (rp.roundNo < 4 ? '东' : '南') + (rp.roundNo % 4 + 1) + '局';
    let html = '<div class="replay-center">' + roundName + (rp.honba ? ' ' + rp.honba + '本场' : '')
      + ' · 残牌 ' + (rp.wall ? rp.wall.length : 0)
      + ' · 宝牌指示：' + rp.doraInds.map(doraOf).map(tileName).join('、') + '</div>';
    html += '<div class="replay-desc">' + rp.desc + '</div>';
    html += '<table class="replay-table">';
    for (let s = 0; s < 4; s++) {
      const p = rp.players[s];
      const melds = p.melds.map(m => '<span class="replay-meld">[' + m.tiles.map(tileName).join('') + ']</span>').join(' ');
      const discards = p.discards.map(tileName).join('');
      html += '<tr><td class="replay-name">' + p.name + (s === rp.dealer ? ' <span class="badge dealer-badge">庄</span>' : '')
        + (p.riichi ? ' <span class="badge riichi-badge">立直</span>' : '')
        + '</td><td class="replay-hand">' + p.concealed.map(tileName).join(' ') + '</td>'
        + '<td class="replay-melds">' + (melds || '—') + '</td>'
        + '<td class="replay-disc">' + (discards || '—') + '</td>'
        + '<td class="replay-score">' + p.score + '</td></tr>';
    }
    html += '</table>';
    if (rp.lastResult && rp.lastResult.infos) {
      const info = rp.lastResult.infos[0];
      html += '<div class="replay-result">' + (rp.lastResult.type === 'tsumo' ? '自摸' : '荣和')
        + ' · ' + (info.yaku.map(y => y.name).join('、') || '—')
        + ' · ' + (info.limit ? info.limit : info.han + '番') + '</div>';
    }
    view.innerHTML = html;
  },

  /* ---------- 役种图鉴 ---------- */
  showDictionary() {
    Meta.load();
    const set = Meta.data.yakuSet || {};
    let html = '<h2>役种图鉴</h2><div class="dict-grid">';
    YAKU_DICT.forEach(y => {
      const owned = !!set[y.name];
      html += '<div class="dict-item' + (owned ? ' owned' : '') + (y.yakuman ? ' yakuman' : '') + '">'
        + '<div class="dict-name">' + y.name + (owned ? ' <span class="dict-owned">✓</span>' : '') + '</div>'
        + '<div class="dict-han">' + y.han + ' 番 · ' + y.kui + '</div>'
        + '<div class="dict-desc">' + y.desc + '</div></div>';
    });
    html += '</div>';
    html += '<div class="modal-btns"><button class="btn-primary" id="dict-close">知道了</button></div>';
    this.showModal(html, 'rules');
    byId('dict-close').addEventListener('click', () => this.hideModal());
  },

  /* ---------- 段位 / 战绩 / 成就 ---------- */
  showMeta() {
    Meta.load();
    const d = Meta.data;
    const rk = Meta.rankIndex();
    const next = Meta.nextRank();
    const avgPlace = d.games ? ((d.places[0] + d.places[1] * 2 + d.places[2] * 3 + d.places[3] * 4) / d.games).toFixed(2) : '-';
    const winRate = d.games ? Math.round(d.wins / d.games * 100) : 0;
    let html = '<h2>段位 · 战绩</h2>';
    html += '<div class="meta-rank">当前段位：<b>' + RANKS[rk].name + '</b>（' + d.rankPoints + ' 分）'
      + (next ? ' · 距 ' + next.name + ' 还差 ' + Math.max(0, next.min - d.rankPoints) + ' 分' : ' · 已达最高段位') + '</div>';
    html += '<table class="pay-table"><tr><th>对局数</th><th>和牌率</th><th>立直次数</th><th>役满</th><th>平均顺位</th></tr>';
    html += '<tr><td>' + d.games + '</td><td>' + winRate + '%</td><td>' + d.riichis + '</td><td>' + d.yakuman + '</td><td>' + avgPlace + '</td></tr></table>';
    html += '<div class="meta-places">顺位：一位 ' + d.places[0] + ' · 二位 ' + d.places[1] + ' · 三位 ' + d.places[2] + ' · 四位 ' + d.places[3] + '</div>';
    html += '<div class="meta-yaku">役种图鉴收集：' + Meta.collectedYaku() + ' / ' + YAKU_DICT.length + '</div>';
    html += '<h3 class="ach-title">成就（' + Meta.achievements() + ' / ' + ACHIEVEMENTS.length + '）</h3><div class="ach-list">';
    ACHIEVEMENTS.forEach(a => {
      const got = !!d.achievements[a.id];
      html += '<div class="ach-item' + (got ? ' got' : '') + '">' + (got ? '🏆' : '🔒') + ' ' + a.name + '：' + a.desc + '</div>';
    });
    html += '</div>';
    html += '<div class="modal-btns"><button class="btn-primary" id="meta-close">知道了</button></div>';
    this.showModal(html, 'rules');
    byId('meta-close').addEventListener('click', () => this.hideModal());
  },

  /* ---------- 打牌交互（单击/双击） ---------- */
  selectHandTile(el, id) {
    const prev = this.els.hand.querySelector('.tile.selected');
    if (prev) prev.classList.remove('selected');
    el.classList.add('selected');
    this.selectedTile = id;
  },
  discardTile(id) {
    const g = this.game;
    if (!g) return;
    if (g.phase === 'riichi-select') g.humanRiichiDiscard(id);
    else g.humanDiscard(id);
    this.selectedTile = null;
  },

  /* ---------- 外挂面板 ---------- */
  initCheat() {
    const ball = byId('cheat-ball');
    const panel = byId('cheat-panel');
    if (!ball || !panel) return;
    ball.addEventListener('click', () => {
      panel.classList.toggle('hidden');
      if (!panel.classList.contains('hidden')) this.renderCheatPanel();
    });
    panel.addEventListener('click', e => {
      const tile = e.target.closest && e.target.closest('.cheat-tiles .tile[data-id]');
      const opt = e.target.closest && e.target.closest('.cheat-opt');
      if (tile) this.onCheatSelectTile(+tile.dataset.id);
      else if (opt) this.onCheatSelectOpt(opt.dataset);
    });
  },

  updateCheatBall() {
    const ball = byId('cheat-ball');
    if (!ball) return;
    const g = this.game;
    const show = g && g.cheat && g.cheat.enabled && g.humanSeat >= 0 && !g.cfg.allAI;
    ball.classList.toggle('hidden', !show);
    if (!show) byId('cheat-panel').classList.add('hidden');
  },

  renderCheatPanel() {
    const g = this.game;
    const list = byId('cheat-list');
    if (!g || !list) return;
    const c = g.cheat;
    let html = '';
    CHEATS.forEach(ch => {
      const avail = Cheats.canUse(g, ch.id);
      const on = (ch.type === 'toggle' && c.flags[ch.id]);
      let state = '';
      if (ch.type === 'toggle') state = on ? '开' : '关';
      else if (c.limited && ch.uses) state = '×' + (c.uses[ch.id] || 0);
      else if (ch.cooldown && (c.cooldown[ch.id] || 0) > 0) state = '冷却' + c.cooldown[ch.id];
      html += '<div class="cheat-item' + (!avail ? ' disabled' : '') + (on ? ' on' : '') + '" data-id="' + ch.id + '">'
        + '<span class="ci-icon">' + ch.icon + '</span><span class="ci-name">' + ch.name + '</span>'
        + '<span class="ci-state">' + state + '</span></div>';
    });
    list.innerHTML = html;
    list.querySelectorAll('.cheat-item').forEach(el => {
      el.addEventListener('click', () => this.onCheatClick(el.dataset.id));
    });
    this.cheatSelect = null;
    byId('cheat-select').innerHTML = '';
  },

  onCheatClick(id) {
    const g = this.game;
    if (!g) return;
    const ch = Cheats.def(id);
    if (!ch || !Cheats.canUse(g, id)) return;
    if (ch.type === 'toggle' || ch.type === 'instant') {
      Cheats.activate(g, id);
      this.renderCheatPanel();
      return;
    }
    this.cheatSelect = { id, stage: 0 };
    this.renderCheatSelect();
  },

  renderCheatSelect() {
    const g = this.game;
    const sel = this.cheatSelect;
    const el = byId('cheat-select');
    if (!g || !sel || !el) { el.innerHTML = ''; return; }
    const ch = Cheats.def(sel.id);
    let html = '<div class="cheat-select-title">' + ch.name + '：请选择</div>';
    if (ch.type === 'pattern') {
      html += '<div class="cheat-opts">' + YAKUMAN_PATTERNS.map(p =>
        '<div class="cheat-opt" data-p="' + p.name + '">' + p.name + '</div>').join('') + '</div>';
    } else if (ch.type === 'opp') {
      html += '<div class="cheat-opts">' + [0, 2, 3].filter(s => s !== g.humanSeat).map(s =>
        '<div class="cheat-opt" data-o="' + s + '">' + g.players[s].name + '</div>').join('') + '</div>';
    } else if (ch.type === 'handtile') {
      const p = g.players[g.humanSeat];
      const tiles = Array.from(new Set(p.concealed.map(family))).sort((a, b) => a - b);
      html += '<div class="cheat-tiles">' + tiles.map(t => tileEl(t, { small: true, clickable: true })).join('') + '</div>';
    } else if (ch.type === 'tile') {
      html += '<div class="cheat-tiles">';
      for (let t = 0; t < 34; t++) html += tileEl(t, { small: true, clickable: true });
      html += '</div>';
    } else if (ch.type === 'opptile') {
      if (sel.stage === 0) {
        html += '<div class="cheat-opts">' + [0, 2, 3].filter(s => s !== g.humanSeat).map(s =>
          '<div class="cheat-opt" data-o="' + s + '">' + g.players[s].name + '</div>').join('') + '</div>';
      } else {
        html += '<div class="cheat-select-title">指定 ' + g.players[sel.seat].name + ' 打出的牌：</div><div class="cheat-tiles">';
        for (let t = 0; t < 34; t++) html += tileEl(t, { small: true, clickable: true });
        html += '</div>';
      }
    }
    el.innerHTML = html;
  },

  onCheatSelectOpt(data) {
    const g = this.game;
    const sel = this.cheatSelect;
    if (!g || !sel) return;
    const ch = Cheats.def(sel.id);
    if (ch.type === 'pattern' && data.p) { Cheats.activate(g, sel.id, data.p); this.renderCheatPanel(); return; }
    if (ch.type === 'opp' && data.o) { Cheats.activate(g, sel.id, +data.o); this.renderCheatPanel(); return; }
    if (ch.type === 'opptile' && sel.stage === 0 && data.o) {
      sel.stage = 1; sel.seat = +data.o;
      this.renderCheatSelect();
      return;
    }
  },

  onCheatSelectTile(tile) {
    const g = this.game;
    const sel = this.cheatSelect;
    if (!g || !sel) return;
    const ch = Cheats.def(sel.id);
    if (ch.type === 'tile' || ch.type === 'handtile') { Cheats.activate(g, sel.id, tile); this.renderCheatPanel(); return; }
    if (ch.type === 'opptile' && sel.stage === 1) { Cheats.activate(g, sel.id, { seat: sel.seat, tile }); this.renderCheatPanel(); return; }
  },
};

function byId(id) { return document.getElementById(id); }
window.addEventListener('DOMContentLoaded', () => UI.init());
