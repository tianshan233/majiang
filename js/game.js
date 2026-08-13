'use strict';
/* ============ 对局引擎 ============
 * 状态机（this.phase）：
 *   idle            未开始
 *   draw            玩家摸牌后待决策（自摸/杠/立直/打牌）
 *   discard         玩家刚打出牌，待其他三家响应
 *   discard-required 副露（碰/吃）后需打出一张牌
 *   claims          打出的牌正被判定荣和/碰/吃（优先级：荣和 > 碰/杠 > 吃）
 *   riichi-select   玩家已宣言立直，需选择打出的听牌牌
 *   round-end       本局结束（和牌/流局），展示结算
 *   gameover        整场比赛结束
 *
 * 座位：seat0=东(右) seat1=南(你) seat2=西(左) seat3=北(上)
 * 牌墙：wall(122 张可摸) + dead(14 张王牌：前 4 张宝牌指示、index5 起里宝牌、末张起岭上牌)
 * 点数守恒：四人分数之和恒为 100000（25000 起）。
 */
const AI_NAMES = ['钟离', '胡桃', '可莉', '行秋'];

class Game {
  constructor(cfg) {
    this.cfg = Object.assign({ mode: 'east', allAI: false, speed: 700, humanSeat: 1, difficulty: 'normal' }, cfg);
    this.humanSeat = this.cfg.allAI ? -1 : this.cfg.humanSeat;
    this.speed = this.cfg.speed;
    this.players = [];
    this.roundNo = 0;
    this.honba = 0;
    this.riichiSticks = 0;
    this.riichiOwners = [];
    this.dealer = 0;
    this.phase = 'idle';
    this.turn = -1;
    this.drawnTile = null;
    this.wall = [];
    this.dead = [];
    this.doraInds = [];
    this.lastTile = false;
    this.houtei = false;
    this.rinshan = false;
    this.chankanWin = false;
    this.turnCount = 0;
    this.pending = null;
    this.lastResult = null;
    this.log = [];
    this.debugLog = [];
    this.events = [];
    this.onUpdate = null;
    this.cheat = Object.assign({ enabled: false, limited: true, flags: {}, uses: {}, cooldown: {}, puppet: null }, cfg.cheat || {});
    this.snapshots = [];
  }

  roundWindOf() { return this.roundNo < 4 ? 0 : 1; }
  roundName() {
    const r = this.roundNo;
    return (r < 4 ? '东' : '南') + (r % 4 + 1) + '局';
  }
  /* 结构化事件（牌谱录制用） */
  _evt(o) { this.events.push(o); }

  stop() { this.stopped = true; }
  _schedule(fn, ms) {
    setTimeout(() => { if (!this.stopped) fn(); }, ms !== undefined ? ms : this.speed);
  }
  _update() { if (this.onUpdate) this.onUpdate(); }
  _log(msg) {
    this.log.unshift('[' + this.roundName() + (this.honba ? '-' + this.honba + '本场' : '') + '] ' + msg);
    if (this.log.length > 80) this.log.pop();
  }
  _clearIppatsu() { for (const p of this.players) p.ippatsu = false; }
  /* 详细调试日志（导出用，不截断） */
  _dbg(msg) {
    this.debugLog.push('[' + this.roundName() + (this.honba ? '-' + this.honba + '本' : '')
      + '] T' + this.turnCount + ' ' + msg);
  }
  _tilesStr(tiles) {
    return sortTiles(tiles).map(tileName).join(' ');
  }
  _applyScore(delta) {
    for (let i = 0; i < 4; i++) {
      this.players[i].score += delta[i];
      this.players[i].delta = delta[i];
    }
  }

  /* ---------- 对局流程 ---------- */
  start() {
    this.stopped = false;
    this.players = [0, 1, 2, 3].map((_, i) => ({
      name: i === this.humanSeat ? (this.cfg.playerName || '玩家') : AI_NAMES[i],
      isHuman: i === this.humanSeat,
      concealed: [], melds: [], discards: [], tsumogiri: [],
      riichi: false, riichiTile: null, ippatsu: false, riichiTurnCount: -1,
      lastDrawn: null,
      furitenTmp: false, riichiFuriten: false, drawnCount: 0,
      score: 25000, seatWind: 0, delta: 0,
    }));
    this.roundNo = 0;
    this.honba = 0;
    this.riichiSticks = 0;
    this.riichiOwners = [];
    this.dealer = Math.floor(Math.random() * 4);
    this.log = [];
    this.debugLog = [];
    this.events = [];
    this.snapshots = [];
    if (this.cheat.enabled && typeof Cheats !== 'undefined') Cheats.init(this);
    this._dbg('对局开始：' + (this.cfg.mode === 'east' ? '东风战' : '东南战')
      + (this.cfg.allAI ? ' / AI观战' : ' / 人机对战') + ' / 行动间隔' + this.cfg.speed + 'ms'
      + (this.cheat.enabled ? ' / 开挂模式' : ''));
    for (let i = 0; i < 4; i++) {
      this._dbg('seat' + i + ' = ' + this.players[i].name + (this.players[i].isHuman ? '(人类)' : '(AI)'));
    }
    this._dbg('初始庄家：seat' + this.dealer + ' ' + this.players[this.dealer].name);
    this._startRound();
  }

  continueRound() {
    if (this.phase === 'gameover' || this.phase === 'idle') return;
    if (this.phase !== 'round-end') return;
    this._startRound();
  }

  _startRound() {
    const wall = buildWall();
    this.wall = wall.slice(0, 122);
    this.dead = wall.slice(122);
    this.doraInds = [this.dead[0]];
    this._evt({ t: 'round', roundNo: this.roundNo, honba: this.honba, dealer: this.dealer, wall: wall.slice() });
    this.lastTile = false;
    this.houtei = false;
    this.rinshan = false;
    this.turnCount = 0;
    this.pending = null;
    this.drawnTile = null;
    this.meldCount = 0;
    this.tenhouFlag = -1;
    this.chiihouFlag = -1;
    for (let i = 0; i < 4; i++) {
      const p = this.players[i];
      p.concealed = []; p.melds = []; p.discards = []; p.tsumogiri = [];
      p.riichi = false; p.riichiTile = null; p.ippatsu = false; p.riichiTurnCount = -1;
      p.lastDrawn = null;
      p.furitenTmp = false; p.riichiFuriten = false; p.drawnCount = 0;
      p.seatWind = (i - this.dealer + 4) % 4;
      p.delta = 0;
    }
    for (let r = 0; r < 3; r++) {
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) this.players[i].concealed.push(this.wall.shift());
      }
    }
    for (let i = 0; i < 4; i++) this.players[i].concealed.push(this.wall.shift());
    for (const p of this.players) p.concealed.sort(tileCompare);
    this._dbg('开局：庄家 seat' + this.dealer + '(' + this.players[this.dealer].name
      + ') 宝牌指示[' + tileName(this.doraInds[0]) + ']');
    for (let i = 0; i < 4; i++) {
      this._dbg('发牌 seat' + i + '(' + this.players[i].name + ')：' + this._tilesStr(this.players[i].concealed));
    }
    this._log(this.roundName() + (this.honba ? ' ' + this.honba + '本场' : '') + ' 开始'
      + (this.riichiSticks ? '（立直棒 ×' + this.riichiSticks + '）' : ''));
    this._update();
    this._startTurn(this.dealer);
  }

  _startTurn(seat) {
    this.turnCount++;
    if (this.cheat.enabled) {
      this.snapshots.push(this.takeSnapshot());
      if (this.snapshots.length > 30) this.snapshots.shift();
      if (typeof Cheats !== 'undefined') Cheats.tickCooldown(this);
    }
    if (this.wall.length === 0) { this._ryuukyoku(); return; }
    let tile;
    /* 心想事成+：摸一张宝牌 */
    if (seat === this.humanSeat && this.cheat.flags && this.cheat.flags.wishDora) {
      const doraTiles = this.doraInds.map(doraOf);
      const avail = doraTiles.filter(t => this.wall.includes(t));
      if (avail.length) {
        tile = this.wall.splice(this.wall.indexOf(avail[0]), 1)[0];
        this.cheat.flags.wishDora = false;
      } else {
        tile = this.wall.shift();
      }
    } else {
      tile = this.wall.shift();
    }
    if (this.wall.length === 0) this.lastTile = true;
    const p = this.players[seat];
    p.concealed.push(tile);
    p.concealed.sort(tileCompare);
    p.drawnCount = (p.drawnCount || 0) + 1;
    p.furitenTmp = false;
    this.drawnTile = tile;
    p.lastDrawn = tile;
    this.turn = seat;
    this.phase = 'draw';
    this._evt({ t: 'draw', seat, tile });
    this._log(p.name + ' 摸牌');
    this._dbg('摸牌 seat' + seat + '(' + p.name + ') 摸到[' + tileName(tile)
      + '] 手牌：' + this._tilesStr(p.concealed) + ' 残牌=' + this.wall.length);
    this._update();
    if (p.isHuman && !this.cfg.allAI) return;
    this._schedule(() => this._aiDecideDraw(seat));
  }

  /* 外挂「傀儡线」：指定 AI 打出的牌 */
  _aiChooseDiscard(seat) {
    const puppet = this.cheat.puppet;
    if (puppet && puppet.seat === seat && this.players[seat].concealed.some(t => family(t) === family(puppet.tile))) {
      this.cheat.puppet = null;
      return puppet.tile;
    }
    return AI.chooseDiscard(this, seat);
  }

  _aiDecideDraw(seat) {
    const puppet = this.cheat.puppet;
    if (puppet && puppet.seat === seat) {
      this.cheat.puppet = null;
      if (this.players[seat].concealed.some(t => family(t) === family(puppet.tile))) {
        this._applyDiscard(seat, puppet.tile, { riichi: false, fromDraw: false });
        return;
      }
    }
    const act = AI.onDraw(this, seat);
    if (act.type === 'tsumo') { this._tsumo(seat); return; }
    if (act.type === 'discard') {
      this._applyDiscard(seat, act.tile, { riichi: false, fromDraw: true });
      return;
    }
    if (act.type === 'kan') { this._doKan(seat, act.kan); return; }
    if (act.type === 'riichi') {
      const p = this.players[seat];
      p.riichi = true; p.riichiTile = act.tile; p.ippatsu = true; p.riichiTurnCount = this.turnCount;
      this.riichiSticks++; this.riichiOwners.push(seat); p.score -= 1000;
      this._log(p.name + ' 立直！');
      this._applyDiscard(seat, act.tile, { riichi: true, fromDraw: true });
    }
  }

  _applyDiscard(seat, tile, opts) {
    const p = this.players[seat];
    let actual = p.concealed.includes(tile) ? tile : pickTile(p.concealed, family(tile));
    if (actual < 0) return;
    const idx = p.concealed.indexOf(actual);
    p.concealed.splice(idx, 1);
    p.discards.push(actual);
    p.tsumogiri.push(actual === this.drawnTile);
    this._evt({ t: 'discard', seat, tile: actual, tsumo: actual === this.drawnTile, riichi: !!opts.riichi });
    if (actual === this.drawnTile) p.lastDrawn = null;
    this._dbg('打出 seat' + seat + '(' + p.name + ') [' + tileName(actual) + ']'
      + (opts.riichi ? ' 立直宣言' : '') + ' (' + (actual === this.drawnTile ? '摸切' : '手切')
      + ') 手牌：' + this._tilesStr(p.concealed));
    if (opts.riichi) {
      const rc = counts(p.concealed);
      const rws = waitsFor(tilesFromCounts(rc), p.melds.length);
      this._dbg('立直听牌：' + rws.map(tileName).join(' ') + '（' + rws.length + '张）');
    }
    if (opts.riichi) p.riichiTile = actual;
    if (this.lastTile) this.houtei = true;
    this.drawnTile = null;
    this.rinshan = false;
    this.phase = 'discard';
    if (p.ippatsu && this.turnCount - p.riichiTurnCount >= 4) p.ippatsu = false;
    this._log(p.name + ' 打出 ' + tileName(actual) + (opts.riichi ? '（立直宣言）' : ''));
    this._update();
    this._resolveClaims(seat, actual);
  }

  /* ---------- 副露 ---------- */
  _chiCombos(seat, tile) {
    const f = family(tile);
    if (f >= 27) return [];
    const p = this.players[seat];
    const c = counts(p.concealed);
    const n = f % 9;
    const combos = [];
    const tryC = (a, b) => { if (c[a] > 0 && c[b] > 0) combos.push([a, b]); };
    if (n >= 2) tryC(f - 2, f - 1);
    if (n >= 1 && n <= 7) tryC(f - 1, f + 1);
    if (n <= 6) tryC(f + 1, f + 2);
    return combos;
  }
  _bestChiCombo(seat, tile) {
    if ((this.cfg.difficulty || 'normal') === 'easy') return null;
    const combos = this._chiCombos(seat, tile);
    if (!combos.length) return null;
    const p = this.players[seat];
    const pre = shanten(counts(p.concealed), p.melds.length);
    let best = null, bestS = 99;
    for (const cb of combos) {
      const cc = counts(p.concealed);
      cc[cb[0]]--; cc[cb[1]]--;
      const s = shanten(cc, p.melds.length + 1);
      if (s < bestS) { bestS = s; best = cb; }
    }
    return bestS < pre ? best : null;
  }

  _resolveClaims(seat, tile) {
    const claims = { rons: [], pons: [], kans: [], chiSeat: null, from: seat, tile };
    const hypno = s => this.cheat.flags && this.cheat.flags.hypnotize && !this.players[s].isHuman;
    for (let s = 0; s < 4; s++) if (s !== seat) {
      const pl = this.players[s];
      if (!hypno(s) && this.canRon(s, tile)) claims.rons.push(s);
      if (pl.riichi) continue;
      if (!hypno(s) && counts(pl.concealed)[family(tile)] >= 2) claims.pons.push(s);
      if (!hypno(s) && counts(pl.concealed)[family(tile)] >= 3) claims.kans.push(s);
    }
    if (!claims.rons.length && !claims.pons.length && !claims.kans.length) {
      const next = (seat + 1) % 4;
      if (!hypno(next) && this._chiCombos(next, tile).length) claims.chiSeat = next;
    }
    this.pending = { claims, step: 'ron' };
    this.phase = 'claims';
    this._claimStep();
  }

  /* 副露/荣和判定状态机：按「荣和 > 碰/杠 > 吃」的优先级依次处理。
   * 明杠与碰同级（由 AI/玩家决策）；吃仅限下家；无任何响应时轮到下家摸牌。 */
  _claimStep() {
    const { claims } = this.pending;
    while (true) {
      const step = this.pending.step;
      if (step === 'ron') {
        const human = claims.rons.find(s => this.players[s].isHuman);
        if (human !== undefined) { this._update(); return; }
        if (claims.rons.length) { this._ron(claims.rons, claims.tile, claims.from); return; }
        /* 抢杠无人荣和 → 恢复原加杠/暗杠动作（跳过抢杠判定直接杠） */
        if (this.pending.chankan && this.pending.resume) {
          const resume = this.pending.resume;
          this.pending = null;
          this._doKan(resume.seat, resume.kan, true);
          return;
        }
        this.pending.step = 'pon';
        continue;
      }
      if (step === 'pon') {
        const seats = [];
        for (const s of claims.pons) if (seats.indexOf(s) < 0) seats.push(s);
        for (const s of (claims.kans || [])) if (seats.indexOf(s) < 0) seats.push(s);
        if (!seats.length) { this.pending.step = 'chi'; continue; }
        seats.sort((a, b) => ((a - claims.from + 4) % 4) - ((b - claims.from + 4) % 4));
        const s0 = seats[0];
        if (!this.cfg.allAI && this.players[s0].isHuman) { this._update(); return; }
        if (claims.kans.indexOf(s0) >= 0 && AI.wantKan(this, s0, claims.tile)) {
          this._minkan(s0, claims.tile, claims.from); return;
        }
        if (claims.pons.indexOf(s0) >= 0 && AI.wantPon(this, s0, claims.tile)) {
          this._pon(s0, claims.tile, claims.from); return;
        }
        claims.pons = claims.pons.filter(s => s !== s0);
        claims.kans = claims.kans.filter(s => s !== s0);
        continue;
      }
      if (step === 'chi') {
        const cs = claims.chiSeat;
        if (cs !== null) {
          if (this.cfg.allAI || !this.players[cs].isHuman) {
            const best = this._bestChiCombo(cs, claims.tile);
            if (best) { this._chi(cs, claims.tile, claims.from, best); return; }
            claims.chiSeat = null;
            continue;
          }
          this._update(); return;
        }
        this.pending = null;
        this._startTurn((claims.from + 1) % 4);
        return;
      }
    }
  }

  _pon(seat, tile, from) {
    const p = this.players[seat];
    const fam = family(tile);
    const a = pickTile(p.concealed, fam);
    const b = pickTile(p.concealed, fam);
    removeTilesByFamily(p.concealed, fam, 2);
    p.melds.push({ type: 'pon', tiles: [tile, a, b].sort(tileCompare), open: true, from });
    this._evt({ t: 'pon', seat, tile, from });
    this.meldCount++;
    this._clearIppatsu();
    this.pending = null;
    this.turn = seat;
    this.phase = 'discard-required';
    this.drawnTile = null;
    p.lastDrawn = null;
    this._log(p.name + ' 碰 ' + tileName(tile));
    this._dbg('副露 seat' + seat + '(' + p.name + ') 碰[' + tileName(tile)
      + '] 来自seat' + from + '(' + this.players[from].name + ') 手牌：' + this._tilesStr(p.concealed));
    this._update();
    if (p.isHuman && !this.cfg.allAI) return;
    this._schedule(() => this._applyDiscard(seat, this._aiChooseDiscard(seat), { riichi: false, fromDraw: false }));
  }

  _chi(seat, tile, from, combo) {
    const p = this.players[seat];
    const a = pickTile(p.concealed, family(combo[0]));
    const b = pickTile(p.concealed, family(combo[1]));
    removeTilesByFamily(p.concealed, family(combo[0]), 1);
    removeTilesByFamily(p.concealed, family(combo[1]), 1);
    const tiles = [tile, a, b].sort(tileCompare);
    p.melds.push({ type: 'chi', tiles, open: true, from });
    this._evt({ t: 'chi', seat, tile, from, combo });
    this.meldCount++;
    this._clearIppatsu();
    this.pending = null;
    this.turn = seat;
    this.phase = 'discard-required';
    this.drawnTile = null;
    p.lastDrawn = null;
    this._log(p.name + ' 吃 ' + tileName(tile));
    this._dbg('副露 seat' + seat + '(' + p.name + ') 吃[' + tileName(tile)
      + '] 组合[' + combo.map(tileName).join('+') + '] 来自seat' + from
      + '(' + this.players[from].name + ') 手牌：' + this._tilesStr(p.concealed));
    this._update();
    if (p.isHuman && !this.cfg.allAI) return;
    this._schedule(() => this._applyDiscard(seat, this._aiChooseDiscard(seat), { riichi: false, fromDraw: false }));
  }

  kanOptions(seat) {
    const p = this.players[seat];
    const opts = [];
    if (p.riichi) return opts;
    const c = counts(p.concealed);
    for (let t = 0; t < 34; t++) if (c[t] >= 4) opts.push({ type: 'ankan', tile: t });
    for (const m of p.melds) if (m.type === 'pon' && c[family(m.tiles[0])] >= 1) opts.push({ type: 'chakan', tile: family(m.tiles[0]) });
    return opts;
  }

  /* 别人打出第 4 张 → 明杠 */
  _minkan(seat, tile, from) {
    const p = this.players[seat];
    const fam = family(tile);
    const a = pickTile(p.concealed, fam);
    const b = pickTile(p.concealed, fam);
    const c2 = pickTile(p.concealed, fam);
    removeTilesByFamily(p.concealed, fam, 3);
    p.melds.push({ type: 'kan', tiles: [tile, a, b, c2].sort(tileCompare), open: true, from });
    this._evt({ t: 'kan', seat, type: 'minkan', tile: fam, from });
    this._finishKan(seat, '明杠', fam);
  }

  /* 抢杠候选：其他家能荣和此牌。kokushiOnly=true 时仅允许国士无双抢暗杠 */
  _robberSeats(seat, tile, kokushiOnly) {
    const f = family(tile);
    const hypno = s => this.cheat.flags && this.cheat.flags.hypnotize && !this.players[s].isHuman;
    const out = [];
    for (let s = 0; s < 4; s++) if (s !== seat && !hypno(s)) {
      if (!this.canRon(s, f)) continue;
      if (!kokushiOnly) { out.push(s); continue; }
      const c = counts(this.players[s].concealed);
      c[f]++;
      if (isKokushi(c)) out.push(s);
    }
    return out;
  }

  _doKan(seat, kan, skipRobber) {
    const p = this.players[seat];
    if (kan.type === 'ankan') {
      /* 国士无双可抢暗杠 */
      if (!skipRobber) {
        const robbers = this._robberSeats(seat, kan.tile, true);
        if (robbers.length) {
          this.pending = { claims: { rons: robbers, pons: [], kans: [], chiSeat: null, from: seat, tile: family(kan.tile) }, step: 'ron', chankan: true, resume: { seat, kan } };
          this.phase = 'claims';
          this._log(p.name + ' 暗杠 ' + tileName(kan.tile) + ' 被抢杠！');
          this._claimStep();
          return;
        }
      }
      const fam = family(kan.tile);
      const actual = [];
      let rem = 4;
      for (let i = p.concealed.length - 1; i >= 0 && rem > 0; i--) {
        if (family(p.concealed[i]) === fam) { actual.push(p.concealed[i]); p.concealed.splice(i, 1); rem--; }
      }
      p.melds.push({ type: 'kan', tiles: actual.sort(tileCompare), open: false, from: -1 });
      this._evt({ t: 'kan', seat, type: 'ankan', tile: fam });
      this._finishKan(seat, '暗杠', fam);
    } else {
      const m = p.melds.find(mm => mm.type === 'pon' && family(mm.tiles[0]) === family(kan.tile));
      if (!m) return;
      /* 加杠：先判抢杠（普通荣和） */
      if (!skipRobber) {
        const robbers = this._robberSeats(seat, kan.tile, false);
        if (robbers.length) {
          this.pending = { claims: { rons: robbers, pons: [], kans: [], chiSeat: null, from: seat, tile: family(kan.tile) }, step: 'ron', chankan: true, resume: { seat, kan } };
          this.phase = 'claims';
          this._log(p.name + ' 加杠 ' + tileName(kan.tile) + ' 被抢杠！');
          this._claimStep();
          return;
        }
      }
      const extra = pickTile(p.concealed, family(kan.tile));
      if (extra < 0) return;
      m.type = 'kan';
      m.tiles.push(extra);
      const i = p.concealed.indexOf(extra);
      if (i >= 0) p.concealed.splice(i, 1);
      this._evt({ t: 'kan', seat, type: 'chakan', tile: family(kan.tile) });
      this._finishKan(seat, '加杠', family(kan.tile));
    }
  }

  _totalKans() {
    return this.players.reduce((s, p) => s + p.melds.filter(m => m.type === 'kan').length, 0);
  }
  _kanOwners() {
    return this.players.filter(p => p.melds.some(m => m.type === 'kan')).length;
  }

  /* 杠成立后的公共流程：翻宝牌 → 四杠流局检查 → 岭上摸牌 */
  _finishKan(seat, label, tileFam) {
    const p = this.players[seat];
    this.meldCount++;
    this.doraInds.push(this.dead[this.doraInds.length]);
    this._clearIppatsu();
    this._dbg('副露 seat' + seat + '(' + p.name + ') ' + label + '[' + tileName(tileFam)
      + '] 新宝牌指示[' + tileName(this.dead[this.doraInds.length - 1]) + ']');
    /* 四杠流局：全场杠数达 4 且分属两家及以上 */
    if (this._totalKans() >= 4 && this._kanOwners() >= 2) {
      this._ryuukyoku('四杠散了');
      return;
    }
    if (!this.dead.length) { this._ryuukyoku(); return; }
    const rinshan = this.dead.pop();
    p.concealed.push(rinshan);
    p.concealed.sort(tileCompare);
    this.drawnTile = rinshan;
    p.lastDrawn = rinshan;
    this.rinshan = true;
    this.phase = 'draw';
    this._evt({ t: 'draw', seat, tile: rinshan, rinshan: true });
    this._log(p.name + ' ' + label + ' ' + tileName(tileFam));
    this._update();
    if (this.canWinNow(seat, true)) {
      if (p.isHuman && !this.cfg.allAI) return;
      this._tsumo(seat);
      return;
    }
    this.rinshan = false;
    if (p.isHuman && !this.cfg.allAI) return;
    this._schedule(() => this._applyDiscard(seat, this._aiChooseDiscard(seat), { riichi: false, fromDraw: false }));
  }

  /* ---------- 和牌结算 ---------- */
  evalWinInfo(seat, tsumo, winTile) {
    const p = this.players[seat];
    const concealed = p.concealed.slice();
    if (!tsumo && winTile !== undefined) concealed.push(winTile);
    const actualWin = tsumo ? this.drawnTile : winTile;
    const ctx = {
      concealed,
      calls: p.melds,
      winTile: family(actualWin),
      tsumo,
      seatWind: p.seatWind,
      roundWind: this.roundWindOf(),
      riichi: p.riichi,
      ippatsu: p.ippatsu,
      rinshan: this.rinshan,
      chankan: this.chankanWin,
      haitei: tsumo && this.lastTile,
      houtei: !tsumo && this.houtei,
      tenhou: this.tenhouFlag === seat,
      chiihou: this.chiihouFlag === seat,
      doraInds: this.doraInds.slice(),
      uraInds: p.riichi ? this.dead.slice(5, 5 + this.doraInds.length) : [],
    };
    return evaluateWin(ctx);
  }
  canWinNow(seat, tsumo, winTile) {
    const info = this.evalWinInfo(seat, tsumo, winTile);
    return info !== null && info.yaku.length > 0;
  }
  /* 荣和资格：能构成和牌，且不处于振听（舍牌振听/临时振听/立直后振听） */
  canRon(seat, tile) {
    if (!this.canWinNow(seat, false, tile)) return false;
    const p = this.players[seat];
    if (p.riichiFuriten || p.furitenTmp) return false;
    const seen = new Set();
    for (const d of p.discards) {
      const f = family(d);
      if (seen.has(f)) continue;
      seen.add(f);
      if (this.canWinNow(seat, false, f)) return false;
    }
    return true;
  }

  _tsumo(seat) {
    const p = this.players[seat];
    this.tenhouFlag = (seat === this.dealer && this.turnCount === 1) ? seat : -1;
    this.chiihouFlag = (seat !== this.dealer && this.meldCount === 0 && (p.drawnCount || 0) === 1) ? seat : -1;
    const info = this.evalWinInfo(seat, true);
    if (!info || !info.yaku.length) return;
    this.rinshan = false;
    this._settleWin([seat], -1, true, [info], this.drawnTile);
  }

  _ron(winners, tile, from) {
    this.chankanWin = !!(this.pending && this.pending.chankan);
    const infos = winners.map(w => this.evalWinInfo(w, false, tile));
    this.chankanWin = false;
    this._settleWin(winners, from, false, infos, tile);
  }

  _settleWin(winners, from, tsumo, infos, winTile) {
    const delta = [0, 0, 0, 0];
    const sticks = this.riichiSticks;
    this.riichiSticks = 0;
    this.riichiOwners = [];
    const roundUp = x => Math.ceil(x / 100) * 100;
    winners.forEach((w, i) => {
      const info = infos[i];
      if (tsumo) {
        const dp = roundUp(info.basic * 2) + 100 * this.honba;
        const op = roundUp(info.basic) + 100 * this.honba;
        for (let s = 0; s < 4; s++) if (s !== w) {
          const a = s === this.dealer ? dp : op;
          delta[s] -= a; delta[w] += a;
        }
      } else {
        const a = roundUp(info.basic * (w === this.dealer ? 6 : 4)) + 300 * this.honba;
        delta[from] -= a; delta[w] += a;
      }
      if (i === 0 && sticks) delta[w] += sticks * 1000;
    });
    this._applyScore(delta);
    winners.forEach((w, i) => {
      const info = infos[i];
      const han = info.han + info.doraHan + info.uraHan;
      this._dbg('和牌 seat' + w + '(' + this.players[w].name + ') '
        + (tsumo ? '自摸' : '荣和') + ' 牌[' + tileName(winTile) + '] 役：'
        + info.yaku.map(y => y.name + y.han + '番').join('、')
        + ' 宝牌' + info.doraHan + ' 里宝' + info.uraHan
        + ' 合计' + han + '番' + info.fu + '符 basic=' + info.basic
        + (info.limit ? '(' + info.limit + ')' : ''));
    });
    this._dbg('支付：' + delta.map((d, i) => 'seat' + i + (d >= 0 ? '+' : '') + d).join(' ')
      + (sticks ? ' 立直棒×' + sticks : '')
      + ' 分数：' + this.players.map((p, i) => 'seat' + i + '=' + p.score).join(' '));
    const desc = winners.map((w, i) => {
      const info = infos[i];
      const han = info.han + info.doraHan + info.uraHan;
      let s = this.players[w].name + (tsumo ? ' 自摸' : ' 荣和') + '！'
        + info.yaku.map(y => y.name + y.han + '番').join('、')
        + ' 合计' + han + '番' + info.fu + '符';
      if (info.limit) s += '（' + info.limit + '）';
      return s;
    }).join('；');
    this._log(desc);
    this.lastResult = {
      type: tsumo ? 'tsumo' : 'ron',
      winners: winners.slice(), from, infos: infos.slice(),
      delta, scores: this.players.map(p => p.score),
      tile: winTile,
      sticks,
    };
    this._evt({
      t: 'win', type: tsumo ? 'tsumo' : 'ron', seats: winners.slice(), tile: winTile, from,
      delta: delta.slice(),
      infos: infos.map(i => ({ han: i.han, fu: i.fu, limit: i.limit, doraHan: i.doraHan, uraHan: i.uraHan,
        yaku: i.yaku.map(y => ({ name: y.name, han: y.han })) })),
    });
    this._endRound({ dealerWon: winners.some(w => w === this.dealer), draw: false });
  }

  _isTenpai(seat) {
    const p = this.players[seat];
    if (p.riichi) return true;
    return shanten(counts(p.concealed), p.melds.length) === 0;
  }

  _ryuukyoku(reason) {
    const tenpaiSeats = [], notenSeats = [];
    for (let s = 0; s < 4; s++) {
      if (this._isTenpai(s)) tenpaiSeats.push(s); else notenSeats.push(s);
    }
    const delta = [0, 0, 0, 0];
    if (tenpaiSeats.length && notenSeats.length) {
      /* 罚符总额固定 3000 点：不听者平分缴纳，听牌者平分获得（雀魂/天凤标准规则） */
      const total = 3000;
      const perNoten = Math.ceil(total / notenSeats.length / 100) * 100;
      const actualTotal = perNoten * notenSeats.length;
      const perTenpai = Math.floor(actualTotal / tenpaiSeats.length / 100) * 100;
      let rem = actualTotal - perTenpai * tenpaiSeats.length;
      for (const s of notenSeats) delta[s] -= perNoten;
      for (const s of tenpaiSeats) delta[s] += perTenpai;
      if (rem > 0) delta[tenpaiSeats[0]] += rem;
    }
    this._applyScore(delta);
    this._log('流局！' + (reason ? '（' + reason + '）' : '')
      + ' 听牌：' + (tenpaiSeats.map(s => this.players[s].name).join('、') || '无人')
      + (tenpaiSeats.length ? ' 不听的玩家支付点数' : ' 无人听牌，不支付点数'));
    this._dbg('流局 听牌：' + (tenpaiSeats.map(s => 'seat' + s + '(' + this.players[s].name + ')').join(' ') || '无人')
      + ' 不听：' + (notenSeats.map(s => 'seat' + s + '(' + this.players[s].name + ')').join(' ') || '无人')
      + ' 支付：' + delta.map((d, i) => 'seat' + i + (d >= 0 ? '+' : '') + d).join(' ')
      + ' 分数：' + this.players.map((p, i) => 'seat' + i + '=' + p.score).join(' '));
    this.lastResult = {
      type: 'draw', tenpaiSeats: tenpaiSeats.slice(), notenSeats: notenSeats.slice(),
      delta, scores: this.players.map(p => p.score),
    };
    this._evt({ t: 'ryuukyoku', tenpai: tenpaiSeats.slice(), noten: notenSeats.slice(), delta: delta.slice() });
    this._endRound({ draw: true, dealerWon: false, dealerTenpai: tenpaiSeats.indexOf(this.dealer) >= 0 });
  }

  _endRound(res) {
    this._dbg('本局结束：' + (res.draw ? '流局' : '和牌')
      + ' 庄家' + (res.draw ? (res.dealerTenpai ? '听牌(连庄)' : '不听(落庄)') : (res.dealerWon ? '和牌(连庄)' : '落庄')));
    this.phase = 'round-end';
    this._update();
    const roundsTotal = this.cfg.mode === 'east' ? 4 : 8;
    const nextDealer = () => (this.cheat.flags && this.cheat.flags.alwaysDealer)
      ? this.humanSeat : (this.dealer + 1) % 4;
    let over = false;
    if (res.draw) {
      if (res.dealerTenpai) this.honba++;
      else {
        over = this.roundNo + 1 >= roundsTotal;
        this.honba = 0;
        if (!over) { this.roundNo++; this.dealer = nextDealer(); }
      }
    } else if (res.dealerWon) this.honba++;
    else {
      over = this.roundNo + 1 >= roundsTotal;
      this.honba = 0;
      if (!over) { this.roundNo++; this.dealer = nextDealer(); }
    }
    const maxScore = Math.max(...this.players.map(p => p.score));
    if (over || maxScore >= 30000) {
      this.phase = 'gameover';
      if (this.riichiSticks > 0) {
        this._evt({ t: 'gameover', returns: this.riichiOwners.slice() });
        for (const s of this.riichiOwners) this.players[s].score += 1000;
        this.riichiSticks = 0;
        this.riichiOwners = [];
      }
      this.lastResult.gameover = true;
      this._dbg('比赛结束 最终分数：' + this.players.map((p, i) => 'seat' + i + '(' + p.name + ')=' + p.score).join(' '));
      this._update();
      return;
    }
    if (this.cfg.allAI) this._schedule(() => this.continueRound(), this.speed * 2);
  }

  /* ---------- 查询 ---------- */
  canRiichi(seat) {
    const p = this.players[seat];
    if (p.riichi || p.score < 1000) return false;
    if (p.melds.some(m => m.open)) return false;
    const c = counts(p.concealed);
    for (let t = 0; t < 34; t++) if (c[t] > 0) {
      const c2 = c.slice(); c2[t]--;
      if (waitsFor(tilesFromCounts(c2), p.melds.length).length) return true;
    }
    return false;
  }
  tenpaiDiscards(seat) {
    const p = this.players[seat];
    const c = counts(p.concealed);
    const out = [];
    for (let t = 0; t < 34; t++) if (c[t] > 0) {
      const c2 = c.slice(); c2[t]--;
      if (waitsFor(tilesFromCounts(c2), p.melds.length).length) out.push(t);
    }
    return out;
  }
  humanHint() {
    const seat = this.humanSeat;
    if (seat < 0) return null;
    const p = this.players[seat];
    const c = counts(p.concealed);
    let best = 99, discards = [];
    for (let t = 0; t < 34; t++) if (c[t] > 0) {
      const c2 = c.slice(); c2[t]--;
      const s = shanten(c2, p.melds.length);
      if (s < best) { best = s; discards = [t]; }
      else if (s === best) discards.push(t);
    }
    let waits = null;
    if (best === 0 && discards.length) {
      const c2 = c.slice(); c2[discards[0]]--;
      waits = waitsFor(tilesFromCounts(c2), p.melds.length);
    }
    return { shanten: best, discards, waits };
  }

  /* ---------- 玩家操作 ---------- */
  humanDiscard(tile) {
    const seat = this.humanSeat;
    if (seat < 0 || this.cfg.allAI || this.turn !== seat) return;
    const p = this.players[seat];
    if (this.phase === 'draw' || this.phase === 'discard-required') {
      if (p.riichi && tile !== this.drawnTile) return;
      if (!p.concealed.includes(tile)) return;
      this._applyDiscard(seat, tile, { riichi: false, fromDraw: tile === this.drawnTile });
    }
  }
  humanRiichiDiscard(tile) {
    const seat = this.humanSeat;
    if (seat < 0 || this.phase !== 'riichi-select' || this.turn !== seat) return;
    if (!this.tenpaiDiscards(seat).includes(family(tile))) return;
    const p = this.players[seat];
    p.riichi = true; p.ippatsu = true; p.riichiTurnCount = this.turnCount;
    this.riichiSticks++; this.riichiOwners.push(seat); p.score -= 1000;
    this._log(p.name + ' 立直！');
    this._applyDiscard(seat, tile, { riichi: true, fromDraw: tile === this.drawnTile });
  }
  humanRiichi() {
    const seat = this.humanSeat;
    if (seat < 0 || !this.canRiichi(seat)) return;
    this.phase = 'riichi-select';
    this._update();
  }
  humanTsumo() {
    const seat = this.humanSeat;
    if (seat < 0 || !this.canWinNow(seat, true)) return;
    this._tsumo(seat);
  }
  humanKan(kan) {
    const seat = this.humanSeat;
    if (seat < 0) return;
    const opts = this.kanOptions(seat);
    if (!opts.some(k => k.type === kan.type && k.tile === kan.tile)) return;
    this._doKan(seat, kan);
  }
  humanClaim(type) {
    const me = this.humanSeat;
    if (me < 0 || !this.pending) return;
    const { claims } = this.pending;
    if (type === 'ron') {
      if (!claims.rons.includes(me)) return;
      const winners = [me].concat(claims.rons.filter(s => s !== me));
      this._ron(winners, claims.tile, claims.from);
    } else if (type === 'pon') {
      if (!claims.pons.includes(me)) return;
      this._pon(me, claims.tile, claims.from);
    } else if (type === 'kan') {
      if (!(claims.kans || []).includes(me)) return;
      this._minkan(me, claims.tile, claims.from);
    } else if (type === 'chi') {
      if (claims.chiSeat !== me) return;
      const best = this._bestChiCombo(me, claims.tile);
      if (best) this._chi(me, claims.tile, claims.from, best);
    } else if (type === 'pass') {
      if (this.pending.step === 'ron') {
        if (claims.rons.includes(me)) {
          const p = this.players[me];
          if (p.riichi) p.riichiFuriten = true; else p.furitenTmp = true;
        }
        claims.rons = claims.rons.filter(s => s !== me);
      }
      else if (this.pending.step === 'pon') {
        claims.pons = claims.pons.filter(s => s !== me);
        claims.kans = (claims.kans || []).filter(s => s !== me);
      }
      else if (this.pending.step === 'chi') claims.chiSeat = null;
      this._claimStep();
    }
  }
  /* 按指定组合吃牌（吃牌预览面板点击） */
  humanChiCombo(combo) {
    const me = this.humanSeat;
    if (me < 0 || !this.pending) return;
    const { claims } = this.pending;
    if (claims.chiSeat !== me || this.pending.step !== 'chi') return;
    if (!Array.isArray(combo) || combo.length !== 2) return;
    const valid = this._chiCombos(me, claims.tile)
      .some(cb => cb[0] === combo[0] && cb[1] === combo[1]);
    if (!valid) return;
    this._chi(me, claims.tile, claims.from, combo);
  }

  /* ---------- 牌谱：序列化 / 恢复 ---------- */
  /* 轻量快照（外挂「时光倒流」用，只含可逆状态） */
  takeSnapshot() { return this.serialize().snapshot; }
  applySnapshot(snap) {
    const g = Game.restore({ snapshot: snap });
    this.players = g.players;
    this.wall = g.wall; this.dead = g.dead; this.doraInds = g.doraInds;
    this.roundNo = g.roundNo; this.honba = g.honba; this.dealer = g.dealer;
    this.phase = g.phase; this.turn = g.turn; this.drawnTile = g.drawnTile;
    this.lastTile = g.lastTile; this.houtei = g.houtei; this.rinshan = g.rinshan;
    this.turnCount = g.turnCount; this.pending = g.pending;
    this.riichiSticks = g.riichiSticks; this.riichiOwners = g.riichiOwners;
    this.meldCount = g.meldCount; this.tenhouFlag = g.tenhouFlag; this.chiihouFlag = g.chiihouFlag;
  }
  cheatUndo() {
    if (!this.snapshots.length) return false;
    this.applySnapshot(this.snapshots.pop());
    return true;
  }

  serialize() {
    const clone = o => JSON.parse(JSON.stringify(o));
    const snap = {
      cfg: { mode: this.cfg.mode, allAI: this.cfg.allAI, speed: this.cfg.speed, humanSeat: this.cfg.humanSeat, difficulty: this.cfg.difficulty },
      humanSeat: this.humanSeat,
      speed: this.speed,
      players: this.players.map(p => ({
        name: p.name, isHuman: p.isHuman,
        concealed: p.concealed.slice(),
        melds: p.melds.map(m => ({ type: m.type, tiles: m.tiles.slice(), open: m.open, from: m.from })),
        discards: p.discards.slice(), tsumogiri: p.tsumogiri.slice(),
        riichi: p.riichi, riichiTile: p.riichiTile, ippatsu: p.ippatsu, riichiTurnCount: p.riichiTurnCount,
        lastDrawn: p.lastDrawn, furitenTmp: p.furitenTmp, riichiFuriten: p.riichiFuriten, drawnCount: p.drawnCount,
        score: p.score, seatWind: p.seatWind, delta: p.delta,
      })),
      roundNo: this.roundNo, honba: this.honba, riichiSticks: this.riichiSticks, riichiOwners: this.riichiOwners.slice(),
      dealer: this.dealer, phase: this.phase, turn: this.turn, drawnTile: this.drawnTile,
      wall: this.wall.slice(), dead: this.dead.slice(), doraInds: this.doraInds.slice(),
      lastTile: this.lastTile, houtei: this.houtei, rinshan: this.rinshan, turnCount: this.turnCount,
      pending: this.pending ? clone(this.pending) : null,
      meldCount: this.meldCount, tenhouFlag: this.tenhouFlag, chiihouFlag: this.chiihouFlag,
    };
    return {
      version: 1, type: 'mahjong-paifu',
      exportedAt: new Date().toISOString(),
      snapshot: snap,
      events: clone(this.events),
      debugLog: this.debugLog.slice(),
    };
  }

  static restore(paifu) {
    const snap = paifu.snapshot || paifu;
    const g = new Game(snap.cfg);
    g.humanSeat = snap.humanSeat;
    g.speed = snap.speed;
    g.players = snap.players.map(p => ({
      name: p.name, isHuman: p.isHuman,
      concealed: p.concealed.slice(),
      melds: p.melds.map(m => ({ type: m.type, tiles: m.tiles.slice(), open: m.open, from: m.from })),
      discards: p.discards.slice(), tsumogiri: p.tsumogiri.slice(),
      riichi: p.riichi, riichiTile: p.riichiTile, ippatsu: p.ippatsu, riichiTurnCount: p.riichiTurnCount,
      lastDrawn: p.lastDrawn, furitenTmp: p.furitenTmp, riichiFuriten: p.riichiFuriten, drawnCount: p.drawnCount,
      score: p.score, seatWind: p.seatWind, delta: p.delta,
    }));
    g.roundNo = snap.roundNo; g.honba = snap.honba; g.riichiSticks = snap.riichiSticks; g.riichiOwners = (snap.riichiOwners || []).slice();
    g.dealer = snap.dealer; g.phase = snap.phase; g.turn = snap.turn; g.drawnTile = snap.drawnTile;
    g.wall = snap.wall.slice(); g.dead = snap.dead.slice(); g.doraInds = snap.doraInds.slice();
    g.lastTile = snap.lastTile; g.houtei = snap.houtei; g.rinshan = snap.rinshan; g.turnCount = snap.turnCount;
    g.pending = snap.pending ? JSON.parse(JSON.stringify(snap.pending)) : null;
    g.meldCount = snap.meldCount || 0; g.tenhouFlag = snap.tenhouFlag; g.chiihouFlag = snap.chiihouFlag;
    g.events = (paifu.events || []).slice();
    g.debugLog = (paifu.debugLog || []).slice();
    g.stopped = false;
    return g;
  }
}
