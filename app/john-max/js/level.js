import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { G, groups } from './config.js';
import { toonGradient, toonMesh } from './toon.js';
import { Decor } from './decor.js';
import { Breakables } from './breakables.js';
import { sfx } from './audio.js';

// Bornes de jeu courantes (mutées par stage.js : zone verrouillée / ouverte). STAGE = étendue totale.
export const ARENA = { minX: -9, maxX: 9, minZ: -1.45, maxZ: 1.15, wallZ: -2.0, frontZ: 1.9 };
export const STAGE = { minX: -9, maxX: 63 };
const LAMPS = [-5.5, 4.5];
const TILE = 30; // la rue décorée fait 30 m, deux copies se relaient autour de la caméra

function canvasTex(w, h, draw, rx = 1, ry = 1) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const toon = (color, map) => new THREE.MeshToonMaterial(map ? { color, map, gradientMap: toonGradient() } : { color, gradientMap: toonGradient() });

const BASE_PROPS = [
  { kind: 'crate', x: 2.6, z: -1.2, y: 0.28 },
  { kind: 'crate', x: 2.6, z: -1.2, y: 0.84 },
  { kind: 'crate', x: 3.2, z: -1.25, y: 0.28 },
  { kind: 'crate', x: -4.2, z: 0.6, y: 0.28 },
  { kind: 'can', x: -2.4, z: -1.35, y: 0.36 },
  { kind: 'can', x: -1.8, z: -1.4, y: 0.36 },
  { kind: 'can', x: 5.6, z: 0.9, y: 0.36 },
  { kind: 'crate', x: 6.6, z: -1.1, y: 0.28 },
  { kind: 'can', x: 7.3, z: -1.3, y: 0.36 },
  { kind: 'crate', x: -6.5, z: -1.2, y: 0.28 },
];
// Les 3 premières zones reprennent la disposition de base décalée ; une caisse isolée par zone cache de la nourriture
const PROP_DEFS = [
  ...[0, 18, 36].flatMap((off) => BASE_PROPS.map((d) => ({ ...d, x: d.x + off, food: off > 0 && d.x === -4.2 }))),
  { kind: 'can', x: 47.5, z: -1.35, y: 0.36 }, { kind: 'can', x: 60.5, z: 0.9, y: 0.36 },
  { kind: 'crate', x: 49, z: 0.7, y: 0.28, food: true }, { kind: 'crate', x: 59, z: -1.2, y: 0.28, food: true },
];

export class Level {
  constructor(game) {
    this.game = game;
    const { scene, R, world } = game;
    this.props = [];
    this.boxSoundT = 0;

    scene.background = new THREE.Color(0x0d0f1a);
    scene.fog = new THREE.Fog(0x141226, 10, 34);

    // Éclairage de nuit sans shadow map (ombres « blob », voir blobs.js) : lune froide + contre-jour chaud.
    scene.add(new THREE.HemisphereLight(0x5a6cc0, 0x1a1020, 0.9));
    const moon = new THREE.DirectionalLight(0xa8bcff, 1.4);
    moon.position.set(-3, 9, 6);
    const warm = new THREE.DirectionalLight(0xff9a50, 1.3);
    warm.position.set(4, 2.5, -5);
    scene.add(moon, warm);

    // Trottoir mouillé : dalles sombres, taches bleutées
    const walkTex = canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#2a2834'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(90,110,170,${Math.random() * 0.18})`; g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, 4 + Math.random() * 14, 2 + Math.random() * 5, 0, 0, 7); g.fill(); }
      g.strokeStyle = '#17151e'; g.lineWidth = 3; g.strokeRect(0, 0, w, h);
    }, 30, 3.4);
    const tile = new THREE.Group();
    const walk = new THREE.Mesh(new THREE.PlaneGeometry(30, 3.4), toon(0xffffff, walkTex));
    walk.rotation.x = -Math.PI / 2;
    walk.position.set(0, 0, -0.35);

    const roadTex = canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#16151d'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#9a7a2e'; g.fillRect(0, h * 0.55, w * 0.55, h * 0.05);
    }, 10, 1);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(30, 7), toon(0xffffff, roadTex));
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, -0.02, 4.85);
    const curb = new THREE.Mesh(new THREE.BoxGeometry(30, 0.1, 0.18), toon(0x4a4756));
    curb.position.set(0, 0.03, 1.38);
    tile.add(walk, road, curb);

    // Lampadaires : géométries fusionnées en un mesh
    const M = new THREE.Matrix4();
    const parts = [];
    for (const x of LAMPS) {
      parts.push(new THREE.CylinderGeometry(0.07, 0.09, 3.6, 8).applyMatrix4(M.makeTranslation(x, 1.8, -1.6)));
      parts.push(new THREE.BoxGeometry(0.5, 0.12, 0.25).applyMatrix4(M.makeTranslation(x + 0.2, 3.6, -1.6)));
    }
    const poles = new THREE.Mesh(mergeGeometries(parts), toon(0x24232e));
    tile.add(poles);
    const bulbs = new THREE.Mesh(
      mergeGeometries(LAMPS.map((x) => new THREE.BoxGeometry(0.3, 0.05, 0.15).applyMatrix4(M.makeTranslation(x + 0.3, 3.53, -1.6)))),
      new THREE.MeshBasicMaterial({ color: 0xffd9a0 })
    );
    tile.add(bulbs);

    this.decor = new Decor(scene, LAMPS, tile);
    // deuxième tuile : même géométrie et matériaux (clone léger), vapeur figée masquée
    this.tiles = [tile, tile.clone()];
    this.tiles[1].traverse((o) => { if (o.isSprite) o.visible = false; });
    scene.add(...this.tiles);

    // Physique statique
    const st = groups(G.STATIC, 0xffff);
    const fixed = (hx, hy, hz, x, y, z) => {
      const b = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(x, y, z));
      world.createCollider(R.ColliderDesc.cuboid(hx, hy, hz).setFriction(0.9).setCollisionGroups(st), b);
    };
    const cx = (STAGE.minX + STAGE.maxX) / 2, hx = (STAGE.maxX - STAGE.minX) / 2 + 10;
    fixed(hx, 0.5, 20, cx, -0.5, 0);
    fixed(hx, 5, 0.2, cx, 4, ARENA.wallZ - 0.2);
    fixed(hx, 5, 0.2, cx, 4, ARENA.frontZ + 0.2);
    fixed(0.2, 5, 5, STAGE.maxX + 0.8, 4, 0);
    fixed(0.2, 5, 5, STAGE.minX - 0.8, 4, 0);
    for (const x of [0, 1, 2].flatMap((k) => LAMPS.map((l) => l + k * TILE))) {
      const b = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(x, 1.8, -1.6));
      world.createCollider(R.ColliderDesc.cylinder(1.8, 0.09).setCollisionGroups(st), b);
    }

    this.crateMat = toon(0x9a8f88, canvasTex(64, 64, (g, w, h) => {
      g.fillStyle = '#c98b4a'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#6a4220'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
      g.beginPath(); g.moveTo(4, 4); g.lineTo(w - 4, h - 4); g.stroke();
    }));
    this.canMat = toon(0x3f5a50);
    this.lidMat = toon(0x2e443c);
    this.breakables = new Breakables(game, this);
    this.resetProps();
  }

  resetProps() {
    const { scene, world } = this.game;
    for (const p of this.props) { scene.remove(p.mesh); world.removeRigidBody(p.body); }
    this.props = [];
    for (const d of PROP_DEFS) this.spawnProp(d);
    this.breakables && this.breakables.reset();
  }

  spawnProp(d, dropY = 0) {
    const { scene, R, world } = this.game;
    const cg = groups(G.PROPS, 0xffff);
    {
      let mesh, col;
      if (d.kind === 'crate') {
        mesh = toonMesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), this.crateMat, scene);
        col = R.ColliderDesc.cuboid(0.275, 0.275, 0.275).setDensity(0.25);
      } else {
        mesh = toonMesh(new THREE.CylinderGeometry(0.25, 0.22, 0.72, 12), this.canMat, scene);
        const lid = toonMesh(new THREE.CylinderGeometry(0.27, 0.27, 0.05, 12), this.lidMat, mesh);
        lid.position.y = 0.38;
        col = R.ColliderDesc.cylinder(0.36, 0.25).setDensity(0.18);
      }
      const body = world.createRigidBody(
        R.RigidBodyDesc.dynamic().setTranslation(d.x, d.y + dropY, d.z).setLinearDamping(0.1).setAngularDamping(0.3).setCcdEnabled(true)
      );
      world.createCollider(col.setFriction(0.7).setRestitution(0.2).setCollisionGroups(cg), body);
      const p = { mesh, body, vprev: 0, def: d, kind: d.kind, hits: 0 };
      this.props.push(p);
      return p;
    }
  }

  sync(dt) {
    this.boxSoundT -= dt;
    for (const p of this.props) {
      const t = p.body.translation(), r = p.body.rotation();
      p.mesh.position.set(t.x, t.y, t.z);
      p.mesh.quaternion.set(r.x, r.y, r.z, r.w);
      const v = p.body.linvel();
      const s = Math.hypot(v.x, v.y, v.z);
      if (p.vprev - s > 2.5 && this.boxSoundT <= 0) { sfx.box((p.vprev - s) / 6); this.boxSoundT = 0.08; }
      p.vprev = s;
    }
  }

  // Appelé à chaque frame (temps réel) : pluie, vapeur, débris
  update(camX, t, dt) {
    // tuiles de rue : l'une centrée sur le multiple de 30 m le plus proche, l'autre du côté où regarde la caméra
    const base = Math.round(camX / TILE) * TILE;
    this.tiles[0].position.x = base;
    this.tiles[1].position.x = base + (camX >= base ? TILE : -TILE);
    this.breakables.update(dt);
    this.decor.update(t, camX, dt);
  }
}
