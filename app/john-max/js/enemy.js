import * as THREE from 'three';
import { CFG } from './config.js';
import { Character } from './character.js';
import { ARENA } from './level.js';
import { sfx } from './audio.js';

const _p = new THREE.Vector3();
const WALK_SPEED = 1.5; // vitesse naturelle du clip Walk_Loop (m/s)
// Vêtements un peu désaturés : le héros (liseré orange) doit rester le point focal
const LOOKS = [
  { body: 'male', hair: ['simpleparted'], hairColor: 0x6fae55, shirt: 0xa8445a, pants: 0x33303d, boots: 0x1d1b22, rim: 0x4fb8ff },
  { body: 'male', hair: ['buzzed'], hairColor: 0xd2a24c, skin: 0xb98a6a, shirt: 0x6a57a8, pants: 0x4f5b3a, boots: 0xe8e2d0, rim: 0x4fb8ff },
  { body: 'female', hair: ['long'], hairColor: 0xc0566a, shirt: 0x3a8178, pants: 0x2c2c3a, boots: 0x1d1b22, rim: 0x4fb8ff },
];
// Attaque ennemie : cross ralenti pour être lisible. Temps en secondes de clip.
const ATK = { clip: 'Punch_Cross', active: [0.22, 0.34], end: 0.8 };
const WARN = new THREE.Color(1, 0.12, 0.08);
// Chutes : mise au sol (on se relève) ou mort. hold = instant du clip tenu tant qu'il est en l'air.
const FALL = {
  knock: { clip: 'Hit_Knockback', from: 0, speed: 1.1, hold: 0.22 },
  death: { clip: 'Death01', from: 0.62, speed: 1.25, hold: 0.95 },
};

export class Enemy extends Character {
  constructor(game, idx) {
    super(game, LOOKS[idx % 3], { x: 3 + idx * 1.5, z: idx % 2 ? 0.6 : -0.6, facing: -1, hp: 60 });
    this.idx = idx;
    this.active = true;
    this.cooldown = 1 + idx * 0.8;
    this.ko = false;
    this.bowled = new Set();
    this.hitDir = 1;
    this.stunDur = 0.4;
    this.makeBar();
    this.setState('approach');
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

  setState(s) {
    if (this.warned && s !== 'attack') { this.warned = false; this.model.setFlash(0); }
    super.setState(s);
  }

  // Armure de l'attaque : les coups légers blessent sans interrompre
  armored() {
    return this.state === 'attack';
  }

  hittable() {
    return this.active && ['approach', 'attack', 'hitstun'].includes(this.state);
  }

  // Saisi par le héros : figé en réaction, placé chaque tick par le héros
  grabbed() {
    this.releaseToken();
    this.kx = 0;
    this.anim('Hit_Chest', { fade: 0.06, restart: true, from: 0.12, speed: 0 });
    this.setState('grabbed');
  }

  // Lâché sans être projeté (le héros a pris un coup, sauté, roulé, ou la prise a expiré)
  released(dir) {
    this.y = 0;
    this.lightHit(dir);
  }

  // En l'air après un coup fort (chute animée) : on peut le rattraper (juggle)
  airborne() {
    return this.state === 'knock' && this.y > 0.12;
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
    this.hitDir = Math.sign(launch.x) || 1;
    this.facing = -this.hitDir;
    this.bowled.clear();
    this.knock(launch.x, launch.y);
  }

  // Chute animée : Hit_Knockback (finit sur le dos) + trajectoire balistique du root.
  // Sa dernière pose correspond à la première de LayToIdle : le relevé s'enchaîne sans saut.
  // KO : Death01 (recule, part à la renverse, reste étendu bras en croix) à la place du Hit_Knockback.
  // La pose « en chute » est tenue en l'air (FALL.hold), la fin du clip se joue à l'atterrissage.
  knock(vx, vy, from = 0) {
    this.vx = vx;
    this.vy = vy;
    this.y = Math.max(this.y, 0.01);
    this.facing = vx ? -Math.sign(vx) : this.facing;
    this.fall = this.ko ? FALL.death : FALL.knock;
    this.anim(this.fall.clip, { fade: 0.04, restart: true, from: Math.max(from, this.fall.from), speed: this.fall.speed });
    this.setState('knock');
  }

  // Appelé au KO : si l'ennemi est déjà en train de tomber, la chute devient une mort
  die() {
    if (this.state !== 'knock' || this.fall === FALL.death) return;
    this.fall = FALL.death;
    this.anim(FALL.death.clip, { fade: 0.08, restart: true, from: FALL.death.from, speed: FALL.death.speed });
  }

  // Coup reçu en l'air : on le relance vers le haut
  juggle(vx, vy) {
    this.knock(vx, Math.max(this.vy, 0) * 0.3 + vy, this.ko ? FALL.death.from : 0.05);
  }

  respawn() {
    const hero = this.game.hero;
    this.y = this.vx = this.vy = 0;
    this.collider.setEnabled(true);
    this.hp = this.maxHp;
    this.ko = false;
    const right = hero.x < (ARENA.minX + ARENA.maxX) / 2;
    this.x = right ? ARENA.maxX + 1.5 : ARENA.minX - 1.5;
    this.z = (Math.random() - 0.5) * 2;
    this.facing = right ? -1 : 1;
    this.yaw = this.facing > 0 ? Math.PI / 2 : -Math.PI / 2;
    this.cooldown = 1;
    this.clip = null;
    this.setState('enter');
  }

  walkAnim(v) {
    this.speed = v;
    if (v > 0.15) this.anim('Walk_Loop', { fade: 0.2, speed: Math.max(0.5, v / (WALK_SPEED * CFG.animSpeed)) });
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
          this.anim(ATK.clip, { fade: 0.08, restart: true, speed: CFG.enemyWindup * CFG.enemyAggro });
          this.struck = false;
          this.whoosh = false;
          sfx.warn();
          this.setState('attack');
        }
        break;
      }
      case 'attack': {
        // préparation lisible (clip ralenti), frappe pendant la fenêtre active, puis retour en garde
        const ct = this.model.actions[ATK.clip].time;
        // télégraphie : il rougit pendant la préparation (pulsation qui monte jusqu'à la frappe)
        if (ct < ATK.active[0]) {
          this.facing = toHero;
          this.model.setFlash(0.25 + 0.5 * (ct / ATK.active[0]), WARN);
          this.warned = true;
        } else if (this.warned) { this.warned = false; this.model.setFlash(0); }
        if (ct < ATK.active[0]) { /* préparation */ } else if (ct < ATK.active[1]) {
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
      case 'grabbed':
        this.step(dt);
        this.updateBar();
        return;
      case 'hitstun': {
        if (this.t >= this.stunDur) { this.cooldown = Math.max(this.cooldown, 0.4); this.setState('approach'); }
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
          a.timeScale = a.time > F.hold ? 0 : F.speed; // pose de chute tenue en l'air, la fin se joue à l'atterrissage
          if (this.y <= 0) {
            this.y = 0;
            a.timeScale = F.speed;
            if (this.ko && this.vy < -1.5) { sfx.thud(0.9); game.juice.dust(this.x, this.z, 1.4); game.juice.shake(0.25); this.vy = 0; }
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
          if (this.t > 2.5) { this.model.root.visible = true; this.respawn(); }
        }
        else if (this.t > 0.35) { this.anim('LayToIdle', { fade: 0.05, restart: true, speed: 1.2 }); this.setState('getup'); }
        break;
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

  updateBar() {
    const show = this.active && !(this.ko && this.state === 'down') && this.state !== 'enter';
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
