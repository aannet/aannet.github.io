import * as THREE from 'three';
import { CFG, G, groups } from './config.js';
import { toonGradient, toonMesh } from './toon.js';
import { sfx } from './audio.js';

// Décor qui casse : caisses (en planches physiques), poubelles qui valsent, vitrines d'abribus qui éclatent.
// Les chutes animées ne passent pas par Rapier : on teste nous-mêmes le passage d'un ennemi projeté.
const GLASS = [
  { x: -6.6, z0: -1.45, z1: -0.45 },
  { x: 5.9, z0: -0.2, z1: 0.8 },
];
const RESPAWN = 18;
const WOOD = [0.75, 0.48, 0.22], SHARD = [0.75, 0.92, 1];
const _v = new THREE.Vector3();

export class Breakables {
  constructor(game, level) {
    this.game = game;
    this.level = level;
    this.debris = [];
    this.respawns = [];
    this.plankGeo = new THREE.BoxGeometry(0.5, 0.07, 0.13);
    this.glassMat = new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
    this.frameMat = new THREE.MeshToonMaterial({ color: 0x2b2a36, gradientMap: toonGradient() });
    this.glass = GLASS.map((g) => ({ ...g, intact: true, mesh: null, body: null }));
    for (const g of this.glass) this.buildGlass(g);
  }

  reset() {
    for (const d of this.debris) this.removeDebris(d);
    this.debris = [];
    this.respawns = [];
    for (const g of this.glass) if (!g.intact) this.buildGlass(g);
  }

  // Abribus : montants sombres + panneau de verre en travers du trottoir (bloque tant qu'il est intact)
  buildGlass(g) {
    const { scene, R, world } = this.game;
    const len = g.z1 - g.z0, zc = (g.z0 + g.z1) / 2;
    if (!g.frame) {
      g.frame = new THREE.Group();
      for (const z of [g.z0, g.z1]) {
        const post = toonMesh(new THREE.BoxGeometry(0.06, 2.1, 0.06), this.frameMat, g.frame);
        post.position.set(g.x, 1.05, z);
      }
      const top = toonMesh(new THREE.BoxGeometry(0.08, 0.06, len + 0.06), this.frameMat, g.frame);
      top.position.set(g.x, 2.1, zc);
      scene.add(g.frame);
    }
    g.mesh = new THREE.Mesh(new THREE.PlaneGeometry(len, 1.9), this.glassMat);
    g.mesh.rotation.y = Math.PI / 2;
    g.mesh.position.set(g.x, 1.08, zc);
    g.mesh.renderOrder = 4;
    scene.add(g.mesh);
    g.body = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(g.x, 1, zc));
    world.createCollider(R.ColliderDesc.cuboid(0.03, 1, len / 2).setCollisionGroups(groups(G.STATIC, 0xffff)), g.body);
    g.intact = true;
  }

  shatterGlass(g, dir) {
    const { scene, world, juice } = this.game;
    g.intact = false;
    scene.remove(g.mesh);
    world.removeRigidBody(g.body);
    g.respawnT = RESPAWN;
    for (let i = 0; i < 6; i++) {
      _v.set(g.x, 0.4 + Math.random() * 1.5, g.z0 + Math.random() * (g.z1 - g.z0));
      juice.sparks(_v, dir, 9 * CFG.particles, 1, SHARD);
    }
    juice.droplets(_v.set(g.x, 1.6, (g.z0 + g.z1) / 2), dir, 16);
    juice.shake(0.3);
    sfx.glass();
  }

  // Bloque la marche à travers une vitrine intacte (persos debout)
  block(ch, prevX) {
    for (const g of this.glass) {
      if (!g.intact || ch.z < g.z0 - 0.3 || ch.z > g.z1 + 0.3) continue;
      if (Math.abs(ch.x - g.x) < 0.3) ch.x = g.x + (prevX < g.x ? -0.3 : 0.3);
    }
  }

  // Casse une caisse : planches physiques + échardes + poussière ; respawn plus tard
  breakCrate(p, dir) {
    const { scene, R, world, juice } = this.game;
    const t = p.body.translation(), v = p.body.linvel();
    scene.remove(p.mesh);
    world.removeRigidBody(p.body);
    this.level.props.splice(this.level.props.indexOf(p), 1);
    for (let i = 0; i < 6; i++) {
      const m = toonMesh(this.plankGeo, this.level.crateMat, scene, false);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 3, Math.random() * 3, Math.random() * 3));
      const b = world.createRigidBody(R.RigidBodyDesc.dynamic()
        .setTranslation(t.x + (Math.random() - 0.5) * 0.4, t.y + (Math.random() - 0.2) * 0.4, t.z + (Math.random() - 0.5) * 0.4)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
        .setLinvel(v.x * 0.5 + dir * (1.5 + Math.random() * 3), 2 + Math.random() * 3, v.z * 0.5 + (Math.random() - 0.5) * 2)
        .setAngvel({ x: (Math.random() - 0.5) * 14, y: (Math.random() - 0.5) * 14, z: (Math.random() - 0.5) * 14 }));
      world.createCollider(R.ColliderDesc.cuboid(0.25, 0.035, 0.065).setDensity(0.3).setCollisionGroups(groups(G.PROPS, G.STATIC | G.PROPS)), b);
      this.debris.push({ m, b, t: 3 + Math.random() });
    }
    _v.set(t.x, t.y, t.z);
    juice.sparks(_v, dir, 16 * CFG.particles, 1, WOOD);
    juice.dust(t.x, t.z, 0.8);
    juice.shake(0.2);
    sfx.wood();
    this.respawns.push({ def: p.def, t: RESPAWN });
  }

  // Impact sur un objet : les caisses cassent (coup fort, ou 2e coup léger), les poubelles valsent
  impact(p, dir, heavy, push = 1) {
    if (p.kind === 'crate' && (heavy || ++p.hits >= 2)) return this.breakCrate(p, dir);
    // vitesse visée (indépendante de la masse) : ~1,5 m/s pour un coup, plus fort quand un ennemi percute
    const m = p.body.mass(), dv = 1.5 * push;
    p.body.applyImpulse({ x: dir * dv * m, y: dv * 0.6 * m, z: (Math.random() - 0.5) * 0.3 * m }, true);
    p.body.setAngvel({ x: (Math.random() - 0.5) * 3 * push, y: 0, z: -dir * 4 * push }, true);
    if (p.kind === 'crate') sfx.box(0.8); else sfx.clang();
  }

  // Coups du héros sur le décor. Retourne true si quelque chose a été touché.
  hitProps(points, r, dir, heavy, hitSet) {
    let any = false;
    for (const p of [...this.level.props]) {
      if (hitSet.has(p)) continue;
      const t = p.body.translation();
      for (const pt of points) {
        // distance au sol + tolérance verticale : un coup à hauteur de poitrine touche une caisse posée devant
        if (Math.hypot(t.x - pt.x, t.z - pt.z) < r + 0.35 && pt.y - t.y < 1.3 && pt.y - t.y > -0.6) {
          hitSet.add(p);
          this.game.juice.hit(pt, dir, heavy ? 1 : 0);
          this.game.time.hitstop(CFG.hitstopLight);
          this.impact(p, dir, heavy);
          any = true;
          break;
        }
      }
    }
    return any;
  }

  // Ennemi projeté (chute animée) : casse/bouscule ce qu'il traverse et perd de la vitesse
  sweep(e) {
    const dir = Math.sign(e.vx) || 1;
    for (const g of this.glass) {
      if (g.intact && e.z > g.z0 - 0.25 && e.z < g.z1 + 0.25 && e.y < 2 && Math.abs(e.x - g.x) < 0.35) {
        this.shatterGlass(g, dir);
        e.vx *= 0.55;
        e.hp -= 8 * CFG.damageMult;
        if (e.hp <= 0 && !e.ko) this.game.onKO(e);
      }
    }
    for (const p of [...this.level.props]) {
      if (e.bowled.has(p)) continue;
      const t = p.body.translation();
      if (Math.abs(t.x - (e.x + dir * 0.3)) < 0.5 && Math.abs(t.z - e.z) < 0.45 && e.y < 1.1) {
        e.bowled.add(p);
        this.impact(p, dir, Math.abs(e.vx) > 3, 2.2);
        e.vx *= 0.8;
      }
    }
  }

  // Smash : tout ce qui casse dans le rayon casse, le reste est soufflé vers l'extérieur
  smashArea(x, z, radius) {
    for (const g of this.glass) {
      const gz = Math.max(g.z0, Math.min(g.z1, z));
      if (g.intact && Math.hypot(g.x - x, gz - z) < radius) this.shatterGlass(g, Math.sign(g.x - x) || 1);
    }
    for (const p of [...this.level.props]) {
      const t = p.body.translation();
      const d = Math.hypot(t.x - x, t.z - z);
      if (d < radius) {
        const dir = Math.sign(t.x - x) || 1;
        if (p.kind === 'crate') this.breakCrate(p, dir);
        else this.impact(p, dir, false, 3.5 * (1 - d / radius) + 1);
      }
    }
  }

  // Projectile (poubelle lancée) : casse caisses et vitrines qu'il traverse
  sweepPoint(t, dir, done) {
    for (const g of this.glass) {
      if (g.intact && t.z > g.z0 - 0.25 && t.z < g.z1 + 0.25 && t.y < 2 && Math.abs(t.x - g.x) < 0.35) this.shatterGlass(g, dir);
    }
    for (const p of [...this.level.props]) {
      if (done.has(p) || p.kind !== 'crate') continue;
      const c = p.body.translation();
      if (Math.hypot(c.x - t.x, c.z - t.z) < 0.55 && Math.abs(c.y - t.y) < 0.6) { done.add(p); this.breakCrate(p, dir); }
    }
  }

  removeDebris(d) {
    this.game.scene.remove(d.m);
    this.game.world.removeRigidBody(d.b);
  }

  update(dt) {
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.t -= dt;
      const t = d.b.translation(), r = d.b.rotation();
      d.m.position.set(t.x, t.y, t.z);
      d.m.quaternion.set(r.x, r.y, r.z, r.w);
      if (d.t < 0.4) d.m.scale.setScalar(Math.max(0.01, d.t / 0.4));
      if (d.t <= 0) { this.removeDebris(d); this.debris.splice(i, 1); }
    }
    // respawn quand John est loin (pas d'apparition sous ses yeux)
    const hx = this.game.hero.x;
    for (let i = this.respawns.length - 1; i >= 0; i--) {
      const r = this.respawns[i];
      r.t -= dt;
      if (r.t <= 0 && Math.abs(r.def.x - hx) > 5) { this.level.spawnProp(r.def, 2); this.respawns.splice(i, 1); }
    }
    for (const g of this.glass) {
      if (g.intact) continue;
      g.respawnT -= dt;
      if (g.respawnT <= 0 && Math.abs(g.x - hx) > 5) this.buildGlass(g);
    }
  }
}
