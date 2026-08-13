'use strict';
/* ============ 牌谱导入导出 + 回放播放器 ============ */
const Paifu = {
  validate(p) {
    return !!(p && p.type === 'mahjong-paifu' && p.version === 1 && p.snapshot && Array.isArray(p.snapshot.players));
  },
};

/* 回放播放器：按结构化事件重建对局状态（四家明牌） */
class ReplayPlayer {
  constructor(paifu) {
    this.paifu = paifu;
    this.names = paifu.snapshot.players.map(p => p.name);
    this.reset();
  }
  reset() {
    this.idx = -1;
    this.players = null;
    this.doraInds = [];
    this.turn = -1;
    this.drawnTile = null;
    this.roundNo = 0; this.honba = 0; this.dealer = 0;
    this.lastResult = null;
    this.gameover = false;
    this.desc = '已就绪';
  }
  get total() { return this.paifu.events.length; }
  get atEnd() { return this.idx >= this.total - 1; }
  step() {
    if (this.idx >= this.total - 1) return false;
    this.idx++;
    this.apply(this.paifu.events[this.idx]);
    return true;
  }
  prev() {
    if (this.idx < 0) return false;
    const target = this.idx - 1;
    this.reset();
    for (let k = 0; k <= target; k++) this.apply(this.paifu.events[k]);
    this.idx = target;
    return true;
  }
  goto(i) {
    const n = Math.max(-1, Math.min(i, this.total - 1));
    this.reset();
    for (let k = 0; k <= n; k++) this.apply(this.paifu.events[k]);
    this.idx = n;
  }
  apply(e) {
    switch (e.t) {
      case 'round': {
        this.roundNo = e.roundNo; this.honba = e.honba; this.dealer = e.dealer;
        const wall = e.wall.slice(0, 122), dead = e.wall.slice(122);
        this.doraInds = [dead[0]];
        const prevScores = this.players ? this.players.map(p => p.score) : [25000, 25000, 25000, 25000];
        this.players = [0, 1, 2, 3].map(i => ({
          name: this.names[i], concealed: [], melds: [], discards: [], tsumogiri: [],
          riichi: false, riichiTile: null, score: prevScores[i], seatWind: (i - e.dealer + 4) % 4,
        }));
        for (let r = 0; r < 3; r++) for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) this.players[i].concealed.push(wall.shift());
        for (let i = 0; i < 4; i++) this.players[i].concealed.push(wall.shift());
        for (const p of this.players) p.concealed.sort(tileCompare);
        this.wall = wall; this.dead = dead;
        this.turn = e.dealer; this.lastResult = null;
        this.desc = '东/南' + (this.roundNo < 4 ? '东' : '南') + (this.roundNo % 4 + 1) + '局 开始（庄家 ' + this.names[e.dealer] + '）';
        break;
      }
      case 'draw': {
        const p = this.players[e.seat];
        p.concealed.push(e.tile); p.concealed.sort(tileCompare);
        this.drawnTile = e.tile; this.turn = e.seat;
        if (e.rinshan) this.dead.pop(); else this.wall.shift();
        this.desc = this.names[e.seat] + ' 摸牌' + (e.rinshan ? '（岭上）' : '');
        break;
      }
      case 'discard': {
        const p = this.players[e.seat];
        const i = p.concealed.indexOf(e.tile);
        if (i >= 0) p.concealed.splice(i, 1);
        p.discards.push(e.tile);
        p.tsumogiri.push(!!e.tsumo);
        if (e.riichi) { p.riichi = true; p.riichiTile = e.tile; p.score -= 1000; }
        this.drawnTile = null;
        this.desc = this.names[e.seat] + ' 打出 ' + tileName(e.tile) + (e.riichi ? '（立直）' : '');
        break;
      }
      case 'pon': {
        const p = this.players[e.seat];
        const a = pickTile(p.concealed, family(e.tile));
        const b = pickTile(p.concealed, family(e.tile));
        removeTilesByFamily(p.concealed, family(e.tile), 2);
        p.melds.push({ type: 'pon', tiles: [e.tile, a, b].sort(tileCompare), open: true, from: e.from });
        this.turn = e.seat;
        this.desc = this.names[e.seat] + ' 碰 ' + tileName(e.tile);
        break;
      }
      case 'chi': {
        const p = this.players[e.seat];
        const a = pickTile(p.concealed, family(e.combo[0]));
        const b = pickTile(p.concealed, family(e.combo[1]));
        removeTilesByFamily(p.concealed, family(e.combo[0]), 1);
        removeTilesByFamily(p.concealed, family(e.combo[1]), 1);
        p.melds.push({ type: 'chi', tiles: [e.tile, a, b].sort(tileCompare), open: true, from: e.from });
        this.turn = e.seat;
        this.desc = this.names[e.seat] + ' 吃 ' + tileName(e.tile);
        break;
      }
      case 'kan': {
        const p = this.players[e.seat];
        if (e.type === 'ankan') {
          const actual = [];
          let rem = 4;
          for (let i = p.concealed.length - 1; i >= 0 && rem > 0; i--) {
            if (family(p.concealed[i]) === family(e.tile)) { actual.push(p.concealed[i]); p.concealed.splice(i, 1); rem--; }
          }
          p.melds.push({ type: 'kan', tiles: actual.sort(tileCompare), open: false, from: -1 });
        } else {
          const m = p.melds.find(mm => mm.type === 'pon' && family(mm.tiles[0]) === family(e.tile));
          if (m) { const x = pickTile(p.concealed, family(e.tile)); if (x >= 0) { m.type = 'kan'; m.tiles.push(x); const i = p.concealed.indexOf(x); if (i >= 0) p.concealed.splice(i, 1); } }
        }
        this.doraInds.push(this.dead[this.doraInds.length]);
        this.desc = this.names[e.seat] + (e.type === 'ankan' ? ' 暗杠 ' : ' 加杠 ') + tileName(e.tile);
        break;
      }
      case 'win': {
        e.delta.forEach((d, i) => { this.players[i].score += d; });
        this.lastResult = { type: e.type, tile: e.tile, infos: e.infos, delta: e.delta, seats: e.seats };
        this.desc = e.seats.map(s => this.names[s]).join('、') + (e.type === 'tsumo' ? ' 自摸' : ' 荣和');
        break;
      }
      case 'ryuukyoku': {
        e.delta.forEach((d, i) => { this.players[i].score += d; });
        this.lastResult = { type: 'draw', tenpai: e.tenpai, noten: e.noten, delta: e.delta };
        this.desc = '流局';
        break;
      }
      case 'gameover': {
        (e.returns || []).forEach(s => { this.players[s].score += 1000; });
        this.gameover = true;
        break;
      }
    }
  }
}
