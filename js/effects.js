'use strict';
/* ============ 胡牌特效层 ============
 * 全屏 overlay：自摸/荣和标题 + 满贯分级 + 粒子爆发 + 役满震动，点击跳过。
 * 与结算弹窗解耦（overlay 盖在弹窗之上，跳过后看到结算）。
 */
const LIMIT_COLORS = {
  '满贯': '#ffd88e',
  '跳满': '#7cb8ff',
  '倍满': '#c89bff',
  '三倍满': '#ff9d6b',
};

const Effects = {
  els: {},
  raf: null,
  timer: null,
  particles: [],
  playing: false,
  supportsCanvas: (function () {
    try {
      if (typeof document === 'undefined' || !document.createElement) return false;
      const c = document.createElement('canvas');
      return !!(c && c.getContext && c.getContext('2d'));
    } catch (e) { return false; }
  })(),

  init() {
    const g = id => document.getElementById(id);
    this.els.fx = g('fx');
    this.els.canvas = g('fx-canvas');
    this.els.title = g('fx-title');
    this.els.limit = g('fx-limit');
    this.els.sub = g('fx-sub');
    if (!this.els.fx) return;
    this.els.fx.addEventListener('click', () => this.hide());
    this.els.fx.addEventListener('touchend', () => this.hide());
  },

  limitColor(limit) {
    if (!limit) return '#ffd88e';
    if (limit.indexOf('役满') >= 0) {
      const k = parseInt(limit) || 1;
      return k >= 4 ? '#ff1f1f' : k === 3 ? '#ff4d3b' : k === 2 ? '#ff5a5a' : '#ffd700';
    }
    return LIMIT_COLORS[limit] || '#ffd88e';
  },

  /* 由 UI 在结算时调用 */
  playResult(result) {
    if (!this.els.fx) return;
    if (result.type === 'ron' || result.type === 'tsumo') {
      const info = result.infos && result.infos[0];
      const limit = info && info.limit;
      this.showWin(result.type === 'tsumo' ? '自摸' : '荣和', limit || '');
    } else if (result.type === 'draw') {
      this.showDraw();
    }
  },

  showWin(title, limit) {
    const isYakuman = limit.indexOf('役满') >= 0;
    this.els.title.textContent = title;
    this.els.limit.textContent = limit;
    this.els.limit.style.color = this.limitColor(limit);
    this.els.sub.textContent = isYakuman ? '役满达成！' : '';
    this.els.fx.classList.remove('hidden');
    this.els.fx.classList.toggle('fx-yakuman', isYakuman);
    this.els.title.classList.remove('fx-title-in', 'fx-yakuman-title');
    void this.els.title.offsetWidth;
    this.els.title.classList.add('fx-title-in');
    if (isYakuman) this.els.title.classList.add('fx-yakuman-title');
    this.playing = true;
    if (this.supportsCanvas) this.spawnParticles(this.limitColor(limit), isYakuman ? 320 : 150);
    this.autoHide(isYakuman ? 2800 : 2100);
  },

  showDraw() {
    this.els.title.textContent = '流局';
    this.els.limit.textContent = '';
    this.els.sub.textContent = '';
    this.els.fx.classList.remove('hidden');
    this.els.fx.classList.remove('fx-yakuman');
    this.els.title.classList.remove('fx-title-in', 'fx-yakuman-title');
    void this.els.title.offsetWidth;
    this.els.title.classList.add('fx-title-in');
    this.playing = true;
    if (this.supportsCanvas) this.spawnParticles('#9db3c6', 60);
    this.autoHide(1500);
  },

  spawnParticles(color, count) {
    const canvas = this.els.canvas;
    const w = canvas.width = window.innerWidth || 800;
    const h = canvas.height = window.innerHeight || 600;
    const ctx = canvas.getContext('2d');
    const ps = [];
    for (let i = 0; i < count; i++) {
      ps.push({
        x: w * (0.35 + Math.random() * 0.3),
        y: h * (0.3 + Math.random() * 0.25),
        vx: (Math.random() - 0.5) * 9,
        vy: (Math.random() - 0.5) * 9 - 1.2,
        r: Math.random() * 3.5 + 1,
        life: 1,
        decay: Math.random() * 0.016 + 0.008,
      });
    }
    this.particles = ps;
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.raf);
    const step = () => {
      ctx.clearRect(0, 0, w, h);
      let alive = false;
      for (const p of this.particles) {
        p.x += p.vx; p.y += p.vy; p.life -= p.decay; p.vy += 0.03;
        if (p.life <= 0) continue;
        alive = true;
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (alive && this.playing) this.raf = requestAnimationFrame(step);
      else ctx.clearRect(0, 0, w, h);
    };
    this.raf = requestAnimationFrame(step);
  },

  autoHide(ms) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.hide(), ms);
  },

  hide() {
    clearTimeout(this.timer);
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.raf);
    this.playing = false;
    this.particles = [];
    if (this.els.fx) this.els.fx.classList.add('hidden');
    if (this.els.canvas && this.els.canvas.getContext) {
      const ctx = this.els.canvas.getContext('2d');
      ctx.clearRect(0, 0, this.els.canvas.width, this.els.canvas.height);
    }
  },
};
