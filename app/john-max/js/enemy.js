import * as THREE from 'three';
import { CFG } from './config.js';
import { Character } from './character.js';
import { ARENA } from './level.js';
import { sfx } from './audio.js';
import { TYPES as WEAPONS } from './weapons.js';

const _p = new THREE.Vector3();
const WALK_SPEED = 1.5; // vitesse naturelle du clip Walk_Loop (m/s)
const RIM = 0x4fb8ff;

// Types d'ennemis. Vêtements un peu désaturés : le héros (liseré orange) reste le point focal.
//  attack : punch (voyou), charge (fonceur), swing (costaud à la barre), throw (lanceur), boss
//  knock  : multiplicateur des projections subies (lourds = moins loin)
//  grab   : true, false, ou 'stun' (seulement quand il est sonné)
export const TYPES = {
  thug: {
    hp: 60, speed: 1, attack: 'punch', dmg: 7, knock: 1, grab: true,
    looks: [
      { body: 'male', hair: ['simpleparted'], hairColor: 0x6fae55, shirt: 0xa8445a, pants: 0x33303d, boots: 0x1d1b22, rim: RIM },
      { body: 'male', hair: ['buzzed'], hairColor: 0xd2a24c, skin: 0xb98a6a, shirt: 0x6a57a8, pants: 0x4f5b3a, boots: 0xe8e2d0, rim: RIM },
      { body: 'female', hair: ['long'], hairColor: 0xc0566a, shirt: 0x3a8178, pants: 0x2c2c3a, boots: 0x1d1b22, rim: RIM },
    ],
  },
  rusher: {
    hp: 50, speed: 1.2, attack: 'charge', dmg: 12, knock: 1, grab: true, chargeV: 8.5, stun: 0.9,
    looks: [{ body: 'male', hair: ['buzzed'], hairColor: 0xdedede, shirt: 0xb8902e, pants: 0x2a2a33, boots: 0x1d1b22, rim: RIM }],
  },
  brute: {
    hp: 150, speed: 0.75, scale: 1.18, attack: 'swing', dmg: 14, knock: 0.55, grab: false, armor: true, weapon: 'pipe',
    looks: [{ body: 'male', hair: ['buzzed', 'beard'], hairColor: 0x3a2a20, skin: 0xa77a5a, shirt: 0x3d4a5a, pants: 0x3a3330, boots: 0x2a2420, rim: RIM }],
  },
  thrower: {
    hp: 45, speed: 1.05, attack: 'throw', dmg: 8, knock: 1.1, grab: true,
    looks: [{ body: 'female', hair: ['simpleparted'], hairColor: 0x9a6ad0, shirt: 0x8a3a8a, pants: 0x2c2c3a, boots: 0x1d1b22, rim: RIM }],
  },
  boss: {
    hp: 520, speed: 0.95, scale: 1.3, attack: 'boss', dmg: 9, knock: 0.5, grab: 'stun', boss: true, chargeV: 10, name: 'ONI',
    looks: [{ body: 'male', hair: ['long', 'beard'], hairColor: 0xd8d8d8, skin: 0xc29a7a, shirt: 0x6e1e2a, pants: 0x1a1a22, boots: 0x111114, tattoo: true, rim: 0xff3d6e, rimK: 0.9, rimPow: 2.6 }],
  },
};

// Coups ennemis, temps en secondes de clip
const PUNCH = { clip: 'Punch_Cross', active: [0.22, 0.34], end: 0.8 };
const SWING = { clip: 'Sword_Regular_A', active: [0.14, 0.3], end: 0.75, speed: 0.55, reach: 1.05 };
const THROW_AT = 0.36;
const BOSS_COMBO = [
  { clip: 'Punch_Jab', speed: 0.8, active: [0.16, 0.27], end: 0.5, dmg: 8 },
  { clip: 'Punch_Cross', speed: 0.8, active: [0.22, 0.34], end: 0.62, dmg: 9 },
  { clip: 'Melee_Hook', speed: 0.85, active: [0.17, 0.3], end: 0.62, dmg: 13, heavy: true },
];
const WARN = new THREE.Color(1, 0.12, 0.08);
// Chutes : mise au sol (on se relève) ou mort. hold = instant du clip tenu tant qu'il est en l'air.
const FALL = {
  knock: { clip: 'Hit_Knockback', from: 0, speed: 1.1, hold: 0.22 },
  death: { clip: 'Death01', from: 0.62, speed: 1.25, hold: 0.95 },
};
// fin d'un coup : à l'instant prévu, ou à la fin réelle du clip s'il est plus court
const done = (a, end) => !a.isRunning() || a.time >= Math.min(end, a.getClip().duration - 0.02);
const HITTABLE = ['approach', 'windup', 'attack', 'charge', 'stun', 'hitstun'];
const ARMORED = ['windup', 'attack', 'charge'];

export class Enemy extends Character {
  constructor(game, type, variant = 0) {
    const T = TYPES[type];
    super(game, T.looks[variant % T.looks.length], { x: 0, z: 0, facing: -1, hp: T.hp });
    this.type = type;
    this.T = T;
    this.hScale = T.scale || 1;
    this.model.root.scale.setScalar(this.hScale);
    this.bowled = new Set();
    this.hitDir = 1;
    this.stunDur = 0.4;
    this.warnK = 0;
    this.makeBar();
    if (T.weapon) this.holdWeapon(T.weapon);
    this.deactivate();
  }

  holdWeapon(type) {
    const g = new THREE.Group(), def = WEAPONS[type];
    const { mesh } = def.build(g);
    mesh.position.y = -def.len / 2 + 0.08;
    g.position.set(0.02, 0.08, 0);
    g.rotation.set(0, 0, Math.PI / 2);
    this.model.bones.hand_r.add(g);
  }

  makeBar() {
    const g = new THREE.Group();
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.06), new THREE.MeshBasicMaterial({ color: 0x08070e, transparent: true, opacity: 0.75, depthTest: false }));
    const fillGeo = new THREE.PlaneGeometry(0.56, 0.03);
    fillGeo.translate(0.28, 0, 0);
    this.barMat = new THREE.MeshBasicMaterial({ color: 0x5be36b, depthTest: false });
    const fill = new THREE.Mesh(fillGeo, this.barMat);
    fill.position.set(-0.28, 0, 0.001);
    bg.renderOrder = 20; fill.renderOrder = 21;
    g.add(bg, fill);
    this.game.scene.add(g);
    this.bar = g;
    this.barFill = fill;
  }

  // ---- pool : le directeur de stage active / range les ennemis (aucune instanciation en cours de partie)
  spawn(x, z, enterX) {
    this.x = x; this.z = z; this.y = 0; this.vx = this.vy = this.kx = 0;
    this.enterX = enterX;
    this.facing = enterX > x ? 1 : -1;
    this.yaw = this.facing > 0 ? Math.PI / 2 : -Math.PI / 2;
    this.hp = this.maxHp;
    this.ko = false;
    this.active = true;
    this.fall = null;
    this.stunHits = 0;
    this.stunT = 0;
    this.phase2 = false;
    this.attacks = 0;
    this.cooldown = 0.6 + Math.random() * 0.6;
    this.clip = null;
    this.model.root.visible = true;
    this.game.scene.add(this.model.root, this.bar);
    this.model.setFlash(0);
    this.collider.setEnabled(true);
    this.setState('enter');
  }

  deactivate() {
    this.active = false;
    this.releaseToken();
    this.model.root.visible = false;
    this.bar.visible = false;
    this.game.scene.remove(this.model.root, this.bar);
    this.collider.setEnabled(false);
    this.state = 'off';
  }

  // Coups légers sans effet pendant une attaque (armure) ; le costaud y est insensible tout le temps ;
  // le boss encaisse tout sans broncher, sauf sonné (5 coups max) ou sur un smash.
  resists(A, heavy) {
    if (this.T.boss) return !A.smash && !(['stun', 'hitstun'].includes(this.state) && this.stunHits < 5);
    if (this.T.armor) return !heavy && !A.weapon;
    return !heavy && !A.weapon && ARMORED.includes(this.state);
  }

  grabbable() {
    return this.T.grab === true ? true : this.T.grab === 'stun' && this.state === 'stun';
  }

  hittable() {
    return this.active && HITTABLE.includes(this.state);
  }

  grabbed() {
    this.releaseToken();
    this.kx = 0;
    this.anim('Hit_Chest', { fade: 0.06, restart: true, from: 0.12, speed: 0 });
    this.setState('grabbed');
  }

  released(dir) {
    this.y = 0;
    this.lightHit(dir);
  }

  airborne() {
    return this.state === 'knock' && this.y > 0.12;
  }

  // Jetons d'attaque : 1 au corps à corps, 2 à partir de 3 ennemis (jamais 3). Lanceur et boss n'en ont pas besoin.
  takeToken() {
    const g = this.game;
    if (g.tokens.has(this)) return true;
    const melee = g.enemies.filter((e) => e.active && !e.ko && !e.T.boss && e.T.attack !== 'throw').length;
    if (g.tokens.size >= (melee >= 3 ? 2 : 1)) return false;
    g.tokens.add(this);
    return true;
  }

  releaseToken() {
    this.game.tokens.delete(this);
  }

  lightHit(dir) {
    this.releaseToken();
    this.hitDir = dir;
    this.kx = dir * CFG.knockLight * this.T.knock;
    if (this.T.boss) this.stunHits++;
    const clip = Math.random() < 0.5 ? 'Hit_Chest' : 'Hit_Head';
    this.anim(clip, { fade: 0.04, restart: true, speed: 1.1 });
    this.stunDur = this.model.actions[clip].getClip().duration / 1.1 + 0.08;
    this.setState('hitstun');
  }

  heavyHit(launch) {
    this.releaseToken();
    this.hitDir = Math.sign(launch.x) || 1;
    this.facing = -this.hitDir;
    this.bowled.clear();
    this.knock(launch.x, launch.y);
  }

  // Chute animée : Hit_Knockback (finit sur le dos, enchaîne LayToIdle) ou, au KO, Death01.
  // La pose « en chute » est tenue en l'air (FALL.hold), la fin du clip se joue à l'atterrissage.
  knock(vx, vy, from = 0) {
    const k = this.T.knock;
    this.vx = vx * k;
    this.vy = vy * (0.5 + 0.5 * k);
    this.y = Math.max(this.y, 0.01);
    this.facing = vx ? -Math.sign(vx) : this.facing;
    this.fall = this.ko ? FALL.death : FALL.knock;
    this.anim(this.fall.clip, { fade: 0.04, restart: true, from: Math.max(from, this.fall.from), speed: this.fall.speed });
    this.setState('knock');
  }

  die() {
    if (this.state !== 'knock' || this.fall === FALL.death) return;
    this.fall = FALL.death;
    this.anim(FALL.death.clip, { fade: 0.08, restart: true, from: FALL.death.from, speed: FALL.death.speed });
  }

  juggle(vx, vy) {
    this.knock(vx, Math.max(this.vy, 0) * 0.3 + vy, this.ko ? FALL.death.from : 0.05);
  }

  walkAnim(v) {
    this.speed = v;
    if (v > 0.15) this.anim('Walk_Loop', { fade: 0.2, speed: Math.max(0.5, v / (WALK_SPEED * CFG.animSpeed)) });
    else this.anim(this.T.weapon ? 'Sword_Idle' : 'Guard', { fade: 0.25, speed: this.T.weapon ? 1 : 0, loop: true });
  }

  // Marche vers (tx, tz) ; renvoie le pivot de profondeur pour le « lean »
  moveTo(tx, tz, dt) {
    if (this.detourT > 0) { this.detourT -= dt; tz = this.detourZ; } // contournement d'une vitrine
    const dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz);
    const sp = CFG.enemySpeed * this.T.speed * (this.phase2 ? 1.2 : 1) * Math.min(1, d / 0.4);
    let mx = 0, mz = 0;
    if (d > 0.05) { mx = (dx / d) * sp * dt; mz = (dz / d) * sp * 0.8 * dt; }
    this.x += mx; this.z += mz;
    this.walkAnim(Math.hypot(mx, mz) / dt);
    return -Math.sign(mz) * Math.min(0.5, Math.abs(mz / dt));
  }

  startAttack(clip, speed) {
    this.anim(clip, { fade: 0.08, restart: true, speed: speed * CFG.enemyAggro });
    this.struck = false;
    this.whoosh = false;
    sfx.warn();
    this.setState('attack');
  }

  startWindup(mode) {
    this.mode = mode;
    this.releaseToken();
    sfx.warn();
    if (mode === 'slam') this.anim('Jump_Start', { fade: 0.1, restart: true, from: 0.05, speed: 0 });
    else this.anim('Punch_Cross', { fade: 0.1, restart: true, from: 0.1, speed: 0 });
    this.setState('windup');
  }

  stun(d) {
    this.stunT = d;
    this.stunHits = 0;
    this.anim('Idle_Shield_Break', { fade: 0.1, restart: true, speed: 1 });
    this.setState('stun');
  }

  endAttack(cool) {
    this.releaseToken();
    this.cooldown = cool / CFG.enemyAggro;
    this.setState('approach');
  }

  hitHero(dmg, heavy) {
    this.struck = true;
    this.game.hero.hurt(this.facing, dmg * CFG.enemyDmg / 7, heavy);
  }

  // ---------------------------------------------------------------
  update(dt) {
    if (dt <= 0 || !this.active) return;
    const game = this.game, hero = game.hero, T = this.T;
    this.t += dt;
    this.cooldown -= dt;
    this.warnK = 0;
    const toHero = Math.sign(hero.x - this.x) || 1;
    const adx = Math.abs(hero.x - this.x), adz = Math.abs(hero.z - this.z);
    let lean = 0;
    if (T.boss && !this.phase2 && this.hp < this.maxHp / 2 && !this.ko) { this.phase2 = true; game.stage?.bossRage(this); }

    switch (this.state) {
      case 'enter': {
        const dx = this.enterX - this.x;
        const step = Math.sign(dx) * Math.min(Math.abs(dx), CFG.enemySpeed * 1.3 * dt);
        this.x += step;
        this.facing = Math.sign(dx) || this.facing;
        this.walkAnim(Math.abs(step) / dt);
        if (Math.abs(dx) < 0.05 || this.t > 5) this.setState('approach');
        break;
      }
      case 'approach': {
        this.facing = toHero;
        // côté d'approche ; si la place manque contre un mur pour prendre de l'élan, il passe de l'autre côté
        let side = this.x >= hero.x ? 1 : -1;
        const room = T.attack === 'charge' || T.attack === 'throw' ? 4.2 : 0;
        if (room && (side > 0 ? ARENA.maxX - hero.x : hero.x - ARENA.minX) < room) side = -side;
        const lane = (i) => Math.max(ARENA.minZ, Math.min(ARENA.maxZ, hero.z + i));
        const wait = 2.2 + (this.waitSlot || 0) * 0.45;
        if (T.attack === 'boss') { lean = this.bossThink(dt, side, adx, adz); break; }
        if (T.attack === 'throw') {
          // garde ses distances, change de couloir, lance quand il est prêt
          lean = this.moveTo(hero.x + side * 4.5, lane(this.z > hero.z ? 0.8 : -0.8), dt);
          this.facing = toHero;
          if (this.cooldown <= 0 && adx > 2.5 && adx < 7 && !game.bottles.busy(this)) this.startAttack('OverhandThrow', 1);
          break;
        }
        const mine = this.cooldown <= 0 && adx < 6 && this.takeToken();
        if (T.attack === 'charge') {
          this.planT = mine ? (this.planT || 0) + dt : 0;
          if (this.planT > 3) { this.planT = 0; this.releaseToken(); this.cooldown = 0.8; break; } // plan raté : il rend le jeton
          lean = this.moveTo(hero.x + side * (mine ? 3.8 : wait + 0.6), mine ? hero.z : lane(this.waitSlot % 2 ? 0.55 : -0.55), dt);
          if (mine && adz < 0.3 && adx > 2.2 && adx < 5.5) this.startWindup('charge');
          break;
        }
        const reach = T.attack === 'swing' ? 1.25 : 0.95;
        lean = this.moveTo(hero.x + side * (mine ? reach : wait), mine ? hero.z : lane(this.waitSlot % 2 ? 0.55 : -0.55), dt);
        this.facing = toHero;
        if (mine && adx < reach + 0.2 && adz < 0.28) {
          if (T.attack === 'swing') this.startAttack(SWING.clip, SWING.speed);
          else this.startAttack(PUNCH.clip, CFG.enemyWindup);
        }
        break;
      }
      case 'windup': {
        const d = this.mode === 'slam' ? 0.6 : 0.55;
        this.warnK = 0.3 + 0.6 * (this.t / d);
        this.facing = toHero;
        if (this.mode === 'charge') this.z += Math.sign(hero.z - this.z) * Math.min(adz, 1.2 * dt); // s'aligne
        if (this.t >= d) {
          if (this.mode === 'slam') { this.vy = 6.2; this.y = 0.01; this.anim('Jump_Loop', { fade: 0.1 }); sfx.whoosh(true); this.setState('jump'); }
          else { this.struck = false; sfx.whoosh(true); this.setState('charge'); }
        }
        break;
      }
      case 'charge': {
        this.anim('Jog_Fwd_Loop', { fade: 0.08, speed: 2.2 });
        const v = T.chargeV * (this.phase2 ? 1.15 : 1);
        this.x += this.facing * v * dt;
        if (this.t % 0.12 < dt) game.juice.dust(this.x - this.facing * 0.3, this.z, 0.35);
        if (!this.struck && Math.abs(hero.x - this.x) < 0.6 && adz < 0.45 && hero.y < 0.6) this.hitHero(T.attack === 'boss' ? 16 : T.dmg, true);
        const passed = (this.x - hero.x) * this.facing > 1.8;
        const wall = this.x <= ARENA.minX + 0.05 || this.x >= ARENA.maxX - 0.05;
        if (this.t > 1.2 || passed || wall) {
          if (wall) { game.juice.shake(0.3); sfx.thud(0.6); }
          this.releaseToken();
          this.stun(T.boss ? 1.1 : T.stun);
        }
        break;
      }
      case 'jump': { // boss : saut puis onde de choc au sol
        this.vy -= CFG.gravity * dt;
        this.y += this.vy * dt;
        this.x += Math.sign(hero.x - this.x) * Math.min(adx, 2.5 * dt);
        if (this.y <= 0) {
          this.y = 0;
          this.anim('Jump_Land', { fade: 0.04, restart: true, speed: 1.2 });
          game.bottles.wave(this, this.phase2 ? 6 : 5);
          game.juice.shake(0.8); game.juice.camPunch(0.12); game.juice.dust(this.x, this.z, 2);
          game.input.rumble(200, 1);
          sfx.smash();
          this.stun(0.9);
        }
        break;
      }
      case 'stun': {
        if (this.t >= this.stunT) { this.stunT = 0; this.endAttack(T.boss ? 0.6 : 1.2); }
        break;
      }
      case 'attack': {
        if (T.attack === 'boss') { this.bossCombo(dt, toHero, adz); break; }
        if (T.attack === 'throw') {
          const ct = this.model.actions.OverhandThrow.time;
          this.facing = toHero;
          if (ct < THROW_AT) this.warnK = 0.3 + 0.5 * (ct / THROW_AT);
          else if (!this.struck) { this.struck = true; game.bottles.throw(this, hero); }
          if (done(this.model.actions.OverhandThrow, 0.9)) this.endAttack(2 + Math.random());
          break;
        }
        const A = T.attack === 'swing' ? SWING : PUNCH;
        const ct = this.model.actions[A.clip].time;
        if (ct < A.active[0]) { this.facing = toHero; this.warnK = 0.25 + 0.5 * (ct / A.active[0]); }
        else if (ct < A.active[1]) {
          this.x += this.facing * 1.0 * dt;
          if (!this.whoosh) { sfx.whoosh(T.attack === 'swing'); this.whoosh = true; }
          if (!this.struck && adz < 0.5) {
            if (A.reach) { if (Math.abs(hero.x - (this.x + this.facing * A.reach)) < 0.7) this.hitHero(T.dmg, true); }
            else { this.tip('fistR', _p); if (hero.hurtDist(_p) < 0.48) this.hitHero(T.dmg, false); }
          }
        }
        if (done(this.model.actions[A.clip], A.end)) this.endAttack(0.9 + Math.random() * 0.9);
        break;
      }
      case 'grabbed':
        this.step(dt);
        this.updateBar();
        return;
      case 'hitstun': {
        if (this.t >= this.stunDur) {
          this.cooldown = Math.max(this.cooldown, T.boss ? 0.2 : 0.4);
          if (T.boss && this.stunHits < 5 && this.stunT > 0) { const n = this.stunHits; this.stun(0.4); this.stunHits = n; }
          else { this.stunT = 0; this.setState('approach'); }
        }
        break;
      }
      case 'knock': {
        const F = this.fall, a = this.model.actions[F.clip];
        const air = this.y > 0;
        this.x += this.vx * dt;
        if (Math.abs(this.vx) > 1.5) game.level.breakables.sweep(this);
        if (air) {
          this.vy -= CFG.gravity * dt;
          this.y += this.vy * dt;
          this.vx *= Math.exp(-0.6 * dt);
          a.timeScale = a.time > F.hold ? 0 : F.speed;
          if (this.y <= 0) {
            this.y = 0;
            a.timeScale = F.speed;
            if (this.ko && this.vy < -1.5) { sfx.thud(0.9); game.juice.dust(this.x, this.z, 1.4); game.juice.shake(0.25); }
            else if (this.vy < -2.5) { sfx.thud(-this.vy / 8); game.juice.dust(this.x, this.z, 1); game.juice.shake(Math.min(0.2, -this.vy * 0.02)); }
            this.vy = 0;
          }
        } else {
          this.vx *= Math.exp(-CFG.groundDrag * dt);
        }
        if (!air && this.y === 0 && (a.time >= a.getClip().duration - 0.02 || !a.isRunning())) this.setState('down');
        break;
      }
      case 'down': {
        this.x += this.vx * dt;
        this.vx *= Math.exp(-CFG.groundDrag * dt);
        if (this.ko) {
          this.model.root.visible = this.t < 1.6 || Math.floor(this.t * 14) % 2 === 0; // clignote puis disparaît
          if (this.t > 2.5) game.stage.remove(this);
        } else if (this.t > (T.boss ? 0.8 : 0.35)) { this.anim('LayToIdle', { fade: 0.05, restart: true, speed: 1.2 }); this.setState('getup'); }
        break;
      }
      case 'getup': {
        const a = this.model.actions.LayToIdle;
        if (!a.isRunning() || a.time >= a.getClip().duration - 0.05) { this.cooldown = 0.6; this.setState('approach'); }
        break;
      }
    }
    if (!this.active) return;

    // télégraphie : il rougit pendant ses préparations
    if (this.warnK > 0) { this.model.setFlash(this.warnK, WARN); this.warned = true; }
    else if (this.warned) { this.warned = false; this.model.setFlash(0); }

    this.kx *= Math.exp(-7 * dt);
    this.x += this.kx * dt;
    this.clampArena();
    this.step(dt, lean);
    this.updateBar();
  }

  // ---- Boss : choisit entre combo (près), charge (loin, aligné) et saut + onde de choc (tous les 3 coups)
  bossThink(dt, side, adx, adz) {
    const hero = this.game.hero;
    if (this.t > 3 && this.nextMove && this.nextMove !== 'combo') { this.nextMove = adx < 1.6 ? 'combo' : 'slam'; this.t = 0; } // plan bloqué
    if ((side > 0 ? ARENA.maxX - hero.x : hero.x - ARENA.minX) < 4.4) side = -side;
    const want = this.nextMove || (this.nextMove = this.pickMove(adx));
    let lean;
    if (want === 'combo') {
      lean = this.moveTo(hero.x + side * 1.05, hero.z, dt);
      if (this.cooldown <= 0 && adx < 1.35 && adz < 0.3) { this.nextMove = null; this.comboStep = 0; this.bossStep(); }
    } else if (want === 'charge') {
      lean = this.moveTo(hero.x + side * 4.2, hero.z, dt);
      if (this.cooldown <= 0 && adz < 0.35 && adx > 2.6) { this.nextMove = null; this.startWindup('charge'); }
    } else {
      lean = this.moveTo(hero.x + side * 2.2, hero.z, dt);
      if (this.cooldown <= 0) { this.nextMove = null; this.startWindup('slam'); }
    }
    this.facing = Math.sign(hero.x - this.x) || this.facing;
    return lean;
  }

  pickMove(adx) {
    this.attacks++;
    if (this.attacks % 3 === 0 || (this.phase2 && Math.random() < 0.3)) return 'slam';
    return adx > 3 || Math.random() < 0.35 ? 'charge' : 'combo';
  }

  bossStep() {
    const s = BOSS_COMBO[this.comboStep];
    this.anim(s.clip, { fade: 0.06, restart: true, speed: s.speed * (this.phase2 ? 1.15 : 1) });
    this.struck = false;
    this.whoosh = false;
    if (this.comboStep === 0) sfx.warn();
    this.setState('attack');
  }

  bossCombo(dt, toHero, adz) {
    const s = BOSS_COMBO[this.comboStep], hero = this.game.hero;
    const ct = this.model.actions[s.clip].time;
    if (ct < s.active[0]) { this.facing = toHero; if (this.comboStep === 0) this.warnK = 0.3 + 0.5 * (ct / s.active[0]); }
    else if (ct < s.active[1]) {
      this.x += this.facing * 1.4 * dt;
      if (!this.whoosh) { sfx.whoosh(true); this.whoosh = true; }
      this.tip(s.clip === 'Punch_Jab' ? 'fistL' : 'fistR', _p);
      if (!this.struck && adz < 0.55 && hero.hurtDist(_p) < 0.6) this.hitHero(s.dmg, !!s.heavy);
    }
    if (done(this.model.actions[s.clip], s.end)) {
      if (++this.comboStep < BOSS_COMBO.length) this.bossStep();
      else this.stun(0.7); // fenêtre de punition
    }
  }

  updateBar() {
    const show = this.active && !this.T.boss && !(this.ko && this.state === 'down') && this.state !== 'enter';
    this.bar.visible = show;
    if (!show) return;
    this.headPos(_p);
    this.bar.position.copy(_p);
    this.bar.quaternion.copy(this.game.camera.quaternion);
    const k = Math.max(0, this.hp / this.maxHp);
    this.barFill.scale.x = Math.max(0.001, k);
    this.barMat.color.setHex(k > 0.5 ? 0x3fe0ff : k > 0.25 ? 0xff8a3c : 0xff3d6e);
  }
}

// Projectiles ennemis : bouteilles du lanceur (pool de 3) et onde de choc au sol du boss (1 anneau).
export class Hazards {
  constructor(game) {
    this.game = game;
    const glass = new THREE.MeshToonMaterial({ color: 0x3f8a5a, emissive: 0x0a2a14 });
    this.items = [0, 1, 2].map(() => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.26, 8), glass);
      m.visible = false;
      game.scene.add(m);
      return { m, on: false, owner: null, v: new THREE.Vector3() };
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xff3d6e, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, forceSinglePass: true }));
    ring.visible = false;
    ring.renderOrder = 4;
    game.scene.add(ring);
    this.ring = ring;
    this.shock = null;
  }

  busy(owner) {
    return this.items.some((b) => b.on && b.owner === owner);
  }

  throw(owner, hero) {
    const b = this.items.find((i) => !i.on);
    if (!b) return;
    owner.tip('fistR', _p);
    b.m.position.copy(_p);
    // vise l'endroit où est John au lâcher : on l'évite en changeant de couloir, en sautant ou en roulant
    const dx = hero.x - _p.x, dz = hero.z - _p.z, d = Math.hypot(dx, dz) || 1, v = 8.5;
    b.v.set((dx / d) * v, 1.2, (dz / d) * v);
    b.on = true; b.owner = owner; b.t = 0;
    b.m.visible = true;
    sfx.whoosh(false);
  }

  wave(owner, radius) {
    this.shock = { x: owner.x, z: owner.z, r: 0.3, max: radius, hit: false };
    this.ring.visible = true;
  }

  update(dt) {
    const hero = this.game.hero, juice = this.game.juice;
    for (const b of this.items) {
      if (!b.on) continue;
      b.t += dt;
      b.v.y -= 7 * dt;
      b.m.position.addScaledVector(b.v, dt);
      b.m.rotation.z += 14 * dt;
      const p = b.m.position;
      const hit = Math.hypot(p.x - hero.x, p.z - hero.z) < 0.45 && p.y > hero.y + 0.4 && p.y < hero.y + 1.8;
      if (hit) hero.hurt(Math.sign(b.v.x) || 1, b.owner.T.dmg * CFG.enemyDmg / 7, false);
      if (hit || p.y < 0.05 || b.t > 2) {
        b.on = false; b.m.visible = false;
        juice.sparks(p, Math.sign(b.v.x) || 1, 10, 0.5, [0.6, 1, 0.75]);
        sfx.glass();
      }
    }
    const s = this.shock;
    if (s) {
      s.r += 9 * dt;
      this.ring.position.set(s.x, 0.03, s.z);
      this.ring.scale.set(s.r, 1, s.r * 0.75);
      this.ring.material.opacity = 1 - s.r / s.max;
      const d = Math.hypot(hero.x - s.x, (hero.z - s.z) / 0.75);
      if (!s.hit && Math.abs(d - s.r) < 0.45 && hero.y < 0.25) { s.hit = true; hero.hurt(Math.sign(hero.x - s.x) || 1, 14 * CFG.enemyDmg / 7, true); }
      if (s.r >= s.max) { this.shock = null; this.ring.visible = false; }
    }
  }
}
