import * as THREE from 'three';
import { CFG, G, groups } from './config.js';
import { toonGradient, toonMesh } from './toon.js';
import { ARENA } from './level.js';
import { sfx } from './audio.js';

// Armes ramassables : on marche dessus pour les prendre. Chacune change le moveset (clips d'épée du pack)
// et casse au bout de `uses` coups ; une nouvelle du même type retombe du ciel un peu plus tard.
// Temps des coups en secondes de clip, comme dans combat.js.
const toon = (c) => new THREE.MeshToonMaterial({ color: c, gradientMap: toonGradient() });
const swing = (clip, rec, o) => ({ clip, rec, active: [0.14, 0.3], cancel: 0.45, tip: 'weapon', weapon: true, lunge: 0.4, ...o });

export const TYPES = {
  bat: {
    label: 'BATTE', len: 0.86, uses: 6, idle: 'Sword_Idle',
    combo: [
      swing('Sword_Regular_A', 'Sword_Regular_A_Rec', { name: 'bat1', speed: 0.9, r: 0.26, dmg: 30, heavy: true, wk: 1.2, wh: 0.14, ws: 1.3, sfx: 'bat' }),
      swing('Sword_Regular_B', 'Sword_Regular_B_Rec', { name: 'bat2', speed: 0.9, active: [0.15, 0.32], cancel: 0.53, r: 0.26, dmg: 30, heavy: true, wk: 1.2, wh: 0.14, ws: 1.3, sfx: 'bat' }),
    ],
    build(g) {
      const geo = new THREE.CylinderGeometry(0.028, 0.058, this.len, 12).rotateX(Math.PI);
      const m = toonMesh(geo, toon(0xd9a55b), g);
      toonMesh(new THREE.CylinderGeometry(0.032, 0.032, 0.2, 10), toon(0x2b2230), m).position.y = this.len / 2 - 0.1;
      return { mesh: m, mat: m.material, r: 0.05 };
    },
  },
  pipe: {
    label: 'BARRE', len: 0.95, uses: 10, idle: 'Sword_Idle',
    combo: [
      swing('Sword_Regular_A', 'Sword_Regular_A_Rec', { name: 'pipe1', speed: 1.3, r: 0.22, dmg: 14, heavy: false, wk: 1, wh: 0.07, ws: 1, sfx: 'metal' }),
      swing('Sword_Regular_B', 'Sword_Regular_B_Rec', { name: 'pipe2', speed: 1.3, active: [0.15, 0.32], cancel: 0.5, r: 0.22, dmg: 18, heavy: true, wk: 0.9, wh: 0.1, ws: 1.1, sfx: 'metal' }),
    ],
    build(g) {
      const mat = toon(0x8d939e);
      const m = toonMesh(new THREE.CylinderGeometry(0.026, 0.026, this.len, 8), mat, g);
      for (const y of [-this.len / 2 + 0.03, this.len / 2 - 0.03]) toonMesh(new THREE.CylinderGeometry(0.036, 0.036, 0.06, 8), toon(0x5b606b), m).position.y = y;
      return { mesh: m, mat, r: 0.035 };
    },
  },
  sign: {
    label: 'PANNEAU', len: 1.25, uses: 5, idle: 'Sword_Idle',
    combo: [
      swing('Sword_Regular_A', 'Sword_Regular_A_Rec', { name: 'sign1', speed: 0.75, r: 0.5, dmg: 24, heavy: true, wk: 1.5, wh: 0.16, ws: 1.5, sfx: 'sign' }),
      swing('Sword_Regular_B', 'Sword_Regular_B_Rec', { name: 'sign2', speed: 0.75, active: [0.15, 0.32], cancel: 0.53, r: 0.5, dmg: 24, heavy: true, wk: 1.5, wh: 0.16, ws: 1.5, sfx: 'sign' }),
    ],
    build(g) {
      const mat = toon(0x6f7480);
      const m = toonMesh(new THREE.CylinderGeometry(0.03, 0.03, this.len, 8), mat, g);
      // panneau octogonal (rouge, trait blanc) au bout lourd
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const x = c.getContext('2d');
      x.fillStyle = '#c8303a'; x.beginPath();
      for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + (i / 8) * Math.PI * 2; x.lineTo(32 + Math.cos(a) * 31, 32 + Math.sin(a) * 31); }
      x.fill(); x.fillStyle = '#fff'; x.fillRect(12, 27, 40, 10);
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      const panel = toonMesh(new THREE.CylinderGeometry(0.26, 0.26, 0.03, 8), new THREE.MeshToonMaterial({ map: tex, gradientMap: toonGradient() }), m);
      panel.rotation.set(Math.PI / 2, Math.PI / 8, 0);
      panel.position.y = -this.len / 2 + 0.2;
      return { mesh: m, mat, r: 0.05 };
    },
  },
};

// une arme par zone (le boss se combat à mains nues ou avec ce qu'on a gardé)
const SPAWNS = [
  { type: 'bat', x: -6.8, z: 0.3 },
  { type: 'pipe', x: 14, z: 1.0 },
  { type: 'sign', x: 34.5, z: -0.6 },
];
const _p = new THREE.Vector3(), _q = new THREE.Quaternion();

class Weapon {
  constructor(game, type, x, z, y) {
    this.game = game;
    this.type = type;
    this.def = TYPES[type];
    this.group = new THREE.Group();
    const b = this.def.build(this.group);
    this.mesh = b.mesh;
    this.mat = b.mat;
    this.radius = b.r;
    // marqueurs de hitbox le long de l'arme (en main, l'arme pend sous le poing : -Y)
    this.marks = [0.4, 0.65, 0.9].map((k) => { const o = new THREE.Object3D(); o.position.y = -k * this.def.len; this.group.add(o); return o; });
    game.scene.add(this.group);
    this.drop(x, z, y);
  }

  drop(x, z, y = 4) {
    const { R, world } = this.game;
    this.state = 'ground';
    this.mesh.position.set(0, 0, 0);
    this.game.scene.add(this.group);
    _q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2 + 0.2);
    this.body = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(x, y, z)
      .setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w }).setAngvel({ x: 0, y: 2, z: 4 }).setCcdEnabled(true));
    world.createCollider(R.ColliderDesc.cylinder(this.def.len / 2, this.radius).setDensity(0.6).setCollisionGroups(groups(G.PROPS, 0xffff)), this.body);
  }

  pickUp(hero) {
    this.game.world.removeRigidBody(this.body);
    this.body = null;
    this.state = 'held';
    hero.weapon = this;
    this.uses = Math.max(1, Math.round(this.def.uses * CFG.durabilityMult));
    hero.model.bones.hand_r.add(this.group);
    this.group.position.set(0.02, 0.08, 0);
    this.group.rotation.set(0, 0, Math.PI / 2);
    this.mesh.position.set(0, -this.def.len / 2 + 0.08, 0);
    this.game.ui.message(this.def.label + ' !', 0.8);
    sfx.pickup();
  }

  points(out) {
    this.group.updateMatrixWorld(true);
    for (let i = 0; i < 3; i++) this.marks[i].getWorldPosition(out[i]);
    return out;
  }

  used() {
    if (--this.uses <= 0) this.break();
  }

  // Casse : deux morceaux physiques, l'arme est perdue ; une autre du même type retombera
  break() {
    const { R, world, scene, hero, juice } = this.game;
    this.mesh.getWorldPosition(_p);
    this.mesh.getWorldQuaternion(_q);
    hero.weapon = null;
    if (hero.state === 'attack') hero.setState('free');
    this.group.removeFromParent();
    this.state = 'gone';
    this.respawnT = 6;
    sfx.crack();
    juice.hit(_p, hero.facing, 2);
    this.game.ui.message('CRAC !', 0.8);
    const half = this.def.len / 2;
    for (let i = 0; i < 2; i++) {
      const m = toonMesh(new THREE.CylinderGeometry(this.radius * 0.9, this.radius, half, 8), this.mat, scene);
      const off = new THREE.Vector3(0, i ? -half / 2 : half / 2, 0).applyQuaternion(_q);
      const b = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(_p.x + off.x, _p.y + off.y, _p.z + off.z)
        .setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w })
        .setLinvel(hero.facing * (2 + Math.random() * 3), 3 + Math.random() * 2, (Math.random() - 0.5) * 2)
        .setAngvel({ x: Math.random() * 10, y: 0, z: Math.random() * 10 }));
      world.createCollider(R.ColliderDesc.cylinder(half / 2, this.radius).setDensity(0.6).setCollisionGroups(groups(G.PROPS, 0xffff)), b);
      this.game.weapons.pieces.push({ m, b, t: 3 });
    }
  }

  // John tombe : l'arme lui échappe et rebondit au sol (pas reprise tout de suite)
  dropFromHand(hero) {
    hero.weapon = null;
    this.group.getWorldPosition(_p);
    this.group.removeFromParent();
    this.drop(_p.x, _p.z, Math.max(0.6, _p.y));
    this.body.setLinvel({ x: -hero.facing * 1.5, y: 3, z: 0 }, true);
    this.noPick = 1.5;
  }

  forceDrop() {
    const { hero, world } = this.game;
    if (this.state === 'held') { hero.weapon = null; this.group.removeFromParent(); if (hero.state === 'attack') hero.setState('free'); }
    if (this.state === 'ground' && this.body) world.removeRigidBody(this.body);
    this.state = 'gone';
    this.respawnT = 0;
  }

  update(dt) {
    const hero = this.game.hero;
    if (this.state === 'gone') {
      this.respawnT -= dt;
      if (this.respawnT <= 0) {
        const x = Math.max(ARENA.minX + 1, Math.min(ARENA.maxX - 1, hero.x + (Math.random() < 0.5 ? -2.5 : 2.5)));
        this.drop(x, (Math.random() - 0.5) * 1.6, 5);
      }
      return;
    }
    if (this.state !== 'ground') return;
    if (this.noPick > 0) this.noPick -= dt;
    const t = this.body.translation(), r = this.body.rotation();
    this.group.position.set(t.x, t.y, t.z);
    this.group.quaternion.set(r.x, r.y, r.z, r.w);
    const v = this.body.linvel();
    if (!(this.noPick > 0) && !hero.weapon && !hero.carrying && hero.state === 'free' && t.y < 0.4 && Math.hypot(v.x, v.y, v.z) < 2.5 &&
        Math.hypot(t.x - hero.x, t.z - hero.z) < 0.6) this.pickUp(hero);
  }
}

export class Weapons {
  constructor(game) {
    this.game = game;
    this.pieces = [];
    this.items = SPAWNS.map((s) => new Weapon(game, s.type, s.x, s.z, 0.3));
  }

  update(dt) {
    const { world, scene } = this.game;
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i];
      p.t -= dt;
      const t = p.b.translation(), r = p.b.rotation();
      p.m.position.set(t.x, t.y, t.z);
      p.m.quaternion.set(r.x, r.y, r.z, r.w);
      if (p.t <= 0) { scene.remove(p.m); world.removeRigidBody(p.b); this.pieces.splice(i, 1); }
    }
    for (const w of this.items) w.update(dt);
    this.updateFlying(dt);
  }

  // ---- Poubelle à lancer ----
  // Poubelle du décor à portée de John, devant lui
  canNear(hero) {
    for (const p of this.game.level.props) {
      if (p.kind !== 'can') continue;
      const t = p.body.translation();
      if (t.y < 0.6 && Math.abs(t.z - hero.z) < 0.45 && (t.x - hero.x) * hero.facing > -0.2 && Math.abs(t.x - hero.x) < 0.85) return p;
    }
    return null;
  }

  // La poubelle quitte le décor et passe dans les mains de John (tenue devant la poitrine)
  lift(hero, p) {
    const { level, world } = this.game;
    level.props.splice(level.props.indexOf(p), 1);
    world.removeRigidBody(p.body);
    p.mesh.removeFromParent();
    hero.model.root.add(p.mesh);
    p.mesh.position.set(0, 1.12, 0.42);
    p.mesh.quaternion.identity();
    hero.carrying = p;
    sfx.clang();
  }

  // Remet la poubelle dans le monde comme corps physique (lancée ou simplement lâchée)
  release(hero, vx, vy) {
    const p = hero.carrying, { R, world, scene } = this.game;
    hero.carrying = null;
    p.mesh.getWorldPosition(_p);
    p.mesh.removeFromParent();
    scene.add(p.mesh);
    p.body = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(_p.x, _p.y, _p.z)
      .setLinvel(vx, vy, 0).setAngvel({ x: 0, y: 0, z: -Math.sign(vx || 1) * 9 }).setLinearDamping(0.1).setCcdEnabled(true));
    world.createCollider(R.ColliderDesc.cylinder(0.36, 0.25).setDensity(0.18).setFriction(0.7).setRestitution(0.3)
      .setCollisionGroups(groups(G.PROPS, 0xffff)), p.body);
    return p;
  }

  // fin de vol : la poubelle redevient un objet du décor
  land(f) {
    f.p.body.collider(0).setCollisionGroups(groups(G.PROPS, 0xffff));
    this.game.level.props.push(f.p);
    this.flying = null;
  }

  throwCan(hero, dir) {
    if (this.flying) this.land(this.flying); // une seule poubelle suivie à la fois
    const p = this.release(hero, dir * CFG.canThrowV, 2.2);
    // en vol, la poubelle traverse les capsules des persos : c'est le test ci-dessous qui gère l'impact
    p.body.collider(0).setCollisionGroups(groups(G.PROPS, 0xffff & ~G.CHAR));
    this.flying = { p, dir, t: 1.6, hit: new Set() };
    sfx.whoosh(true);
  }

  drop(hero) {
    if (hero.carrying) this.game.level.props.push(this.release(hero, hero.facing * 1.5, 1));
  }

  // Poubelle en vol : renverse les ennemis, casse caisses et vitrines, puis redevient un objet du décor
  updateFlying(dt) {
    const f = this.flying;
    if (!f) return;
    const { game } = this, t = f.p.body.translation(), v = f.p.body.linvel();
    f.t -= dt;
    const fast = Math.hypot(v.x, v.y) > 3;
    if (fast) {
      for (const e of game.enemies) {
        if (f.hit.has(e) || !(e.hittable() || e.airborne())) continue;
        if (Math.abs(e.x - t.x) < 0.6 && Math.abs(e.z - t.z) < 0.5 && t.y < 1.9 + e.y) {
          f.hit.add(e);
          e.hp -= 20 * CFG.damageMult;
          e.bowled.clear();
          e.releaseToken();
          if (!(e.T.boss && e.hp > 0)) e.knock(f.dir * CFG.knockHeavy * 1.3, CFG.knockUp); // le boss encaisse
          game.juice.flash(e.rig);
          game.juice.hit(_p.set(t.x, t.y, t.z), f.dir, 1, e.headPos(new THREE.Vector3()));
          game.time.hitstop(CFG.hitstopHeavy);
          game.juice.shake(CFG.shakeHeavy);
          game.hero.gainSpecial(CFG.specialHeavy);
          game.ui.combo();
          sfx.clang(); sfx.punch(true);
          f.p.body.setLinvel({ x: v.x * 0.4, y: Math.max(v.y, 2), z: v.z }, true);
          if (e.hp <= 0 && !e.ko) game.onKO(e);
        }
      }
      game.level.breakables.sweepPoint(t, f.dir, f.hit);
    }
    if (f.t <= 0 || (!fast && f.t < 1.2)) this.land(f);
  }

  // Panneau de debug : fait retomber une arme du type demandé près de John
  dropNear(type) {
    const w = this.items.find((i) => i.type === type);
    if (w) w.forceDrop();
  }
}
