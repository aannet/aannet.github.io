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
const _dp = new THREE.Vector3();

// Atlas d'effets (assets/fx/fx.webp), découpé dans la planche « attaque normale » (tools/fx/make_atlas.py).
// [u, v, largeur, hauteur] en UV + rapport largeur/hauteur du contenu. Fond transparent : la plupart sont additifs.
const FX_UV = {
  trail: [0.0039, 0.791, 0.2412, 0.168, 2.872], zap: [0.2539, 0.7617, 0.2422, 0.2285, 2.12], burstB: [0.5254, 0.7578, 0.1992, 0.2344, 1.7],
  glowB: [0.7539, 0.7969, 0.2422, 0.1563, 3.1], pixB: [0.0039, 0.5273, 0.2412, 0.1973, 2.446], fire: [0.2725, 0.5078, 0.2051, 0.2344, 1.75],
  flame: [0.5234, 0.5078, 0.2031, 0.2344, 1.733], starO: [0.8145, 0.5078, 0.1201, 0.2344, 1.025], smoke: [0.0283, 0.2578, 0.1924, 0.2344, 1.642],
  embers: [0.2539, 0.2695, 0.2422, 0.2109, 2.296], glint: [0.5039, 0.3379, 0.2422, 0.0762, 6.359], slash: [0.8027, 0.2578, 0.1445, 0.2344, 1.233],
  star4: [0.0693, 0.0078, 0.1104, 0.2344, 0.942], streak: [0.2539, 0.0859, 0.2412, 0.0801, 6.024], digital: [0.5059, 0.0078, 0.2373, 0.2344, 2.025],
};
const fxTex = new THREE.TextureLoader().load(new URL('../assets/fx/fx.webp', import.meta.url).href, () => { for (const m of fxMaps) m.needsUpdate = true; });
fxTex.colorSpace = THREE.SRGBColorSpace;
const fxMaps = [];

// Pool de sprites d'une case de l'atlas : grossit et s'efface ; flip = miroir horizontal (sens du coup)
class FxPool {
  constructor(scene, key, n, { blending = THREE.AdditiveBlending, order = 11, center = null } = {}) {
    const [u, v, w, h, ar] = FX_UV[key];
    const map = fxTex.clone();
    map.offset.set(u, v);
    map.repeat.set(w, h);
    fxMaps.push(map);
    this.ar = ar;
    this.items = [];
    for (let i = 0; i < n; i++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthTest: false, depthWrite: false, blending }));
      if (center) m.center.set(center[0], center[1]);
      m.visible = false;
      m.renderOrder = order;
      scene.add(m);
      this.items.push({ m, t: 0, dur: 1, s0: 1, s1: 1, a0: 1, vy: 0, flip: 1 });
    }
    this.i = 0;
  }
  spawn(p, dur, s0, s1, { a0 = 1, rot = 0, flip = 1, vy = 0 } = {}) {
    const it = this.items[this.i];
    this.i = (this.i + 1) % this.items.length;
    it.m.position.copy(p);
    it.m.material.rotation = rot;
    Object.assign(it, { t: dur, dur, s0, s1, a0, vy, flip });
    it.m.visible = true;
    this.place(it, 0);
    return it;
  }
  place(it, k) {
    const e = 1 - (1 - k) * (1 - k), s = it.s0 + (it.s1 - it.s0) * e;
    it.m.scale.set(s * this.ar * it.flip, s, 1);
    it.m.material.opacity = it.a0 * (1 - k * k);
  }
  update(dt) {
    for (const it of this.items) {
      if (it.t <= 0) continue;
      it.t -= dt;
      if (it.t <= 0) { it.m.visible = false; continue; }
      it.m.position.y += it.vy * dt;
      this.place(it, 1 - it.t / it.dur);
    }
  }
}

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

    // Énergie du Charged Punch : halo au poing (persistant pendant la charge) + onde orange au relâchement
    this.chargeGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: puff, color: 0xff7a1a, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.chargeGlow.visible = false;
    this.chargeGlow.renderOrder = 12;
    scene.add(this.chargeGlow);
    this.chargeZoom = 0;
    this.energyRings = new SpritePool(scene, ring, 0xff6a10, 4);
    // smash : énergie électrique cyan / violet, pour ne pas se confondre avec l'orange du Charged Punch
    this.boltRings = new SpritePool(scene, ring, 0x4fd8ff, 4);
    this.boltRays = new SpritePool(scene, rays, 0xb58cff, 3);

    // Planche d'impacts : coup léger bleu électrique, coup lourd orange + fumée, arme cyan-orange
    this.fx = {
      zap: new FxPool(scene, 'zap', 4), burstB: new FxPool(scene, 'burstB', 4), glowB: new FxPool(scene, 'glowB', 3),
      pixB: new FxPool(scene, 'pixB', 4), trail: new FxPool(scene, 'trail', 3, { center: [0.88, 0.5] }),
      flame: new FxPool(scene, 'flame', 3), starO: new FxPool(scene, 'starO', 4),
      smoke: new FxPool(scene, 'smoke', 5, { blending: THREE.NormalBlending, order: 9 }),
      embers: new FxPool(scene, 'embers', 2, { order: 3 }), glint: new FxPool(scene, 'glint', 2),
      slash: new FxPool(scene, 'slash', 3), star4: new FxPool(scene, 'star4', 3),
      streak: new FxPool(scene, 'streak', 4), digital: new FxPool(scene, 'digital', 4),
    };
    // poing en feu pendant la charge (case « charge lourde » 1), ancré sur le poing
    this.fire = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.fx.flame.items[0].m.material.map.clone(), transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    {
      const [u, v, w, h] = FX_UV.fire, m = this.fire.material.map;
      m.offset.set(u, v); m.repeat.set(w, h); fxMaps.push(m);
    }
    this.fire.center.set(0.78, 0.45);
    this.fire.visible = false;
    this.fire.renderOrder = 12;
    scene.add(this.fire);
  }

  // ---- effets de la planche
  trail(p, facing) { this.fx.trail.spawn(p, 0.14, 0.36, 0.42, { flip: facing, a0: 0.95 }); }
  slash(p, facing, variant) { this.fx.slash.spawn(p, 0.18, 1.2, 1.45, { flip: facing, rot: variant ? Math.PI * 0.5 : 0 }); }
  speed(p, dir) { this.fx.streak.spawn(p, 0.22, 0.32, 0.4, { flip: -dir, a0: 0.8 }); }
  glint(p) { this.fx.glint.spawn(p, 0.35, 0.12, 0.16); }
  dissolve(p) { this.fx.digital.spawn(p, 0.6, 0.45, 0.6, { vy: 0.5 }); this.fx.pixB.spawn(p, 0.5, 0.4, 0.55, { vy: 0.4 }); }
  scorch(x, z) { _dp.set(x, 0.18, z); this.fx.embers.spawn(_dp.setY(0.25), 1.8, 0.7, 0.8); this.fx.smoke.spawn(_dp.setY(0.5), 0.9, 0.5, 1.1, { a0: 0.75, vy: 0.5 }); }

  // Appelé à chaque tick pendant la charge (p = poing), p null pour arrêter
  charge(p, k, facing = 1) {
    const g = this.chargeGlow, f = this.fire;
    this.chargeZoom = p ? k : 0;
    if (!p) { g.visible = false; f.visible = false; return; }
    g.visible = true;
    f.visible = true;
    f.position.copy(p);
    const fs = (0.16 + 0.12 * k) * (0.94 + Math.random() * 0.12);
    f.scale.set(fs * FX_UV.fire[4] * facing, fs, 1);
    f.material.opacity = 0.5 + 0.5 * k;
    g.position.copy(p);
    const s = (0.25 + 0.65 * k) * (0.9 + Math.random() * 0.2);
    g.scale.set(s, s, 1);
    g.material.opacity = 0.55 + 0.45 * k;
    // étincelles aspirées vers le poing, plus nombreuses à pleine charge
    const n = k >= 1 ? 3 : Math.random() < 0.5 + k ? 1 : 0;
    for (let j = 0; j < n; j++) {
      const i = this.sNext;
      this.sNext = (this.sNext + 1) % MAXS;
      const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI - Math.PI / 2, r = 0.45 + Math.random() * 0.3;
      const ox = Math.cos(a) * Math.cos(b) * r, oy = Math.sin(b) * r, oz = Math.sin(a) * Math.cos(b) * r * 0.6;
      this.sVel[i * 3] = -ox * 6; this.sVel[i * 3 + 1] = -oy * 6 + 0.8; this.sVel[i * 3 + 2] = -oz * 6;
      this.sLife[i] = 0.14;
      for (const o of [0, 3]) {
        this.sPos[i * 6 + o] = p.x + ox; this.sPos[i * 6 + o + 1] = p.y + oy; this.sPos[i * 6 + o + 2] = p.z + oz;
        this.sCol[i * 6 + o] = 1; this.sCol[i * 6 + o + 1] = 0.45 + Math.random() * 0.25; this.sCol[i * 6 + o + 2] = 0.08;
      }
    }
  }

  // Libération de l'énergie : anneaux orange concentriques + éclat
  energyBurst(p, s) {
    this.energyRings.spawn(p, 0.28, 0.3, 2.4 * s, 1, 0);
    this.energyRings.spawn(p, 0.4, 0.2, 3.6 * s, 0.6, 0);
    this.rays.spawn(p, 0.14, 0.8, 2.6 * s, 1);
    this.sparks(p, Math.random() < 0.5 ? 1 : -1, 14 * CFG.particles, 2);
    this.sparks(p, Math.random() < 0.5 ? 1 : -1, 14 * CFG.particles, 2);
  }

  electricBurst(p, s) {
    this.boltRings.spawn(p, 0.3, 0.3, 2.6 * s, 1, 0);
    this.boltRings.spawn(p, 0.45, 0.2, 3.8 * s, 0.7, 0);
    this.boltRays.spawn(p, 0.18, 0.9, 3 * s, 1);
    this.boltRays.spawn(p, 0.12, 0.6, 2 * s, 0.8);
    const q = CFG.particles;
    this.sparks(p, 1, 16 * q, 2.5, [0.45, 0.9, 1]);
    this.sparks(p, -1, 16 * q, 2.5, [0.75, 0.55, 1]);
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
  // kind : 'light' (bleu électrique), 'heavy' (orange, fumée), 'blade' (arme, cyan-orange) ; défaut selon power
  hit(p, dir, power = 0, head = null, kind = power ? 'heavy' : 'light') {
    const q = CFG.particles, fx = this.fx;
    if (kind === 'light') {
      fx.zap.spawn(p, 0.13, 0.34, 0.5, { rot: (Math.random() - 0.5) * 0.8, flip: dir });
      fx.burstB.spawn(p, 0.22, 0.3, 0.46);
      fx.glowB.spawn(p, 0.2, 0.3, 0.45, { a0: 0.8 });
      fx.pixB.spawn(p, 0.5, 0.3, 0.42, { vy: 0.35, flip: dir });
      this.sparks(p, dir, 8 * q, 0, [0.45, 0.8, 1]);
    } else if (kind === 'blade') {
      fx.star4.spawn(p, 0.18, 0.55, 0.8, { rot: (Math.random() - 0.5) * 0.4 });
      fx.digital.spawn(p, 0.5, 0.42, 0.56, { vy: 0.3, flip: dir });
      this.sparks(p, dir, 12 * q, 1.5, Math.random() < 0.5 ? [0.4, 1, 1] : [1, 0.6, 0.25]);
    } else {
      fx.starO.spawn(p, 0.18, 0.5 + power * 0.12, 0.85 + power * 0.2);
      fx.flame.spawn(p, 0.22, 0.45, 0.6 + power * 0.08, { flip: dir });
      fx.smoke.spawn(p, 0.6, 0.3, 0.65 + power * 0.18, { a0: 0.75, vy: 0.45 });
      this.sparks(p, dir, (12 + power * 6) * q, power);
    }
    if (kind !== 'light') this.stars.spawn(p, 0.08, 0.2, 0.5 + power * 0.3, 0.6);
    if (power >= 1 && kind === 'heavy') {
      this.rings.spawn(p, 0.2, 0.2, 1.6 + power * 0.6, 0.9, 0);
      this.dust(p.x + dir * 0.3, p.z, 0.5 * power);
    }
    if (head) this.droplets(head, dir, (4 + power * 4) * q);
  }

  sparks(p, dir, n, power = 0, color = null) {
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
      const c = color || [1, 0.55 + w * 0.4, 0.15 + w * 0.5];
      for (const o of [0, 3]) { this.sCol[i * 6 + o] = c[0]; this.sCol[i * 6 + o + 1] = c[1]; this.sCol[i * 6 + o + 2] = c[2]; }
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
      const p = _dp.set(x + (Math.random() - 0.5) * 0.9 * amount, 0.12, z + (Math.random() - 0.5) * 0.4); // copié par spawn
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
    this.energyRings.update(dt);
    for (const k in this.fx) this.fx[k].update(dt);
    this.boltRings.update(dt);
    this.boltRays.update(dt);
  }

  // Décalage de caméra (shake = trauma², bruit pseudo-aléatoire lisse)
  cameraOffset(out) {
    const s = this.trauma * this.trauma * CFG.shakeMax;
    const t = this.t * 38;
    out.set(Math.sin(t * 1.1) * Math.cos(t * 0.37) * s, Math.sin(t * 1.7 + 1.3) * s * 0.8, 0);
    return out;
  }
}
