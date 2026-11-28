import { CFG } from './config.js';

const POP = [{ scale: 1.5, filter: 'blur(2px)' }, { scale: 1, filter: 'none' }];
const POP_T = { duration: 220, easing: 'cubic-bezier(.2, 2.2, .4, 1)' };

// HUD DOM : vie du héros, compteur de combo, messages, fps. Panneau de debug lil-gui.
export class UI {
  constructor(game) {
    this.game = game;
    this.hpFill = document.getElementById('hp-fill');
    this.spFill = document.getElementById('sp-fill');
    this.status = document.getElementById('status');
    this.upBtn = document.getElementById('btn-upper');
    this.flashEl = document.getElementById('flash');
    this.comboEl = document.getElementById('combo');
    this.msgEl = document.getElementById('msg');
    this.fpsEl = document.getElementById('fps');
    this.koEl = document.getElementById('ko-count');
    this.hpPct = document.getElementById('hp-pct');
    this.spLbl = document.getElementById('sp-lbl');
    this.comboNEl = document.getElementById('combo-n');
    this.comboFill = document.getElementById('combo-fill');
    this.lastHp = -1;
    this.lastSp = -1;
    this.comboN = 0;
    this.comboT = 0;
    this.msgT = 0;
    this.kos = 0;
    this.frames = 0;
    this.fpsT = 0;
  }

  combo() {
    this.comboN = this.comboT > 0 ? this.comboN + 1 : 1;
    this.comboT = 1.3;
    if (this.comboN >= 2) {
      this.comboNEl.textContent = `X${this.comboN} COMBO`;
      this.comboNEl.animate(POP, POP_T); // Web Animations : pas de reflow forcé à chaque coup
      this.comboEl.classList.add('on');
    }
  }

  ko() {
    this.kos++;
    this.koEl.textContent = String(this.kos).padStart(2, '0');
  }

  message(text, dur = 1) {
    this.msgEl.textContent = text;
    this.msgEl.classList.remove('pop');
    void this.msgEl.offsetWidth;
    this.msgEl.classList.add('pop', 'on');
    this.msgT = dur;
  }

  specialDenied() {
    this.status.classList.remove('denied');
    void this.status.offsetWidth;
    this.status.classList.add('denied');
  }

  flashScreen(kind = '') {
    this.flashEl.className = kind;
    void this.flashEl.offsetWidth;
    this.flashEl.classList.add('on');
  }

  update(dt) {
    const h = this.game.hero;
    // le DOM n'est touché que si la valeur change
    const hp = Math.max(0, Math.round((h.hp / h.maxHp) * 100));
    if (hp !== this.lastHp) { this.lastHp = hp; this.hpFill.style.transform = `scaleX(${hp / 100})`; this.hpPct.textContent = `HP ${hp}%`; }
    const sp = Math.round(h.special);
    const ready = h.special >= 100;
    if (sp !== this.lastSp) { this.lastSp = sp; this.spFill.style.transform = `scaleX(${sp / 100})`; this.spLbl.innerHTML = ready ? 'MAX<br>READY' : sp + '%'; }
    this.status.classList.toggle('ready', ready);
    this.upBtn.classList.toggle('ready', ready);
    this.comboT -= dt;
    if (this.comboT <= 0) this.comboEl.classList.remove('on');
    else this.comboFill.style.transform = `scaleX(${this.comboT / 1.3})`;
    this.msgT -= dt;
    if (this.msgT <= 0) this.msgEl.classList.remove('on');
    this.frames++;
    this.fpsT += dt;
    if (this.fpsT >= 0.5) {
      this.fpsEl.textContent = `${Math.round(this.frames / this.fpsT)} fps`;
      this.frames = 0;
      this.fpsT = 0;
    }
  }
}

export function buildGui(GUI, game) {
  const gui = new GUI({ title: 'Game feel', width: 270 });
  gui.hide();
  const f = (name) => gui.addFolder(name);

  const n = f('Nervosité');
  n.add(CFG, 'animSpeed', 0.6, 1.6, 0.01).name('vitesse des animations');
  n.add(CFG, 'heroSpeed', 1, 7, 0.1).name('vitesse héros');
  n.add(CFG, 'enemySpeed', 0.5, 4, 0.1).name('vitesse ennemis');

  const r = f('Rendu');
  r.add(CFG, 'renderLines', { '240 (gros pixels)': 240, '360 (pixel art)': 360, '540': 540, '720': 720, 'natif': 0 }).name('résolution').onChange(() => game.applyRes());

  const t = f('Temps');
  t.add(CFG, 'timeScale', 0.1, 1.5, 0.05).name('vitesse globale');
  t.add(CFG, 'hitstopLight', 0, 0.2, 0.005).name('hitstop léger (s)');
  t.add(CFG, 'hitstopHeavy', 0, 0.3, 0.005).name('hitstop fort (s)');
  t.add(CFG, 'slowmoScale', 0.05, 1, 0.05).name('slow-mo dernier KO');
  t.add(CFG, 'slowmoDuration', 0, 2, 0.05).name('durée slow-mo (s)');

  const c = f('Caméra');
  c.add(CFG, 'shakeLight', 0, 1, 0.01).name('shake léger');
  c.add(CFG, 'shakeHeavy', 0, 1, 0.01).name('shake fort');
  c.add(CFG, 'shakeMax', 0, 1, 0.01).name('amplitude max (m)');
  c.add(CFG, 'shakeDecay', 0.5, 8, 0.1).name('amortissement');
  c.add(CFG, 'camPunch', 0, 0.3, 0.01).name('punch zoom');

  const k = f('Impact');
  k.add(CFG, 'fxScale', 0.5, 2.5, 0.05).name('taille des effets ×');
  k.add(CFG, 'fxTime', 0.5, 2.5, 0.05).name('durée des effets ×');
  k.add(CFG, 'knockLight', 0, 6, 0.1).name('recul coup léger');
  k.add(CFG, 'knockHeavy', 0, 20, 0.1).name('impulsion coup fort');
  k.add(CFG, 'knockUp', 0, 10, 0.1).name('impulsion verticale');
  k.add(CFG, 'groundDrag', 0, 15, 0.5).name('frottement au sol');
  k.add(CFG, 'gravity', 5, 25, 0.5).name('gravité').onChange((v) => { game.world.gravity = { x: 0, y: -v, z: 0 }; });
  k.add(CFG, 'bowling').name('un projeté renverse les autres');
  k.add(CFG, 'flashTime', 0, 0.2, 0.005).name('flash (s)');
  k.add(CFG, 'particles', 0, 3, 0.1).name('quantité de particules');

  const u = f('Uppercut & juggle');
  u.add(CFG, 'upperUp', 2, 14, 0.1).name('uppercut vertical');
  u.add(CFG, 'upperX', 0, 6, 0.1).name('uppercut horizontal');
  u.add(CFG, 'juggleUp', 0, 10, 0.1).name('relance en l\'air');
  u.add(CFG, 'juggleX', 0, 6, 0.1).name('poussée en l\'air');

  const sp = f('Jauge spéciale & smash');
  sp.add(CFG, 'specialHit', 0, 30, 1).name('gain par coup');
  sp.add(CFG, 'specialHeavy', 0, 40, 1).name('gain coup fort');
  sp.add(CFG, 'specialHurt', 0, 40, 1).name('gain coup reçu');
  sp.add(CFG, 'smashRadius', 1, 6, 0.1).name('rayon du smash (m)');
  sp.add(CFG, 'smashKnock', 2, 20, 0.5).name('projection du smash');
  sp.add(CFG, 'smashDmg', 0, 100, 1).name('dégâts du smash');
  sp.add(CFG, 'vibration').name('vibrations');
  sp.add({ go: () => { game.hero.special = 100; } }, 'go').name('remplir la jauge');

  const ch = f('Charged Punch, saut, esquive');
  ch.add(CFG, 'chargeDelay', 0.1, 0.6, 0.01).name('appui avant charge (s)');
  ch.add(CFG, 'chargeFull', 0.3, 2, 0.05).name('durée charge pleine (s)');
  ch.add(CFG, 'chargeKnock', 0, 5, 0.1).name('projection chargée ×');
  ch.add(CFG, 'chargeWave', 0, 5, 0.1).name('portée onde de choc (m)');
  ch.add(CFG, 'jumpV', 3, 10, 0.1).name('impulsion saut');
  ch.add(CFG, 'airControl', 0, 1.2, 0.05).name('contrôle en l\'air');
  ch.add(CFG, 'throwV', 2, 14, 0.5).name('force du lancer');
  ch.add(CFG, 'grabTime', 0.5, 6, 0.1).name('durée de la prise (s)');
  ch.add(CFG, 'grabDelay', 0, 1, 0.05).name('poussée avant saisie (s)');
  ch.add(CFG, 'dodgeDist', 1, 5, 0.1).name('distance roulade (m)');
  ch.add(CFG, 'dodgeInvuln', 0, 1, 0.05).name('part invincible');

  const cb = f('Combat');
  cb.add(CFG, 'inputBuffer', 0, 0.5, 0.01).name('buffer input (s)');
  cb.add(CFG, 'damageMult', 0.2, 5, 0.1).name('dégâts ×');
  cb.add(CFG, 'enemyAggro', 0.3, 3, 0.1).name('agressivité');
  cb.add(CFG, 'enemyWindup', 0.3, 1.2, 0.05).name('préparation ennemie (vitesse)');
  cb.add(CFG, 'enemyDmg', 0, 30, 1).name('dégâts ennemis');
  cb.add(CFG, 'knockWindow', 0, 10, 0.5).name('fenêtre mise à terre (s)');
  cb.add(CFG, 'heroInvincible').name('héros invincible');

  const b = f('Armes');
  b.add(CFG, 'durabilityMult', 0.2, 5, 0.1).name('durabilité ×');
  b.add(CFG, 'canThrowV', 4, 20, 0.5).name('force lancer poubelle');
  for (const [t, n] of [['bat', 'batte'], ['pipe', 'barre de fer'], ['sign', 'panneau']]) b.add({ go: () => game.weapons.dropNear(t) }, 'go').name('faire tomber : ' + n);

  const d = f('Scène');
  d.add({ go: () => game.level.resetProps() }, 'go').name('replacer le décor');
  d.add({ go: () => { // relance la vague en cours (sans passer par la victoire si le boss est là)
    const s = game.stage;
    for (const e of [...game.enemies]) { e.deactivate(); game.enemies.splice(game.enemies.indexOf(e), 1); }
    if (s.zone >= 0) { s.queue.length = 0; s.state = 'fight'; s.wave = 0; s.queueWave(); }
  } }, 'go').name('relancer la vague');
  d.add({ go: () => { try { localStorage.setItem('btaCfg2', JSON.stringify(CFG)); game.ui.message('Réglages gardés', 0.8); } catch (e) {} } }, 'go').name('garder ces réglages');
  d.add({ go: () => { navigator.clipboard?.writeText(JSON.stringify(CFG, null, 2)).then(() => game.ui.message('Copié', 0.8)).catch(() => {}); } }, 'go').name('copier les réglages (JSON)');
  d.add({ go: () => { try { localStorage.removeItem('btaCfg2'); } catch (e) {} location.reload(); } }, 'go').name('réglages par défaut');
  for (const folder of gui.folders) folder.close();
  return gui;
}

export function loadSavedCfg() {
  try {
    const s = localStorage.getItem('btaCfg2');
    if (s) Object.assign(CFG, JSON.parse(s));
  } catch (e) { /* stockage indisponible */ }
}
