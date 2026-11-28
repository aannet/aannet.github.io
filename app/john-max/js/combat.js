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

const _l = new THREE.Vector3();

// Résolution d'un coup du héros sur un ennemi debout.
export function resolveHit(game, A, enemy, point) {
  const { juice, time, hero } = game;
  const dir = Math.sign(enemy.x - hero.x) || hero.facing;
  enemy.hp -= A.dmg * CFG.damageMult;
  const ko = enemy.hp <= 0;
  const heavy = A.heavy || ko;

  time.hitstop(A.bat ? CFG.hitstopBat : heavy ? CFG.hitstopHeavy : CFG.hitstopLight);
  juice.shake(heavy ? CFG.shakeHeavy * (A.bat ? 1.3 : 1) : CFG.shakeLight);
  if (heavy) juice.camPunch(CFG.camPunch * (A.bat ? 1.4 : 1));
  juice.flash(enemy.rig);
  juice.sparks(point, dir, heavy ? 28 : 12, heavy);
  juice.star(point, heavy ? 1.2 : 0.65);
  if (A.bat) sfx.bat(); else sfx.punch(heavy);
  game.ui.combo();

  if (A.launcher) {
    enemy.heavyHit({ x: dir * CFG.upperX, y: CFG.upperUp, z: 0, spin: -dir * 3, instant: true, inherit: 0 });
  } else if (heavy) {
    const m = A.bat ? CFG.batMult : 1;
    _l.set(dir * CFG.knockHeavy * m, CFG.knockUp * (A.bat ? 1.25 : 1) * (ko ? 1.15 : 1), (Math.random() - 0.5) * 1.6);
    enemy.heavyHit({ x: _l.x, y: _l.y, z: _l.z, spin: -dir * 5 });
  } else {
    enemy.lightHit(dir);
  }
  if (ko) game.onKO(enemy);
}

// Coup sur un ennemi en ragdoll : en l'air on le maintient (juggle), au sol on le relance.
export function resolveRagdollHit(game, A, enemy, point) {
  const { juice, time, hero } = game;
  const c = enemy.ragdoll.center(_l);
  const dir = Math.sign(c.x - hero.x) || hero.facing;
  const m = A.bat ? CFG.batMult : 1;
  let vel;
  if (A.launcher) vel = { x: dir * CFG.upperX, y: CFG.upperUp * 0.85, z: 0 };
  else if (c.y > 0.55) vel = { x: dir * CFG.juggleX * (A.heavy ? 2.5 * m : 1), y: CFG.juggleUp * (A.heavy ? 1.15 : 1), z: 0 };
  else { const k = A.heavy ? 1 : 0.45; vel = { x: dir * CFG.knockHeavy * m * k, y: CFG.knockUp * (0.6 + k), z: (Math.random() - 0.5) * 1.2 }; }
  enemy.ragdoll.hit(point, vel);
  enemy.t = 0; // relance le délai de relevé / respawn tant qu'on le garde en l'air
  if (!enemy.ko) {
    enemy.hp -= A.dmg * CFG.damageMult * 0.6;
    if (enemy.hp <= 0) game.onKO(enemy);
  }
  time.hitstop((A.heavy ? CFG.hitstopHeavy : CFG.hitstopLight) * 0.8);
  juice.shake(A.heavy ? CFG.shakeHeavy * 0.8 : CFG.shakeLight);
  juice.flash(enemy.rig);
  juice.sparks(point, dir, 14, A.heavy);
  juice.star(point, 0.8);
  if (A.bat) sfx.bat(); else sfx.punch(A.heavy);
  game.ui.combo();
}
