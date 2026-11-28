import * as THREE from 'three';
import { CFG } from './config.js';
import { Character } from './character.js';
import { FIST_COMBO, BAT_COMBO, UPPERCUT, resolveHit, resolveJuggle } from './combat.js';
import { sfx } from './audio.js';

const _p = new THREE.Vector3();
const JOG_SPEED = 3.0; // vitesse naturelle du clip Jog_Fwd_Loop (m/s), pour caler les pieds

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
    this.anim(this.A.clip, { fade: 0.06, speed: this.A.speed, restart: true });
    this.setState('attack');
  }

  hurt(dir) {
    if (this.invuln > 0 || this.state === 'hurt') return false;
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
      if (input.take('upper', CFG.inputBuffer)) this.startAttack(0, UPPERCUT);
      else if (input.take('attack', CFG.inputBuffer)) this.startAttack(0);
    }

    if (this.state === 'attack') this.updateAttack(dt);

    if (this.state === 'hurt' && this.t >= 0.35) this.setState('free');

    this.clampArena();
    this.step(dt, lean);

    // hitbox active seulement sur la fenêtre utile du clip
    if (this.state === 'attack' && this.phase === 'main') {
      const ct = this.model.actions[this.A.clip].time;
      if (ct >= this.A.active[0] && ct <= this.A.active[1]) this.testHits(this.A);
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

  points(A) {
    if (A.tip === 'bat') return this.bat ? this.bat.points(this.hitPoints) : [];
    this.tip(A.tip, this.hitPoints[0]);
    return [this.hitPoints[0]];
  }

  testHits(A) {
    const pts = this.points(A);
    for (const e of this.game.enemies) {
      if (this.hitSet.has(e) || !e.active) continue;
      if (e.ragdoll) {
        // juggle d'un ennemi en l'air ou au sol
        for (const p of pts) {
          let hit = false;
          for (const n of e.ragdoll.parts) {
            const b = e.ragdoll.bodies[n].translation();
            if (Math.hypot(b.x - p.x, b.y - p.y, b.z - p.z) < A.r + 0.32) { hit = true; break; }
          }
          if (hit) {
            this.hitSet.add(e);
            resolveJuggle(this.game, A, e, p);
            if (A.bat && this.bat) this.bat.used();
            break;
          }
        }
        continue;
      }
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
