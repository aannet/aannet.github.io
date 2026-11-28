import * as THREE from 'three';
import { CFG, G, groups } from './config.js';
import { toonGradient, toonMesh } from './toon.js';
import { ARENA } from './level.js';
import { sfx } from './audio.js';

const LEN = 0.86;
const _p = new THREE.Vector3();
const toon = (c) => new THREE.MeshToonMaterial({ color: c, gradientMap: toonGradient() });

// Batte ramassable : passe sur la batte pour la prendre. Change le moveset,
// casse au bout de CFG.batDurability coups, puis une nouvelle tombe du ciel.
export class Bat {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.wood = toon(0xd9a55b);
    this.grip = toon(0x2b2230);
    const geo = new THREE.CylinderGeometry(0.028, 0.058, LEN, 12);
    geo.rotateX(Math.PI); // bout épais vers -Y
    this.mesh = toonMesh(geo, this.wood, this.group);
    const tape = toonMesh(new THREE.CylinderGeometry(0.032, 0.032, 0.2, 10), this.grip, this.mesh);
    tape.position.y = LEN / 2 - 0.1;
    // marqueurs de hitbox le long de la batte (en mode tenu)
    this.marks = [0.35, 0.58, 0.8].map((d) => { const o = new THREE.Object3D(); o.position.y = -d; this.group.add(o); return o; });
    game.scene.add(this.group);
    this.state = 'gone';
    this.body = null;
    this.uses = 0;
    this.respawnT = 0;
    this.pieces = [];
    this.spawn(-6.8, 0.3, 0.3);
  }

  spawn(x, z, y = 4) {
    const { R, world } = this.game;
    this.state = 'ground';
    this.game.scene.add(this.group);
    this.mesh.position.set(0, 0, 0);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2 + 0.2);
    this.body = world.createRigidBody(
      R.RigidBodyDesc.dynamic().setTranslation(x, y, z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
        .setAngvel({ x: 0, y: 2, z: 4 }).setCcdEnabled(true)
    );
    world.createCollider(R.ColliderDesc.cylinder(LEN / 2, 0.05).setDensity(0.6).setCollisionGroups(groups(G.PROPS, 0xffff)), this.body);
  }

  pickUp(hero) {
    this.game.world.removeRigidBody(this.body);
    this.body = null;
    this.state = 'held';
    hero.bat = this;
    this.uses = CFG.batDurability;
    // tenue dans la main droite : la batte sort du poing, perpendiculaire aux doigts
    hero.model.bones.hand_r.add(this.group);
    this.group.position.set(0.02, 0.08, 0);
    this.group.rotation.set(0, 0, Math.PI / 2);
    this.mesh.position.set(0, -LEN / 2 + 0.08, 0);
    this.game.ui.message('BATTE !', 0.8);
    sfx.pickup();
  }

  points(out) {
    this.group.updateMatrixWorld(true);
    for (let i = 0; i < 3; i++) this.marks[i].getWorldPosition(out[i]);
    return out;
  }

  used() {
    this.uses--;
    if (this.uses <= 0) this.break();
  }

  break() {
    const { R, world, scene, hero } = this.game;
    this.mesh.getWorldPosition(_p);
    const q = new THREE.Quaternion();
    this.mesh.getWorldQuaternion(q);
    hero.bat = null;
    if (hero.state === 'attack') hero.setState('free');
    this.group.removeFromParent();
    this.state = 'gone';
    this.respawnT = 5;
    sfx.crack();
    this.game.juice.sparks(_p, hero.facing, 18, true);
    this.game.ui.message('CRAC !', 0.8);
    // deux morceaux physiques
    const half = new THREE.CylinderGeometry(0.045, 0.058, LEN / 2, 10);
    for (let i = 0; i < 2; i++) {
      const m = toonMesh(half, this.wood, scene);
      const off = new THREE.Vector3(0, i ? -LEN / 4 : LEN / 4, 0).applyQuaternion(q);
      const b = world.createRigidBody(
        R.RigidBodyDesc.dynamic().setTranslation(_p.x + off.x, _p.y + off.y, _p.z + off.z)
          .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
          .setLinvel(hero.facing * (2 + Math.random() * 3), 3 + Math.random() * 2, (Math.random() - 0.5) * 2)
          .setAngvel({ x: Math.random() * 10, y: 0, z: Math.random() * 10 })
      );
      world.createCollider(R.ColliderDesc.cylinder(LEN / 4, 0.05).setDensity(0.6).setCollisionGroups(groups(G.PROPS, 0xffff)), b);
      this.pieces.push({ m, b, t: 3 });
    }
  }

  update(dt) {
    const { hero, world, scene } = this.game;
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i];
      p.t -= dt;
      const t = p.b.translation(), r = p.b.rotation();
      p.m.position.set(t.x, t.y, t.z);
      p.m.quaternion.set(r.x, r.y, r.z, r.w);
      if (p.t <= 0) { scene.remove(p.m); world.removeRigidBody(p.b); this.pieces.splice(i, 1); }
    }
    if (this.state === 'gone') {
      this.respawnT -= dt;
      if (this.respawnT <= 0) {
        const x = Math.max(ARENA.minX + 1, Math.min(ARENA.maxX - 1, hero.x + (Math.random() < 0.5 ? -2.5 : 2.5)));
        this.spawn(x, (Math.random() - 0.5) * 1.6, 5);
      }
      return;
    }
    if (this.state === 'ground') {
      const t = this.body.translation(), r = this.body.rotation();
      this.group.position.set(t.x, t.y, t.z);
      this.group.quaternion.set(r.x, r.y, r.z, r.w);
      const v = this.body.linvel();
      if (!hero.bat && hero.state === 'free' && t.y < 0.4 && Math.hypot(v.x, v.y, v.z) < 2.5 &&
          Math.hypot(t.x - hero.x, t.z - hero.z) < 0.6) {
        this.pickUp(hero);
      }
    }
  }

  forceRespawn() {
    const { hero, world } = this.game;
    if (this.state === 'held') { hero.bat = null; this.group.removeFromParent(); }
    if (this.state === 'ground' && this.body) world.removeRigidBody(this.body);
    this.state = 'gone';
    this.respawnT = 0;
  }
}
