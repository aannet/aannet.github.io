// Couche d'input abstraite : le jeu ne lit que des actions (move, attack).
// Sources : tactile (stick virtuel + bouton), manette (Gamepad API), clavier.
const now = () => performance.now() / 1000;
const DEAD = 0.2;

export class Input {
  constructor() {
    this.mode = 'touch';
    this.move = { x: 0, z: 0 };
    this.presses = []; // { action, t }
    this.keys = new Set();
    this.stick = { x: 0, z: 0, id: null, ox: 0, oy: 0 };
    this.gpPrev = {};
    this.onModeChange = null;
    this.onMenu = null;
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
    this.presses.push({ action, t: now() });
  }

  // Consomme la pression la plus récente de moins de maxAge secondes (buffer d'input).
  take(action, maxAge) {
    const t = now();
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
    const atk = ['KeyJ', 'Space', 'KeyX', 'Enter'];
    const upr = ['KeyK', 'KeyI', 'KeyC'];
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this._setMode('keyboard');
      this.keys.add(e.code);
      if (atk.includes(e.code)) {
        this.press('attack');
        e.preventDefault();
      }
      if (upr.includes(e.code)) this.press('upper');
      if (e.code === 'Backquote' || e.code === 'KeyG') this.onMenu && this.onMenu();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  _bindTouch() {
    const zone = document.getElementById('stick-zone');
    const base = document.getElementById('stick-base');
    const knob = document.getElementById('stick-knob');
    const btn = document.getElementById('btn-attack');
    const R = 52;
    if (!zone) return;

    zone.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') this._setMode('touch');
      if (this.stick.id !== null) return;
      this.stick.id = e.pointerId;
      this.stick.ox = e.clientX;
      this.stick.oy = e.clientY;
      zone.setPointerCapture(e.pointerId);
      base.style.left = e.clientX + 'px';
      base.style.top = e.clientY + 'px';
      base.classList.add('on');
      document.body.classList.add('stick-used');
      knob.style.transform = 'translate(-50%,-50%)';
      e.preventDefault();
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.stick.id) return;
      let dx = e.clientX - this.stick.ox;
      let dy = e.clientY - this.stick.oy;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      this.stick.x = dx / R;
      this.stick.z = dy / R;
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    });
    const end = (e) => {
      if (e.pointerId !== this.stick.id) return;
      this.stick.id = null;
      this.stick.x = this.stick.z = 0;
      base.classList.remove('on');
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);

    const bindButton = (el, action) => {
      el.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'touch') this._setMode('touch');
        this.press(action);
        el.classList.add('down');
        e.preventDefault();
      });
      const up = () => el.classList.remove('down');
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('pointerleave', up);
    };
    bindButton(btn, 'attack');
    bindButton(document.getElementById('btn-upper'), 'upper');

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
          if (i === 0 || i === 2) this.press('attack');
          if (i === 3 || i === 1) this.press('upper');
          if (i === 9 && this.onMenu) this.onMenu();
        }
      });
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
    this.presses = this.presses.filter((p) => t - p.t < 1);
  }
}
