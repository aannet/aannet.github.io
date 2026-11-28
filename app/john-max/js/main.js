import * as THREE from 'three';
import { CFG } from './config.js';
import { GameTime } from './time.js';
import { Input } from './input.js';
import { Juice } from './juice.js';
import { Level, ARENA } from './level.js';
import { Hero } from './hero.js';
import { Enemy } from './enemy.js';
import { Bat } from './bat.js';
import { Blobs } from './blobs.js';
import { UI, buildGui, loadSavedCfg } from './ui.js';
import { unlockAudio, sfx } from './audio.js';
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

  const game = { R, world, scene, camera, renderer, CFG, token: null, applyRes, lib };
  game.time = new GameTime();
  game.input = new Input();
  game.juice = new Juice(scene);
  game.ui = new UI(game);
  game.level = new Level(game);
  game.hero = new Hero(game);
  game.enemies = [new Enemy(game, 0), new Enemy(game, 1)];
  game.bat = new Bat(game);
  game.blobs = new Blobs(scene);

  game.onKO = (enemy) => {
    enemy.ko = true;
    game.ui.ko();
    const standing = game.enemies.filter((e) => e !== enemy && !e.ko);
    if (standing.length === 0) {
      game.time.slowmo(CFG.slowmoDuration);
      game.juice.camPunch(CFG.camPunch * 1.6);
      game.ui.message('K.O.', 1.2);
    }
  };

  const gui = buildGui(GUI, game);
  let guiOn = false;
  const toggleGui = () => { guiOn = !guiOn; gui.show(guiOn); if (guiOn) gui.open(); };
  document.getElementById('btn-gui').addEventListener('click', toggleGui);
  game.input.onMenu = toggleGui;

  // Caméra
  const camX = { v: game.hero.x };
  const shake = new THREE.Vector3();
  const look = new THREE.Vector3();
  const BASE_FOV = 38;
  function updateCamera(dt) {
    const target = Math.max(ARENA.minX + 4.6, Math.min(ARENA.maxX - 4.6, game.hero.x + game.hero.facing * 0.6));
    camX.v += (target - camX.v) * (1 - Math.exp(-4 * dt));
    game.juice.cameraOffset(shake);
    camera.position.set(camX.v + shake.x, 2.9 + shake.y, 7.4);
    look.set(camX.v + shake.x * 0.5, 1.0 + shake.y * 0.5, -0.45);
    camera.lookAt(look);
    const fov = BASE_FOV * (1 - game.juice.punch);
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
    game.level.update(camX.v, game.time.real, dt);
  }

  // « Bowling » : un ennemi projeté renverse ceux qu'il percute
  const _bp = new THREE.Vector3();
  function bowlHit(a, b, p, v) {
    a.bowled.add(b);
    b.hp -= 12 * CFG.damageMult;
    const ko = b.hp <= 0;
    b.heavyHit({ x: v.x * 0.75, y: Math.max(2.5, v.y * 0.4 + 2.5) });
    game.juice.flash(b.rig);
    game.juice.shake(CFG.shakeHeavy * 0.8);
    game.juice.hit(_bp.set(p.x, p.y, p.z), Math.sign(v.x), 1, b.headPos(new THREE.Vector3()));
    game.time.hitstop(CFG.hitstopHeavy * 0.7);
    sfx.punch(true);
    game.ui.combo();
    if (ko) game.onKO(b);
  }
  function bowling() {
    if (!CFG.bowling) return;
    for (const a of game.enemies) {
      const targets = (p) => game.enemies.filter((b) => b !== a && b.hittable() && !a.bowled.has(b) && Math.hypot(p.x - b.x, p.z - b.z) < 0.5 && p.y < 1.8);
      if (a.state === 'knock' && Math.abs(a.vx) > 2.5) {
        const p = { x: a.x + Math.sign(a.vx) * 0.3, y: a.y + 0.6, z: a.z };
        for (const b of targets(p)) bowlHit(a, b, p, { x: a.vx, y: a.vy });
      }
    }
  }

  // Séparation entre persos debout
  function separate() {
    const list = [game.hero, ...game.enemies.filter((e) => e.hittable() || e.state === 'enter')];
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
    game.bat.update(gdt);
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    game.input.poll();
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

  progress(1, 'Prêt');
  const loader = document.getElementById('loader');
  loader.classList.add('ready');
  const start = () => {
    unlockAudio();
    loader.classList.add('gone');
  };
  // démarrage uniquement par le bouton (clic, toucher, Entrée/Espace quand il a le focus)
  const play = document.getElementById('play');
  play.addEventListener('click', () => { goFullscreen(); start(); }, { once: true });
  const onKey = (e) => {
    if (e.code !== 'Enter' && e.code !== 'Space') return;
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
