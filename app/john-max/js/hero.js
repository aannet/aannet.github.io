import * as THREE from 'three';
import { CFG } from './config.js';
import { Character } from './character.js';
import { FIST_COMBO, SMASH, CHARGED, AIR_STRIKE, resolveHit, resolveJuggle, resolveThrow } from './combat.js';
import { sfx } from './audio.js';

const _p = new THREE.Vector3();
const JOG_SPEED = 3.0; // vitesse naturelle du clip Jog_Fwd_Loop (m/s), pour caler les pieds
const ROLL_UP = 1.2; // instant du clip Roll où John est de nouveau debout
const THROW_RELEASE = 0.36; // instant du clip OverhandThrow où la main lâche

// John Max : débardeur noir, cargo gris acier, bottes acier, bandages, tatouage Oni sur le bras droit.
// Pantalon plus clair que le trottoir et liseré orange plus large : John reste lisible sur le décor sombre.
const LOOK = {
  body: 'male', hair: ['buzzed', 'beard'], saltPepper: true, spikes: { count: 60, len: 0.075 },
  shirt: 0x26272e, pants: 0x3a3d47, boots: 0x2a2c33, hands: 0x121212, tattoo: true, rim: 0xff8a3c, rimK: 1, rimPow: 2.6,
};

export class Hero extends Character {
  constructor(game) {
    super(game, LOOK, { x: -3, z: 0, facing: 1, hp: 100 });
    this.name = 'John Max';
    this.comboStep = 0;
    this.A = null;
    this.phase = 'main';
    this.hitSet = new Set();
    this.invuln = 0;
    this.weapon = null; // arme en main (weapons.js)
    this.carrying = null; // poubelle soulevée
    this.hitPoints = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.chargeT = 0;
    this.chargeK = 0;
    this.dodgeDir = new THREE.Vector2(1, 0);
    this.held = null; // ennemi saisi
    this.special = 0; // jauge 0..100 : pleine, elle débloque le smash
    this.grabT = 0;
    this.hits = []; // instants des derniers coups encaissés (mise à terre au 3e)
  }

  combo() {
    return this.weapon ? this.weapon.def.combo : FIST_COMBO;
  }

  // move : attaque hors combo (uppercut). Le coup suivant repart alors du début du combo.
  startAttack(step, move = null) {
    const C = this.combo();
    this.comboStep = move ? -1 : step % C.length;
    this.A = move || C[this.comboStep];
    this.phase = 'main';
    this.hitSet.clear();
    this.whooshed = false;
    const mx = this.game.input.move.x;
    if (Math.abs(mx) > 0.3) this.facing = Math.sign(mx);
    this.anim(this.A.clip, { fade: 0.06, speed: this.A.speed, restart: true, from: this.A.from || 0 });
    this.waveDone = false;
    this.setState('attack');
  }

  gainSpecial(n) {
    if (this.special >= 100) return;
    this.special = Math.min(100, this.special + n);
    if (this.special >= 100) { this.game.ui.message('SPÉCIAL PRÊT', 0.9); sfx.ready(); this.game.input.rumble(80, 0.4); }
  }

  // UP : smash si la jauge est pleine, sinon refus (signal visuel + sonore)
  tryUpper() {
    if (this.special < 100) { this.game.ui.specialDenied(); sfx.denied(); return false; }
    this.special = 0;
    this.smashDone = false;
    this.invuln = Math.max(this.invuln, 0.6); // la jauge ne se perd pas sur un coup pendant l'élan
    this.startAttack(0, SMASH);
    return true;
  }

  // Smash : flash, vibration, onde de choc, tout ce qui casse dans le rayon casse, les ennemis proches décollent
  smash() {
    this.smashDone = true;
    const { game } = this, R = CFG.smashRadius;
    game.time.hitstop(0.1);
    game.time.slowmo(0.6);
    game.juice.shake(1);
    game.juice.camPunch(0.24);
    game.juice.electricBurst(this.tip('fistR', _p), 2.6);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; game.juice.dust(this.x + Math.cos(a) * R * 0.6, this.z + Math.sin(a) * R * 0.35, 0.7); }
    game.ui.flashScreen('smash');
    game.input.rumble(320, 1);
    sfx.smash();
    game.level.breakables.smashArea(this.x, this.z, R);
    for (const e of game.enemies) {
      if (!e.active || e.state === 'enter' || Math.hypot(e.x - this.x, (e.z - this.z) * 1.5) > R) continue;
      const dir = Math.sign(e.x - this.x) || this.facing;
      const near = 1 - Math.min(1, Math.abs(e.x - this.x) / R) * 0.4; // plus fort au contact
      this.hitSet.add(e);
      e.hp -= CFG.smashDmg * CFG.damageMult;
      e.bowled.clear();
      e.knock(dir * CFG.smashKnock * near, CFG.upperUp * 1.25);
      game.juice.flash(e.rig);
      game.juice.sparks(e.headPos(_p), dir, 8 * CFG.particles, 1.5, [0.5, 0.9, 1]);
      game.ui.combo();
      if (e.hp <= 0 && !e.ko) game.onKO(e);
    }
  }

  // Charged Punch : John se fige épaule en arrière (frame de préparation du cross) et accumule l'énergie
  startCharge() {
    const mx = this.game.input.move.x;
    if (Math.abs(mx) > 0.3) this.facing = Math.sign(mx);
    this.chargeT = 0;
    this.chargeK = 0;
    this.anim('Punch_Cross', { fade: 0.1, restart: true, from: 0.1, speed: 0 });
    sfx.chargeStart();
    this.setState('charge');
  }

  stopCharge() {
    sfx.chargeStop();
    this.game.juice.charge(null, 0);
  }

  // Roulade : direction du stick (ou devant), invincible sur la plus grande partie
  startDodge() {
    const { move } = this.game.input;
    this.dodgeDir.set(move.x, move.z * 0.7);
    if (this.dodgeDir.lengthSq() < 0.05) this.dodgeDir.set(this.facing, 0);
    this.dodgeDir.normalize();
    if (Math.abs(this.dodgeDir.x) > 0.2) this.facing = Math.sign(this.dodgeDir.x);
    this.dodgeDur = ROLL_UP / (1.5 * CFG.animSpeed);
    this.invuln = this.dodgeDur * CFG.dodgeInvuln;
    this.dusted = false;
    this.anim('Roll', { fade: 0.05, restart: true, speed: 1.5 });
    sfx.whoosh(true);
    this.setState('dodge');
  }

  // Saut : impulsion (Jump_Start dès la détente), pose en l'air (Jump_Loop), réception (Jump_Land)
  startJump() {
    this.vy = CFG.jumpV;
    this.y = 0.01;
    this.A = null;
    this.airUsed = false;
    this.anim('Jump_Start', { fade: 0.05, restart: true, from: 0.06, speed: 1.6 });
    sfx.whoosh(false);
    this.game.juice.dust(this.x, this.z, 0.3);
    this.setState('air');
  }

  startLift(can) {
    this.game.weapons.lift(this, can);
    this.anim('Walk_Carry_Loop', { fade: 0.1, restart: true, speed: 0 });
    this.setState('carry');
  }

  dropCarried() {
    if (this.carrying) this.game.weapons.drop(this);
  }

  enemyClose(d) {
    return this.game.enemies.some((e) => e.hittable() && (e.x - this.x) * this.facing > -0.2 && Math.abs(e.x - this.x) < d && Math.abs(e.z - this.z) < 0.5);
  }

  // Saisie : John tient l'ennemi au col, bras tendus (pose de portage)
  startGrab(e) {
    this.held = e;
    this.facing = Math.sign(e.x - this.x) || this.facing;
    e.grabbed();
    this.anim('Walk_Carry_Loop', { fade: 0.1, restart: true, speed: 0 });
    sfx.punch(false);
    this.setState('grab');
  }

  release() {
    if (!this.held) return;
    this.held.released(this.facing);
    this.held = null;
  }

  // Lancer par-dessus l'épaule, devant (dir = facing) ou derrière (dir = -facing)
  startThrow(dir) {
    this.throwDir = dir;
    this.anim('OverhandThrow', { fade: 0.06, restart: true, speed: 1.3 });
    this.setState('throw');
  }

  // L'ennemi saisi suit les mains de John
  holdPosition() {
    const e = this.held;
    if (this.state === 'throw') {
      // pendant l'élan, il suit la main droite : recule, monte au-dessus de l'épaule
      this.tip('fistR', _p);
      e.x = _p.x + this.facing * 0.1;
      e.y = Math.max(0, _p.y - 1.3);
      e.z = _p.z;
    } else {
      e.x = this.x + this.facing * 0.62;
      e.y = 0;
      e.z = this.z;
    }
    e.facing = -this.facing;
  }

  hurt(dir) {
    if (this.invuln > 0 || ['hurt', 'knock', 'down', 'getup'].includes(this.state)) return false;
    if (this.held) this.release();
    this.dropCarried();
    this.gainSpecial(CFG.specialHurt);
    if (this.state === 'charge') this.stopCharge();
    const { juice, time } = this.game;
    juice.flash(this.rig);
    juice.shake(0.3);
    juice.hit(this.headPos(_p).setY(_p.y - 0.25), -dir, 0, null);
    this.game.input.rumble(60, 0.5);
    sfx.hurt();
    time.hitstop(0.06);
    if (!CFG.heroInvincible) this.hp -= CFG.enemyDmg;
    // 3 coups encaissés en peu de temps (ou plus de vie) : John tombe
    const now = time.game;
    this.hits = this.hits.filter((t) => now - t < CFG.knockWindow);
    this.hits.push(now);
    if (this.hp <= 0 || this.hits.length >= 3) { this.startKnock(dir); return true; }
    this.kx = dir * 2.5;
    this.invuln = 0.55;
    this.anim('Hit_Head', { fade: 0.05, restart: true });
    this.setState('hurt');
    return true;
  }

  // Chute du héros : même mécanique que les ennemis (Hit_Knockback balistique, puis LayToIdle)
  startKnock(dir) {
    this.hits.length = 0;
    if (this.weapon) this.weapon.dropFromHand(this);
    this.A = null;
    this.kx = 0;
    this.vx = dir * 3.2;
    this.vy = 3.6;
    this.y = Math.max(this.y, 0.01);
    this.facing = -dir;
    this.invuln = 99;
    this.anim('Hit_Knockback', { fade: 0.04, restart: true, speed: 1.1 });
    this.game.juice.shake(0.5);
    this.game.time.hitstop(0.1);
    this.game.input.rumble(180, 0.9);
    this.setState('knock');
  }

  update(dt) {
    if (dt <= 0) return;
    const input = this.game.input;
    this.t += dt;
    this.invuln -= dt;
    this.kx *= Math.exp(-8 * dt);
    this.x += this.kx * dt;
    let lean = 0;

    if (this.state === 'free') {
      const mx = input.move.x, mz = input.move.z;
      const sp = CFG.heroSpeed;
      const dx = mx * sp * dt, dz = mz * sp * 0.7 * dt;
      this.x += dx;
      this.z += dz;
      if (Math.abs(mx) > 0.15) this.facing = Math.sign(mx);
      const v = Math.hypot(dx, dz) / dt;
      if (v > 0.2) {
        this.anim('Jog_Fwd_Loop', { fade: 0.15, speed: Math.max(0.6, v / (JOG_SPEED * CFG.animSpeed)) });
        lean = -mz * 0.6;
      } else {
        this.anim(this.weapon ? this.weapon.def.idle : 'Guard', { fade: 0.2, speed: this.weapon ? 1 : 0, loop: true });
      }
      // saisie : pousser le stick contre un ennemi debout
      const grabTarget = this.grabCandidate(mx);
      this.grabT = grabTarget ? this.grabT + dt : 0;
      if (grabTarget && this.grabT > CFG.grabDelay) { this.grabT = 0; this.startGrab(grabTarget); }
      else if (input.take('jump', CFG.inputBuffer)) this.startJump();
      else if (input.take('dodge', CFG.inputBuffer)) this.startDodge();
      else if (input.take('upper', CFG.inputBuffer)) this.tryUpper();
      else if (input.take('attack', CFG.inputBuffer)) {
        // à côté d'une poubelle, sans ennemi juste devant : on la soulève
        const can = !this.weapon && this.game.weapons.canNear(this);
        if (can && !this.enemyClose(1.3)) this.startLift(can); else this.startAttack(0);
      } else if (input.heldFor('attack') > CFG.chargeDelay) this.startCharge();
    }

    if (this.state === 'attack') this.updateAttack(dt);

    if (this.state === 'air') {
      // contrôle en l'air, réduit
      const sp = CFG.heroSpeed * CFG.airControl;
      this.x += input.move.x * sp * dt;
      this.z += input.move.z * sp * 0.7 * dt;
      if (!this.A && Math.abs(input.move.x) > 0.15) this.facing = Math.sign(input.move.x);
      this.vy -= CFG.gravity * dt;
      this.y += this.vy * dt;
      if (!this.airUsed && input.take('attack', CFG.inputBuffer)) {
        this.airUsed = true;
        this.A = AIR_STRIKE;
        this.phase = 'main';
        this.hitSet.clear();
        this.anim(AIR_STRIKE.clip, { fade: 0.05, restart: true, from: AIR_STRIKE.from, speed: AIR_STRIKE.speed });
        sfx.whoosh(true);
      }
      if (this.A) {
        const act = this.model.actions[this.A.clip];
        if (act.time >= this.A.hold) act.timeScale = 0; // poing tendu jusqu'au sol
      } else if (this.vy < 1.5) this.anim('Jump_Loop', { fade: 0.2 });
      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
        this.A = null;
        this.anim('Jump_Land', { fade: 0.04, restart: true, speed: 1.8 });
        this.game.juice.dust(this.x, this.z, 0.5);
        sfx.thud(0.4);
        this.setState('land');
      }
    }

    if (this.state === 'land' && this.t >= 0.12) this.setState('free');

    if (this.state === 'grab') {
      const sp = CFG.heroSpeed * 0.5;
      const dx = input.move.x * sp * dt, dz = input.move.z * sp * 0.7 * dt;
      // on avance avec lui ; on ne se retourne pas (la direction se choisit au lancer)
      this.x += dx; this.z += dz;
      const v = Math.hypot(dx, dz) / dt;
      this.anim('Walk_Carry_Loop', { speed: v > 0.2 ? v / (1.4 * CFG.animSpeed) : 0 });
      if (input.take('attack', CFG.inputBuffer)) {
        const back = input.move.x * this.facing < -0.5; // stick vers l'arrière : lancer derrière
        this.startThrow(back ? -this.facing : this.facing);
      } else if (input.take('upper', CFG.inputBuffer)) this.startThrow(-this.facing);
      else if (input.take('jump', CFG.inputBuffer)) { this.release(); this.startJump(); }
      else if (input.take('dodge', CFG.inputBuffer)) { this.release(); this.startDodge(); }
      else if (this.t > CFG.grabTime) this.release(), this.setState('free');
    }

    if (this.state === 'carry') {
      const sp = CFG.heroSpeed * 0.65;
      const dx = input.move.x * sp * dt, dz = input.move.z * sp * 0.7 * dt;
      this.x += dx; this.z += dz;
      if (Math.abs(input.move.x) > 0.3) this.facing = Math.sign(input.move.x);
      const v = Math.hypot(dx, dz) / dt;
      this.anim('Walk_Carry_Loop', { speed: v > 0.2 ? v / (1.4 * CFG.animSpeed) : 0 });
      if (input.take('attack', CFG.inputBuffer)) this.startThrow(this.facing);
      else if (input.take('upper', CFG.inputBuffer)) this.startThrow(-this.facing);
      else if (input.take('jump', CFG.inputBuffer)) { this.dropCarried(); this.startJump(); }
      else if (input.take('dodge', CFG.inputBuffer)) { this.dropCarried(); this.startDodge(); }
    }

    if (this.state === 'throw') {
      const act = this.model.actions.OverhandThrow;
      if (this.carrying && act.time >= THROW_RELEASE) {
        if (this.throwDir !== this.facing) this.facing = this.throwDir;
        this.game.weapons.throwCan(this, this.throwDir);
      }
      if (this.held && act.time >= THROW_RELEASE) {
        if (this.throwDir !== this.facing) this.facing = this.throwDir; // lancer derrière : John se retourne
        const e = this.held;
        this.held = null;
        resolveThrow(this.game, e, this.throwDir);
      }
      if (act.time >= 0.9) this.setState('free');
    }

    if (this.state === 'knock') {
      const a = this.model.actions.Hit_Knockback;
      this.x += this.vx * dt;
      if (this.y > 0) {
        this.vy -= CFG.gravity * dt;
        this.y += this.vy * dt;
        a.timeScale = a.time > 0.22 ? 0 : 1.1;
        if (this.y <= 0) {
          this.y = 0; this.vy = 0; a.timeScale = 1.1;
          sfx.thud(0.6); this.game.juice.dust(this.x, this.z, 1); this.game.juice.shake(0.2);
        }
      } else this.vx *= Math.exp(-CFG.groundDrag * dt);
      if (this.y === 0 && (a.time >= a.getClip().duration - 0.02 || !a.isRunning())) this.setState('down');
    }
    if (this.state === 'down') {
      this.x += this.vx * dt;
      this.vx *= Math.exp(-CFG.groundDrag * dt);
      if (this.hp <= 0) { if (this.t > 0.6 && !this.downSent) { this.downSent = true; this.game.onHeroDown(); } }
      else if (this.t > 0.45) { this.downSent = false; this.anim('LayToIdle', { fade: 0.05, restart: true, speed: 1.3 }); this.setState('getup'); }
    }
    if (this.state === 'getup') {
      const a = this.model.actions.LayToIdle;
      this.invuln = 1;
      if (!a.isRunning() || a.time >= a.getClip().duration - 0.05) this.setState('free');
    }

    // retombée si un coup le surprend en l'air
    if (this.state !== 'air' && this.state !== 'knock' && this.y > 0) {
      this.vy -= CFG.gravity * dt;
      this.y = Math.max(0, this.y + this.vy * dt);
      if (this.y === 0) this.vy = 0;
    }

    if (this.state === 'charge') {
      this.chargeT += dt;
      this.chargeK = Math.min(1, this.chargeT / CFG.chargeFull);
      this.game.juice.charge(this.tip('fistR', _p), this.chargeK);
      if (input.heldFor('attack') === 0) { this.stopCharge(); input.take('attack', 1); this.startAttack(0, CHARGED); }
      else if (input.take('dodge', CFG.inputBuffer)) { this.stopCharge(); this.startDodge(); }
    }

    if (this.state === 'dodge') {
      const k = Math.min(1, this.t / this.dodgeDur), prev = Math.min(1, (this.t - dt) / this.dodgeDur);
      const ease = (u) => 1 - (1 - u) * (1 - u);
      const d = (ease(k) - ease(Math.max(0, prev))) * CFG.dodgeDist;
      this.x += this.dodgeDir.x * d;
      this.z += this.dodgeDir.y * d;
      lean = -this.dodgeDir.y * 0.6;
      if (!this.dusted && k > 0.45) { this.dusted = true; this.game.juice.dust(this.x, this.z, 0.6); }
      if (k >= 1) this.setState('free');
    }

    if (this.state === 'hurt' && this.t >= 0.35) this.setState('free');

    this.clampArena();
    this.step(dt, lean);
    if (this.held) this.holdPosition();

    // hitbox active seulement sur la fenêtre utile du clip (au sol ou coup aérien)
    if ((this.state === 'attack' && this.phase === 'main') || (this.state === 'air' && this.A)) {
      const ct = this.model.actions[this.A.clip].time;
      if (ct >= this.A.active[0] && ct <= this.A.active[1]) {
        if (this.A.charged && !this.waveDone) this.shockwave();
        if (this.A.smash && !this.smashDone && ct >= this.A.smashAt) this.smash();
        this.testHits(this.A);
      }
    }
  }

  updateAttack(dt) {
    const A = this.A, input = this.game.input;
    const act = this.model.actions[this.phase === 'main' ? A.clip : A.rec];
    const ct = act.time;
    if (this.phase === 'main') {
      if (ct < A.active[1]) this.x += this.facing * A.lunge * dt;
      if (!this.whooshed && ct >= A.active[0] * 0.7) { sfx.whoosh(A.heavy); this.whooshed = true; }
    }
    const canCancel = this.phase === 'rec' || ct >= A.cancel;
    // PAF maintenu pendant un coup : on bascule en charge, seulement quand le coup peut s'annuler
    if (canCancel && !A.charged && !A.weapon && input.heldFor('attack') > CFG.chargeDelay) return this.startCharge();
    if (canCancel && input.take('dodge', CFG.inputBuffer)) return this.startDodge();
    if (canCancel && input.take('jump', CFG.inputBuffer)) return this.startJump();
    if (canCancel && !A.smash && input.take('upper', CFG.inputBuffer) && this.tryUpper()) return;
    if (canCancel && input.take('attack', CFG.inputBuffer)) return this.startAttack(this.comboStep + 1);
    if (this.phase === 'main') {
      const done = A.end ? ct >= A.end : !act.isRunning() || ct >= act.getClip().duration - 1e-3;
      if (done && A.rec) { this.phase = 'rec'; this.anim(A.rec, { fade: 0.04, speed: A.speed, restart: true }); }
      else if (done) this.setState('free');
    } else if (!act.isRunning() || ct >= act.getClip().duration - 1e-3) {
      this.setState('free');
    }
  }

  // Ennemi debout, juste devant, vers qui on pousse le stick
  // Uniquement un ennemi sonné ou immobile, et pas juste après un PAF (on voulait frapper, pas saisir)
  grabCandidate(mx) {
    if (this.weapon || this.carrying || Math.abs(mx) < 0.5 || this.game.input.pressedWithin('attack', 0.25)) return null;
    for (const e of this.game.enemies) {
      if (!(e.state === 'hitstun' || (e.state === 'approach' && e.speed < 0.3))) continue;
      const dx = e.x - this.x;
      if (Math.sign(dx) === Math.sign(mx) && Math.abs(dx) < 0.78 && Math.abs(e.z - this.z) < 0.3) return e;
    }
    return null;
  }

  // Onde de choc du Charged Punch : touche aussi les ennemis devant, à distance (si assez chargé)
  shockwave() {
    this.waveDone = true;
    const k = this.chargeK;
    this.game.juice.energyBurst(this.tip('fistR', _p), 0.4 + k);
    if (k < 0.6) return;
    for (const e of this.game.enemies) {
      if (this.hitSet.has(e) || !e.hittable()) continue;
      const dx = (e.x - this.x) * this.facing;
      if (dx > 0 && dx < CFG.chargeWave * k && Math.abs(e.z - this.z) < 1) {
        this.hitSet.add(e);
        resolveHit(this.game, this.A, e, _p.set(e.x, 1.2, e.z), 0.4);
      }
    }
  }

  points(A) {
    if (A.tip === 'weapon') return this.weapon ? this.weapon.points(this.hitPoints) : [];
    this.tip(A.tip, this.hitPoints[0]);
    return [this.hitPoints[0]];
  }

  testHits(A) {
    const pts = this.points(A);
    if (this.game.level.breakables.hitProps(pts, A.r, this.facing, A.heavy || !!A.weapon, this.hitSet) && A.weapon && this.weapon) this.weapon.used();
    for (const e of this.game.enemies) {
      if (this.hitSet.has(e) || !e.active) continue;
      const air = e.airborne();
      if (!air && !e.hittable()) continue;
      if ((e.x - this.x) * this.facing < -0.25) continue;
      for (const p of pts) {
        if (air) {
          if (e.hurtDist(p) < A.r + 0.4 && Math.abs(e.z - this.z) < 0.8) { this.hitSet.add(e); resolveJuggle(this.game, A, e, _p.copy(p)); if (A.weapon && this.weapon) this.weapon.used(); break; }
          continue;
        }
        if (e.hurtDist(p) < A.r + 0.28 && Math.abs(e.z - this.z) < 0.7) {
          this.hitSet.add(e);
          _p.copy(p);
          resolveHit(this.game, A, e, _p);
          if (A.weapon && this.weapon) this.weapon.used();
          break;
        }
      }
    }
  }
}
