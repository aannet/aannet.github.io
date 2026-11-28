import * as THREE from 'three';
import { CFG } from './config.js';
import { Character } from './character.js';
import { FIST_COMBO, BAT_COMBO, UPPERCUT, CHARGED, AIR_STRIKE, resolveHit, resolveJuggle } from './combat.js';
import { sfx } from './audio.js';

const _p = new THREE.Vector3();
const JOG_SPEED = 3.0; // vitesse naturelle du clip Jog_Fwd_Loop (m/s), pour caler les pieds
const ROLL_UP = 1.2; // instant du clip Roll où John est de nouveau debout

// John Max : débardeur et cargo noirs, bottes acier, bandages, tatouage Oni sur le bras droit.
const LOOK = {
  body: 'male', hair: ['buzzed', 'beard'], hairColor: 0x1b1512,
  shirt: 0x17171b, pants: 0x222227, boots: 0x2a2c33, hands: 0x121212, tattoo: true, rim: 0xff8a3c,
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
    this.bat = null;
    this.hitPoints = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.chargeT = 0;
    this.chargeK = 0;
    this.dodgeDir = new THREE.Vector2(1, 0);
  }

  combo() {
    return this.bat ? BAT_COMBO : FIST_COMBO;
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

  hurt(dir) {
    if (this.invuln > 0 || this.state === 'hurt') return false;
    if (this.state === 'charge') this.stopCharge();
    const { juice } = this.game;
    juice.flash(this.rig);
    juice.shake(0.25);
    sfx.hurt();
    this.game.time.hitstop(0.05);
    if (!CFG.heroInvincible) this.hp -= 7;
    this.kx = dir * 2.5;
    this.invuln = 0.55;
    this.anim('Hit_Head', { fade: 0.05, restart: true });
    this.setState('hurt');
    if (this.hp <= 0) {
      this.hp = this.maxHp;
      this.game.ui.message('K.O. ! On repart', 1.4);
    }
    return true;
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
        this.anim(this.bat ? 'Sword_Idle' : 'Guard', { fade: 0.2, speed: this.bat ? 1 : 0, loop: true });
      }
      if (input.take('jump', CFG.inputBuffer)) this.startJump();
      else if (input.take('dodge', CFG.inputBuffer)) this.startDodge();
      else if (input.take('upper', CFG.inputBuffer)) this.startAttack(0, UPPERCUT);
      else if (input.take('attack', CFG.inputBuffer)) this.startAttack(0);
      else if (input.heldFor('attack') > CFG.chargeDelay) this.startCharge();
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

    // retombée si un coup le surprend en l'air
    if (this.state !== 'air' && this.y > 0) {
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

    // hitbox active seulement sur la fenêtre utile du clip (au sol ou coup aérien)
    if ((this.state === 'attack' && this.phase === 'main') || (this.state === 'air' && this.A)) {
      const ct = this.model.actions[this.A.clip].time;
      if (ct >= this.A.active[0] && ct <= this.A.active[1]) {
        if (this.A.charged && !this.waveDone) this.shockwave();
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
    // PAF maintenu pendant un coup : on bascule en charge
    if (!A.charged && input.heldFor('attack') > CFG.chargeDelay) return this.startCharge();
    const canCancel = this.phase === 'rec' || ct >= A.cancel;
    if (canCancel && input.take('dodge', CFG.inputBuffer)) return this.startDodge();
    if (canCancel && input.take('jump', CFG.inputBuffer)) return this.startJump();
    if (canCancel && A !== UPPERCUT && input.take('upper', CFG.inputBuffer)) return this.startAttack(0, UPPERCUT);
    if (canCancel && input.take('attack', CFG.inputBuffer)) return this.startAttack(this.comboStep + 1);
    if (this.phase === 'main') {
      const done = A.end ? ct >= A.end : !act.isRunning() || ct >= act.getClip().duration - 1e-3;
      if (done && A.rec) { this.phase = 'rec'; this.anim(A.rec, { fade: 0.04, speed: A.speed, restart: true }); }
      else if (done) this.setState('free');
    } else if (!act.isRunning() || ct >= act.getClip().duration - 1e-3) {
      this.setState('free');
    }
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
        resolveHit(this.game, this.A, e, _p.set(e.x, 1.2, e.z), 0.55);
      }
    }
  }

  points(A) {
    if (A.tip === 'bat') return this.bat ? this.bat.points(this.hitPoints) : [];
    this.tip(A.tip, this.hitPoints[0]);
    return [this.hitPoints[0]];
  }

  testHits(A) {
    const pts = this.points(A);
    for (const e of this.game.enemies) {
      if (this.hitSet.has(e) || !e.active) continue;
      const air = e.airborne();
      if (!air && !e.hittable()) continue;
      if ((e.x - this.x) * this.facing < -0.25) continue;
      for (const p of pts) {
        if (air) {
          if (e.hurtDist(p) < A.r + 0.4 && Math.abs(e.z - this.z) < 0.8) { this.hitSet.add(e); resolveJuggle(this.game, A, e, _p.copy(p)); if (A.bat && this.bat) this.bat.used(); break; }
          continue;
        }
        if (e.hurtDist(p) < A.r + 0.28 && Math.abs(e.z - this.z) < 0.7) {
          this.hitSet.add(e);
          _p.copy(p);
          resolveHit(this.game, A, e, _p);
          if (A.bat && this.bat) this.bat.used();
          break;
        }
      }
    }
  }
}
