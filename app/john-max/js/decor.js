import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonGradient } from './toon.js';

// Décor Neo-Tokyo de nuit. Tout est « feinte » pour tenir le budget mobile :
//  - façade, tuyaux, volets et fenêtres peints dans une seule texture canvas ;
//  - enseignes dans un atlas, fusionnées en 1 mesh ;
//  - halos, reflets de flaques et cônes de lampadaires = quads additifs fusionnés (2 draw calls) ;
//  - pluie animée dans le vertex shader (1 draw call, zéro CPU) ;
//  - immeubles du fond = 1 plan texturé, la parallaxe vient de la perspective.
const W = 30; // longueur de rue décorée (m)

function canvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const rnd = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
const pick = (a) => a[Math.floor(rnd() * a.length)];
const WARM = ['#ff9a3c', '#ffb35c', '#ff7a2a'];
const COOL = ['#4fe3ff', '#38c8d8'];

// Silhouettes d'immeubles avec fenêtres allumées
function skyline(g, w, h, base, lit, density, top) {
  let x = 0;
  while (x < w) {
    const bw = 30 + rnd() * 90, bh = h * (top + rnd() * (1 - top) * 0.75);
    g.fillStyle = base;
    g.fillRect(x, h - bh, bw, bh);
    for (let wy = h - bh + 8; wy < h - 6; wy += 9) {
      for (let wx = x + 5; wx < x + bw - 6; wx += 8) {
        if (rnd() < density) { g.fillStyle = rnd() < 0.8 ? pick(lit) : pick(COOL); g.globalAlpha = 0.35 + rnd() * 0.5; g.fillRect(wx, wy, 4, 5); }
      }
    }
    g.globalAlpha = 1;
    if (rnd() < 0.35) { g.fillStyle = pick(['#ff4fa0', '#ff8a2a', '#4fe3ff']); g.fillRect(x + bw * 0.4, h - bh + 10, 6, Math.min(60, bh * 0.4)); }
    x += bw + rnd() * 10;
  }
}

// Immeubles derrière la rue : un seul plan découpé (alphaTest), seule la bande au-dessus de la façade se voit
function backdrop(scene) {
  const mid = canvas(1024, 256, (g, w, h) => { skyline(g, w, h, '#11121d', WARM, 0.18, 0.4); });
  const midM = new THREE.Mesh(new THREE.PlaneGeometry(50, 12), new THREE.MeshBasicMaterial({ map: mid, alphaTest: 0.5, fog: true }));
  midM.position.set(0, 6, -7);
  scene.add(midM);
}

// Façade du rez-de-chaussée : une seule texture pour toute la rue
function facade(scene) {
  const tex = canvas(2048, 288, (g, w, h) => {
    const ppm = w / W;
    g.fillStyle = '#1b1a24'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(0,0,0,${rnd() * 0.25})`; g.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 6, 2 + rnd() * 10); }
    // dalle de béton et corniche
    g.fillStyle = '#121119'; g.fillRect(0, h * 0.38, w, 6);
    for (let x = 0; x < w; x += ppm * 2.5) { g.fillStyle = '#15141d'; g.fillRect(x, 0, 3, h); }
    // boutiques : volet roulant, vitrine éclairée ou porte
    for (let s = 0; s < W / 3.75; s++) {
      const x0 = s * 3.75 * ppm + 10, sw = 3.75 * ppm - 20;
      const kind = s % 3;
      if (kind === 0) {
        g.fillStyle = '#2b2a35'; g.fillRect(x0, h * 0.46, sw, h * 0.54);
        for (let y = h * 0.46; y < h; y += 5) { g.fillStyle = '#211f2a'; g.fillRect(x0, y, sw, 2); }
        g.fillStyle = 'rgba(255,79,160,.5)'; g.font = 'bold 22px sans-serif'; g.fillText(pick(['GANG', 'ネオ', 'NO PAST', '鬼']), x0 + 20 + rnd() * 60, h * 0.7);
      } else if (kind === 1) {
        const grd = g.createLinearGradient(0, h * 0.46, 0, h);
        grd.addColorStop(0, '#d9893f'); grd.addColorStop(1, '#4a2412');
        g.fillStyle = grd; g.fillRect(x0 + 10, h * 0.48, sw - 20, h * 0.36);
        g.fillStyle = '#1b1a24';
        for (let k = 1; k < 4; k++) g.fillRect(x0 + 10 + (k * (sw - 20)) / 4, h * 0.48, 4, h * 0.36);
        g.fillStyle = '#0e0d14'; g.fillRect(x0, h * 0.84, sw, h * 0.16);
      } else {
        g.fillStyle = '#0e0d14'; g.fillRect(x0 + sw * 0.15, h * 0.5, sw * 0.22, h * 0.5);
        g.fillStyle = 'rgba(79,227,255,.7)'; g.fillRect(x0 + sw * 0.15, h * 0.5, sw * 0.22, 3);
        g.fillStyle = '#2a2935'; g.fillRect(x0 + sw * 0.55, h * 0.56, sw * 0.32, h * 0.2); // clim
        g.strokeStyle = '#17161f'; g.lineWidth = 3;
        g.beginPath(); g.arc(x0 + sw * 0.71, h * 0.66, h * 0.07, 0, Math.PI * 2); g.stroke();
      }
      // étage : fenêtres, certaines allumées
      for (let k = 0; k < 3; k++) {
        const wx = x0 + 18 + k * (sw / 3), on = rnd() < 0.45;
        g.fillStyle = on ? pick(WARM) : '#0c0c13'; g.globalAlpha = on ? 0.75 : 1;
        g.fillRect(wx, h * 0.1, sw / 3 - 36, h * 0.2);
        g.globalAlpha = 1;
      }
    }
    // tuyaux et câbles
    g.strokeStyle = '#0d0c12'; g.lineWidth = 7;
    for (let x = 120; x < w; x += 330 + rnd() * 200) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    g.lineWidth = 2;
    for (let i = 0; i < 6; i++) { g.beginPath(); const y = 8 + rnd() * 30; g.moveTo(0, y); g.quadraticCurveTo(w / 2, y + 40, w, y + rnd() * 20); g.stroke(); }
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(W, 4.2), new THREE.MeshToonMaterial({ map: tex, gradientMap: toonGradient() }));
  m.position.set(0, 2.1, -2.0);
  scene.add(m);
}

// Enseignes au néon : atlas de 8 cellules verticales
const SIGNS = [
  { text: 'ラーメン', col: '#ff8a2a' }, { text: '暴力街', col: '#ff8a2a' }, { text: 'ホテル', col: '#ff4fa0' },
  { text: '酒場', col: '#4fe3ff' }, { text: 'レトロ', col: '#ff7a2a' }, { text: '電気', col: '#4fe3ff' },
  { text: 'BAR', col: '#ff4fa0' }, { text: '24H', col: '#ffb35c' },
];
function signAtlas() {
  return canvas(1024, 256, (g) => {
    SIGNS.forEach((s, i) => {
      const x = i * 128;
      g.fillStyle = '#0b0a10'; g.fillRect(x + 6, 4, 116, 248);
      g.strokeStyle = s.col; g.lineWidth = 4; g.shadowColor = s.col; g.shadowBlur = 14;
      g.strokeRect(x + 12, 10, 104, 236);
      const chars = [...s.text];
      const size = Math.min(64, 220 / chars.length);
      g.font = `bold ${size}px "Noto Sans JP", "Hiragino Sans", sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      chars.forEach((ch, k) => {
        const y = 128 + (k - (chars.length - 1) / 2) * size * 1.05;
        g.fillStyle = s.col; g.shadowBlur = 18; g.fillText(ch, x + 64, y);
        g.fillStyle = '#fff6e8'; g.shadowBlur = 0; g.globalAlpha = 0.55; g.fillText(ch, x + 64, y); g.globalAlpha = 1;
      });
      g.shadowBlur = 0;
    });
  });
}

// Quad avec couleur par sommet (pour fusionner halos et reflets en un seul mesh additif)
function coloredPlane(w, h, color, k, matrix, uv) {
  const geo = new THREE.PlaneGeometry(w, h);
  if (uv) {
    const a = geo.attributes.uv;
    for (let i = 0; i < a.count; i++) a.setXY(i, uv[0] + a.getX(i) * (uv[1] - uv[0]), a.getY(i));
  }
  return color === null ? geo.applyMatrix4(matrix) : withColor(geo, color, k, matrix);
}

const glowTex = () => canvas(64, 64, (g) => {
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.4, 'rgba(255,255,255,.35)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
});
const additive = (map) => new THREE.MeshBasicMaterial({ map, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });

function neons(scene, lampXs) {
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(1, 1, 1), P = new THREE.Vector3();
  const flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  const signGeos = [], glowGeos = [];
  const xs = [-11.5, -8.2, -5.9, -2.8, 0.6, 3.4, 6.8, 9.6, 12.5];
  xs.forEach((x, i) => {
    const s = SIGNS[i % SIGNS.length];
    const h = 1.1 + (i % 3) * 0.2, y = 2.45 + (i % 2) * 0.25;
    M.compose(P.set(x, y, -1.9), Q.identity(), S);
    signGeos.push(coloredPlane(0.62, h, null, 0, M, [(i % 8) / 8, (i % 8 + 1) / 8]));
    M.compose(P.set(x, y, -1.88), Q.identity(), S);
    glowGeos.push(coloredPlane(2.4, h + 1.4, s.col, 0.42, M));
    // reflet étiré dans les flaques
    M.compose(P.set(x, 0.015, -0.5), flat, S);
    glowGeos.push(coloredPlane(0.9, 3.6, s.col, 0.22, M));
  });
  // flaques de lumière chaude sous les lampadaires
  for (const x of lampXs) {
    M.compose(P.set(x + 0.3, 0.02, -0.9), flat, S);
    glowGeos.push(coloredPlane(3.2, 2.6, '#ffa860', 0.35, M));
  }
  const signs = new THREE.Mesh(mergeGeometries(signGeos), new THREE.MeshBasicMaterial({ map: signAtlas(), fog: false }));
  const glow = new THREE.Mesh(mergeGeometries(glowGeos), additive(glowTex()));
  glow.renderOrder = 5;
  scene.add(signs, glow);

  // cônes de lumière des lampadaires (faux volumétrique)
  const coneTex = canvas(4, 64, (g) => {
    const l = g.createLinearGradient(0, 0, 0, 64);
    l.addColorStop(0, 'rgba(255,255,255,0)'); l.addColorStop(0.15, 'rgba(255,255,255,.9)'); l.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = l; g.fillRect(0, 0, 4, 64);
  });
  const cones = lampXs.map((x) => {
    const geo = new THREE.CylinderGeometry(0.1, 0.95, 3.5, 12, 1, true);
    M.compose(P.set(x + 0.3, 1.75, -1.6), Q.identity(), S);
    return withColor(geo, '#ffa860', 0.05, M);
  });
  const coneMesh = new THREE.Mesh(mergeGeometries(cones), additive(coneTex));
  coneMesh.material.side = THREE.DoubleSide;
  coneMesh.renderOrder = 6;
  scene.add(coneMesh);
}

function withColor(geo, color, k, matrix) {
  const c = new THREE.Color(color).multiplyScalar(k);
  const cols = new Float32Array(geo.attributes.position.count * 3);
  for (let i = 0; i < cols.length; i += 3) { cols[i] = c.r; cols[i + 1] = c.g; cols[i + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return geo.applyMatrix4(matrix);
}

// Pluie : chaque goutte = un segment, la chute et le bouclage sont calculés dans le shader
function rain(scene) {
  const N = 650, pos = new Float32Array(N * 6), end = new Float32Array(N * 2), spd = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    const x = (rnd() - 0.5) * 24, y = rnd() * 8, z = -1.9 + rnd() * 5.5, s = 9 + rnd() * 5;
    pos.set([x, y, z, x, y, z], i * 6);
    end[i * 2 + 1] = 1;
    spd[i * 2] = spd[i * 2 + 1] = s;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  geo.setAttribute('aSpeed', new THREE.BufferAttribute(spd, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uCamX: { value: 0 } },
    vertexShader: `uniform float uTime; uniform float uCamX; attribute float aEnd; attribute float aSpeed;
      void main() {
        vec3 p = position;
        p.y = mod(p.y - uTime * aSpeed, 8.0) - aEnd * 0.32;
        p.x = uCamX - 12.0 + mod(p.x - uCamX + 12.0, 24.0) - aEnd * 0.06;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `void main() { gl_FragColor = vec4(0.62, 0.72, 0.95, 0.32); }`,
    transparent: true, depthWrite: false,
  });
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;
  lines.renderOrder = 8;
  scene.add(lines);
  return mat.uniforms;
}

// Vapeur qui sort des grilles : quelques sprites recyclés
function steam(scene) {
  const tex = glowTex();
  const list = [];
  for (const x of [-7.2, -0.8, 5.2, 10.5]) {
    for (let k = 0; k < 2; k++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0x8a90a8, transparent: true, depthWrite: false, opacity: 0 }));
      scene.add(m);
      list.push({ m, x, z: -1.75, t: k * 1.6 });
    }
  }
  return list;
}

export class Decor {
  constructor(scene, lampXs) {
    backdrop(scene);
    facade(scene);
    neons(scene, lampXs);
    this.rainU = rain(scene);
    this.steam = steam(scene);
  }

  update(t, camX, dt) {
    this.rainU.uTime.value = t;
    this.rainU.uCamX.value = camX;
    for (const s of this.steam) {
      s.t = (s.t + dt) % 3.2;
      const k = s.t / 3.2;
      s.m.position.set(s.x + Math.sin(s.t * 1.3) * 0.2 * k, 0.2 + k * 2.2, s.z + k * 0.6);
      const sc = 0.6 + k * 2.4;
      s.m.scale.set(sc, sc, 1);
      s.m.material.opacity = Math.sin(k * Math.PI) * 0.18;
    }
  }
}
