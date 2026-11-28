import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { toonGradient } from './toon.js';

// Personnage riggé (Quaternius, squelette 65 os) : toon + contour + liseré, habillé par teinte par sommet.
// L'habit est calculé une fois au chargement selon l'os dominant de chaque sommet :
// aucune texture à repeindre, et chaque ennemi a sa palette sans dupliquer la texture.

const _m = new THREE.Matrix4();

// Régions d'habit -> couleur (rgb 0..1) + opacité du mélange (a)
function clothAttribute(geo, skeleton, look) {
  const pos = geo.attributes.position, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
  geo.computeBoundingBox();
  const bb = geo.boundingBox, H = bb.max.y - bb.min.y, cx = (bb.max.x + bb.min.x) / 2;
  const names = skeleton.bones.map((b) => b.name);
  const out = new Float32Array(pos.count * 4);
  const C = (hex) => new THREE.Color(hex);
  const pal = {
    shirt: look.shirt != null ? C(look.shirt) : null, pants: C(look.pants), boots: C(look.boots),
    belt: C(look.belt ?? 0x3a3c44), hands: look.hands != null ? C(look.hands) : null, ink: C(0x1c1416),
  };
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const t = (v.y - bb.min.y) / H; // hauteur relative 0 (pieds) .. 1 (tête)
    // os dominant et poids vers la main / le pied
    let best = 0, bw = -1, handW = 0, footW = 0;
    for (let k = 0; k < 4; k++) {
      const w = sw.getComponent(i, k), n = names[si.getComponent(i, k)] || '';
      if (w > bw) { bw = w; best = n; }
      if (/^(hand|index|middle|ring|pinky|thumb)/.test(n)) handW += w;
      if (/^(foot|ball)/.test(n)) footW += w;
    }
    let c = null;
    if (footW > 0.2 || t < 0.12) c = pal.boots;
    else if (/^(thigh|calf)/.test(best) || (best === 'pelvis' && t < 0.57)) c = pal.pants;
    else if (best === 'pelvis' || (/^spine_01/.test(best) && t < 0.585)) c = t > 0.55 ? pal.belt : pal.pants;
    else if (/^spine/.test(best) && pal.shirt) c = pal.shirt;
    else if (handW > 0.35 && pal.hands) c = pal.hands;
    else if (look.tattoo && /^(upperarm_r|clavicle_r)/.test(best) && v.x < cx) {
      // motif d'encre procédural (irezumi stylisé) sur le bras droit
      const a = Math.sin(v.y * 55 + Math.sin(v.z * 70) * 2.5) + Math.sin(v.x * 48 + v.y * 20);
      if (a > 0.35) c = pal.ink;
    } else if (look.tattoo && best === 'neck_01' && v.x < cx - 0.02 && t < 0.86) {
      if (Math.sin(v.y * 60 + v.z * 40) > 0.2) c = pal.ink;
    }
    if (c) { out[i * 4] = c.r; out[i * 4 + 1] = c.g; out[i * 4 + 2] = c.b; out[i * 4 + 3] = 1; }
  }
  geo.setAttribute('aCloth', new THREE.BufferAttribute(out, 4));
}

// Patch du shader toon : habit par sommet + liseré (rim) fresnel
function patchToon(mat, rim) {
  const rimColor = new THREE.Color(rim || 0x000000).multiplyScalar(0.55);
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uRim = { value: rimColor };
    sh.vertexShader = 'attribute vec4 aCloth;\nvarying vec4 vCloth;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvCloth = aCloth;');
    sh.fragmentShader = 'uniform vec3 uRim;\nvarying vec4 vCloth;\n' + sh.fragmentShader
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vCloth.rgb, vCloth.a);')
      .replace('#include <opaque_fragment>', 'outgoingLight += uRim * pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 4.0);\n#include <opaque_fragment>');
  };
  mat.customProgramCacheKey = () => 'cloth-rim';
}

// Contour inverted hull compatible skinning : on gonfle la position avant le skinning
const outlineMat = new THREE.MeshBasicMaterial({ color: 0x0c0810, side: THREE.BackSide });
outlineMat.onBeforeCompile = (sh) => {
  sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = position + normal * 0.012;');
};

export class Model {
  // look : { body: 'male'|'female', hair: [...], hairColor, skin, shirt, pants, boots, hands, tattoo, rim }
  constructor(lib, look) {
    this.root = cloneSkinned(lib[look.body].scene);
    this.mats = [];
    const g = toonGradient();
    let body = null;
    this.root.traverse((o) => {
      if (!o.isMesh) return;
      o.frustumCulled = false;
      const src = o.material;
      const mat = new THREE.MeshToonMaterial({ color: 0xffffff, map: src.map || null, gradientMap: g });
      if (/superhero/i.test(src.name)) {
        body = o;
        o.geometry = o.geometry.clone();
        clothAttribute(o.geometry, o.skeleton, look);
        if (look.skin) mat.color.set(look.skin);
        patchToon(mat, look.rim);
      } else if (/hair/i.test(src.name)) { // sourcils
        mat.map = null; mat.color.set(look.hairColor ?? 0x1b1512);
      }
      o.material = mat;
      this.mats.push(mat);
    });
    this.body = body;
    const outline = new THREE.SkinnedMesh(body.geometry, outlineMat);
    outline.bind(body.skeleton, body.bindMatrix);
    outline.frustumCulled = false;
    body.parent.add(outline);

    this.bones = {};
    for (const b of body.skeleton.bones) this.bones[b.name] = b;
    // pose de repos : le ragdoll déplace des os que les clips ne réécrivent pas (positions sans piste)
    this.rest = body.skeleton.bones.map((b) => [b, b.position.clone(), b.quaternion.clone(), b.scale.clone()]);

    // Coiffures : maillages statiques « origine au corps », rattachés à l'os de la tête
    this.root.updateWorldMatrix(true, true);
    const head = this.bones.Head;
    const inv = new THREE.Matrix4().copy(head.matrixWorld).invert();
    const hairMat = new THREE.MeshToonMaterial({ color: look.hairColor ?? 0x1b1512, gradientMap: g });
    this.mats.push(hairMat);
    for (const h of look.hair || []) {
      const scene = lib['hair_' + h].scene.clone();
      scene.updateWorldMatrix(true, true);
      scene.traverse((o) => {
        if (!o.isMesh) return;
        const m = new THREE.Mesh(o.geometry, hairMat);
        m.matrixAutoUpdate = false;
        m.matrix.multiplyMatrices(inv, o.matrixWorld);
        m.frustumCulled = false;
        head.add(m);
      });
    }

    // Points de contact (hitboxes) accrochés aux os
    this.tips = {};
    const tip = (name, bone, off) => { const o = new THREE.Object3D(); o.position.fromArray(off); this.bones[bone].add(o); this.tips[name] = o; };
    tip('fistL', 'hand_l', [0, 0.08, 0]);
    tip('fistR', 'hand_r', [0, 0.08, 0]);
    tip('footL', 'ball_l', [0, 0.05, 0]);
    tip('footR', 'ball_r', [0, 0.05, 0]);
    tip('head', 'Head', [0, 0.25, 0]);

    // Animation
    this.mixer = new THREE.AnimationMixer(this.root);
    this.actions = {};
    this.current = null;
    for (const [name, clip] of Object.entries(lib.clips)) this.actions[name] = this.mixer.clipAction(clip);
  }

  // Joue un clip avec fondu. opts : { fade, loop, speed, from }
  play(name, opts = {}) {
    const a = this.actions[name];
    if (!a) return null;
    const { fade = 0.12, loop = /_Loop$/.test(name), speed = 1, from = 0 } = opts;
    if (this.current === a && loop) { a.timeScale = speed; return a; }
    a.reset();
    a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    a.clampWhenFinished = !loop;
    a.timeScale = speed;
    a.time = from;
    a.enabled = true;
    a.setEffectiveWeight(1);
    if (this.current && this.current !== a) a.crossFadeFrom(this.current, fade, false);
    a.play();
    this.current = a;
    return a;
  }

  update(dt) {
    this.mixer.update(dt);
  }

  resetPose() {
    for (const [b, p, q, s] of this.rest) { b.position.copy(p); b.quaternion.copy(q); b.scale.copy(s); }
  }

  setFlash(k) {
    for (const m of this.mats) m.emissive.setRGB(k, k, k);
  }
}
