import * as THREE from 'three';
import { CFG, G, groups } from './config.js';

// Bascule animation → ragdoll sur le squelette Quaternius (nommage Unreal).
// Chaque corps Rapier a pour origine l'os qu'il pilote. Les os intermédiaires (spine_02/03, cou,
// clavicules) gardent la pose locale du moment de la bascule et suivent leur parent.
// Mode 7 corps : avant-bras et tibias figés, rattachés au bras / à la cuisse comme 2e collider.
// Mode 11 corps : avant-bras et tibias libres (rotule freinée).
// `to` : os (ou décalage) qui donne l'axe et la longueur de la capsule.
export const PARTS = [
  { name: 'pelvis', bone: 'pelvis', parent: null, to: 'spine_01', r: 0.14, min: 0.16, density: 1.4 },
  { name: 'torso', bone: 'spine_01', parent: 'pelvis', to: 'neck_01', r: 0.16, density: 1.1 },
  { name: 'head', bone: 'Head', parent: 'torso', to: [0, 0.2, 0], r: 0.11, density: 1 },
  { name: 'armL', bone: 'upperarm_l', parent: 'torso', to: 'lowerarm_l', r: 0.065 },
  { name: 'foreL', bone: 'lowerarm_l', parent: 'armL', to: 'hand_l', ext: 1.35, r: 0.055 },
  { name: 'armR', bone: 'upperarm_r', parent: 'torso', to: 'lowerarm_r', r: 0.065 },
  { name: 'foreR', bone: 'lowerarm_r', parent: 'armR', to: 'hand_r', ext: 1.35, r: 0.055 },
  { name: 'legL', bone: 'thigh_l', parent: 'pelvis', to: 'calf_l', r: 0.085 },
  { name: 'shinL', bone: 'calf_l', parent: 'legL', to: 'foot_l', ext: 1.15, r: 0.065 },
  { name: 'legR', bone: 'thigh_r', parent: 'pelvis', to: 'calf_r', r: 0.085 },
  { name: 'shinR', bone: 'calf_r', parent: 'legR', to: 'foot_r', ext: 1.15, r: 0.065 },
];
const BY = Object.fromEntries(PARTS.map((p) => [p.name, p]));
const MERGED = { armL: 'foreL', armR: 'foreR', legL: 'shinL', legR: 'shinR' };
const SEVEN = new Set(['pelvis', 'torso', 'head', 'armL', 'armR', 'legL', 'legR']);

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _v = new THREE.Vector3(), _d = new THREE.Vector3();
const _q = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _m = new THREE.Matrix4(), _pm = new THREE.Matrix4();
const _s = new THREE.Vector3(1, 1, 1), UP = new THREE.Vector3(0, 1, 0);

// Extrémités monde d'une capsule de partie
function ends(bones, p, outA, outB) {
  bones[p.bone].getWorldPosition(outA);
  if (Array.isArray(p.to)) {
    bones[p.bone].getWorldQuaternion(_q);
    outB.fromArray(p.to).applyQuaternion(_q).add(outA);
  } else {
    bones[p.to].getWorldPosition(outB);
  }
  if (p.ext) outB.sub(outA).multiplyScalar(p.ext).add(outA);
  if (p.min && outB.distanceTo(outA) < p.min) outB.sub(outA).setLength(p.min).add(outA);
}

export class Ragdoll {
  constructor(game, ch, launch, ragIndex) {
    const R = game.R, world = game.world;
    this.game = game;
    this.ch = ch;
    const bones = ch.model.bones;
    this.parts = PARTS.filter((p) => CFG.ragdollParts === 11 || SEVEN.has(p.name)).map((p) => p.name);
    this.bodies = {};
    ch.model.root.updateMatrixWorld(true);

    const mine = G.RAG0 << ragIndex;
    // pas de collision avec les capsules des persos debout : une capsule cinématique éjecte le ragdoll
    const cg = groups(mine, G.STATIC | G.PROPS | (G.ALLRAG & ~mine));
    const dt = Math.max(ch.lastDt || 1 / 60, 1 / 240);
    const inherit = launch.inherit ?? 0.25;

    for (const name of this.parts) {
      const p = BY[name], bone = bones[p.bone];
      bone.getWorldPosition(_a);
      bone.getWorldQuaternion(_q);
      const b = world.createRigidBody(R.RigidBodyDesc.dynamic()
        .setTranslation(_a.x, _a.y, _a.z).setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w })
        .setLinearDamping(CFG.linDamp).setAngularDamping(CFG.angDamp).setCcdEnabled(true));
      _qi.copy(_q).invert();
      const origin = _a.clone();
      const addCapsule = (part) => {
        ends(bones, part, _a, _b);
        // repère local du corps : centre et orientation (axe Y de la capsule le long du segment)
        _d.subVectors(_b, _a);
        const len = _d.length();
        _v.addVectors(_a, _b).multiplyScalar(0.5).sub(origin).applyQuaternion(_qi);
        _d.applyQuaternion(_qi).normalize();
        const rq = new THREE.Quaternion().setFromUnitVectors(UP, _d);
        world.createCollider(R.ColliderDesc.capsule(Math.max(0.01, len / 2 - part.r * 0.5), part.r)
          .setTranslation(_v.x, _v.y, _v.z).setRotation({ x: rq.x, y: rq.y, z: rq.z, w: rq.w })
          .setDensity(part.density || 0.9).setFriction(0.8).setRestitution(0.15).setCollisionGroups(cg), b);
      };
      addCapsule(p);
      if (CFG.ragdollParts !== 11 && MERGED[name]) addCapsule(BY[MERGED[name]]);

      // vitesse de l'anim (évite le « pop ») + impulsion du coup, qui décide de la trajectoire
      const prev = ch.jointHist[name];
      if (prev) _v.copy(origin).sub(prev).divideScalar(dt).multiplyScalar(inherit); else _v.set(0, 0, 0);
      if (_v.length() > 2.5) _v.setLength(2.5);
      const w = name === 'torso' || name === 'pelvis' ? 1.1 : name === 'head' ? 1.25 : 0.9;
      b.setLinvel({ x: _v.x + launch.x * w, y: _v.y + launch.y * w, z: _v.z + launch.z * w }, true);
      b.setAngvel({ x: (Math.random() - 0.5) * 3, y: (Math.random() - 0.5) * 3, z: launch.spin || 0 }, true);
      this.bodies[name] = b;
    }

    // Articulations : rotules freinées par moteurs à vitesse nulle (la « raideur » du panneau)
    for (const name of this.parts) {
      const p = BY[name];
      if (!p.parent) continue;
      const pb = this.bodies[p.parent], cb = this.bodies[name];
      const t = pb.translation(), r = pb.rotation();
      _q.set(r.x, r.y, r.z, r.w).invert();
      bones[p.bone].getWorldPosition(_a);
      _a.sub(_v.set(t.x, t.y, t.z)).applyQuaternion(_q);
      const joint = world.createImpulseJoint(R.JointData.spherical({ x: _a.x, y: _a.y, z: _a.z }, { x: 0, y: 0, z: 0 }), pb, cb, true);
      const f = CFG.jointFriction * (name === 'torso' ? 3 : name === 'head' ? 1.5 : /fore|shin/.test(name) ? 2 : 1);
      // selon la version de Rapier, la rotule n'expose pas ses moteurs : l'amortissement angulaire prend le relais
      if (joint.configureMotorVelocity) for (const ax of [R.JointAxis.AngX, R.JointAxis.AngY, R.JointAxis.AngZ]) joint.configureMotorVelocity(ax, 0, f);
      joint.setContactsEnabled(false);
    }
    this.thudT = 0;
    this.prevVy = 0;
    this.sync();
  }

  // Les corps pilotent les os : position/rotation monde → locales (parents d'abord, dans l'ordre de PARTS)
  sync() {
    const bones = this.ch.model.bones;
    for (const name of this.parts) {
      const bone = bones[BY[name].bone], b = this.bodies[name];
      const t = b.translation(), r = b.rotation();
      bone.parent.updateWorldMatrix(true, false);
      _m.compose(_v.set(t.x, t.y, t.z), _q.set(r.x, r.y, r.z, r.w), _s);
      _pm.copy(bone.parent.matrixWorld).invert().multiply(_m);
      _pm.decompose(bone.position, bone.quaternion, _d);
    }
  }

  center(out) {
    const t = this.bodies.pelvis.translation();
    return out.set(t.x, t.y, t.z);
  }

  speed() {
    const v = this.bodies.pelvis.linvel();
    return Math.hypot(v.x, v.y, v.z);
  }

  // Frappe un ragdoll : impulsion plus forte sur le corps le plus proche du point d'impact.
  hit(point, vel) {
    let best = null, bd = 1e9;
    for (const name of this.parts) {
      const t = this.bodies[name].translation();
      const d = Math.hypot(t.x - point.x, t.y - point.y, t.z - point.z);
      if (d < bd) { bd = d; best = name; }
    }
    for (const name of this.parts) {
      const b = this.bodies[name];
      const k = name === best ? 1.3 : 0.75;
      const v = b.linvel();
      b.setLinvel({ x: v.x * 0.3 + vel.x * k, y: Math.max(v.y, 0) + vel.y * k, z: v.z * 0.3 + vel.z * k }, true);
    }
  }

  // Frottement au sol : sans lui, les capsules roulent et glissent jusqu'au bord de l'écran.
  groundDrag(dt) {
    const k = Math.exp(-CFG.groundDrag * dt), ka = Math.exp(-CFG.groundDrag * 0.8 * dt);
    for (const name of this.parts) {
      const b = this.bodies[name];
      if (b.translation().y > 0.45) continue;
      const v = b.linvel(), w = b.angvel();
      b.setLinvel({ x: v.x * k, y: v.y, z: v.z * k }, true);
      b.setAngvel({ x: w.x * ka, y: w.y * ka, z: w.z * ka }, true);
    }
  }

  forEachFast(minSpeed, fn) {
    for (const name of this.parts) {
      const b = this.bodies[name];
      const v = b.linvel();
      const s = Math.hypot(v.x, v.y, v.z);
      if (s > minSpeed) fn(b.translation(), v, s);
    }
  }

  dispose() {
    for (const name of this.parts) this.game.world.removeRigidBody(this.bodies[name]);
    this.bodies = {};
  }
}
