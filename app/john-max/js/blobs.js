import * as THREE from 'three';

// Ombres « blob » : un disque sombre sous chaque perso et chaque objet, en un seul InstancedMesh.
// Remplace la shadow map (pas de 2e passe de rendu, pas d'échantillonnage d'ombre dans les shaders).
const MAX = 40;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
const _p = new THREE.Vector3(), _s = new THREE.Vector3();

export class Blobs {
  constructor(scene) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(0,0,0,.75)'); r.addColorStop(0.6, 'rgba(0,0,0,.4)'); r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    const mat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, MAX);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
  }

  // h = hauteur au-dessus du sol : l'ombre rétrécit quand l'objet monte
  set(i, x, z, size, h) {
    const k = Math.max(0.35, 1 - h * 0.35);
    _s.set(size * k, size * k * 0.7, 1);
    _m.compose(_p.set(x, 0.01, z), _q, _s);
    this.mesh.setMatrixAt(i, _m);
  }

  update(game) {
    let i = 0;
    for (const ch of [game.hero, ...game.enemies]) {
      if (ch.active !== false) this.set(i++, ch.x, ch.z, 0.9 * (ch.hScale || 1), ch.y);
    }
    for (const p of game.level.props) {
      const t = p.mesh.position;
      if (Math.abs(t.x - game.camX) < 9) this.set(i++, t.x, t.z, 0.75, Math.max(0, t.y - 0.3));
    }
    for (const w of game.weapons.items) {
      if (w.state !== 'ground' || !w.body) continue;
      const t = w.body.translation();
      this.set(i++, t.x, t.z, 0.8, t.y);
    }
    const f = game.weapons.flying;
    if (f) { const t = f.p.body.translation(); this.set(i++, t.x, t.z, 0.7, t.y); }
    this.mesh.count = Math.min(i, MAX);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
