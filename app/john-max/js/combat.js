import * as THREE from 'three';
import { CFG } from './config.js';
import { sfx } from './audio.js';

// Coups calés sur les clips. Les temps sont en secondes DE CLIP (mesurés sur les animations) :
// active = hitbox active, cancel = enchaînement possible, end = sortie vers la garde.
// rec = clip de récupération joué ensuite (l'annulation reste ouverte pendant).
// speed accélère le clip : la préparation devient plus nerveuse sans retoucher l'animation.
export const FIST_COMBO = [
  { name: 'jab', clip: 'Punch_Jab', speed: 1.3, active: [0.16, 0.27], cancel: 0.27, end: 0.6, tip: 'fistL', r: 0.24, dmg: 8, heavy: false, lunge: 0.5 },
  { name: 'cross', clip: 'Punch_Cross', speed: 1.3, active: [0.22, 0.34], cancel: 0.36, end: 0.72, tip: 'fistR', r: 0.24, dmg: 10, heavy: false, lunge: 0.7 },
  { name: 'hook', clip: 'Melee_Hook', rec: 'Melee_Hook_Rec', speed: 1.0, active: [0.17, 0.3], cancel: 0.47, tip: 'fistR', r: 0.3, dmg: 24, heavy: true, lunge: 0 },
];
export const BAT_COMBO = [
  { name: 'swing', clip: 'Sword_Regular_A', rec: 'Sword_Regular_A_Rec', speed: 0.9, active: [0.14, 0.28], cancel: 0.43, tip: 'bat', r: 0.26, dmg: 30, heavy: true, bat: true, lunge: 0.4 },
  { name: 'backswing', clip: 'Sword_Regular_B', rec: 'Sword_Regular_B_Rec', speed: 0.9, active: [0.15, 0.32], cancel: 0.53, tip: 'bat', r: 0.26, dmg: 30, heavy: true, bat: true, lunge: 0.4 },
];
// Lanceur vertical. Pas d'uppercut dans les packs gratuits : le crochet, plus rapide, en tient lieu.
export const UPPERCUT = { name: 'upper', clip: 'Melee_Hook', rec: 'Melee_Hook_Rec', speed: 1.2, active: [0.15, 0.3], cancel: 0.47, tip: 'fistR', r: 0.32, dmg: 14, heavy: true, launcher: true, lunge: 0.3 };

// Coup aérien : le cross part de sa préparation puis reste tendu (hold) et actif jusqu'à la réception.
export const AIR_STRIKE = { name: 'air', clip: 'Punch_Cross', from: 0.1, speed: 1.7, active: [0.18, 0.4], hold: 0.3, cancel: 9, tip: 'fistR', r: 0.36, dmg: 14, heavy: true, lunge: 0 };

// Charged Punch : le cross repart de sa frame de préparation (0,1 s), plus vite et avec une grosse fenêtre.
export const CHARGED = { name: 'charged', clip: 'Punch_Cross', from: 0.1, speed: 1.5, active: [0.2, 0.38], cancel: 0.62, end: 0.82, tip: 'fistR', r: 0.42, dmg: 20, heavy: true, charged: true, lunge: 2.4 };

const _l = new THREE.Vector3();

// Résolution d'un coup du héros sur un ennemi debout.
export function resolveHit(game, A, enemy, point, k = 1) {
  const { juice, time, hero } = game;
  const dir = Math.sign(enemy.x - hero.x) || hero.facing;
  if (A.charged) return resolveCharged(game, enemy, point, dir, hero.chargeK * k);
  enemy.hp -= A.dmg * CFG.damageMult;
  const ko = enemy.hp <= 0;
  const heavy = A.heavy || ko;

  time.hitstop(A.bat ? CFG.hitstopBat : heavy ? CFG.hitstopHeavy : CFG.hitstopLight);
  juice.shake(heavy ? CFG.shakeHeavy * (A.bat ? 1.3 : 1) : CFG.shakeLight);
  if (heavy) juice.camPunch(CFG.camPunch * (A.bat ? 1.4 : 1));
  juice.flash(enemy.rig);
  juice.hit(point, dir, A.bat ? 2 : heavy ? 1 : 0, enemy.headPos(_l));
  if (A.bat) sfx.bat(); else sfx.punch(heavy);
  game.ui.combo();

  if (A.launcher) {
    enemy.heavyHit({ x: dir * CFG.upperX, y: CFG.upperUp });
  } else if (heavy) {
    const m = A.bat ? CFG.batMult : 1;
    enemy.heavyHit({ x: dir * CFG.knockHeavy * m, y: CFG.knockUp * (A.bat ? 1.25 : 1) * (ko ? 1.15 : 1) });
  } else {
    enemy.lightHit(dir);
  }
  if (ko) game.onKO(enemy);
}

// Charged Punch : dégâts et projection selon la charge (k de 0 à 1), énergie orange, onde de choc.
function resolveCharged(game, enemy, point, dir, k) {
  const { juice, time } = game;
  enemy.hp -= (CHARGED.dmg + 30 * k) * CFG.damageMult;
  const ko = enemy.hp <= 0;
  time.hitstop(CFG.hitstopHeavy + 0.1 * k);
  if (k > 0.95) time.slowmo(0.35);
  juice.shake(CFG.shakeHeavy * (1.1 + 0.6 * k));
  juice.camPunch(CFG.camPunch * (1.5 + k));
  juice.flash(enemy.rig);
  juice.hit(point, dir, 2, enemy.headPos(_l));
  juice.energyBurst(point, 0.6 + k);
  sfx.charged(k);
  game.ui.combo();
  enemy.heavyHit({ x: dir * CFG.knockHeavy * (1 + CFG.chargeKnock * k * 0.6), y: CFG.knockUp * (1 + 0.4 * k) });
  if (ko) game.onKO(enemy);
}

// Coup sur un ennemi en l'air (chute animée) : on le relance (juggle).
export function resolveJuggle(game, A, enemy, point) {
  const { juice, time, hero } = game;
  const m = A.bat ? CFG.batMult : 1;
  const dir = Math.sign(enemy.x - hero.x) || hero.facing;
  if (A.launcher) enemy.juggle(dir * CFG.upperX, CFG.upperUp * 0.85);
  else enemy.juggle(dir * CFG.juggleX * (A.heavy ? 2.5 * m : 1), CFG.juggleUp * (A.heavy ? 1.15 : 1));
  enemy.t = 0; // relance le délai de relevé / respawn tant qu'on le garde en l'air
  if (!enemy.ko) {
    enemy.hp -= A.dmg * CFG.damageMult * 0.6;
    if (enemy.hp <= 0) game.onKO(enemy);
  }
  time.hitstop((A.heavy ? CFG.hitstopHeavy : CFG.hitstopLight) * 0.8);
  juice.shake(A.heavy ? CFG.shakeHeavy * 0.8 : CFG.shakeLight);
  juice.flash(enemy.rig);
  juice.hit(point, Math.sign(point.x - hero.x) || hero.facing, A.bat ? 2 : A.heavy ? 1 : 0, enemy.headPos(_l));
  if (A.bat) sfx.bat(); else sfx.punch(A.heavy);
  game.ui.combo();
}
