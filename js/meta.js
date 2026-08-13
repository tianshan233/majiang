'use strict';
/* ============ 段位 / 战绩 / 成就 ============ */
const RANKS = [
  { name: '初心', min: 0 },
  { name: '雀士', min: 100 },
  { name: '雀杰', min: 300 },
  { name: '雀豪', min: 600 },
  { name: '雀圣', min: 1000 },
  { name: '魂天', min: 1500 },
];
const PLACE_PTS = [30, 10, -10, -30]; /* 一位/二位/三位/四位 */

const ACHIEVEMENTS = [
  { id: 'first_game', name: '初出茅庐', desc: '完成第一场对局' },
  { id: 'first_win', name: '首次和牌', desc: '第一次和牌' },
  { id: 'first_riichi', name: '首次立直', desc: '第一次立直' },
  { id: 'first_yakuman', name: '役满达成', desc: '第一次和出役满' },
  { id: 'kokushi', name: '国士无双', desc: '和出「国士无双」' },
  { id: 'games_10', name: '渐入佳境', desc: '累计完成 10 场对局' },
  { id: 'top_10', name: '常胜将军', desc: '累计 10 次一位' },
];

const Meta = {
  data: null,

  load() {
    try {
      this.data = JSON.parse(localStorage.getItem('mahjong-meta') || 'null');
    } catch (e) { this.data = null; }
    if (!this.data || typeof this.data !== 'object') {
      this.data = { rankPoints: 0, games: 0, wins: 0, riichis: 0, yakuman: 0, places: [0, 0, 0, 0], yakuSet: {}, achievements: {} };
    }
    this.data.places = this.data.places || [0, 0, 0, 0];
    this.data.yakuSet = this.data.yakuSet || {};
    this.data.achievements = this.data.achievements || {};
  },
  save() {
    try { localStorage.setItem('mahjong-meta', JSON.stringify(this.data)); } catch (e) { /* 忽略 */ }
  },

  rankIndex() {
    let idx = 0;
    for (let i = 0; i < RANKS.length; i++) if (this.data.rankPoints >= RANKS[i].min) idx = i;
    return idx;
  },
  rankName() { return RANKS[this.rankIndex()].name; },
  nextRank() {
    const i = this.rankIndex();
    return i + 1 < RANKS.length ? RANKS[i + 1] : null;
  },

  /* 对局结束后记录（仅人机对战，以人类玩家视角统计） */
  recordGame(game) {
    if (game.humanSeat < 0) return; /* AI 观战不计入战绩 */
    this.load();
    const seat = game.humanSeat;
    const d = this.data;
    d.games++;

    /* 顺位 */
    const order = [0, 1, 2, 3].sort((a, b) => game.players[b].score - game.players[a].score);
    const place = order.indexOf(seat);
    d.places[place]++;
    const ptn = Math.round((game.players[seat].score - 25000) / 1000);
    d.rankPoints += PLACE_PTS[place] + ptn;

    /* 统计（从结构化事件提取） */
    const evs = game.events || [];
    for (const e of evs) {
      if (e.t === 'discard' && e.riichi && e.seat === seat) d.riichis++;
      if (e.t === 'win' && e.seats.indexOf(seat) >= 0) {
        d.wins++;
        const infos = e.infos || [];
        for (const info of infos) {
          if (info.limit && info.limit.indexOf('役满') >= 0) d.yakuman++;
          for (const y of (info.yaku || [])) d.yakuSet[y.name] = true;
        }
      }
    }

    /* 成就 */
    const A = d.achievements;
    if (d.games >= 1) A.first_game = true;
    if (d.wins >= 1) A.first_win = true;
    if (d.riichis >= 1) A.first_riichi = true;
    if (d.yakuman >= 1) A.first_yakuman = true;
    if (d.yakuSet['国士无双'] || d.yakuSet['国士无双十三面']) A.kokushi = true;
    if (d.games >= 10) A.games_10 = true;
    if (d.places[0] >= 10) A.top_10 = true;

    this.save();
  },

  collectedYaku() {
    return Object.keys(this.data.yakuSet || {}).length;
  },
  achievements() {
    return ACHIEVEMENTS.filter(a => this.data.achievements[a.id]).length;
  },
};
