import { CFG } from './config.js';

// Pas fixe sur le temps réel (60 Hz). Chaque tick fait avancer le temps de jeu
// de TICK * scale : hitstop = 0, slow-mo = CFG.slowmoScale, normal = CFG.timeScale.
export const TICK = 1 / 60;

export class GameTime {
  constructor() {
    this.acc = 0;
    this.hitstopT = 0;
    this.slowT = 0;
    this.slowDur = 1;
    this.scale = 1;
    this.game = 0; // temps de jeu cumulé
    this.real = 0; // temps réel cumulé (ticks)
  }

  hitstop(d) {
    if (d > 0) this.hitstopT = Math.max(this.hitstopT, d);
  }

  slowmo(d) {
    this.slowT = Math.max(this.slowT, d);
    this.slowDur = this.slowT;
  }

  currentScale() {
    if (this.hitstopT > 0) return 0;
    if (this.slowT > 0) {
      // remontée douce sur le dernier tiers
      const k = this.slowT / this.slowDur;
      const s = CFG.slowmoScale;
      return k > 0.33 ? s : s + (CFG.timeScale - s) * (1 - k / 0.33);
    }
    return CFG.timeScale;
  }

  advance(realDt, tick) {
    this.acc += Math.min(realDt, 0.1);
    let n = 0;
    while (this.acc >= TICK && n < 5) {
      this.acc -= TICK;
      n++;
      this.real += TICK;
      const s = this.currentScale();
      if (this.hitstopT > 0) this.hitstopT -= TICK;
      else if (this.slowT > 0) this.slowT -= TICK;
      this.scale = s;
      const gdt = TICK * s;
      this.game += gdt;
      tick(gdt);
    }
    if (n === 5) this.acc = 0;
  }
}
