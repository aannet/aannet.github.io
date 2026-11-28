import * as THREE from 'three';
import { CFG, G, groups } from './config.js';
import { Model } from './model.js';
import { ARENA } from './level.js';

const _v = new THREE.Vector3();

// Base commune héros / ennemis : modèle riggé + AnimationMixer, capsule cinématique (pousse le décor).
// La logique de chaque perso choisit les clips ; la base gère la lecture et le placement.
export class Character {
  constructor(game, look, opts = {}) {
    this.game = game;
    this.model = new Model(game.lib, look);
    game.scene.add(this.model.root);
    this.x = opts.x || 0;
    this.z = opts.z || 0;
    this.facing = opts.facing || 1;
    this.yaw = this.facing > 0 ? Math.PI / 2 : -Math.PI / 2;
    this.lean = 0; // léger pivot vers la profondeur quand il se déplace en Z
    this.kx = 0;
    this.y = 0; // hauteur en l'air (chutes animées)
    this.vx = 0;
    this.vy = 0;
    this.maxHp = opts.hp || 100;
    this.hp = this.maxHp;
    this.state = 'free';
    this.t = 0;
    this.clip = null;

    const { R, world } = game;
    this.body = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(this.x, 0.9, this.z));
    this.collider = world.createCollider(
      R.ColliderDesc.capsule(0.5, 0.28).setCollisionGroups(groups(G.CHAR, G.PROPS)),
      this.body
    );
  }

  get rig() { return this.model; } // flash du juice

  setState(s) {
    this.state = s;
    this.t = 0;
  }

  // Lance un clip s'il n'est pas déjà en cours. Retourne l'action.
  anim(name, opts) {
    if (this.clip === name && !opts?.restart) {
      const a = this.model.actions[name];
      if (opts?.speed != null) a.timeScale = opts.speed;
      return a;
    }
    this.clip = name;
    return this.model.play(name, opts);
  }

  clampArena() {
    this.x = Math.max(ARENA.minX, Math.min(ARENA.maxX, this.x));
    this.z = Math.max(ARENA.minZ, Math.min(ARENA.maxZ, this.z));
  }

  // Avance l'animation et place le modèle
  step(dt, leanTarget = 0) {
    if (dt <= 0) return;
    this.model.mixer.timeScale = CFG.animSpeed;
    this.model.update(dt);
    const goal = this.facing > 0 ? Math.PI / 2 : -Math.PI / 2;
    this.yaw += (goal - this.yaw) * (1 - Math.exp(-20 * dt));
    this.lean += (leanTarget - this.lean) * (1 - Math.exp(-10 * dt));
    const root = this.model.root;
    root.position.set(this.x, this.y, this.z);
    root.rotation.set(0, this.yaw + this.lean * this.facing, 0);
    root.updateMatrixWorld(true);
    this.body.setNextKinematicTranslation({ x: this.x, y: 0.9, z: this.z });
  }

  tip(name, out) {
    return this.model.tips[name].getWorldPosition(out);
  }

  // Distance d'un point à la capsule « hurtbox » du perso debout
  hurtDist(p) {
    const y = Math.max(0.25 + this.y, Math.min(1.65 + this.y, p.y));
    return Math.hypot(p.x - this.x, p.y - y, p.z - this.z);
  }

  headPos(out) {
    return this.tip('head', out).add(_v.set(0, 0.2, 0));
  }
}
