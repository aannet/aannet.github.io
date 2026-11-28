import * as THREE from 'three';
import { CFG } from './config.js';
import { Character } from './character.js';
import { ARENA } from './level.js';
import { sfx } from './audio.js';

const _p = new THREE.Vector3();
const WALK_SPEED = 1.5; // vitesse naturelle du clip Walk_Loop (m/s)
const LOOKS = [
  { body: 'male', hair: ['simpleparted'], hairColor: 0x7ad44f, shirt: 0xc8324a, pants: 0x33303d, boots: 0x1d1b22, rim: 0x4fb8ff },
  { body: 'male', hair: ['buzzed'], hairColor: 0xf2b134, skin: 0xb98a6a, shirt: 0x7b4fd0, pants: 0x4f5b3a, boots: 0xe8e2d0, rim: 0x4fb8ff },
  { body: 'female', hair: ['long'], hairColor: 0xe84a5f, shirt: 0x2f9a8f, pants: 0x2c2c3a, boots: 0x1d1b22, rim: 0x4fb8ff },
];
// Attaque ennemie : cross ralenti pour être lisible. Temps en secondes de clip.
const ATK = { clip: 'Punch_Cross', active: [0.22, 0.34], end: 0.8 };

export class Enemy extends Character {
  constructor(game, idx) {
    super(game, LOOKS[idx % 3], { x: 3 + idx * 1.5, z: idx % 2 ? 0.6 : -0.6, facing: -1, hp: 60, ragIndex: idx });
    this.idx = idx;
    this.active = true;
    this.cooldown = 1 + idx * 0.8;
    this.ko = false;
    this.calmT = 0;
    this.bowled = new Set();
    this.launch = null;
    this.hitDir = 1;
    this.stunDur = 0.4;
    this.makeBar();
    this.setState('approach');
  }

  makeBar() {
    const g = new THREE.Group();
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.09), new THREE.MeshBasicMaterial({ color: 0x1a1020, depthTest: false }));
    const fillGeo = new THREE.PlaneGeometry(0.56, 0.05);
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

  hittable() {
    return this.active && !this.ragdoll && this.state !== 'react' && this.state !== 'enter' && this.state !== 'getup';
  }

  releaseToken() {
    if (this.game.token === this) this.game.token = null;
  }

  lightHit(dir) {
    this.releaseToken();
    this.hitDir = dir;
    this.kx = dir * CFG.knockLight;
    const clip = Math.random() < 0.5 ? 'Hit_Chest' : 'Hit_Head';
    this.anim(clip, { fade: 0.04, restart: true, speed: 1.1 });
    this.stunDur = this.model.actions[clip].getClip().duration / 1.1 + 0.08;
    this.setState('hitstun');
  }

  heavyHit(launch) {
    this.releaseToken();
    this.launch = launch;
    this.hitDir = Math.sign(launch.x) || 1;
    this.facing = -this.hitDir;
    this.bowled.clear();
    if (CFG.ragdollDelay <= 0 || launch.instant) this.goRagdoll(launch);
    else {
      this.anim('Hit_Knockback', { fade: 0.03, restart: true, speed: 1.4 });
      this.setState('react');
    }
  }

  respawn() {
    const hero = this.game.hero;
    if (this.ragdoll) { this.ragdoll.dispose(); this.ragdoll = null; }
    this.collider.setEnabled(true);
    this.hp = this.maxHp;
    this.ko = false;
    const right = hero.x < (ARENA.minX + ARENA.maxX) / 2;
    this.x = right ? ARENA.maxX + 1.5 : ARENA.minX - 1.5;
    this.z = (Math.random() - 0.5) * 2;
    this.facing = right ? -1 : 1;
    this.yaw = this.facing > 0 ? Math.PI / 2 : -Math.PI / 2;
    this.histReady = false;
    this.cooldown = 1;
    this.clip = null;
    this.setState('enter');
  }

  walkAnim(v) {
    if (v > 0.15) this.anim('Walk_Loop', { fade: 0.2, speed: Math.max(0.5, v / WALK_SPEED) });
    else this.anim('Guard', { fade: 0.25, speed: 0, loop: true });
  }

  update(dt) {
    if (dt <= 0) return;
    const game = this.game, hero = game.hero;
    this.t += dt;
    this.cooldown -= dt;
    const toHero = Math.sign(hero.x - this.x) || 1;
    let lean = 0;

    switch (this.state) {
      case 'enter': {
        const tx = Math.max(ARENA.minX + 0.5, Math.min(ARENA.maxX - 0.5, this.x));
        const dx = tx - this.x;
        const step = Math.sign(dx) * Math.min(Math.abs(dx), CFG.enemySpeed * 1.3 * dt);
        this.x += step;
        this.facing = Math.sign(dx) || this.facing;
        this.walkAnim(Math.abs(step) / dt);
        if (Math.abs(dx) < 0.05) this.setState('approach');
        break;
      }
      case 'approach': {
        this.facing = toHero;
        if (!game.token && this.cooldown <= 0 && Math.abs(hero.x - this.x) < 4) game.token = this;
        const mine = game.token === this;
        const side = this.x >= hero.x ? 1 : -1;
        const dist = mine ? 0.95 : 2.2 + this.idx * 0.45;
        const tx = hero.x + side * dist;
        const tz = mine ? hero.z : Math.max(ARENA.minZ, Math.min(ARENA.maxZ, hero.z + (this.idx % 2 ? 0.55 : -0.55)));
        const dx = tx - this.x, dz = tz - this.z;
        const d = Math.hypot(dx, dz);
        const sp = CFG.enemySpeed * Math.min(1, d / 0.4);
        let mx = 0, mz = 0;
        if (d > 0.05) { mx = (dx / d) * sp * dt; mz = (dz / d) * sp * 0.8 * dt; }
        this.x += mx; this.z += mz;
        this.walkAnim(Math.hypot(mx, mz) / dt);
        lean = -Math.sign(mz) * Math.min(0.5, Math.abs(mz / dt));
        if (mine && Math.abs(hero.x - this.x) < 1.15 && Math.abs(hero.z - this.z) < 0.28) {
          this.anim(ATK.clip, { fade: 0.08, restart: true, speed: 0.75 * CFG.enemyAggro });
          this.struck = false;
          this.setState('attack');
        }
        break;
      }
      case 'attack': {
        // préparation lisible (clip ralenti), frappe pendant la fenêtre active, puis retour en garde
        const ct = this.model.actions[ATK.clip].time;
        if (ct < ATK.active[0]) this.facing = toHero;
        else if (ct < ATK.active[1]) {
          this.x += this.facing * 1.0 * dt;
          if (!this.whoosh) { sfx.whoosh(false); this.whoosh = true; }
          this.tip('fistR', _p);
          if (!this.struck && hero.hurtDist(_p) < 0.48 && Math.abs(hero.z - this.z) < 0.5) {
            this.struck = true;
            hero.hurt(this.facing);
          }
        }
        if (ct >= ATK.end) {
          this.whoosh = false;
          this.releaseToken();
          this.cooldown = (0.9 + Math.random() * 0.9) / CFG.enemyAggro;
          this.setState('approach');
        }
        break;
      }
      case 'hitstun': {
        if (this.t >= this.stunDur) { this.cooldown = Math.max(this.cooldown, 0.4); this.setState('approach'); }
        break;
      }
      case 'react': {
        // quelques frames d'animation lisible avant la bascule physique
        this.x += this.hitDir * 1.2 * dt;
        if (this.t >= CFG.ragdollDelay) {
          this.clampArena();
          this.step(dt);
          this.goRagdoll(this.launch);
          this.updateBar();
          return;
        }
        break;
      }
      case 'ragdoll': {
        this.ragdoll.groundDrag(dt);
        this.ragdoll.sync();
        this.thudCheck(dt);
        if (this.ko) {
          if (this.t > 3.5) this.respawn();
        } else {
          this.calmT = this.ragdoll.speed() < 0.45 ? this.calmT + dt : 0;
          if ((this.calmT > 0.5 && this.t > 0.9) || this.t > 3.5) {
            this.endRagdoll('LayToIdle');
            this.setState('getup');
          }
        }
        this.updateBar();
        return;
      }
      case 'getup': {
        const a = this.model.actions.LayToIdle;
        if (!a.isRunning() || a.time >= a.getClip().duration - 0.05) { this.cooldown = 0.6; this.setState('approach'); }
        break;
      }
    }

    this.kx *= Math.exp(-7 * dt);
    this.x += this.kx * dt;
    this.clampArena();
    this.step(dt, lean);
    this.updateBar();
  }

  thudCheck(dt) {
    const rd = this.ragdoll;
    rd.thudT -= dt;
    const vy = rd.bodies.torso.linvel().y;
    if (rd.prevVy < -3 && vy > -0.8 && rd.thudT <= 0) {
      sfx.thud(-rd.prevVy / 8);
      this.game.juice.shake(Math.min(0.25, -rd.prevVy * 0.025));
      rd.thudT = 0.25;
    }
    rd.prevVy = vy;
  }

  updateBar() {
    const show = this.active && (!this.ko || this.t < 0.8) && this.state !== 'enter';
    this.bar.visible = show;
    if (!show) return;
    this.headPos(_p);
    this.bar.position.copy(_p);
    this.bar.quaternion.copy(this.game.camera.quaternion);
    const k = Math.max(0, this.hp / this.maxHp);
    this.barFill.scale.x = Math.max(0.001, k);
    this.barMat.color.setHex(k > 0.5 ? 0x5be36b : k > 0.25 ? 0xf2c14e : 0xe8484a);
  }
}
