import * as THREE from 'three';
import { CFG } from './config.js';

// Effets de game feel. Tout tourne en temps réel (vivant pendant un hitstop), tout est en pool :
// un draw call par famille d'effet, aucune allocation pendant le jeu.
//  - traînées d'étincelles (segments étirés selon la vitesse)
//  - gouttes qui giclent de la tête
//  - flash d'impact en étoile + éclat de lignes radiales (manga)
//  - onde de choc annulaire (coups forts)
//  - poussière (atterrissages, coups forts)
const MAXS = 200, MAXD = 80;

function tex(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.translate(size / 2, size / 2);
  draw(g, size / 2);
  return new THREE.CanvasTexture(c);
}

// Pool de sprites animés (échelle, opacité, dérive)
class SpritePool {
  constructor(scene, map, color, n, blending = THREE.AdditiveBlending, order = 10) {
    this.items = [];
    for (let i = 0; i < n; i++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, transparent: true, depthTest: false, depthWrite: false, blending }));
      m.visible = false;
      m.renderOrder = order;
      scene.add(m);
      this.items.push({ m, t: 0, dur: 1, s0: 1, s1: 1, a0: 1, vy: 0 });
    }
    this.i = 0;
  }
  spawn(p, dur, s0, s1, a0 = 1, rot = Math.random() * Math.PI, vy = 0) {
    const it = this.items[this.i];
    this.i = (this.i + 1) % this.items.length;
    it.m.position.copy(p);
    it.m.material.rotation = rot;
    Object.assign(it, { t: dur, dur, s0, s1, a0, vy });
    it.m.visible = true;
    return it;
  }
  update(dt) {
    for (const it of this.items) {
      if (it.t <= 0) continue;
      it.t -= dt;
      if (it.t <= 0) { it.m.visible = false; continue; }
      const k = 1 - it.t / it.dur, e = 1 - (1 - k) * (1 - k); // ease-out
      const s = it.s0 + (it.s1 - it.s0) * e;
      it.m.scale.set(s, s, 1);
      it.m.position.y += it.vy * dt;
      it.m.material.opacity = it.a0 * (1 - k * k);
    }
  }
}

export class Juice {
  constructor(scene) {
    this.trauma = 0;
    this.punch = 0;
    this.flashes = [];
    this.t = 0;

    // Traînées : chaque étincelle = un segment tête → queue (queue = tête - vitesse * 0.035)
    this.sPos = new Float32Array(MAXS * 6);
    this.sCol = new Float32Array(MAXS * 6);
    this.sVel = new Float32Array(MAXS * 3);
    this.sLife = new Float32Array(MAXS);
    this.sNext = 0;
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(this.sPos, 3));
    sg.setAttribute('color', new THREE.BufferAttribute(this.sCol, 3));
    this.streaks = new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.streaks.frustumCulled = false;
    this.streaks.renderOrder = 11;
    scene.add(this.streaks);

    // Gouttes
    this.dPos = new Float32Array(MAXD * 3);
    this.dVel = new Float32Array(MAXD * 3);
    this.dLife = new Float32Array(MAXD);
    this.dNext = 0;
    for (let i = 0; i < MAXD; i++) this.dPos[i * 3 + 1] = -100;
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(this.dPos, 3));
    this.drops = new THREE.Points(dg, new THREE.PointsMaterial({ color: 0xcfe6ff, size: 0.055, transparent: true, opacity: 0.85, depthWrite: false }));
    this.drops.frustumCulled = false;
    scene.add(this.drops);

    const star = tex(128, (g, r) => {
      g.fillStyle = '#fff';
      g.beginPath();
      for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, rr = i % 2 ? r * 0.34 : r; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      g.fill();
    });
    const rays = tex(128, (g, r) => {
      g.strokeStyle = '#fff';
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2 + Math.random() * 0.2, r0 = r * (0.35 + Math.random() * 0.15);
        g.lineWidth = 2 + Math.random() * 4;
        g.beginPath(); g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); g.lineTo(Math.cos(a) * r * 0.98, Math.sin(a) * r * 0.98); g.stroke();
      }
    });
    const ring = tex(128, (g, r) => { g.strokeStyle = '#fff'; g.lineWidth = r * 0.12; g.beginPath(); g.arc(0, 0, r * 0.85, 0, Math.PI * 2); g.stroke(); });
    const puff = tex(64, (g, r) => {
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, r);
      gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(0.5, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(-r, -r, 2 * r, 2 * r);
    });
    this.stars = new SpritePool(scene, star, 0xffc070, 6);
    this.rays = new SpritePool(scene, rays, 0xfff0d8, 5);
    this.rings = new SpritePool(scene, ring, 0xff9a3c, 4);
    this.dusts = new SpritePool(scene, puff, 0x8a8698, 16, THREE.NormalBlending, 9);
  }

  shake(amount) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  camPunch(k) {
    this.punch = Math.max(this.punch, k);
  }

  flash(rig) {
    this.flashes.push({ rig, t: CFG.flashTime });
    rig.setFlash(1);
  }

  // Impact complet. power : 0 léger, 1 fort, 2 batte. head : position de la tête touchée (gouttes).
  hit(p, dir, power = 0, head = null) {
    const q = CFG.particles;
    this.sparks(p, dir, (10 + power * 9) * q, power);
    this.stars.spawn(p, 0.11, 0.35 + power * 0.25, 0.9 + power * 0.45);
    this.rays.spawn(p, 0.09 + power * 0.03, 0.6 + power * 0.3, 1.5 + power * 0.7, 0.9);
    if (power >= 1) {
      this.rings.spawn(p, 0.2, 0.2, 1.6 + power * 0.6, 0.9, 0);
      this.dust(p.x + dir * 0.3, p.z, 0.5 * power);
    }
    if (head) this.droplets(head, dir, (4 + power * 4) * q);
  }

  sparks(p, dir, n, power = 0) {
    for (let k = 0; k < Math.round(n); k++) {
      const i = this.sNext;
      this.sNext = (this.sNext + 1) % MAXS;
      const sp = (5 + power * 2.5) * (0.5 + Math.random());
      const a = (Math.random() - 0.5) * 2.2, up = (Math.random() - 0.35) * 1.4;
      this.sVel[i * 3] = dir * Math.cos(a) * sp;
      this.sVel[i * 3 + 1] = up * sp * 0.7 + 1.2;
      this.sVel[i * 3 + 2] = Math.sin(a) * sp * 0.5;
      this.sLife[i] = 0.12 + Math.random() * 0.2;
      for (const o of [0, 3]) { this.sPos[i * 6 + o] = p.x; this.sPos[i * 6 + o + 1] = p.y; this.sPos[i * 6 + o + 2] = p.z; }
      const w = Math.random();
      for (const o of [0, 3]) { this.sCol[i * 6 + o] = 1; this.sCol[i * 6 + o + 1] = 0.55 + w * 0.4; this.sCol[i * 6 + o + 2] = 0.15 + w * 0.5; }
    }
  }

  droplets(p, dir, n) {
    for (let k = 0; k < Math.round(n); k++) {
      const i = this.dNext;
      this.dNext = (this.dNext + 1) % MAXD;
      this.dPos[i * 3] = p.x; this.dPos[i * 3 + 1] = p.y - 0.15; this.dPos[i * 3 + 2] = p.z;
      this.dVel[i * 3] = dir * (1.5 + Math.random() * 2.5);
      this.dVel[i * 3 + 1] = 1 + Math.random() * 2.5;
      this.dVel[i * 3 + 2] = (Math.random() - 0.5) * 1.5;
      this.dLife[i] = 0.4 + Math.random() * 0.3;
    }
  }

  dust(x, z, amount = 1) {
    const n = Math.round(3 + amount * 4);
    for (let k = 0; k < n; k++) {
      const p = new THREE.Vector3(x + (Math.random() - 0.5) * 0.9 * amount, 0.12, z + (Math.random() - 0.5) * 0.4);
      this.dusts.spawn(p, 0.45 + Math.random() * 0.3, 0.25, 0.7 + amount * 0.5, 0.55, Math.random() * 6, 0.35 + Math.random() * 0.4);
    }
  }

  update(dt) {
    this.t += dt;
    this.trauma = Math.max(0, this.trauma - CFG.shakeDecay * dt * this.trauma - 0.2 * dt);
    this.punch = Math.max(0, this.punch - dt * 6 * Math.max(this.punch, 0.05));

    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.t -= dt;
      if (f.t <= 0) { f.rig.setFlash(0); this.flashes.splice(i, 1); }
    }

    const sp = this.sPos, sv = this.sVel;
    for (let i = 0; i < MAXS; i++) {
      if (this.sLife[i] <= 0) continue;
      this.sLife[i] -= dt;
      const o = i * 6;
      if (this.sLife[i] <= 0) { sp[o + 1] = sp[o + 4] = -100; continue; }
      sv[i * 3 + 1] -= 16 * dt;
      sp[o] += sv[i * 3] * dt; sp[o + 1] += sv[i * 3 + 1] * dt; sp[o + 2] += sv[i * 3 + 2] * dt;
      sp[o + 3] = sp[o] - sv[i * 3] * 0.035; sp[o + 4] = sp[o + 1] - sv[i * 3 + 1] * 0.035; sp[o + 5] = sp[o + 2] - sv[i * 3 + 2] * 0.035;
    }
    this.streaks.geometry.attributes.position.needsUpdate = true;
    this.streaks.geometry.attributes.color.needsUpdate = true;

    const dp = this.dPos, dv = this.dVel;
    for (let i = 0; i < MAXD; i++) {
      if (this.dLife[i] <= 0) continue;
      this.dLife[i] -= dt;
      if (this.dLife[i] <= 0 || dp[i * 3 + 1] < 0.02) { dp[i * 3 + 1] = -100; this.dLife[i] = 0; continue; }
      dv[i * 3 + 1] -= 12 * dt;
      dp[i * 3] += dv[i * 3] * dt; dp[i * 3 + 1] += dv[i * 3 + 1] * dt; dp[i * 3 + 2] += dv[i * 3 + 2] * dt;
    }
    this.drops.geometry.attributes.position.needsUpdate = true;

    this.stars.update(dt);
    this.rays.update(dt);
    this.rings.update(dt);
    this.dusts.update(dt);
  }

  // Décalage de caméra (shake = trauma², bruit pseudo-aléatoire lisse)
  cameraOffset(out) {
    const s = this.trauma * this.trauma * CFG.shakeMax;
    const t = this.t * 38;
    out.set(Math.sin(t * 1.1) * Math.cos(t * 0.37) * s, Math.sin(t * 1.7 + 1.3) * s * 0.8, 0);
    return out;
  }
}
