'use strict';
/* ============ VR 3D 牌桌（WebXR / Pico 优先） ============
 * 依赖本地 three.min.js（r128 UMD）。与 2D 共用同一 Game 实例，渲染解耦。
 * 无头显 / 不支持 WebXR 时自动保持 2D 模式。
 */
const VR = {
  supported: false,
  active: false,
  ready: false,
  renderer: null, scene: null, camera: null, session: null,
  root: null,
  handGroup: null, discardsGroup: null, centerGroup: null, buttonsGroup: null,
  controllers: [],
  textures: {},
  raycaster: null,
  interactables: [],
  hovered: null,
  nameplates: {},

  detect() {
    if (typeof navigator === 'undefined' || !navigator.xr || typeof THREE === 'undefined') return false;
    this.supported = true;
    return true;
  },

  async supportedAsync() {
    if (!this.detect()) return false;
    try {
      return await navigator.xr.isSessionSupported('immersive-vr');
    } catch (e) { return false; }
  },

  async enter() {
    if (this.active || typeof THREE === 'undefined') return;
    try {
      this.session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] });
    } catch (e) {
      alert('无法进入 VR 会话：' + e.message);
      return;
    }
    this.initRenderer();
    this.active = true;
    this.hide2D();
    this.session.addEventListener('end', () => this.exit());
  },

  initRenderer() {
    const renderer = this.renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(1);
    renderer.xr.enabled = true;
    document.body.appendChild(renderer.domElement);
    this.session.updateRenderState({ baseLayer: new XRWebGLLayer(this.session, renderer.gl) });

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a1729);
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 50);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1.0));
    const dir = new THREE.DirectionalLight(0xffffff, 1.0);
    dir.position.set(0, 3, 2);
    this.scene.add(dir);

    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.handGroup = new THREE.Group();
    this.discardsGroup = new THREE.Group();
    this.centerGroup = new THREE.Group();
    this.buttonsGroup = new THREE.Group();
    this.root.add(this.handGroup, this.discardsGroup, this.centerGroup, this.buttonsGroup);
    this.buildTable();

    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 20;

    for (let i = 0; i < 2; i++) {
      const ctrl = renderer.xr.getController(i);
      const line = this.makeRayLine();
      ctrl.add(line);
      ctrl.userData.line = line;
      ctrl.addEventListener('selectstart', e => this.onSelect(e.target));
      ctrl.addEventListener('selectend', () => {});
      this.scene.add(ctrl);
      this.controllers.push(ctrl);
    }

    const self = this;
    renderer.setAnimationLoop(() => {
      this.updateRays();
      renderer.render(this.scene, this.camera);
    });
  },

  makeRayLine() {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1),
    ]);
    return new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x66aaff }));
  },

  buildTable() {
    const wood = new THREE.MeshStandardMaterial({ color: 0x5a3a1e, roughness: .8 });
    const felt = new THREE.MeshStandardMaterial({ color: 0x0e4a3d, roughness: .9 });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 1.6), wood);
    frame.position.y = -0.04;
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.02, 1.5), felt);
    top.position.y = 0.01;
    this.root.add(frame, top);
  },

  tileTexture(tile) {
    const key = TILE_IMG[tile];
    if (!key) return null;
    if (!this.textures[key]) {
      this.textures[key] = new THREE.TextureLoader().load('img/' + key + '.png');
    }
    return this.textures[key];
  },

  makeTile(tile, scale) {
    const s = scale || 0.045;
    const tex = this.tileTexture(tile);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: .6 });
    const sideMat = new THREE.MeshStandardMaterial({ color: 0xf5f0de });
    const mats = [sideMat, sideMat, sideMat, sideMat, mat, sideMat];
    const m = new THREE.Mesh(new THREE.BoxGeometry(s, s * 1.33, s * 0.4), mats);
    return m;
  },

  makeText(text, color) {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 64;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = color || '#ffffff';
    ctx.font = 'bold 40px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, 128, 46);
    const tex = new THREE.CanvasTexture(cv);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
    return new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.15), mat);
  },

  clearGroup(g) {
    while (g.children.length) {
      const c = g.children.pop();
      if (c.geometry) c.geometry.dispose();
      if (c.material) {
        const mats = Array.isArray(c.material) ? c.material : [c.material];
        mats.forEach(m => m.map && m.map.dispose && m.map.dispose());
        mats.forEach(m => m.dispose && m.dispose());
      }
    }
  },

  /* 从当前对局重建 3D 场景 */
  sync(game) {
    if (!this.active || !this.root) return;
    this.clearGroup(this.handGroup);
    this.clearGroup(this.discardsGroup);
    this.clearGroup(this.centerGroup);
    this.clearGroup(this.buttonsGroup);
    this.interactables = [];

    /* 自己的手牌（南家，位于 z 正前方） */
    const me = game.players[1];
    const hand = me.concealed.slice().sort(tileCompare);
    hand.forEach((t, i) => {
      const tile = this.makeTile(t);
      tile.position.set((i - hand.length / 2) * 0.05, 0.02, 0.55);
      tile.rotation.x = -0.35;
      tile.userData = { kind: 'tile', tile: t };
      this.handGroup.add(tile);
      this.interactables.push(tile);
    });

    /* 三家牌背 / 副露 / 牌河 */
    const positions = [
      { seat: 3, x: 0, z: -0.7, rotY: 0 },
      { seat: 0, x: 0.72, z: 0, rotY: -Math.PI / 2 },
      { seat: 2, x: -0.72, z: 0, rotY: Math.PI / 2 },
    ];
    for (const pos of positions) {
      const p = game.players[pos.seat];
      const backs = new THREE.Group();
      for (let i = 0; i < p.concealed.length; i++) {
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.02),
          new THREE.MeshStandardMaterial({ color: 0x1a5a8a, roughness: .7 }));
        back.position.set((i - p.concealed.length / 2) * 0.045, 0.03, 0);
        backs.add(back);
      }
      backs.position.set(pos.x, 0, pos.z);
      backs.rotation.y = pos.rotY;
      this.discardsGroup.add(backs);

      const disc = new THREE.Group();
      p.discards.forEach((t, i) => {
        const tile = this.makeTile(t, 0.04);
        tile.position.set((i % 6) * 0.045, 0.03 + Math.floor(i / 6) * 0.05, 0);
        disc.add(tile);
      });
      disc.position.set(pos.x, 0, pos.z * 0.6);
      disc.rotation.y = pos.rotY;
      this.discardsGroup.add(disc);
    }

    /* 中央信息：宝牌指示 + 场风 */
    game.doraInds.forEach((ind, i) => {
      const tile = this.makeTile(ind, 0.04);
      tile.position.set((i - game.doraInds.length / 2) * 0.05, 0.03, -0.2);
      this.centerGroup.add(tile);
    });
    const label = this.makeText(game.roundName() + (game.honba ? ' ' + game.honba + '本场' : '') + ' · 残' + game.wall.length, '#ffd88e');
    label.position.set(0, 0.02, -0.05);
    this.centerGroup.add(label);

    /* 操作按钮 */
    this.buildButtons(game);
  },

  buildButtons(game) {
    const opts = this.humanOptions(game);
    const buttons = [];
    if (opts.tsumo) buttons.push(['和', () => game.humanTsumo(), '#ff6f5e']);
    if (opts.ron) buttons.push(['胡', () => game.humanClaim('ron'), '#ff6f5e']);
    if (opts.pon) buttons.push(['碰', () => game.humanClaim('pon'), '#5aa7ff']);
    if (opts.chi) buttons.push(['吃', () => game.humanClaim('chi'), '#5aa7ff']);
    if (opts.riichi) buttons.push(['立直', () => game.humanRiichi(), '#e05550']);
    opts.kans.forEach(k => buttons.push([(k.type === 'ankan' ? '暗杠' : '加杠') + tileName(k.tile), () => game.humanKan(k), '#5aa7ff']));
    if (opts.canPass) buttons.push(['过', () => game.humanClaim('pass'), '#5b7078']);
    buttons.forEach((b, i) => {
      const mesh = this.makeText(b[0], '#ffffff');
      mesh.scale.set(1.2, 1.2, 1.2);
      mesh.position.set((i - buttons.length / 2) * 0.22, 0.18, 0.45);
      mesh.userData = { kind: 'button', fn: b[1] };
      this.buttonsGroup.add(mesh);
      this.interactables.push(mesh);
    });
  },

  humanOptions(game) {
    const seat = game.humanSeat;
    if (seat < 0 || game.cfg.allAI) return { tsumo: false, ron: false, pon: false, chi: false, riichi: false, kans: [], canPass: false };
    const g = game;
    const o = { tsumo: false, ron: false, pon: false, chi: false, riichi: false, kans: [], canPass: false };
    if (g.phase === 'claims' && g.pending) {
      const { claims, step } = g.pending;
      if (step === 'ron' && claims.rons.indexOf(seat) >= 0) o.ron = true;
      if (step === 'pon' && claims.pons.indexOf(seat) >= 0) o.pon = true;
      if (step === 'chi' && claims.chiSeat === seat) o.chi = true;
      if (o.ron || o.pon || o.chi) o.canPass = true;
    }
    if (g.turn === seat && g.phase === 'draw') {
      if (g.canWinNow(seat, true)) o.tsumo = true;
      if (g.canRiichi(seat)) o.riichi = true;
      o.kans = g.kanOptions(seat);
    }
    return o;
  },

  updateRays() {
    if (!this.active || !this.camera) return;
    const pos = this._tmpPos || (this._tmpPos = new THREE.Vector3());
    const dir = this._tmpDir || (this._tmpDir = new THREE.Vector3());
    for (const ctrl of this.controllers) {
      ctrl.getWorldPosition(pos);
      ctrl.getWorldDirection(dir);
      const line = ctrl.userData.line;
      if (line) {
        const pts = [pos.clone(), pos.clone().add(dir.clone().multiplyScalar(10))];
        line.geometry.dispose();
        line.geometry = new THREE.BufferGeometry().setFromPoints(pts);
      }
    }
  },

  onSelect(ctrl) {
    if (!this.raycaster) return;
    const pos = this._tmpPos || (this._tmpPos = new THREE.Vector3());
    const dir = this._tmpDir || (this._tmpDir = new THREE.Vector3());
    ctrl.getWorldPosition(pos);
    ctrl.getWorldDirection(dir);
    this.raycaster.set(pos, dir);
    const hits = this.raycaster.intersectObjects(this.interactables, true);
    if (!hits.length) return;
    let obj = hits[0].object;
    while (obj && !obj.userData.kind) obj = obj.parent;
    if (!obj) return;
    const ud = obj.userData;
    if (ud.kind === 'tile') {
      const g = window.UI && UI.game;
      if (g) g.humanDiscard(ud.tile);
    } else if (ud.kind === 'button') {
      ud.fn();
    }
  },

  hide2D() {
    const el = document.querySelector('main.stage');
    if (el) el.style.display = 'none';
  },
  show2D() {
    const el = document.querySelector('main.stage');
    if (el) el.style.display = '';
  },

  exit() {
    this.active = false;
    this.show2D();
    if (this.renderer) {
      this.renderer.setAnimationLoop(null);
      if (this.renderer.domElement && this.renderer.domElement.parentNode) {
        this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
      }
    }
    this.renderer = null; this.scene = null; this.root = null; this.session = null;
    this.interactables = [];
    this.textures = {};
  },
};
