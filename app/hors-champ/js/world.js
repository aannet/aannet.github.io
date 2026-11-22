// Monde : construit un niveau (carte + légende) avec un thème et le catalogue de props.
// Expose les requêtes de jeu : collisions, ligne de vue, cases bloquées pour le pathfinding.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PROPS } from './props.js';

const S = 2; // taille d'une case en unités monde
const DIRS = [[0, -1, 0], [0, 1, Math.PI], [-1, 0, Math.PI / 2], [1, 0, -Math.PI / 2]]; // [dc, dr, rotation dos au mur]

function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 1 | s) + 0x6D2B79F5 >>> 0) % 1e6) / 1e6; }

export function buildWorld(level, theme, scene) {
  const map = level.map, ROWS = map.length, COLS = map[0].length, legend = level.legend;
  const role = (c, r) => (r < 0 || c < 0 || r >= ROWS || c >= COLS) ? 'wall' : (legend[map[r][c]] || 'floor');
  const wall = (c, r) => role(c, r) === 'wall';
  const rand = rng(level.seed || 1);
  const spawn = {}, floors = [], placed = [];

  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const k = role(c, r);
    if (k === 'wall') continue;
    floors.push([c, r]);
    if (['player', 'enemy', 'key', 'exit'].includes(k)) spawn[k] = { x: c * S, z: r * S };
    else if (k === 'battery') (spawn.batteries ||= []).push({ x: c * S, z: r * S });
    else if (PROPS[k]) placed.push(placeProp(k, c, r));
  }

  function placeProp(k, c, r) {
    const def = PROPS[k];
    let rot = 0, x = c * S, z = r * S;
    if (def.place === 'wall') {
      const w = DIRS.filter(([dc, dr]) => wall(c + dc, r + dr));
      const [dc, dr, ro] = w.length ? w[rand() * w.length | 0] : DIRS[rand() * 4 | 0];
      rot = ro; const sh = S / 2 - def.size[1] / 2 - .03; x += dc * sh; z += dr * sh;
    } else if (def.place === 'door') {
      rot = (wall(c - 1, r) && wall(c + 1, r)) ? 0 : Math.PI / 2;
    } else {
      rot = (rand() * 4 | 0) * Math.PI / 2 + (rand() - .5) * .3;
    }
    const q = Math.round(rot / (Math.PI / 2)) % 2 !== 0;
    const [w, d] = q ? [def.size[1], def.size[0]] : def.size;
    return { k, def, c, r, x, z, rot, box: { x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 } };
  }

  // --- Sol, murs, taches
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(COLS * S, ROWS * S),
    new THREE.MeshStandardMaterial({ map: theme.floorTex(COLS, ROWS), roughness: .42 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set((COLS - 1) * S / 2, 0, (ROWS - 1) * S / 2); floor.receiveShadow = true;
  scene.add(floor);

  const walls = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (map[r][c] && wall(c, r)) walls.push([c, r]);
  const wm = new THREE.InstancedMesh(new THREE.BoxGeometry(S, theme.wallH, S),
    new THREE.MeshStandardMaterial({ map: theme.wallTex(), roughness: .85 }), walls.length);
  const m4 = new THREE.Matrix4();
  walls.forEach(([c, r], i) => { m4.makeTranslation(c * S, theme.wallH / 2, r * S); wm.setMatrixAt(i, m4); });
  wm.castShadow = wm.receiveShadow = true; scene.add(wm);

  const decalMat = new THREE.MeshStandardMaterial({ map: theme.splatTex(), transparent: true, roughness: .12, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const decalGeo = new THREE.PlaneGeometry(1, 1);
  for (let i = 0; i < 18; i++) {
    const [c, r] = floors[rand() * floors.length | 0], d = new THREE.Mesh(decalGeo, decalMat), s = .8 + rand() * 2.2;
    d.scale.set(s, s, 1); d.rotation.set(-Math.PI / 2, 0, rand() * 6.28);
    d.position.set(c * S + (rand() - .5) * 1.2, .01, r * S + (rand() - .5) * 1.2); d.receiveShadow = true; scene.add(d);
  }
  scene.add(new THREE.HemisphereLight(...theme.hemi));

  // --- Props : une InstancedMesh par (type de prop, matériau) => peu d'appels de dessin
  const mats = theme.mats();
  const byType = {};
  placed.forEach(p => (byType[p.k] ||= []).push(p));
  const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), pos = new THREE.Vector3();
  for (const k in byType) {
    const def = PROPS[k], groups = {};
    def.parts().forEach(({ geo, mat }) => (groups[mat] ||= []).push(geo.index ? geo : geo));
    for (const mk in groups) {
      const geo = groups[mk].length > 1 ? mergeGeometries(groups[mk]) : groups[mk][0];
      const im = new THREE.InstancedMesh(geo, mats[mk], byType[k].length);
      byType[k].forEach((p, i) => {
        q.setFromAxisAngle(up, p.rot); pos.set(p.x, 0, p.z); m4.compose(pos, q, one); im.setMatrixAt(i, m4);
        (p.inst ||= { i, ims: [] }).ims.push(im);
        if (mk === 'glow') { im.setColorAt(i, new THREE.Color(1, 1, 1)); p.inst.glow = im; }
      });
      im.castShadow = !!def.shadow; im.receiveShadow = true; im.name = k + ':' + mk;
      scene.add(im);
    }
  }

  // --- Repositionner un prop animé (comportements) : placement * matrice locale optionnelle
  const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _m = new THREE.Matrix4();
  function applyProp(p) {
    _e.set(p.tilt || 0, p.rot, 0, 'YXZ'); _q.setFromEuler(_e); _p.set(p.x, p.y || 0, p.z); _m.compose(_p, _q, one);
    if (p.local) _m.multiply(p.local);
    for (const im of p.inst.ims) { im.setMatrixAt(p.inst.i, _m); im.instanceMatrix.needsUpdate = true; }
  }
  placed.forEach(p => { p.init = { x: p.x, z: p.z, rot: p.rot, box: { ...p.box } }; });

  // --- Lumières de props : pool de 3 PointLights sans ombre, assignées aux sources les plus proches
  const emitters = placed.filter(p => p.def.light);
  const pool = [0, 1, 2].map(() => { const l = new THREE.PointLight(theme.neon, 0, 6, 2); scene.add(l); return l; });
  function updateLights(px, pz) {
    emitters.sort((a, b) => Math.hypot(a.x - px, a.z - pz) - Math.hypot(b.x - px, b.z - pz));
    pool.forEach((l, i) => {
      const e = emitters[i];
      if (!e || Math.hypot(e.x - px, e.z - pz) > 16) { l.intensity = 0; return; }
      l.position.set(e.x, e.def.light.y, e.z); l.distance = e.def.light.distance; l.intensity = e.def.light.intensity * (e.dim ?? 1);
    });
  }

  // --- Atmosphère : poussière (canal R) et fumée (canal G) par case, dans une texture COLS x ROWS filtrée
  // Un niveau déclare des zones : { type: 'dust' | 'smoke', from: [col, row], to: [col, row], density? }
  const atm = new Float32Array(COLS * ROWS * 2);
  (level.zones || []).forEach(zn => {
    const ch = zn.type === 'smoke' ? 1 : 0, v = zn.density ?? 1;
    for (let r = Math.min(zn.from[1], zn.to[1]); r <= Math.max(zn.from[1], zn.to[1]); r++)
      for (let c = Math.min(zn.from[0], zn.to[0]); c <= Math.max(zn.from[0], zn.to[0]); c++)
        if (!wall(c, r)) atm[(r * COLS + c) * 2 + ch] = Math.max(atm[(r * COLS + c) * 2 + ch], v);
  });
  const ad = new Uint8Array(COLS * ROWS * 4);
  for (let i = 0; i < COLS * ROWS; i++) { ad[i * 4] = atm[i * 2] * 255; ad[i * 4 + 1] = atm[i * 2 + 1] * 255; ad[i * 4 + 3] = 255; }
  const atmosTex = new THREE.DataTexture(ad, COLS, ROWS, THREE.RGBAFormat);
  atmosTex.magFilter = atmosTex.minFilter = THREE.LinearFilter; atmosTex.needsUpdate = true;
  const SIGMA = [.12, .9]; // extinction par unité : poussière un peu, fumée beaucoup (mêmes valeurs que le shader)
  // Épaisseur optique le long d'un segment : sert au gameplay (la créature n'est pas "vue" à travers la fumée)
  function fog(ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz), n = Math.max(1, Math.ceil(len / .25)), st = len / n;
    let od = 0;
    for (let i = 0; i < n; i++) {
      const t = (i + .5) / n, c = Math.round((ax + dx * t) / S), r = Math.round((az + dz * t) / S);
      if (r < 0 || c < 0 || r >= ROWS || c >= COLS) continue;
      const k = (r * COLS + c) * 2; od += (atm[k] * SIGMA[0] + atm[k + 1] * SIGMA[1]) * st;
    }
    return od;
  }

  // --- Requêtes de jeu
  const solids = placed.filter(p => p.def.solid).map(p => p.box);
  const opaques = placed.filter(p => p.def.opaque).map(p => p.box);
  const blockedTile = new Set(placed.filter(p => p.def.solid).map(p => p.r * COLS + p.c));
  const wallAt = (x, z) => wall(Math.round(x / S), Math.round(z / S));
  const inBox = (b, x, z, m = 0) => x > b.x0 - m && x < b.x1 + m && z > b.z0 - m && z < b.z1 + m;
  function free(x, z, r = .28) {
    if (wallAt(x - r, z - r) || wallAt(x + r, z - r) || wallAt(x - r, z + r) || wallAt(x + r, z + r)) return false;
    for (const b of solids) if (inBox(b, x, z, r)) return false;
    return true;
  }
  function los(ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az, n = Math.ceil(Math.hypot(dx, dz) / .2);
    for (let i = 1; i < n; i++) {
      const t = i / n, x = ax + dx * t, z = az + dz * t;
      if (wallAt(x, z)) return false;
      for (const b of opaques) if (inBox(b, x, z, -.05)) return false;
    }
    return true;
  }
  const blocked = (c, r) => wall(c, r) || blockedTile.has(r * COLS + c);

  // --- Validation : les objectifs restent atteignables malgré les props
  (function validate() {
    const s = spawn.player, seen = new Set(), qq = [[Math.round(s.x / S), Math.round(s.z / S)]];
    seen.add(qq[0][1] * COLS + qq[0][0]);
    for (let i = 0; i < qq.length; i++) {
      const [c, r] = qq[i];
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = c + dc, nr = r + dr, id = nr * COLS + nc;
        if (!blocked(nc, nr) && !seen.has(id)) { seen.add(id); qq.push([nc, nr]); }
      }
    }
    for (const k of ['key', 'exit', 'enemy']) {
      const p = spawn[k];
      if (p && !seen.has(Math.round(p.z / S) * COLS + Math.round(p.x / S))) console.warn(`[${level.id}] ${k} inaccessible`);
    }
  })();

  return { S, ROWS, COLS, spawn, placed, mats, wall, wallAt, free, los, fog, blocked, updateLights, applyProp, atmosTex, hasAtmos: (level.zones || []).length > 0 };
}
