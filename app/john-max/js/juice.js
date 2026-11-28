import * as THREE from 'three';
import { CFG } from './config.js';

// Effets de game feel : screen shake (trauma), punch de caméra, flash, étincelles, étoile d'impact.
// Tout tourne en temps réel, pour rester vivant pendant un hitstop.
const MAXP = 240;

export class Juice {
  constructor(scene) {
    this.trauma = 0;
    this.punch = 0;
    this.flashes = []; // { rig, t }
    this.t = 0;

    // Étincelles
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAXP * 3);
    this.col = new Float32Array(MAXP * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.pts = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.09, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.pts.frustumCulled = false;
    scene.add(this.pts);
    this.vel = new Float32Array(MAXP * 3);
    this.life = new Float32Array(MAXP);
    this.next = 0;
    for (let i = 0; i < MAXP; i++) this.pos[i * 3 + 1] = -100;

    // Étoiles d'impact (billboards)
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.translate(64, 64);
    g.fillStyle = '#fff';
    g.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, r = i % 2 ? 22 : 62;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
    const tex = new THREE.CanvasTexture(c);
    this.stars = [];
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xffb35c, transparent: true, depthTest: false }));
      m.visible = false;
      m.renderOrder = 10;
      scene.add(m);
      this.stars.push({ m, t: 0, dur: 0.12, size: 1 });
    }
    this.starI = 0;
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

  sparks(p, dir, n, heavy) {
    n = Math.round(n * CFG.particles);
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % MAXP;
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      const sp = (heavy ? 6 : 4) * (0.4 + Math.random());
      const a = Math.random() * Math.PI * 2;
      this.vel[i * 3] = dir * sp * (0.4 + Math.random() * 0.8) + Math.cos(a) * sp * 0.4;
      this.vel[i * 3 + 1] = Math.sin(a) * sp * 0.6 + 1.5;
      this.vel[i * 3 + 2] = (Math.random() - 0.5) * sp * 0.6;
      this.life[i] = 0.18 + Math.random() * 0.22;
      const w = Math.random();
      this.col[i * 3] = 1; this.col[i * 3 + 1] = 0.45 + w * 0.4; this.col[i * 3 + 2] = 0.08 + w * 0.3;
    }
  }

  star(p, size) {
    const s = this.stars[this.starI];
    this.starI = (this.starI + 1) % this.stars.length;
    s.m.position.copy(p);
    s.t = s.dur;
    s.size = size;
    s.m.material.rotation = Math.random() * Math.PI;
    s.m.visible = true;
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

    for (let i = 0; i < MAXP; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -100; continue; }
      this.vel[i * 3 + 1] -= 14 * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
    }
    this.pts.geometry.attributes.position.needsUpdate = true;
    this.pts.geometry.attributes.color.needsUpdate = true;

    for (const s of this.stars) {
      if (s.t <= 0) continue;
      s.t -= dt;
      if (s.t <= 0) { s.m.visible = false; continue; }
      const k = 1 - s.t / s.dur;
      const sc = s.size * (0.5 + k * 0.9);
      s.m.scale.set(sc, sc, 1);
      s.m.material.opacity = 1 - k * k;
    }
  }

  // Décalage de caméra (shake = trauma², bruit pseudo-aléatoire lisse)
  cameraOffset(out) {
    const s = this.trauma * this.trauma * CFG.shakeMax;
    const t = this.t * 38;
    out.set(Math.sin(t * 1.1) * Math.cos(t * 0.37) * s, Math.sin(t * 1.7 + 1.3) * s * 0.8, 0);
    return out;
  }
}
