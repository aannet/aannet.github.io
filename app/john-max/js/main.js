import * as THREE from 'three';
import { CFG } from './config.js';
import { GameTime } from './time.js';
import { Input } from './input.js';
import { Juice } from './juice.js';
import { Level, ARENA } from './level.js';
import { Hero } from './hero.js';
import { Hazards } from './enemy.js';
import { Stage } from './stage.js';
import { Weapons } from './weapons.js';
import { Blobs } from './blobs.js';
import { UI, buildGui, loadSavedCfg } from './ui.js';
import { unlockAudio, sfx, setMuted } from './audio.js';
import { loadLibrary } from './assets.js';

const loadBar = document.getElementById('load-fill');
const loadTxt = document.getElementById('load-txt');
const progress = (k, txt) => { loadBar.style.width = `${k * 100}%`; loadTxt.textContent = txt; };

// Plein écran + paysage : le navigateur exige un geste. On le demande au premier toucher (même pendant
// le chargement) et à nouveau si le joueur en sort. Installé sur l'écran d'accueil (manifeste), le jeu
// s'ouvre directement en plein écran.
async function goFullscreen() {
  const el = document.documentElement;
  if (document.fullscreenElement || !matchMedia('(pointer: coarse)').matches || !el.requestFullscreen) return;
  try { await el.requestFullscreen({ navigationUI: 'hide' }); } catch (e) { return; }
  try { await screen.orientation.lock('landscape'); } catch (e) {}
}
window.addEventListener('pointerdown', goFullscreen);

async function boot() {
  loadSavedCfg();
  progress(0.25, 'Physique…');
  const { default: R } = await import('@dimforge/rapier3d-compat');
  await R.init();
  progress(0.45, 'Panneau de debug…');
  const { default: GUI } = await import('lil-gui');
  progress(0.5, 'Personnages…');
  const lib = await loadLibrary((k) => progress(0.5 + 0.4 * k, 'Personnages…'));
  progress(0.92, 'Rue…');

  // Rendu en résolution réduite (CFG.renderLines) puis agrandi : 2 à 4 fois moins de pixels qu'en natif.
  // MSAA actif ; à 360 lignes ou moins, agrandissement « pixelated » pour un look pixel art assumé.
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  const applyRes = () => {
    const native = Math.min(window.devicePixelRatio, 2);
    renderer.setPixelRatio(CFG.renderLines > 0 ? Math.min(native, CFG.renderLines / window.innerHeight) : native);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.domElement.classList.toggle('pixel', CFG.renderLines > 0 && CFG.renderLines <= 360);
  };
  applyRes();
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.getElementById('app').appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 60);
  const world = new R.World({ x: 0, y: -CFG.gravity, z: 0 });

  const game = { R, world, scene, camera, renderer, CFG, tokens: new Set(), camX: -3, applyRes, lib };
  game.time = new GameTime();
  game.input = new Input();
  game.input.cfg = CFG;
  game.input.clock = () => game.time.game;
  game.juice = new Juice(scene);
  game.ui = new UI(game);
  game.level = new Level(game);
  game.hero = new Hero(game);
  game.enemies = []; // ennemis actifs (le pool est dans stage.js)
  game.bottles = new Hazards(game);
  game.stage = new Stage(game);
  game.weapons = new Weapons(game);
  game.blobs = new Blobs(scene);

  game.onKO = (enemy) => {
    enemy.ko = true;
    enemy.die();
    game.ui.ko();
    if (enemy.T.boss) { game.stage.bossDown(); game.ui.message('K.O.', 2); return; }
    const standing = game.enemies.filter((e) => e !== enemy && !e.ko);
    if (standing.length === 0 && !game.stage.queue.length) {
      game.time.slowmo(CFG.slowmoDuration);
      game.juice.camPunch(CFG.camPunch * 1.6);
      game.ui.message('K.O.', 1.2);
    }
  };

  const gui = buildGui(GUI, game);
  let guiOn = false;
  const toggleGui = () => { guiOn = !guiOn; gui.show(guiOn); if (guiOn) gui.open(); document.body.classList.toggle('gui-open', guiOn); };
  document.getElementById('btn-gui').addEventListener('click', toggleGui);
  game.input.onMenu = toggleGui;

  // Pause (bouton ❚❚, P / Échap, Start) et écran K.O. : la boucle ne fait plus avancer le jeu
  const pauseEl = document.getElementById('pause');
  const pauseTitle = document.getElementById('pause-title'), pauseSub = document.getElementById('pause-sub');
  const resumeBtn = document.getElementById('pause-resume');
  game.paused = true; // gelé derrière l'écran titre, lancé par JOUER
  let gameOver = false, continues = 0;
  const setPause = (on) => {
    if (gameOver && !on) return;
    game.paused = on;
    pauseEl.classList.toggle('on', on);
    game.input.clear();
  };
  const togglePause = () => {
    if (optEl.classList.contains('on')) { optEl.classList.remove('on'); return; }
    if (!loader.classList.contains('gone') || help.classList.contains('on') || gameOver) return;
    setPause(!game.paused);
  };
  game.input.onPause = togglePause;
  document.getElementById('btn-pause').addEventListener('click', togglePause);
  matchMedia('(orientation: portrait) and (pointer: coarse)').addEventListener('change', (e) => { if (e.matches && loader.classList.contains('gone') && !game.paused) setPause(true); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && loader.classList.contains('gone') && !game.paused) setPause(true); });
  // John à 0 PV : il tombe, puis CONTINUER ? (vie pleine, les ennemis proches sont repoussés)
  game.onHeroDown = () => {
    gameOver = true;
    pauseTitle.textContent = 'K.O.';
    pauseSub.textContent = continues ? `CONTINUES UTILISÉS : ${continues}` : 'JOHN EST À TERRE';
    resumeBtn.textContent = 'CONTINUER';
    game.paused = true;
    pauseEl.classList.add('on');
    game.input.clear();
  };
  // Boss vaincu : bilan et rejouer
  let won = false;
  game.onStageClear = ({ time, kos }) => {
    won = gameOver = true;
    const m = Math.floor(time / 60), sec = String(Math.floor(time % 60)).padStart(2, '0');
    pauseTitle.textContent = 'STAGE CLEAR';
    pauseSub.textContent = `KO ${kos} · TEMPS ${m}:${sec} · CONTINUES ${continues}`;
    resumeBtn.textContent = 'REJOUER';
    game.paused = true;
    pauseEl.classList.add('on');
  };
  resumeBtn.addEventListener('click', () => {
    if (won) { location.reload(); return; }
    if (gameOver) {
      gameOver = false;
      continues++;
      const h = game.hero;
      h.hp = h.maxHp;
      h.invuln = 2;
      for (const e of game.enemies) {
        if (!e.hittable()) continue;
        const d = e.x - h.x;
        if (Math.abs(d) < 3) e.heavyHit({ x: (Math.sign(d) || 1) * CFG.knockHeavy, y: CFG.knockUp });
      }
      game.ui.message('CONTINUE', 1);
      pauseTitle.textContent = 'PAUSE';
      pauseSub.textContent = '';
      resumeBtn.textContent = 'REPRENDRE';
    }
    setPause(false);
  });
  document.getElementById('pause-help').addEventListener('click', () => openHelp(true));

  // Options joueur (pause > OPTIONS), gardées dans le navigateur
  const OPT_KEY = 'jmOptions';
  const opts = { sound: 1, vibration: 1, quality: CFG.renderLines, fps: 0 };
  try { Object.assign(opts, JSON.parse(localStorage.getItem(OPT_KEY) || '{}')); } catch (e) { /* stockage indisponible */ }
  const optEl = document.getElementById('options');
  const applyOpts = () => {
    setMuted(!opts.sound);
    CFG.vibration = !!opts.vibration;
    if (CFG.renderLines !== opts.quality) { CFG.renderLines = opts.quality; applyRes(); }
    document.body.classList.toggle('show-fps', !!opts.fps);
    for (const c of optEl.querySelectorAll('.choice')) for (const b of c.children) b.classList.toggle('on', +b.dataset.v === +opts[c.dataset.opt]);
    try { localStorage.setItem(OPT_KEY, JSON.stringify(opts)); } catch (e) { /* idem */ }
  };
  optEl.addEventListener('click', (e) => {
    const b = e.target.closest('.choice button');
    if (b) { opts[b.parentElement.dataset.opt] = +b.dataset.v; applyOpts(); }
  });
  document.getElementById('pause-options').addEventListener('click', () => optEl.classList.add('on'));
  document.getElementById('opt-back').addEventListener('click', () => optEl.classList.remove('on'));
  // le panneau avancé s'ouvre par-dessus la pause : le jeu reste gelé, l'image se redessine pour voir l'effet des réglages
  document.getElementById('opt-advanced').addEventListener('click', () => { optEl.classList.remove('on'); if (!guiOn) toggleGui(); });
  applyOpts();

  // Caméra
  const camX = { v: game.hero.x };
  const shake = new THREE.Vector3();
  const look = new THREE.Vector3();
  const BASE_FOV = 38;
  function updateCamera(dt) {
    const target = Math.max(ARENA.minX + 4.6, Math.min(ARENA.maxX - 4.6, game.hero.x + game.hero.facing * 0.6));
    camX.v += (target - camX.v) * (1 - Math.exp(-4 * dt));
    game.camX = camX.v;
    game.juice.cameraOffset(shake);
    camera.position.set(camX.v + shake.x, 2.9 + shake.y, 7.4);
    look.set(camX.v + shake.x * 0.5, 1.0 + shake.y * 0.5, -0.45);
    camera.lookAt(look);
    const fov = BASE_FOV * (1 - game.juice.punch - game.juice.chargeZoom * 0.07);
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
    game.level.update(camX.v, game.time.real, dt);
  }

  // « Bowling » : un ennemi projeté renverse ceux qu'il percute
  const _bp = new THREE.Vector3(), _bh = new THREE.Vector3();
  function bowlHit(a, b, p, v) {
    a.bowled.add(b);
    b.hp -= 12 * CFG.damageMult;
    const ko = b.hp <= 0;
    b.heavyHit({ x: v.x * 0.75, y: Math.max(2.5, v.y * 0.4 + 2.5) });
    game.juice.flash(b.rig);
    game.juice.shake(CFG.shakeHeavy * 0.8);
    game.juice.hit(_bp.set(p.x, p.y, p.z), Math.sign(v.x), 1, b.headPos(_bh));
    game.time.hitstop(CFG.hitstopHeavy * 0.7);
    sfx.punch(true);
    game.ui.combo();
    if (ko) game.onKO(b);
  }
  const _bp2 = { x: 0, y: 0, z: 0 }, _bv = { x: 0, y: 0 };
  function bowling() {
    if (!CFG.bowling) return;
    for (const a of game.enemies) {
      if (a.state !== 'knock' || Math.abs(a.vx) <= 2.5) continue;
      const p = _bp2;
      p.x = a.x + Math.sign(a.vx) * 0.3; p.y = a.y + 0.6; p.z = a.z;
      if (p.y >= 1.8) continue;
      for (let i = 0; i < game.enemies.length; i++) {
        const b = game.enemies[i];
        if (b === a || b.T.boss || !b.hittable() || a.bowled.has(b) || Math.hypot(p.x - b.x, p.z - b.z) >= 0.5) continue;
        _bv.x = a.vx; _bv.y = a.vy;
        bowlHit(a, b, p, _bv);
      }
    }
  }

  // Séparation entre persos debout
  const _sep = [];
  function separate() {
    const list = _sep;
    list.length = 0;
    list.push(game.hero);
    for (const e of game.enemies) if (e.hittable() || e.state === 'enter') list.push(e);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        const dx = b.x - a.x, dz = b.z - a.z;
        const d = Math.hypot(dx, dz * 1.6);
        const min = 0.62;
        if (d < min && d > 1e-4) {
          const push = (min - d) * 0.5;
          const nx = dx / d, nz = dz / d;
          if (a === game.hero) { b.x += nx * push * 2; b.z += nz * push; }
          else { a.x -= nx * push; a.z -= nz * push * 0.5; b.x += nx * push; b.z += nz * push * 0.5; }
        }
      }
    }
  }

  function tick(gdt) {
    if (gdt <= 0) return; // hitstop : tout est gelé
    game.hero.update(gdt);
    for (const e of game.enemies) e.update(gdt);
    separate();
    world.timestep = gdt;
    world.step();
    bowling();
    game.level.sync(gdt);
    game.weapons.update(gdt);
    game.bottles.update(gdt);
    game.stage.update(gdt);
  }

  // Portrait du HUD : photo du héros (vrai modèle, pose de garde) prise une fois au chargement, derrière l'écran titre.
  // Rendu dans un coin du canvas principal (mêmes shaders, même sortie sRGB : aucune compilation en plus), copié aussitôt.
  function snapshotPortrait() {
    const S = 96, h = game.hero, pr = renderer.getPixelRatio(), s = S / pr;
    const cam = new THREE.PerspectiveCamera(24, 1, 0.1, 30);
    const head = h.headPos(new THREE.Vector3());
    cam.position.set(head.x + h.facing * 0.75, head.y + 0.05, head.z + 1.5);
    cam.lookAt(head.x, head.y - 0.3, head.z);
    const shown = scene.children.map((o) => o.visible);
    scene.children.forEach((o) => { o.visible = o === h.model.root || o.isLight; });
    renderer.setViewport(0, 0, s, s);
    renderer.setScissor(0, 0, s, s);
    renderer.setScissorTest(true);
    renderer.render(scene, cam);
    const cv = renderer.domElement;
    document.querySelector('#portrait canvas').getContext('2d').drawImage(cv, 0, cv.height - S, S, S, 0, 0, S, S);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
    scene.children.forEach((o, i) => { o.visible = shown[i]; });
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    game.input.poll();
    if (game.paused) {
      if (guiOn) { updateCamera(0); renderer.render(scene, camera); }
      requestAnimationFrame(frame);
      return;
    }
    game.time.advance(dt, tick);
    game.juice.update(dt);
    game.ui.update(dt);
    for (const e of game.enemies) e.updateBar();
    game.blobs.update(game);
    updateCamera(dt);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', () => {
    applyRes();
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  game.hero.anim('Guard', { speed: 0, loop: true }); // pose de garde
  for (let i = 0; i < 20; i++) game.hero.step(1 / 60);
  snapshotPortrait();
  renderer.render(scene, camera); // compile les shaders pendant l'écran titre
  progress(1, 'Prêt');
  const loader = document.getElementById('loader');
  loader.classList.add('ready');
  const start = () => {
    unlockAudio();
    game.paused = false;
    game.input.clear();
    game.stage.start();
    loader.classList.add('gone');
    const off = (e) => { if (e.target === loader) { loader.classList.add('off'); loader.removeEventListener('transitionend', off); } };
    loader.addEventListener('transitionend', off);
  };
  // aide : panneau des commandes, fermé par ✕, Échap ou un toucher hors de la carte
  const help = document.getElementById('help');
  const openHelp = (on) => help.classList.toggle('on', on);
  document.getElementById('help-btn').addEventListener('click', () => openHelp(true));
  help.querySelector('.close').addEventListener('click', () => openHelp(false));
  help.addEventListener('click', (e) => { if (e.target === help) openHelp(false); });
  window.addEventListener('keydown', (e) => { if (e.code === 'Escape' && help.classList.contains('on')) { e.stopImmediatePropagation(); openHelp(false); } }, true);

  // démarrage uniquement par le bouton (clic, toucher, Entrée/Espace quand il a le focus)
  const play = document.getElementById('play');
  play.addEventListener('click', () => { goFullscreen(); start(); }, { once: true });
  const onKey = (e) => {
    if ((e.code !== 'Enter' && e.code !== 'Space') || help.classList.contains('on')) return;
    window.removeEventListener('keydown', onKey);
    play.click();
  };
  window.addEventListener('keydown', onKey);
  // Audio débloqué au premier geste, même si l'écran de démarrage a été passé autrement
  window.addEventListener('pointerdown', unlockAudio);

  window.__game = game;
  requestAnimationFrame(frame);
}

boot().catch((e) => {
  console.error(e);
  const msg = String(e && e.message || e).slice(0, 120);
  loadTxt.textContent = `Chargement impossible (${msg}). Touche pour réessayer.`;
  loadTxt.classList.add('err');
  document.getElementById('loader').addEventListener('pointerdown', () => location.reload(), { once: true });
});
