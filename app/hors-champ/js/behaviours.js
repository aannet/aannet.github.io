// Comportements du décor. Chaque prop du catalogue peut déclarer `behave` ou `pushable` ;
// ce module les anime, sans rien savoir du niveau. Réutilisable tel quel sur tout autre niveau.
//   flicker  : néon qui grésille (certains sont "mourants") + grésillement sonore
//   swing    : porte à ressort, poussée par le joueur, par la créature (trace de passage) et par les courants d'air
//   static   : télé qui crache de la neige (texture animée, lumière tremblante, souffle)
//   drip     : fuite d'eau, onde qui s'élargit + goutte sonore
//   pushable : la créature déplace / renverse l'objet en passant hors champ
// + le rat : fausse alerte qui traverse le faisceau.
import * as THREE from 'three';
import * as A from './audio.js';

export function makeBehaviours(W, scene) {
  const rnd = Math.random, white = new THREE.Color();
  const of = b => W.placed.filter(p => p.def.behave === b);
  const neons = of('flicker'), doors = of('swing'), tvs = of('static'), drips = of('drip');
  const pushables = W.placed.filter(p => p.def.pushable);

  // Télé : texture de neige partagée par tous les écrans
  const cv = document.createElement('canvas'); cv.width = 48; cv.height = 36;
  const cx = cv.getContext('2d'), img = cx.createImageData(48, 36), tvTex = new THREE.CanvasTexture(cv);
  tvTex.colorSpace = THREE.SRGBColorSpace; tvTex.magFilter = THREE.NearestFilter;
  Object.assign(W.mats.screen, { emissiveMap: tvTex, emissiveIntensity: .8 }); W.mats.screen.emissive.set(0xffffff); W.mats.screen.needsUpdate = true;
  let tvT = 0, roll = 0;

  // Gouttes : une onde par fuite
  const ringMat = new THREE.MeshStandardMaterial({ color: 0xc8d4dc, roughness: .1, transparent: true, opacity: 0, depthWrite: false });
  drips.forEach(p => {
    p.ring = new THREE.Mesh(new THREE.RingGeometry(.05, .075, 24), ringMat.clone());
    p.ring.rotation.x = -Math.PI / 2; p.ring.position.set(p.x, .02, p.z); scene.add(p.ring);
  });

  // Rat
  const ratMat = new THREE.MeshStandardMaterial({ color: 0x2a2522, roughness: .8 });
  const rat = new THREE.Group();
  const rb = new THREE.Mesh(new THREE.SphereGeometry(.1, 8, 6), ratMat); rb.scale.set(1, .75, 2); rb.position.y = .08;
  const rh = new THREE.Mesh(new THREE.SphereGeometry(.06, 6, 5), ratMat); rh.position.set(0, .09, .22);
  const rt = new THREE.Mesh(new THREE.CylinderGeometry(.008, .015, .35, 4), ratMat); rt.rotation.x = Math.PI / 2 - .2; rt.position.set(0, .05, -.33);
  rat.add(rb, rh, rt); rat.traverse(o => { if (o.isMesh) o.castShadow = true; }); rat.visible = false; scene.add(rat);
  let ratT = 0, run = null;

  let creak = null, hiss = null;

  function reset() {
    neons.forEach(p => { p.dying = rnd() < .35; p.flT = rnd() * 3; p.on = true; p.dim = 1; });
    doors.forEach(p => { p.a = 0; p.v = 0; p.local = p.local || new THREE.Matrix4(); p.draftT = 4 + rnd() * 8; p.inP = p.inE = false; W.applyProp(p); });
    pushables.forEach(p => { Object.assign(p, { x: p.init.x, z: p.init.z, rot: p.init.rot, tilt: 0, y: 0, cd: 0, anim: null }); Object.assign(p.box, p.init.box); W.applyProp(p); });
    drips.forEach(p => { p.dT = rnd() * 2; p.rt = 9; });
    ratT = 18 + rnd() * 12; run = null; rat.visible = false;
  }

  const T1 = new THREE.Matrix4(), T2 = new THREE.Matrix4(), RY = new THREE.Matrix4();
  const lerp = (a, b, k) => a + (b - a) * k, ease = k => 1 - (1 - k) ** 3;

  // c = { px, pz, ex, ez, eSeen, eMoving, lightOn, face, pan(x,z), onFalseAlarm() }
  function update(dt, c) {
    if (A.AC && !creak) { creak = A.creakLoop(); hiss = A.hissLoop(); }
    const dP = p => Math.hypot(p.x - c.px, p.z - c.pz), dE = p => Math.hypot(p.x - c.ex, p.z - c.ez);
    const vol = (d, r) => Math.max(0, 1 - d / r);

    // Néons
    for (const p of neons) {
      p.flT -= dt;
      if (p.flT <= 0) {
        if (p.dying) { p.on = !p.on; p.flT = p.on ? .05 + rnd() * .7 : .03 + rnd() * .3; }
        else if (p.on) { p.on = false; p.flT = .04 + rnd() * .12; }
        else { p.on = true; p.flT = rnd() < .35 ? .06 : 4 + rnd() * 10; }
        if (!p.on) A.oneShot('crackle', vol(dP(p), 9) * .35, c.pan(p.x, p.z));
      }
      p.dim = p.on ? .85 + rnd() * .15 : .02;
      p.inst.glow.setColorAt(p.inst.i, white.setScalar(p.on ? .7 + p.dim * .3 : .08)); p.inst.glow.instanceColor.needsUpdate = true;
    }

    // Portes : ressort amorti autour de l'angle de repos
    let loud = null, loudV = 0;
    for (const p of doors) {
      const inP = dP(p) < 1.1, inE = dE(p) < 1.1;
      if (inE && !p.inE && !c.eSeen) p.v += 3.4;          // la créature est passée par là
      if (inP && !p.inP) p.v += 1.5;
      p.inP = inP; p.inE = inE;
      p.draftT -= dt; if (p.draftT <= 0) { p.draftT = 8 + rnd() * 14; if (dP(p) < 12) p.v += (rnd() - .5) * 1.3; }
      p.v += (-2.2 * p.a - 1.1 * p.v) * dt; p.a += p.v * dt;
      if (p.a > .4) { p.a = .4; p.v *= -.3; } if (p.a < -1) { p.a = -1; p.v *= -.3; }
      T1.makeTranslation(.95, 0, 0); RY.makeRotationY(p.a); T2.makeTranslation(-.95, 0, 0);
      p.local.copy(T1).multiply(RY).multiply(T2); W.applyProp(p);
      const l = Math.abs(p.v) * vol(dP(p), 13); if (l > loudV) { loudV = l; loud = p; }
    }
    if (creak) creak(loud ? Math.min(1, loudV * .7) * .5 : 0, loud ? 18 + Math.abs(loud.v) * 26 : 20, loud ? c.pan(loud.x, loud.z) : 0);

    // Télés
    tvT -= dt;
    if (tvT <= 0) {
      tvT = 1 / 14; roll = (roll + 3) % 36;
      const d = img.data;
      for (let y = 0; y < 36; y++) { const bar = Math.abs(y - roll) < 4 ? .45 : 1; for (let x = 0; x < 48; x++) { const v = rnd() * 255 * bar | 0, i = (y * 48 + x) * 4; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; } }
      cx.putImageData(img, 0, 0); tvTex.needsUpdate = true;
      tvs.forEach(p => { p.dim = .45 + rnd() * .55; });
    }
    if (hiss) { let n = null, nd = 1e9; for (const p of tvs) { const d = dP(p); if (d < nd) { nd = d; n = p; } } hiss(n ? vol(nd, 8) * .05 : 0, n ? c.pan(n.x, n.z) : 0); }

    // Fuites d'eau
    for (const p of drips) {
      p.dT -= dt; if (p.dT <= 0) { p.dT = 1.2 + rnd() * 2.2; p.rt = 0; A.oneShot('drip', vol(dP(p), 10) * .45, c.pan(p.x, p.z)); }
      p.rt += dt; const s = 1 + p.rt * 7; p.ring.scale.set(s, s, 1); p.ring.material.opacity = Math.max(0, .55 - p.rt * .7);
    }

    // Objets déplacés par la créature (hors champ)
    for (const p of pushables) {
      p.cd -= dt;
      if (p.anim) {
        const a = p.anim; a.t += dt / .3; const k = ease(Math.min(1, a.t));
        p.x = lerp(a.x0, a.x1, k); p.z = lerp(a.z0, a.z1, k); p.rot = lerp(a.r0, a.r1, k); p.tilt = lerp(a.t0, a.t1, k); p.y = lerp(a.y0, a.y1, k);
        W.applyProp(p); if (a.t >= 1) p.anim = null;
      } else if (!c.eSeen && c.eMoving && p.cd <= 0 && dE(p) < 1.05) {
        const dx = p.x - c.ex, dz = p.z - c.ez, l = Math.hypot(dx, dz) || 1, ox = dx / l * .5, oz = dz / l * .5;
        const b = p.box, ok = [[b.x0, b.z0], [b.x1, b.z0], [b.x0, b.z1], [b.x1, b.z1]].every(([x, z]) => !W.wallAt(x + ox, z + oz));
        if (ok) {
          const tip = p.k === 'chair' && !p.tilt && rnd() < .45;
          p.anim = { t: 0, x0: p.x, z0: p.z, x1: p.x + ox, z1: p.z + oz, r0: p.rot, r1: p.rot + (rnd() - .5) * 1.3, t0: p.tilt || 0, t1: tip ? -Math.PI / 2 : (p.tilt || 0), y0: p.y || 0, y1: tip ? .24 : (p.y || 0) };
          b.x0 += ox; b.x1 += ox; b.z0 += oz; b.z1 += oz; p.cd = 5;
          A.oneShot('thud', vol(dP(p), 14) * .6, c.pan(p.x, p.z));
        }
      }
    }

    // Rat : fausse alerte qui traverse le faisceau
    if (!run) {
      ratT -= dt;
      if (ratT <= 0 && c.lightOn) {
        for (let i = 0; i < 6 && !run; i++) {
          const dist = 2.5 + rnd() * 2.5, side = rnd() < .5 ? 1 : -1, px = -c.face.z, pz = c.face.x;
          const mx = c.px + c.face.x * dist, mz = c.pz + c.face.z * dist;
          const sx = mx + px * side * 2.6, sz = mz + pz * side * 2.6, ex = mx - px * side * 2.6, ez = mz - pz * side * 2.6;
          if (W.free(sx, sz, .15) && W.free(ex, ez, .15) && W.free(mx, mz, .15) && W.los(sx, sz, ex, ez) && W.los(c.px, c.pz, mx, mz))
            run = { sx, sz, ex, ez, t: 0, len: Math.hypot(ex - sx, ez - sz), started: false };
        }
        ratT = run ? 25 + rnd() * 25 : 3;
      }
    } else {
      if (!run.started) { run.started = true; c.onFalseAlarm(); const pn = c.pan(run.sx, run.sz); A.oneShot('squeak', .5, pn); A.oneShot('scratch', .45, pn); }
      run.t += dt * 6 / run.len; const k = Math.min(1, run.t);
      rat.position.set(lerp(run.sx, run.ex, k), Math.abs(Math.sin(run.t * 40)) * .02, lerp(run.sz, run.ez, k));
      rat.rotation.y = Math.atan2(run.ex - run.sx, run.ez - run.sz); rat.visible = true;
      if (k >= 1) { run = null; rat.visible = false; }
    }
  }

  reset();
  return { update, reset };
}
