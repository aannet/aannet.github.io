// Couche d'input abstraite : le jeu ne lit que des actions (move, attack).
// Sources : tactile (stick virtuel + bouton), manette (Gamepad API), clavier.
const now = () => performance.now() / 1000;
const DEAD = 0.2;
const STICK_DEAD = 0.15; // zone morte du stick tactile (évite qu'un tremblement retourne John)

export class Input {
  constructor() {
    this.mode = 'touch';
    this.move = { x: 0, z: 0 };
    this.presses = []; // { action, t }
    this.down = {}; // action -> instant d'appui si maintenu (sources tactile, clavier, manette)
    this.keys = new Set();
    this.stick = { x: 0, z: 0, id: null, ox: 0, oy: 0 };
    this.gpPrev = {};
    this.onModeChange = null;
    this.onMenu = null;
    this.onPause = null;
    this.clock = now; // horloge du buffer : remplacée par le temps de jeu (le buffer suit hitstop et ralenti)
    this.last = {}; // action -> dernier appui (temps réel)
    this._bindKeyboard();
    this._bindTouch();
    window.addEventListener('gamepadconnected', () => this._setMode('gamepad'));
  }

  _setMode(m) {
    if (this.mode === m) return;
    this.mode = m;
    document.body.classList.toggle('no-touch', m !== 'touch');
    if (this.onModeChange) this.onModeChange(m);
  }

  press(action) {
    this.presses.push({ action, t: this.clock(), rt: now() });
    this.last[action] = now();
  }

  // Appui récent, sans le consommer (temps réel)
  pressedWithin(action, age) {
    return now() - (this.last[action] || -9) < age;
  }

  clear() {
    this.presses.length = 0;
    this.down = {};
  }

  hold(action, src, on) {
    const k = action + ':' + src;
    if (on) { if (!this.down[k]) this.down[k] = now(); } else delete this.down[k];
  }

  // Durée d'appui en cours (0 si relâché), toutes sources confondues
  heldFor(action) {
    let t0 = Infinity;
    for (const k in this.down) if (k.startsWith(action + ':')) t0 = Math.min(t0, this.down[k]);
    return t0 === Infinity ? 0 : now() - t0;
  }

  // Consomme la pression la plus récente de moins de maxAge secondes (buffer d'input).
  take(action, maxAge) {
    const t = this.clock();
    for (let i = this.presses.length - 1; i >= 0; i--) {
      const p = this.presses[i];
      if (p.action === action && t - p.t <= maxAge) {
        this.presses.splice(i, 1);
        return true;
      }
    }
    return false;
  }

  _bindKeyboard() {
    const atk = ['KeyJ', 'KeyX'];
    const jmp = ['Space'];
    const upr = ['KeyK', 'KeyI', 'KeyC'];
    const dge = ['KeyL', 'ShiftLeft', 'ShiftRight', 'KeyV'];
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this._setMode('keyboard');
      this.keys.add(e.code);
      if (atk.includes(e.code)) {
        this.press('attack');
        this.hold('attack', 'kb', true);
        e.preventDefault();
      }
      if (upr.includes(e.code)) this.press('upper');
      if (dge.includes(e.code)) this.press('dodge');
      if (jmp.includes(e.code)) { this.press('jump'); e.preventDefault(); }
      if (e.code === 'Backquote' || e.code === 'KeyG') this.onMenu && this.onMenu();
      if (e.code === 'KeyP' || e.code === 'Escape') this.onPause && this.onPause();
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (atk.includes(e.code) && !atk.some((c) => c !== e.code && this.keys.has(c))) this.hold('attack', 'kb', false);
    });
    window.addEventListener('blur', () => { this.keys.clear(); this.down = {}; });
  }

  _bindTouch() {
    const zone = document.getElementById('stick-zone');
    const pad = document.getElementById('dpad');
    const btn = document.getElementById('btn-attack');
    if (!zone) return;
    const arrows = { u: pad.querySelector('.u'), d: pad.querySelector('.d'), l: pad.querySelector('.l'), r: pad.querySelector('.r') };
    const R = 56;
    // croix fixe : la direction se lit par rapport à son centre, où que tombe le pouce dans la moitié gauche
    const read = (e) => {
      const b = pad.getBoundingClientRect();
      let dx = e.clientX - (b.left + b.width / 2), dy = e.clientY - (b.top + b.height / 2);
      const d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      const k = Math.min(1, d / R);
      const s = k < STICK_DEAD ? 0 : (k - STICK_DEAD) / (1 - STICK_DEAD) / (k || 1);
      this.stick.x = (dx / R) * s;
      this.stick.z = (dy / R) * s;
      this._arrows();
    };
    this._arrows = () => {
      const { x, z } = this.stick;
      arrows.l.classList.toggle('on', x < -0.35); arrows.r.classList.toggle('on', x > 0.35);
      arrows.u.classList.toggle('on', z < -0.35); arrows.d.classList.toggle('on', z > 0.35);
    };
    zone.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') this._setMode('touch');
      if (this.stick.id !== null) return;
      this.stick.id = e.pointerId;
      zone.setPointerCapture(e.pointerId);
      read(e);
      e.preventDefault();
    });
    zone.addEventListener('pointermove', (e) => { if (e.pointerId === this.stick.id) read(e); });
    const end = (e) => {
      if (e.pointerId !== this.stick.id) return;
      this.stick.id = null;
      this.stick.x = this.stick.z = 0;
      this._arrows();
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);

    const bindButton = (el, action) => {
      el.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'touch') this._setMode('touch');
        this.press(action);
        this.hold(action, 'touch', true);
        el.setPointerCapture(e.pointerId);
        el.classList.add('down');
        e.preventDefault();
      });
      const up = () => { el.classList.remove('down'); this.hold(action, 'touch', false); };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    };
    bindButton(btn, 'attack');
    bindButton(document.getElementById('btn-upper'), 'upper');
    bindButton(document.getElementById('btn-dodge'), 'dodge');
    bindButton(document.getElementById('btn-jump'), 'jump');

    // Un toucher n'importe où repasse en mode tactile
    window.addEventListener('touchstart', () => this._setMode('touch'), { passive: true });
  }

  _pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gx = 0, gz = 0;
    for (const gp of pads) {
      if (!gp || !gp.connected) continue;
      const prev = this.gpPrev[gp.index] || [];
      const b = gp.buttons.map((x) => x.pressed);
      let any = false;
      b.forEach((p, i) => {
        if (p && !prev[i]) {
          any = true;
          // A saute, X frappe (maintenu : charge), Y smash, B / RB roulade, Start pause, Select réglages
          if (i === 0) this.press('jump');
          if (i === 2) this.press('attack');
          if (i === 3) this.press('upper');
          if (i === 1 || i === 5) this.press('dodge');
          if (i === 9 && this.onPause) this.onPause();
          if (i === 8 && this.onMenu) this.onMenu();
        }
      });
      this.hold('attack', 'gp' + gp.index, b[2]);
      this.gpPrev[gp.index] = b;
      let ax = gp.axes[0] || 0, az = gp.axes[1] || 0;
      if (Math.hypot(ax, az) < DEAD) ax = az = 0;
      if (b[14]) ax = -1;
      if (b[15]) ax = 1;
      if (b[12]) az = -1;
      if (b[13]) az = 1;
      if (any || Math.hypot(ax, az) > 0.5) this._setMode('gamepad');
      gx += ax;
      gz += az;
    }
    return { x: gx, z: gz };
  }

  // Vibration : téléphone (Vibration API, Android) et manette (rumble), si activée dans les réglages
  rumble(ms, strength = 1) {
    if (!this.cfg?.vibration) return;
    if (this.mode === 'touch' && navigator.vibrate) navigator.vibrate(strength >= 1 ? [ms * 0.4, 40, ms * 0.6] : ms);
    for (const gp of navigator.getGamepads ? navigator.getGamepads() : []) {
      gp?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: strength, weakMagnitude: strength * 0.6 }).catch(() => {});
    }
  }

  // Appelé une fois par frame
  poll() {
    const gp = this._pollGamepad();
    let kx = 0, kz = 0;
    const k = this.keys;
    if (k.has('ArrowLeft') || k.has('KeyA') || k.has('KeyQ')) kx -= 1;
    if (k.has('ArrowRight') || k.has('KeyD')) kx += 1;
    if (k.has('ArrowUp') || k.has('KeyW') || k.has('KeyZ')) kz -= 1;
    if (k.has('ArrowDown') || k.has('KeyS')) kz += 1;
    let x = gp.x + kx + this.stick.x;
    let z = gp.z + kz + this.stick.z;
    const m = Math.hypot(x, z);
    if (m > 1) { x /= m; z /= m; }
    this.move.x = x;
    this.move.z = z;
    // purge des vieilles pressions
    const t = now();
    this.presses = this.presses.filter((p) => t - p.rt < 2);
  }
}
