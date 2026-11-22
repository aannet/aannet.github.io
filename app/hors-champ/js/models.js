// Personnages à partir de modèles 3D animés CC0 (Quaternius : « Animated Men Characters » et « Zombie Animated »).
// Les animations capturées donnent la base réaliste ; une couche procédurale l'adapte au jeu :
//  - vitesse de lecture calée sur la vitesse réelle (mesurée sur le clip) => pieds qui ne patinent pas
//  - mélange idle / marche / course selon la vitesse, marche à reculons, buste et tête vers la visée
//  - bras qui tient la torche en IK sur les os, tremblements de stress, sac à dos et lampe sur des « sockets »
//  - bête : bras et cou allongés par échelle des os, peau blafarde, poses figées tirées des vraies animations
// Optimisation mobile : GLB quantifiés (~330 et 450 Ko), 1 matériau par partie, mixer arrêté quand la bête est invisible.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const UP = new THREE.Vector3(0, 1, 0), PI = Math.PI;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const V = () => new THREE.Vector3();

// --- utilitaires os ---------------------------------------------------------------
const _bp = V(), _cp = V(), _d1 = V(), _d2 = V(), _qd = new THREE.Quaternion(), _qw = new THREE.Quaternion(), _qp = new THREE.Quaternion();
// Tourne `bone` (en espace monde) pour que le point `childPos` aille vers `target`
function aimBone(bone, childPos, target) {
  bone.getWorldPosition(_bp);
  _d1.subVectors(childPos, _bp).normalize(); _d2.subVectors(target, _bp).normalize();
  _qd.setFromUnitVectors(_d1, _d2); bone.getWorldQuaternion(_qw); _qw.premultiply(_qd);
  bone.parent.getWorldQuaternion(_qp).invert(); bone.quaternion.copy(_qp.multiply(_qw)); bone.updateMatrixWorld(true);
}
// IK 2 os sur un squelette : upper -> lower -> end, cible + direction du coude
const _j = V(), _e = V(), _a = V(), _b = V(), _u = V(), _l = V(), _t = V();
function ik2(upper, lower, end, target, pole, l1, l2) {
  upper.getWorldPosition(_u);
  const d = _a.subVectors(target, _u); let dist = d.length(); d.divideScalar(dist || 1); dist = clamp(dist, 1e-3, l1 + l2 - 1e-3);
  const a = (l1 * l1 + dist * dist - l2 * l2) / (2 * dist), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const pd = _b.subVectors(pole, _u); pd.addScaledVector(d, -pd.dot(d)).normalize();
  _j.copy(_u).addScaledVector(d, a).addScaledVector(pd, h); _e.copy(_u).addScaledVector(d, dist);
  aimBone(upper, lower.getWorldPosition(_l), _j);
  aimBone(lower, end.getWorldPosition(_t), _e);
}
// Tourne un os autour d'un axe exprimé en monde (couche additive après l'animation)
function rotWorld(bone, axis, ang) {
  _qd.setFromAxisAngle(axis, ang); bone.getWorldQuaternion(_qw); _qw.premultiply(_qd);
  bone.parent.getWorldQuaternion(_qp).invert(); bone.quaternion.copy(_qp.multiply(_qw)); bone.updateMatrixWorld(true);
}
// Les couches procédurales modifient des os que certains clips n'animent pas : on remet ces os à leur pose
// de repos avant chaque mise à jour du mixer, sinon les rotations additives s'accumulent d'image en image.
function restPose(bones) { const saved = bones.filter(Boolean).map(b => [b, b.quaternion.clone()]); return () => saved.forEach(([b, q]) => b.quaternion.copy(q)); }
// Retire le déplacement horizontal intégré à un clip (animation « sur place »), garde le rebond vertical
function inPlace(clip, boneNames) {
  for (const tr of clip.tracks) {
    if (!tr.name.endsWith('.position') || !boneNames.some(n => tr.name.startsWith(n + '.'))) continue;
    const v = tr.values, n = v.length / 3, T = tr.times[tr.times.length - 1] || 1;
    for (let k = 0; k < 3; k++) {
      const drift = v[(n - 1) * 3 + k] - v[k]; if (Math.abs(drift) < 1e-4) continue;
      for (let i = 0; i < n; i++) v[i * 3 + k] -= drift * (tr.times[i] / T);
    }
  }
}
// Vitesse naturelle d'un clip de locomotion : amplitude avant/arrière d'un pied, deux pas par cycle
function naturalSpeed(root, mixer, clip, footName) {
  const foot = root.getObjectByName(footName), act = mixer.clipAction(clip), p = V();
  act.reset().play(); act.setEffectiveWeight(1); let mn = 1e9, mx = -1e9;
  for (let i = 0; i <= 24; i++) { act.time = clip.duration * i / 24; mixer.update(0); root.updateMatrixWorld(true); foot.getWorldPosition(p); mn = Math.min(mn, p.z); mx = Math.max(mx, p.z); }
  act.stop(); return 2 * (mx - mn) / clip.duration;
}
// « Socket » : rattache un objet à un os en gardant son placement relatif de la pose de liaison, sans hériter de l'échelle
function socket(bone, obj) {
  const bq = new THREE.Quaternion(), bpos = V(); bone.getWorldPosition(bpos); bone.getWorldQuaternion(bq);
  const inv = bq.clone().invert(), off = obj.position.clone().sub(bpos).applyQuaternion(inv), qo = inv.clone().multiply(obj.quaternion);
  return () => { bone.getWorldPosition(bpos); bone.getWorldQuaternion(bq); obj.position.copy(off).applyQuaternion(bq).add(bpos); obj.quaternion.copy(bq).multiply(qo); };
}
function blobs(scene, n) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,.7)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const m = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-PI / 2),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }), n);
  m.frustumCulled = false; scene.add(m);
  const mm = new THREE.Matrix4(), q = new THREE.Quaternion(), p = V(), s = V();
  return { set(i, x, z, sx, sz, yaw) { q.setFromAxisAngle(UP, yaw); mm.compose(p.set(x, .015, z), q, s.set(sx, 1, sz)); m.setMatrixAt(i, mm); }, commit() { m.instanceMatrix.needsUpdate = true; }, mesh: m };
}

// Le serveur de la page ne sert pas les .glb et sa politique de sécurité interdit de charger des données « data: ».
// Les modèles sont donc livrés en .json (glTF avec le binaire en base64) et réassemblés ici en GLB, en mémoire,
// puis analysés sans aucune requête supplémentaire.
async function loadPacked(L, url) {
  const json = await (await fetch(url)).json();
  const b64 = json.buffers[0].uri.split(',')[1], bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  delete json.buffers[0].uri; json.buffers[0].byteLength = bin.length;
  const enc = new TextEncoder().encode(JSON.stringify(json)), jl = (enc.length + 3) & ~3, bl = (bin.length + 3) & ~3, total = 28 + jl + bl;
  const buf = new ArrayBuffer(total), dv = new DataView(buf), u8 = new Uint8Array(buf);
  dv.setUint32(0, 0x46546C67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, jl, true); dv.setUint32(16, 0x4E4F534A, true); u8.set(enc, 20); u8.fill(0x20, 20 + enc.length, 20 + jl);
  dv.setUint32(20 + jl, bl, true); dv.setUint32(24 + jl, 0x004E4942, true); u8.set(bin, 28 + jl);
  return L.parseAsync(buf, '');
}
export async function loadCharacters(scene, base = 'assets/') {
  const L = new GLTFLoader();
  const [h, b, skin] = await Promise.all([loadPacked(L, base + 'hero.gltf.json'), loadPacked(L, base + 'beast.gltf.json'), new THREE.TextureLoader().loadAsync(base + 'beast_skin.png')]);
  return { hero: makeHero(scene, h), beast: makeBeast(scene, b, skin) };
}

// =====================================================================================
// HÉROS : enfant de 10 ans (~1,38 m) tiré d'un modèle adulte (tête agrandie, échelle globale), sac rouge, torche
// =====================================================================================
function makeHero(scene, gltf) {
  const root = new THREE.Group(), model = gltf.scene; root.add(model); scene.add(root);
  const bone = n => model.getObjectByName(n);
  bone('Head').scale.setScalar(1.3);                     // proportions d'enfant : tête plus grosse
  const shoulders = ['ShoulderL', 'ShoulderR'].map(bone); shoulders.forEach(s => s && s.scale.setScalar(.92));
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model), s0 = 1.38 / (box.max.y - box.min.y);
  model.scale.multiplyScalar(s0); model.position.y = -box.min.y * s0;
  const tint = { Shirt: 0x3a4656, Pants: 0x2b2f38, Skin: 0xc9a68a, Hair: 0x3b2a1e, Eyes: 0x111111 };
  model.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; o.receiveShadow = true; o.material = new THREE.MeshStandardMaterial({ color: tint[o.material.name] ?? 0x888888, roughness: .8 }); } });
  model.updateMatrixWorld(true);

  const B = { torso: bone('Torso'), abd: bone('Abdomen'), neck: bone('Neck'), head: bone('Head'), ua: bone('UpperArmR'), la: bone('LowerArmR'), palm: bone('PalmR'), fl: bone('FootL'), fr: bone('FootR') };
  const len = (a, c) => a.getWorldPosition(V()).distanceTo(c.getWorldPosition(V()));
  const L1 = len(B.ua, B.la), L2 = len(B.la, B.palm) * 1.05;
  const rest = restPose([B.torso, B.abd, B.neck, B.head, B.ua, B.la, B.palm]);

  // Sac à dos (rouge) et lampe, rattachés au torse / à la main
  const red = new THREE.MeshStandardMaterial({ color: 0xa3141a, roughness: .7 }), dark = new THREE.MeshStandardMaterial({ color: 0x5e0b0e, roughness: .8 });
  const tp = B.torso.getWorldPosition(V());
  const pack = new THREE.Group();
  const pb = new THREE.Mesh(new THREE.BoxGeometry(.25, .29, .13), red), pf = new THREE.Mesh(new THREE.BoxGeometry(.27, .07, .145), dark), pp = new THREE.Mesh(new THREE.BoxGeometry(.17, .13, .03), dark);
  pf.position.y = .13; pp.position.set(0, -.04, -.075); pack.add(pb, pf, pp); pack.position.set(tp.x, tp.y - .02, tp.z - .15); scene.add(pack);
  const packSock = socket(B.torso, pack);
  const torch = new THREE.Group();
  const tb = new THREE.Mesh(new THREE.CylinderGeometry(.022, .026, .16, 8).rotateX(PI / 2), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: .5, metalness: .4 }));
  const tl = new THREE.Mesh(new THREE.CircleGeometry(.021, 10), new THREE.MeshBasicMaterial({ color: 0xfff2d0 })); tl.position.z = .081;
  torch.add(tb, tl); scene.add(torch);
  const bl = blobs(scene, 3);

  const mixer = new THREE.AnimationMixer(model), clip = n => gltf.animations.find(a => a.name === n);
  ['Man_Walk', 'Man_Run', 'Man_Idle'].forEach(n => inPlace(clip(n), ['Body']));
  const vWalk = naturalSpeed(model, mixer, clip('Man_Walk'), 'FootL') || 1, vRun = naturalSpeed(model, mixer, clip('Man_Run'), 'FootL') || 3;
  const A = { idle: mixer.clipAction(clip('Man_Idle')), walk: mixer.clipAction(clip('Man_Walk')), run: mixer.clipAction(clip('Man_Run')), death: mixer.clipAction(clip('Man_Death')) };
  Object.values(A).forEach(a => { a.play(); a.setEffectiveWeight(0); });
  A.death.setLoop(THREE.LoopOnce, 1); A.death.clampWhenFinished = true; A.death.stop();

  let yaw = 0, turning = false, lean = 0, dying = false, fyL = 0, fyR = 0, downL = false, downR = false, glance = 0, glanceT = 2;
  const f = V(), r = V(), aim = V(), hand = V(), pole = V(), sh = V(), torchPos = V(), torchDir = V(), tmp = V(), fp = V();

  function update(dt, s) {
    const speed = Math.hypot(s.vx, s.vz), stress = s.stress, t = s.time, aimYaw = Math.atan2(s.fx, s.fz);
    if (s.dead && !dying) { dying = true; A.idle.setEffectiveWeight(0); A.walk.setEffectiveWeight(0); A.run.setEffectiveWeight(0); A.death.reset().play(); A.death.setEffectiveWeight(1); A.death.fadeIn(.15); }
    if (!s.dead && dying) { dying = false; A.death.stop(); }
    // orientation du corps (comme avant) : suit le déplacement, recule si on vise derrière, pivote à l'arrêt
    let target = yaw, back = false;
    if (speed > .15) {
      const mY = Math.atan2(s.vx, s.vz), diff = wrap(aimYaw - mY);
      if (Math.abs(diff) > 1.9 && speed < 3.5) { target = mY + PI; back = true; } else target = mY + clamp(diff, -.7, .7) * (speed > 3.5 ? 0 : 1);
      turning = false;
    } else { if (Math.abs(wrap(aimYaw - yaw)) > .7) turning = true; if (turning) { target = aimYaw; if (Math.abs(wrap(aimYaw - yaw)) < .08) turning = false; } }
    yaw += wrap(target - yaw) * Math.min(1, dt * (speed > .15 ? 7 : 5));
    root.position.set(s.x, 0, s.z); root.rotation.y = yaw;
    f.set(Math.sin(yaw), 0, Math.cos(yaw)); r.set(Math.cos(yaw), 0, -Math.sin(yaw));

    // mélange des clips selon la vitesse, lecture calée sur la vitesse réelle
    if (!dying) {
      const wMove = sstep(.05, .6, speed) || (turning ? .5 : 0), wRun = sstep(2.2, 3.6, speed);
      A.idle.setEffectiveWeight(1 - wMove); A.walk.setEffectiveWeight(wMove * (1 - wRun)); A.run.setEffectiveWeight(wMove * wRun);
      const dirSign = back ? -1 : 1;
      A.walk.timeScale = dirSign * Math.max(speed, turning ? .6 : 0) / vWalk; A.run.timeScale = Math.max(speed, .5) / vRun;
      A.idle.timeScale = 1 + stress * 1.5;    // respiration plus rapide sous stress
    }
    rest(); mixer.update(dt); model.updateMatrixWorld(true);

    if (!dying) {
      // couche procédurale : dos voûté par la peur, buste puis tête vers la visée, regards nerveux à l'arrêt
      const leanT = stress * .3 + sstep(2.2, 4, speed) * .12; lean += (leanT - lean) * Math.min(1, dt * 6);
      rotWorld(B.abd, r, lean * .6); rotWorld(B.torso, r, lean * .4);
      const cy = clamp(wrap(aimYaw - yaw), -1, 1) * (speed > 3.5 ? .3 : 1);
      rotWorld(B.torso, UP, cy * .8);
      if (speed < .15 && stress > .25) { glanceT -= dt; if (glanceT <= 0) { glanceT = .5 + Math.random() * 1.6; glance = (Math.random() - .5) * 1.3; } } else glance *= .9;
      rotWorld(B.neck, UP, clamp(wrap(aimYaw - yaw - cy * .8), -.7, .7) + glance * .6);
      rotWorld(B.head, r, .1 + stress * .15);
      // bras droit : tient la torche dans l'axe de visée (IK sur les os), tremblements de stress
      aim.set(s.fx, -.12, s.fz).normalize();
      B.ua.getWorldPosition(sh);
      const tr = .003 + stress * .012;
      hand.copy(sh).addScaledVector(aim, (L1 + L2) * .72).addScaledVector(UP, -.05);
      hand.x += (Math.sin(t * 23) + Math.sin(t * 37.3)) * tr; hand.y += (Math.sin(t * 29.1) + Math.sin(t * 17.7)) * tr; hand.z += (Math.sin(t * 31.7) + Math.sin(t * 19.3)) * tr;
      pole.copy(sh).addScaledVector(r, .3).addScaledVector(UP, -.4).addScaledVector(f, -.1);
      ik2(B.ua, B.la, B.palm, hand, pole, L1, L2);
    }
    B.palm.getWorldPosition(torchPos);
    torchDir.copy(aim).normalize(); torchDir.x += Math.sin(t * 27) * .004 * (1 + stress * 3); torchDir.z += Math.cos(t * 33) * .004 * (1 + stress * 3); torchDir.normalize();
    torchPos.addScaledVector(torchDir, .07);
    torch.position.copy(torchPos); torch.lookAt(tmp.copy(torchPos).add(torchDir));
    packSock();

    // pas : quand un pied redescend au sol (bruit synchronisé), ombres de contact sous les pieds
    B.fl.getWorldPosition(fp); const yl = fp.y; bl.set(1, fp.x, fp.z, .17, .25, yaw);
    B.fr.getWorldPosition(fp); const yr = fp.y; bl.set(2, fp.x, fp.z, .17, .25, yaw);
    const floor = .06;
    if (yl < floor && !downL && speed > .3) { downL = true; s.onStep && s.onStep(-1, sstep(2.2, 3.6, speed)); } else if (yl > floor + .03) downL = false;
    if (yr < floor && !downR && speed > .3) { downR = true; s.onStep && s.onStep(1, sstep(2.2, 3.6, speed)); } else if (yr > floor + .03) downR = false;
    bl.set(0, s.x, s.z, .5, .45, yaw); bl.commit();
    return { torchPos, torchDir };
  }
  return { update };
}

// =====================================================================================
// BÊTE : silhouette décharnée et blafarde, bras et cou démesurés (échelle des os), démarche capturée
// marche lente, rampe à quatre pattes quand elle accélère, pose figée tirée au hasard dans les vraies animations
// =====================================================================================
function makeBeast(scene, gltf, skinTex) {
  const root = new THREE.Group(), model = gltf.scene; root.add(model); scene.add(root);
  const bone = n => model.getObjectByName(n);
  // allongement le long de l'axe de l'os (+Y), amincissement transversal
  const stretch = (n, ly, lt = .85) => { const b = bone(n); if (b) b.scale.set(lt, ly, lt); };
  ['LeftArm', 'RightArm'].forEach(n => stretch(n, 1.45, .8)); ['LeftForeArm', 'RightForeArm'].forEach(n => stretch(n, 1.5, .85));
  ['LeftHand', 'RightHand'].forEach(n => stretch(n, 1.35, .9)); stretch('Neck', 1.7, .8); stretch('Spine1', 1.12, .85); stretch('Spine2', 1.08, .9);
  ['LeftUpLeg', 'RightUpLeg'].forEach(n => stretch(n, 1.1, .8));
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model), s0 = 2.3 / (box.max.y - box.min.y);
  model.scale.multiplyScalar(s0); model.position.y = -box.min.y * s0;
  skinTex.colorSpace = THREE.SRGBColorSpace; skinTex.magFilter = THREE.NearestFilter; skinTex.flipY = false;
  model.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = true; o.receiveShadow = true; o.material = new THREE.MeshStandardMaterial({ map: skinTex, roughness: .55 }); } });

  const mixer = new THREE.AnimationMixer(model), clip = n => gltf.animations.find(a => a.name === n);
  ['ZombieWalk', 'ZombieRun', 'ZombieCrawl', 'ZombieIdle', 'ZombieBite'].forEach(n => inPlace(clip(n), ['Hips']));
  const vWalk = naturalSpeed(model, mixer, clip('ZombieWalk'), 'LeftFoot') || 1, vCrawl = naturalSpeed(model, mixer, clip('ZombieCrawl'), 'LeftHand') || 1;
  const A = { idle: mixer.clipAction(clip('ZombieIdle')), walk: mixer.clipAction(clip('ZombieWalk')), crawl: mixer.clipAction(clip('ZombieCrawl')), run: mixer.clipAction(clip('ZombieRun')), bite: mixer.clipAction(clip('ZombieBite')) };
  Object.values(A).forEach(a => { a.play(); a.setEffectiveWeight(0); });
  const B = { head: bone('Head'), neck: bone('Neck'), sp1: bone('Spine1'), sp2: bone('Spine2'), la: bone('LeftArm'), lf: bone('LeftForeArm'), lh: bone('LeftHand'), ra: bone('RightArm'), rf: bone('RightForeArm'), rh: bone('RightHand'), lFoot: bone('LeftFoot'), rFoot: bone('RightFoot') };
  model.updateMatrixWorld(true);
  const len = (a, c) => a.getWorldPosition(V()).distanceTo(c.getWorldPosition(V()));
  const AL1 = len(B.la, B.lf), AL2 = len(B.lf, B.lh);
  const rest = restPose([B.head, B.neck, B.sp1, B.sp2, B.la, B.lf, B.lh, B.ra, B.rf, B.rh]);

  let yaw = 0, cf = 0, wasVisible = false, frozen = false, twitchT = 0, roll = 0, arch = 0, twist = 0, reachArm = -1, reachH = 1.4;
  let fl = false, fr = false;
  const f = V(), r = V(), sh = V(), tgt = V(), pole = V(), fp = V(), ax = V();

  function newPose() {
    // feinte : une image tirée au hasard dans une vraie animation (rampe, morsure, marche...), puis torsions par-dessus
    const pool = [A.crawl, A.bite, A.walk, A.run, A.idle], pick = pool[Math.random() * pool.length | 0];
    Object.values(A).forEach(a => a.setEffectiveWeight(0)); pick.setEffectiveWeight(1); pick.time = Math.random() * pick.getClip().duration;
    roll = (Math.random() - .5) * 2.6; arch = (Math.random() - .3) * .7; twist = (Math.random() - .5) * 1.1;
    reachArm = Math.random() < .6 ? (Math.random() < .5 ? 0 : 1) : -1; reachH = .6 + Math.random() * 1.3;
  }

  function update(dt, s) {
    const speed = Math.hypot(s.vx, s.vz), toP = Math.atan2(s.px - s.x, s.pz - s.z), dP = Math.hypot(s.px - s.x, s.pz - s.z);
    yaw += wrap((speed > .1 && !s.seen ? Math.atan2(s.vx, s.vz) : toP) - yaw) * Math.min(1, dt * 6);
    root.position.set(s.x, 0, s.z); root.rotation.y = yaw; root.visible = s.visible;
    if (s.feint) newPose();
    if (!s.visible) { wasVisible = false; return; }        // invisible : ni mixer, ni squelette
    f.set(Math.sin(yaw), 0, Math.cos(yaw)); r.set(Math.cos(yaw), 0, -Math.sin(yaw));

    frozen = s.seen && !s.lunge;
    rest();
    if (s.lunge) {
      Object.values(A).forEach(a => a.setEffectiveWeight(0)); A.bite.setEffectiveWeight(1); A.bite.timeScale = 1.6; mixer.update(dt);
    } else if (frozen) {
      // figée : pas de lecture... sauf de brusques sauts d'image (stop-motion) et la tête qui roule
      twitchT -= dt;
      if (twitchT <= 0) { twitchT = .8 + Math.random() * 2.5; roll += (Math.random() - .5) * 1.2; mixer.update(.04 + Math.random() * .08); }
      else mixer.update(0);
    } else {
      // en mouvement : marche voûtée, ou rampe quand elle accélère (torche éteinte)
      cf += ((speed > 3.4 ? 1 : 0) - cf) * Math.min(1, dt * 4);
      A.idle.setEffectiveWeight(speed < .1 ? 1 : 0); A.run.setEffectiveWeight(0); A.bite.setEffectiveWeight(0);
      A.walk.setEffectiveWeight(speed >= .1 ? 1 - cf : 0); A.crawl.setEffectiveWeight(speed >= .1 ? cf : 0);
      A.walk.timeScale = Math.max(speed, .3) / vWalk * .9; A.crawl.timeScale = Math.max(speed, .3) / vCrawl;
      roll *= 1 - Math.min(1, dt * 2); arch *= 1 - Math.min(1, dt * 2); twist *= 1 - Math.min(1, dt * 2);
      mixer.update(dt);
    }
    model.updateMatrixWorld(true);

    // couche procédurale : cambrure, torsion vers le joueur, tête qui roule à des angles impossibles
    rotWorld(B.sp1, r, arch * .6); rotWorld(B.sp2, UP, twist + (frozen ? wrap(toP - yaw) * .5 : 0));
    B.neck.getWorldPosition(sh); B.head.getWorldPosition(ax); ax.sub(sh).normalize();
    rotWorld(B.head, f.clone().applyAxisAngle(UP, twist), roll);

    // bras qui se tend vers le joueur : pendant l'approche (< 3,2 m) ou figé dans la pose
    const reaching = s.lunge ? 2 : frozen ? reachArm : (dP < 3.2 ? 1 : -1);
    for (const [i, ua, la, hd, side] of [[0, B.la, B.lf, B.lh, 1], [1, B.ra, B.rf, B.rh, -1]]) {
      if (!(reaching === 2 || reaching === i)) continue;
      ua.getWorldPosition(sh);
      tgt.set(s.px, frozen ? reachH : 1.0, s.pz).sub(sh); const dd = tgt.length();
      tgt.multiplyScalar(Math.min(AL1 + AL2 - .02, Math.max(.3, dd - .2)) / (dd || 1)).add(sh);
      pole.copy(sh).addScaledVector(r, side * .6).addScaledVector(UP, .5);
      ik2(ua, la, hd, tgt, pole, AL1, AL2);
    }

    // appuis : bruits quand un pied touche le sol
    B.lFoot.getWorldPosition(fp); if (fp.y < .1 && !fl && !frozen && speed > .2) { fl = true; s.onPlant && s.onPlant(false, fp); } else if (fp.y > .16) fl = false;
    B.rFoot.getWorldPosition(fp); if (fp.y < .1 && !fr && !frozen && speed > .2) { fr = true; s.onPlant && s.onPlant(false, fp); } else if (fp.y > .16) fr = false;
    wasVisible = true;
  }
  return { update };
}
