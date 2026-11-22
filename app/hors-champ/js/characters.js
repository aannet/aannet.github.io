// Personnages : animation procédurale sur un rig de segments instanciés.
// Optimisation mobile : chaque personnage = 3 InstancedMesh (cylindres, ellipsoïdes, boîtes) avec couleur
// par instance, soit 3 appels de dessin quel que soit le nombre d'os. Pas de skinning, pas de clips à charger.
// Réalisme : cinématique inverse à 2 os, appuis plantés (pas de glissement), phase de marche pilotée par la
// distance parcourue, contre-rotations, inertie secondaire (sac à dos), tremblements liés au stress.
import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0), PI = Math.PI;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sstep = u => u * u * (3 - 2 * u);
const fract = x => x - Math.floor(x);
// Ressort amorti intégré par sous-pas (stable même si l'image met 50 ms) : renvoie [x, v]
function spring(x, v, tgt, k, c, dt) { const n = Math.ceil(dt / .008), h = dt / n; for (let i = 0; i < n; i++) { v += ((tgt - x) * k - v * c) * h; x += v * h; } return [x, v]; }
const V = () => new THREE.Vector3();

class Rig {
  constructor(scene, { shadow = true, max = 48 } = {}) {
    const mat = new THREE.MeshStandardMaterial({ roughness: .78 });
    this.m = [
      new THREE.InstancedMesh(new THREE.CylinderGeometry(.85, 1, 1, 8, 1), mat, max),
      new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 9), mat, max),
      new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, 12)
    ];
    for (const im of this.m) {
      im.castShadow = shadow; im.receiveShadow = true; im.frustumCulled = false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.setColorAt(0, new THREE.Color()); im.count = 0; scene.add(im);
    }
    this.n = [0, 0, 0]; this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._p = V(); this._s = V(); this._d = V();
  }
  begin() { this.n[0] = this.n[1] = this.n[2] = 0; }
  put(k, col) { const im = this.m[k]; if (this.n[k] >= im.instanceMatrix.count) return; const i = this.n[k]++; im.setMatrixAt(i, this._m); im.setColorAt(i, col); }
  seg(a, b, r, col) {   // cylindre de a à b
    const d = this._d.subVectors(b, a), len = d.length(); if (len < 1e-4) return;
    this._q.setFromUnitVectors(UP, d.divideScalar(len)); this._p.addVectors(a, b).multiplyScalar(.5);
    this._m.compose(this._p, this._q, this._s.set(r, len, r)); this.put(0, col);
  }
  ell(p, q, sx, sy, sz, col) { this._m.compose(p, q, this._s.set(sx, sy, sz)); this.put(1, col); }
  box(p, q, sx, sy, sz, col) { this._m.compose(p, q, this._s.set(sx, sy, sz)); this.put(2, col); }
  end() { this.m.forEach((im, k) => { im.count = this.n[k]; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }); }
}

// IK à 2 os : renvoie l'articulation (coude/genou) dans `joint` et l'extrémité atteignable dans `end`
const _a = V(), _b = V();
function ik(root, target, l1, l2, pole, joint, end) {
  const d = _a.subVectors(target, root); let dist = d.length(); d.divideScalar(dist || 1);
  dist = clamp(dist, 1e-3, l1 + l2 - 1e-3);
  const a = (l1 * l1 + dist * dist - l2 * l2) / (2 * dist), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const pd = _b.subVectors(pole, root); pd.addScaledVector(d, -pd.dot(d)).normalize();
  joint.copy(root).addScaledVector(d, a).addScaledVector(pd, h);
  end.copy(root).addScaledVector(d, dist);
}
const _bm = new THREE.Matrix4(), _bz = V();
const basisQ = (q, x, y) => { _bz.crossVectors(x, y).normalize(); return q.setFromRotationMatrix(_bm.makeBasis(x, y, _bz)); };

// =====================================================================================
// LE HÉROS : enfant de 10 ans (~1,38 m), sac à dos rouge, lampe torche
// Techniques : appuis verrouillés dans le monde + prédiction du point de pose (zéro glissement, virages et arrêts
// naturels), bassin en pendule inversé calculé depuis les pieds au sol, transfert du poids sur la jambe d'appui,
// bassin et épaules en rotation opposée, bras pilotés par la jambe opposée, inclinaison sur l'accélération
// (ressort amorti => anticipation et dépassement), déroulé talon-pointe, marche -> course (phase de vol),
// appui alterné à l'arrêt, regards nerveux, ombres de contact sous les pieds.
// =====================================================================================
function makeBlobs(scene, n) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,.7)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const m = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-PI / 2),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }), n);
  m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m);
  const mm = new THREE.Matrix4(), q = new THREE.Quaternion(), p = V(), s = V();
  return { set(i, x, z, sx, sz, yaw) { q.setFromAxisAngle(UP, yaw); mm.compose(p.set(x, .015, z), q, s.set(sx, 1, sz)); m.setMatrixAt(i, mm); }, commit() { m.instanceMatrix.needsUpdate = true; } };
}

export function makeHero(scene) {
  const rig = new Rig(scene, { shadow: false, max: 48 });
  const blob = makeBlobs(scene, 3);
  const C = {
    skin: new THREE.Color(0xc9a68a), hair: new THREE.Color(0x3b2a1e), jacket: new THREE.Color(0x3a4656), hood: new THREE.Color(0x323d4b),
    pants: new THREE.Color(0x2b2d33), shoe: new THREE.Color(0x1d1d1f), sole: new THREE.Color(0xbdb6a8), pack: new THREE.Color(0xa3141a),
    strap: new THREE.Color(0x5e0b0e), torch: new THREE.Color(0x222222), lens: new THREE.Color(0xfff2d0)
  };
  const L1 = .345, L2 = .335, LEG = L1 + L2, STAND = .70, HW = .085, ANK = .045;
  const feet = [-1, 1].map(side => ({ side, pos: V(), from: V(), to: V(), planted: true, pitch: 0, fwd: 0 }));
  let yaw = 0, phase = 0, turning = false, init = false;
  let pelY = STAND, pelV = 0, lean = 0, leanV = 0, lat = 0, runF = 0, vxp = 0, vzp = 0;
  let bpY = .72, bpV = 0, idleT = 3, idleSide = 0, glanceT = 2, glance = 0, glanceS = 0;
  const base = V(), f = V(), r = V(), f2 = V(), r2 = V(), rp = V(), sp = V(), zP = V(), pel = V(), hip = V(), knee = V(), ank = V(), toe = V(), home = V(), tgt = V();
  const sR = V(), sL = V(), swing = V(), clutch = V(), neck = V(), tc = V(), sh = V(), hand = V(), elbow = V(), head = V(), tmp = V(), aim = V(), torchPos = V(), torchDir = V(), pack = V();
  const qBody = new THREE.Quaternion(), qPel = new THREE.Quaternion(), qChest = new THREE.Quaternion(), qHead = new THREE.Quaternion(), qShoe = new THREE.Quaternion(), e = new THREE.Euler();
  const lerp = (a, b, k) => a + (b - a) * k;

  function update(dt, s) {
    dt = Math.max(dt, 1e-3);
    const speed = Math.hypot(s.vx, s.vz), stress = s.stress, t = s.time;
    base.set(s.x, 0, s.z);
    runF += (clamp((speed - 2.2) / 1.6, 0, 1) - runF) * Math.min(1, dt * 5);
    const aimYaw = Math.atan2(s.fx, s.fz);

    // --- Orientation : suit le déplacement ; à reculons si on vise derrière ; à l'arrêt, pivote (les pieds suivront)
    let target = yaw, back = false;
    if (speed > .15) {
      const mY = Math.atan2(s.vx, s.vz), diff = wrap(aimYaw - mY);
      if (Math.abs(diff) > 1.9 && runF < .5) { target = mY + PI; back = true; } else target = mY + clamp(diff, -.8, .8) * (1 - runF);
      turning = false;
    } else {
      if (Math.abs(wrap(aimYaw - yaw)) > .7) turning = true;
      if (turning) { target = aimYaw; if (Math.abs(wrap(aimYaw - yaw)) < .08) turning = false; }
    }
    yaw += wrap(target - yaw) * Math.min(1, dt * (speed > .15 ? 7 : 5));
    f.set(Math.sin(yaw), 0, Math.cos(yaw)); r.set(Math.cos(yaw), 0, -Math.sin(yaw)); qBody.setFromAxisAngle(UP, yaw);
    const homeOf = ft => home.copy(base).addScaledVector(r, ft.side * HW * (1 - runF * .5));
    if (!init) { feet.forEach(ft => ft.pos.copy(homeOf(ft))); init = true; }

    // --- Rythme : cadence et facteur d'appui dépendent de la vitesse (marche 62 % -> course 36 %)
    const stepRate = clamp(1.7 + .5 * speed, 1.7, 4.3), duty = lerp(.62, .36, runF);
    const need = feet.some(ft => !ft.planted || Math.hypot(ft.pos.x - homeOf(ft).x, ft.pos.z - home.z) > .13);
    const rate = speed > .15 ? stepRate / 2 : (need ? 1.7 : 0);
    phase += rate * dt;

    // --- Pieds : verrouillés au sol pendant l'appui ; en vol, visent le point où le corps sera à la pose
    for (const ft of feet) {
      const p = fract(phase + (ft.side > 0 ? .5 : 0)), swingNow = rate > 0 && p >= duty;
      if (swingNow && ft.planted) { ft.planted = false; ft.from.copy(ft.pos); ft.to.copy(ft.pos); }
      if (!ft.planted) {
        const u = clamp((p - duty) / (1 - duty), 0, 1), left = (1 - u) * (1 - duty) / Math.max(rate, .01), stance = duty / Math.max(rate, .01);
        tgt.copy(homeOf(ft)); tgt.x += s.vx * (left + stance * .5); tgt.z += s.vz * (left + stance * .5);
        ft.to.lerp(tgt, Math.min(1, dt * 18));
        ft.pos.lerpVectors(ft.from, ft.to, sstep(u)); ft.pos.y = Math.sin(PI * u) * lerp(.075, .17, runF) * clamp(speed / 1.2 + .4, 0, 1);
        ft.pitch = u < .3 ? .6 * (1 - u / .3) : -.35 * sstep(clamp((u - .6) / .4, 0, 1));   // décollage pointe -> attaque talon
        if (!swingNow || u >= 1) { ft.planted = true; ft.pos.copy(ft.to); ft.pos.y = 0; s.onStep && s.onStep(ft.side, runF); }
      } else {
        const q = p / duty;
        ft.pitch = rate > 0 && speed > .15 && q > .7 ? (q - .7) / .3 * .45 : ft.pitch * (1 - Math.min(1, dt * 10));   // talon qui se lève
        ft.pos.y = 0;
      }
      ft.fwd = (ft.pos.x - base.x) * f.x + (ft.pos.z - base.z) * f.z;
    }

    // --- Bassin : hauteur imposée par les jambes d'appui (pendule inversé), phase de vol en course
    let yT = STAND - runF * .06 - stress * .05 - (speed < .15 ? .01 : 0), any = false;
    for (const ft of feet) if (ft.planted) {
      any = true; const hx = base.x + r.x * ft.side * HW, hz = base.z + r.z * ft.side * HW;
      const d = Math.hypot(ft.pos.x - hx, ft.pos.z - hz);
      yT = Math.min(yT, Math.sqrt(Math.max(0, (LEG * .975) ** 2 - d * d)) + ANK);
    }
    if (!any) yT = STAND - .02 + runF * .05;
    [pelY, pelV] = spring(pelY, pelV, yT, 420, 36, dt);
    // transfert du poids sur la jambe d'appui ; à l'arrêt, appui alterné (déhanché) de temps en temps
    if (speed < .15 && !need) { idleT -= dt; if (idleT <= 0) { idleT = 3 + Math.random() * 4; idleSide = idleSide ? 0 : (Math.random() < .5 ? -1 : 1); } } else idleSide = 0;
    let latT = idleSide * .028;
    const pl = feet.filter(ft => ft.planted); if (speed > .15 && pl.length === 1) latT = pl[0].side * .028 * (1 - runF);
    lat += (latT - lat) * Math.min(1, dt * 7);
    pel.copy(base).addScaledVector(UP, pelY).addScaledVector(r, lat);
    // rotation du bassin avec la jambe qui avance ; les épaules tournent à l'opposé
    const pelYaw = clamp(-(feet[1].fwd - feet[0].fwd) * .4, -.28, .28);
    qPel.setFromAxisAngle(UP, yaw + pelYaw); rp.set(Math.cos(yaw + pelYaw), 0, -Math.sin(yaw + pelYaw));
    const pelRoll = -lat * 2.2;   // la hanche libre descend légèrement

    rig.begin();
    // --- Jambes (IK, genou vers l'avant), chaussures qui se déroulent
    for (const ft of feet) {
      hip.copy(pel).addScaledVector(rp, ft.side * HW).addScaledVector(UP, -.03 + ft.side * pelRoll * HW);
      ank.copy(ft.pos).addScaledVector(UP, ANK + Math.max(0, ft.pitch) * .05);
      tmp.copy(hip).addScaledVector(f, 1).addScaledVector(UP, -.15);
      ik(hip, ank, L1, L2, tmp, knee, ank);
      rig.seg(hip, knee, .056, C.pants); rig.seg(knee, ank, .045, C.pants);
      e.set(ft.pitch, yaw + ft.side * .08, 0, 'YXZ'); qShoe.setFromEuler(e);
      toe.set(0, -.012, .045).applyQuaternion(qShoe).add(ank);
      rig.ell(toe, qShoe, .052, .036, .095, C.shoe);
      rig.ell(tmp.set(0, -.032, .045).applyQuaternion(qShoe).add(ank), qShoe, .054, .012, .098, C.sole);
      blob.set(ft.side > 0 ? 1 : 2, ft.pos.x + f.x * .04, ft.pos.z + f.z * .04, .17 - ft.pos.y * .4, .26 - ft.pos.y * .5, yaw);
    }
    blob.set(0, pel.x, pel.z, .55, .5, yaw); blob.commit();
    rig.ell(tmp.copy(pel).addScaledVector(UP, .02), qPel, .135, .09, .1, C.pants);

    // --- Buste : inclinaison sur l'accélération (ressort), torsion vers la visée + contre-rotation des épaules
    const ax = (s.vx - vxp) / dt, az = (s.vz - vzp) / dt; vxp = s.vx; vzp = s.vz;
    const accF = clamp(ax * f.x + az * f.z, -8, 8);
    const leanT = (back ? -.03 : .05) * Math.min(speed, 3) / 3 + runF * .17 + accF * .012 + stress * .28;
    [lean, leanV] = spring(lean, leanV, leanT, 90, 13, dt);
    const cy = clamp(wrap(aimYaw - yaw), -1, 1) * (1 - runF * .6) - pelYaw * .9;
    const yc = yaw + cy; f2.set(Math.sin(yc), 0, Math.cos(yc)); r2.set(Math.cos(yc), 0, -Math.sin(yc));
    sp.copy(UP).multiplyScalar(Math.cos(lean)).addScaledVector(f2, Math.sin(lean)).addScaledVector(r2, pelRoll * .5).normalize();
    basisQ(qChest, r2, sp); zP.crossVectors(r2, sp).normalize();
    const breath = 1 + (.02 + stress * .015) * Math.sin(t * (2.2 + stress * 5 + runF * 4));
    tc.copy(pel).addScaledVector(sp, .2);
    rig.ell(tc, qChest, .17 * breath, .205, .115 * breath, C.jacket);
    rig.ell(tmp.copy(pel).addScaledVector(sp, .07), qChest, .155, .07, .11, C.jacket);       // bas du blouson
    neck.copy(pel).addScaledVector(sp, .39).addScaledVector(UP, (breath - 1) * .4);
    rig.ell(tmp.copy(neck).addScaledVector(zP, -.07).addScaledVector(sp, -.02), qChest, .11, .06, .07, C.hood);   // capuche

    // --- Sac à dos : inertie (ressort amorti) sur la hauteur => il rebondit à chaque pas
    [bpY, bpV] = spring(bpY, bpV, pel.y, 140, 12, dt);
    const lag = clamp(bpY - pel.y, -.05, .05);
    pack.copy(tc).addScaledVector(zP, -.18).addScaledVector(sp, .02 + lag);
    rig.box(pack, qChest, .27, .31, .14, C.pack);
    rig.box(tmp.copy(pack).addScaledVector(sp, .13).addScaledVector(zP, .005), qChest, .285, .07, .155, C.strap);
    rig.box(tmp.copy(pack).addScaledVector(zP, -.075).addScaledVector(sp, -.05), qChest, .18, .14, .03, C.strap);
    for (const side of [-1, 1]) {
      sh.copy(neck).addScaledVector(sp, -.05).addScaledVector(r2, side * .1).addScaledVector(zP, .05);
      tmp.copy(pack).addScaledVector(sp, -.14).addScaledVector(r2, side * .1).addScaledVector(zP, .07);
      rig.seg(sh, tmp, .014, C.strap);
    }

    // --- Tête : stabilisée (compense le rebond), suit la visée, regards nerveux quand on est immobile et inquiet
    if (speed < .15 && stress > .25) { glanceT -= dt; if (glanceT <= 0) { glanceT = .5 + Math.random() * 1.6; glance = (Math.random() - .5) * 1.4; } } else glance = 0;
    glanceS += (glance - glanceS) * Math.min(1, dt * 14);   // saccade rapide
    const hy = clamp(wrap(aimYaw - yc) + glanceS, -.9, .9);
    e.set(.06 + stress * .18 - pelV * .02, yc + hy, -pelRoll * .3, 'YXZ'); qHead.setFromEuler(e);
    rig.seg(neck, tmp.copy(neck).addScaledVector(sp, .07), .04, C.skin);
    head.copy(neck).addScaledVector(UP, .15);
    rig.ell(head, qHead, .118, .13, .122, C.skin);
    rig.ell(tmp.set(0, .035, -.02).applyQuaternion(qHead).add(head), qHead, .125, .112, .128, C.hair);
    rig.ell(tmp.set(.03, .1, .07).applyQuaternion(qHead).add(head), qHead, .07, .03, .05, C.hair);   // mèche

    // --- Bras droit : torche dans l'axe de visée, tremblements de stress, secousses de course
    aim.set(s.fx, -.12, s.fz).normalize();
    const tr = .0025 + stress * .012;
    sR.copy(neck).addScaledVector(sp, -.06).addScaledVector(r2, .15);
    hand.copy(sR).addScaledVector(aim, .3 - runF * .06).addScaledVector(UP, -.04 + runF * Math.sin(phase * 4 * PI) * .025).addScaledVector(r2, -.04);
    hand.x += (Math.sin(t * 23) + Math.sin(t * 37.3)) * tr; hand.y += (Math.sin(t * 29.1) + Math.sin(t * 17.7)) * tr; hand.z += (Math.sin(t * 31.7) + Math.sin(t * 19.3)) * tr;
    tmp.copy(sR).addScaledVector(r2, .25).addScaledVector(UP, -.35);
    ik(sR, hand, .235, .215, tmp, elbow, hand);
    rig.seg(sR, elbow, .043, C.jacket); rig.seg(elbow, hand, .036, C.jacket); rig.ell(hand, qChest, .042, .042, .046, C.skin);
    torchDir.copy(aim); torchDir.x += Math.sin(t * 27) * tr * 2; torchDir.z += Math.cos(t * 33) * tr * 2; torchDir.normalize();
    torchPos.copy(hand).addScaledVector(torchDir, .15);
    rig.seg(tmp.copy(hand).addScaledVector(torchDir, -.03), torchPos, .024, C.torch);
    rig.ell(torchPos, qBody, .028, .028, .028, C.lens);

    // --- Bras gauche : pendule entraîné par la jambe opposée, coude plié en course ; agrippe la bretelle si peur
    sL.copy(neck).addScaledVector(sp, -.06).addScaledVector(r2, -.15);
    const sw = clamp((feet[1].fwd - feet[0].fwd) * .55, -.35, .35);
    const k = sstep(clamp((stress - .45) / .3, 0, 1)) * (1 - runF);
    swing.copy(sL).addScaledVector(sp, -.41 + runF * .17).addScaledVector(f2, sw * (1 + runF * .6) + runF * .06).addScaledVector(r2, -.03 + runF * .04);
    clutch.copy(sL).addScaledVector(zP, .1).addScaledVector(sp, -.13).addScaledVector(r2, .07);
    hand.copy(swing).lerp(clutch, k);
    tmp.copy(sL).addScaledVector(r2, -.15).addScaledVector(UP, -.25).addScaledVector(zP, -.4);
    ik(sL, hand, .235, .215, tmp, elbow, hand);
    rig.seg(sL, elbow, .043, C.jacket); rig.seg(elbow, hand, .036, C.jacket); rig.ell(hand, qChest, .042, .042, .046, C.skin);
    rig.end();
    return { torchPos, torchDir };
  }
  return { update };
}

// =====================================================================================
// LA BÊTE : contorsionniste décharnée, bras démesurés servant de pattes, genoux inversés
// =====================================================================================
export function makeBeast(scene) {
  const rig = new Rig(scene, { shadow: true, max: 56 });
  const C = { skin: new THREE.Color(0xb9b5ad), dark: new THREE.Color(0x4a433e), nail: new THREE.Color(0x15110f), mouth: new THREE.Color(0x070303) };
  const rnd = Math.random;
  const limbs = [
    { arm: true, side: -1, g: 0 }, { arm: true, side: 1, g: 1 },
    { arm: false, side: -1, g: 1 }, { arm: false, side: 1, g: 0 }
  ].map(l => Object.assign(l, { pos: V(), from: V(), to: V(), t: 0, step: false }));
  let yaw = 0, snap = true, cf = 0, reach = 0, twitchT = 0, headRoll = 0, headPitch = 0;
  const pose = { hunch: 1, arch: 0, twist: 0, crouch: 0, reachArm: -1, reachH: 1.4 };
  const sd = V();
  const base = V(), f = V(), r = V(), ft = V(), rt = V(), pel = V(), dir = V(), want = V(), sh = V(), hip = V(), joint = V(), end = V(), tmp = V(), tmp2 = V(), headC = V(), face = V();
  const spine = [V(), V(), V(), V(), V(), V()];
  const qB = new THREE.Quaternion(), qH = new THREE.Quaternion(), qR = new THREE.Quaternion(), qS = new THREE.Quaternion();

  function newPose() {
    Object.assign(pose, {
      hunch: .5 + rnd() * 1.1, arch: (rnd() - .4) * 1.0, twist: (rnd() - .5) * 1.2, crouch: rnd() * .35,
      reachArm: rnd() < .65 ? (rnd() < .5 ? 0 : 1) : -1, reachH: .5 + rnd() * 1.5
    });
    headRoll = (rnd() - .5) * 3.2; headPitch = (rnd() - .5) * 1.1;
  }

  // s = { x, z, vx, vz, seen, visible, px, pz, feint, lunge, onPlant(arm) }
  function update(dt, s) {
    const speed = Math.hypot(s.vx, s.vz), moving = speed > .1 && !s.seen;
    const toP = Math.atan2(s.px - s.x, s.pz - s.z), dP = Math.hypot(s.px - s.x, s.pz - s.z);
    yaw += wrap((moving ? Math.atan2(s.vx, s.vz) : toP) - yaw) * Math.min(1, dt * (moving ? 6 : 2));
    if (s.feint) newPose();
    rig.begin();
    if (!s.visible) { snap = true; rig.end(); return; }   // invisible : aucun calcul de squelette

    f.set(Math.sin(yaw), 0, Math.cos(yaw)); r.set(Math.cos(yaw), 0, -Math.sin(yaw)); qB.setFromAxisAngle(UP, yaw);
    base.set(s.x, 0, s.z);
    cf += ((speed > 3.4 ? 1 : 0) - cf) * Math.min(1, dt * 4);             // 0 = rôde voûtée, 1 = rampe
    const hunch = s.seen ? pose.hunch : .95 + cf * .55, arch = s.seen ? pose.arch : .15 + Math.sin(s.x + s.z) * .1;
    const twist = s.seen ? pose.twist + wrap(toP - yaw) * .5 : 0, crouch = s.seen ? pose.crouch : cf * .35;

    // --- Appuis : chaque membre reste planté, puis fait un pas quand sa position idéale dérive trop
    //     (groupes diagonaux alternés) => démarche d'araignée crédible sans aucun clip
    let lift = 0;
    for (const l of limbs) {
      want.copy(base).addScaledVector(f, l.arm ? .95 + cf * .2 : -.15).addScaledVector(r, l.side * (l.arm ? .5 : .22));
      want.x += s.vx * .25; want.z += s.vz * .25;
      if (snap) { l.pos.copy(want); l.step = false; }
      if (l.step) {
        l.t += dt / l.dur; const u = Math.min(1, l.t);
        l.pos.lerpVectors(l.from, l.to, sstep(u)).addScaledVector(UP, Math.sin(PI * u) * (l.arm ? .3 : .15));
        lift += Math.sin(PI * u) * .05;
        if (u >= 1) { l.step = false; l.pos.copy(l.to); s.onPlant && s.onPlant(l.arm, l.pos); }
      } else if (!s.seen) {
        const thr = l.arm ? .55 : .4, other = limbs.some(o => o.step && o.g !== l.g);
        if (l.pos.distanceTo(want) > thr && !other) {
          l.step = true; l.t = 0; l.dur = .26 * clamp(2.4 / Math.max(speed, .5), .55, 1.4);
          l.from.copy(l.pos); l.to.copy(want); l.to.x += s.vx * l.dur * .5; l.to.z += s.vz * l.dur * .5; l.to.y = 0;
        }
      }
    }
    snap = false;

    // --- Colonne : 5 segments, flexion avant + cambrure + torsion progressive
    pel.copy(base).addScaledVector(UP, 1.02 - crouch + lift + Math.sin(s.x * 3 + s.z * 3) * .02);
    spine[0].copy(pel);
    for (let i = 0; i < 5; i++) {
      const a = hunch * (i + 1) / 5 + arch * Math.sin(PI * (i + .5) / 5), tw = yaw + twist * i / 4;
      ft.set(Math.sin(tw), 0, Math.cos(tw));
      dir.copy(UP).multiplyScalar(Math.cos(a)).addScaledVector(ft, Math.sin(a));
      spine[i + 1].copy(spine[i]).addScaledVector(dir, .21);
      rig.seg(spine[i], spine[i + 1], .1 - Math.abs(i - 2) * .015, C.skin);
      rig.ell(spine[i + 1], qB, .055, .055, .055, C.dark);   // vertèbres saillantes
    }
    const twEnd = yaw + twist; ft.set(Math.sin(twEnd), 0, Math.cos(twEnd)); rt.set(Math.cos(twEnd), 0, -Math.sin(twEnd));
    sd.copy(dir); basisQ(qS, rt, dir); rig.ell(tmp.copy(spine[3]).addScaledVector(dir, .02), qS, .17, .21, .12, C.skin);   // cage thoracique
    rig.ell(tmp.copy(pel).addScaledVector(UP, .03), qB, .14, .1, .1, C.skin);

    // --- Cou long et tête allongée qui roule à des angles impossibles
    const top = spine[5];
    if (s.seen) { twitchT -= dt; if (twitchT <= 0) { twitchT = 1.2 + rnd() * 3; headRoll += (rnd() - .5) * 1.4; headPitch = clamp(headPitch + (rnd() - .5) * .6, -.8, .8); } }
    else { headRoll *= 1 - Math.min(1, dt * 2); headPitch *= 1 - Math.min(1, dt * 2); }
    const na = hunch + .35 + headPitch;
    tmp2.copy(UP).multiplyScalar(Math.cos(na)).addScaledVector(ft, Math.sin(na)).normalize();
    tmp.copy(top).addScaledVector(tmp2, .2); rig.seg(top, tmp, .045, C.skin);
    headC.copy(tmp).addScaledVector(tmp2, .2); rig.seg(tmp, headC, .04, C.skin);
    basisQ(qH, rt, tmp2); qR.setFromAxisAngle(face.set(0, 0, 1), headRoll); qH.multiply(qR);
    rig.ell(headC, qH, .13, .23, .15, C.skin);
    rig.ell(tmp.set(0, -.05, .135).applyQuaternion(qH).add(headC), qH, .014, .11, .02, C.mouth);

    // --- Bras : 0,75 + 0,8 m, coudes hauts et écartés, trois longs doigts
    const near = !s.seen && dP < 3.2;
    reach += ((near || s.lunge ? 1 : 0) - reach) * Math.min(1, dt * 3);
    limbs.forEach((l, i) => {
      if (!l.arm) return;
      sh.copy(top).addScaledVector(rt, l.side * .25).addScaledVector(sd, -.04);
      let tgt = l.pos;
      const reaching = s.lunge || (s.seen ? pose.reachArm === i : (near && i === (l.side > 0 ? 1 : 0) && reach > .1));
      if (reaching) {
        tmp2.set(s.px, s.seen ? pose.reachH : 1.1, s.pz).sub(sh); const dd = tmp2.length();
        tgt = tmp.copy(sh).addScaledVector(tmp2.divideScalar(dd || 1), Math.min(1.5, Math.max(.3, dd - .25)));
        if (!s.seen && !s.lunge) tgt.lerp(l.pos, 1 - reach);
      }
      tmp2.copy(sh).addScaledVector(rt, l.side * .7).addScaledVector(UP, .6);
      ik(sh, tgt, .75, .8, tmp2, joint, end);
      rig.ell(sh, qB, .065, .065, .065, C.dark);
      rig.seg(sh, joint, .045, C.skin); rig.ell(joint, qB, .045, .045, .045, C.dark); rig.seg(joint, end, .036, C.skin);
      dir.subVectors(end, joint).normalize();
      for (const k of [-1, 0, 1]) {
        tmp2.copy(dir).addScaledVector(rt, k * .45).addScaledVector(UP, reaching ? 0 : -.35).normalize();
        tmp.copy(end).addScaledVector(tmp2, .27); if (!reaching) tmp.y = Math.max(tmp.y, .02);
        rig.seg(end, tmp, .012, C.nail);
      }
    });

    // --- Jambes : genoux vers l'arrière (digitigrade), pied long
    limbs.forEach(l => {
      if (l.arm) return;
      hip.copy(pel).addScaledVector(r, l.side * .14);
      tmp2.copy(hip).addScaledVector(f, -1).addScaledVector(UP, .2);
      tmp.copy(l.pos).addScaledVector(UP, .08).addScaledVector(f, -.12);
      ik(hip, tmp, .55, .62, tmp2, joint, end);
      rig.seg(hip, joint, .06, C.skin); rig.ell(joint, qB, .05, .05, .05, C.dark); rig.seg(joint, end, .045, C.skin);
      rig.seg(end, tmp.copy(l.pos).addScaledVector(f, .12), .03, C.dark);
    });
    rig.end();
  }
  return { update };
}
