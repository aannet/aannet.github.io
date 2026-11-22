// Jeu : entrées, règles (la créature ne bouge que hors du faisceau), stress, boucle.
import * as THREE from 'three';
import { scene, cam, OFF, R, post, render, screenToWorld, canvas, stats, setAtmos, setTorch } from './render.js';
import { THEMES } from './themes.js';
import { buildWorld } from './world.js';
import { makeActors } from './actors.js';
import * as A from './audio.js';
import * as H from './hud.js';
import { makeBehaviours } from './behaviours.js';
import { makeHero, makeBeast } from './characters.js';
import { loadCharacters } from './models.js';
import * as Voice from './voice.js';
import { LEVELS } from './levels/index.js';

const $ = id => document.getElementById(id);
const rnd = Math.random;
const HASH = location.hash.slice(1);
const LI = Math.max(0, LEVELS.findIndex(l => HASH.includes(l.slug))), LEVEL = LEVELS[LI].level;
const theme = THEMES[LEVEL.theme]();
const W = buildWorld(LEVEL, theme, scene);
const act = makeActors(scene, theme, W.spawn);
const B = makeBehaviours(W, scene);
// Personnages : modèles animés CC0 ; repli sur les personnages procéduraux si le chargement échoue
const goBtn = $('go'); goBtn.disabled = true; goBtn.textContent = 'Chargement…';
let hero, beast, charSrc = 'modèles CC0';
try { ({ hero, beast } = await loadCharacters(scene)); }
catch (e) { console.warn('Modèles indisponibles, repli procédural', e); hero = makeHero(scene); beast = makeBeast(scene); charSrc = 'repli procédural'; }
goBtn.disabled = false; goBtn.textContent = 'Entrer';
if (W.hasAtmos) setAtmos(W.atmosTex, W.COLS, W.ROWS, W.S, theme.dust, theme.smoke);
const _pl = new THREE.Vector3();
const { S } = W, P0 = W.spawn.player, E0 = W.spawn.enemy, K0 = W.spawn.key, X0 = W.spawn.exit;
// Niveau et debug choisis par l'ancre de l'adresse : #niveau-2, #niveau-1-debug, #debug...
const debug = HASH.includes('debug');
function goLevel(i) { location.hash = LEVELS[i].slug + (debug ? '-debug' : ''); location.reload(); }
if (debug) $('dbg').hidden = false;

// ---------- Entrées ----------
const keys = {};
addEventListener('keydown', e => { keys[e.code] = true; if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') trySprint(); });
addEventListener('keyup', e => { keys[e.code] = false; });
let moveT = null, aimT = null, mv = { x: 0, y: 0 }, aimVec = null, mouseAim = null;
const joy = $('joy'), knob = joy.firstElementChild;
// Sprint court : double tap (deux appuis brefs en moins de 330 ms), ou Maj au clavier
let sprintT = 0, sprintCD = 0, lastTap = 0;
const taps = new Map();
function trySprint() {
  if (!running || sprintCD > 0) return;
  sprintT = 1.0; sprintCD = 3.2; vib(25);
  if (A.AC) A.burst(500, .18, .35, 'lowpass');
}
canvas.addEventListener('pointerdown', e => {
  if (e.pointerType !== 'mouse') taps.set(e.pointerId, { t: performance.now(), x: e.clientX, y: e.clientY });
  if (e.pointerType === 'mouse') { mouseAim = { x: e.clientX, y: e.clientY }; return; }
  if (e.clientX < innerWidth / 2 && !moveT) { moveT = { id: e.pointerId, x: e.clientX, y: e.clientY }; joy.style.left = e.clientX + 'px'; joy.style.top = e.clientY + 'px'; joy.style.display = 'block'; knob.style.transform = ''; }
  else if (!aimT) aimT = { id: e.pointerId, x: e.clientX, y: e.clientY };
});
canvas.addEventListener('pointermove', e => {
  if (e.pointerType === 'mouse') { mouseAim = { x: e.clientX, y: e.clientY }; return; }
  if (moveT && e.pointerId === moveT.id) { let dx = e.clientX - moveT.x, dy = e.clientY - moveT.y; const l = Math.hypot(dx, dy), m = 50; if (l > m) { dx *= m / l; dy *= m / l; } mv = { x: dx / m, y: dy / m }; knob.style.transform = `translate(${dx}px,${dy}px)`; }
  if (aimT && e.pointerId === aimT.id) { const dx = e.clientX - aimT.x, dy = e.clientY - aimT.y; if (Math.hypot(dx, dy) > 10) aimVec = screenToWorld(dx, dy); }
});
const endP = e => {
  const tp = taps.get(e.pointerId); taps.delete(e.pointerId);
  if (tp && e.type === 'pointerup' && performance.now() - tp.t < 230 && Math.hypot(e.clientX - tp.x, e.clientY - tp.y) < 14) {
    const now = performance.now(); if (now - lastTap < 330) { trySprint(); lastTap = 0; } else lastTap = now;
  }
 if (moveT && e.pointerId === moveT.id) { moveT = null; mv = { x: 0, y: 0 }; joy.style.display = 'none'; } if (aimT && e.pointerId === aimT.id) { aimT = null; aimVec = null; } };
canvas.addEventListener('pointerup', endP); canvas.addEventListener('pointercancel', endP);

// ---------- État ----------
let running = false, hasKey = false, face = { x: 1, z: 0 }, faceA = 0, flash = 0, fear = 0, time = 0;
let seen = false, movedSinceSeen = 0, flickT = 8, lightOn = true, pathT = 0, heartT = 0, stepT = 0, twitchT = 2;
// Batterie de la lampe : pleine puissance jusqu'à 50 %, puis baisse jusqu'à 25 %, puis agonie
const BAT = { drain: LEVEL.battery?.drain ?? .007, refill: .5 };
let battery = 1, power = 1;
const torchPower = b => b >= .5 ? 1 : b >= .25 ? .55 + .45 * (b - .25) / .25 : b > 0 ? .15 + .4 * b / .25 : .05;
let voiceCD = 4, lostArm = false, wasInBeam = false, eVisible = false, feint = false, dead = false, pvx = 0, pvz = 0, evx = 0, evz = 0;
const pPrev = new THREE.Vector2(), ePrev = new THREE.Vector2(), _tt = new THREE.Vector3();
let breathT = 0, sightAgo = 9, beat = 0, stress = 0, sightB = 0, dubT = 0, shake = 0, punch = 0, growlCD = 0;
let dist = [];
const ppos = new THREE.Vector2(), epos = new THREE.Vector2();
const vib = p => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { } };
const clamp1 = v => Math.max(-1, Math.min(1, v));

function reset() {
  ppos.set(P0.x, P0.z); epos.set(E0.x, E0.z); hasKey = false; face = { x: 1, z: 0 }; faceA = 0;
  flash = fear = shake = punch = growlCD = beat = stress = sightB = dubT = 0; seen = false; wasInBeam = false; movedSinceSeen = 0; sightAgo = 9;
  flickT = 7 + rnd() * 6; lightOn = true; pathT = 0; act.key.visible = true; B.reset(); dead = false; feint = true; pPrev.copy(ppos); ePrev.copy(epos);
  battery = 1; power = 1; act.batteries.forEach(b => { b.taken = false; b.g.visible = true; }); H.battery(1);
  sprintT = 0; sprintCD = 0; voiceCD = 4; lostArm = false; Voice.stop();
  H.show(); H.hint('Trouve la clé. Il ne bouge que hors de ta lumière.', 5);
}
function flood() {
  dist = Array.from({ length: W.ROWS }, () => Array(W.COLS).fill(1e9));
  const sc = Math.round(ppos.x / S), sr = Math.round(ppos.y / S), q = [[sc, sr]]; dist[sr][sc] = 0;
  for (let i = 0; i < q.length; i++) {
    const [c, r] = q[i];
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc, nr = r + dr;
      if (!W.blocked(nc, nr) && dist[nr][nc] > dist[r][c] + 1) { dist[nr][nc] = dist[r][c] + 1; q.push([nc, nr]); }
    }
  }
}
function nextStep() {
  const c = Math.round(epos.x / S), r = Math.round(epos.y / S);
  if (dist[r] && dist[r][c] === 0) return { x: ppos.x, z: ppos.y };
  let best = null, bd = dist[r] ? dist[r][c] : 1e9;
  for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nc = c + dc, nr = r + dr; if (!W.blocked(nc, nr) && dist[nr][nc] < bd) { bd = dist[nr][nc]; best = { x: nc * S, z: nr * S }; } }
  return best || { x: ppos.x, z: ppos.y };
}
function end(win) {
  running = false; Voice.stop(); A.endRun(win);
  if (!win) { dead = true; H.flatline(); A.beep(880, 2.6, .06); vib(900); }
  setTimeout(() => { $(win ? 'win' : 'dead').classList.remove('hide'); H.hide(); }, win ? 300 : 2200);
}
function start() {
  Voice.unlock(); A.init(); A.startRun(); ['start', 'dead', 'win'].forEach(i => $(i).classList.add('hide')); reset(); running = true;
  setTimeout(() => {
    const n = Voice.voiceCount();
    if (n < 0) H.hint('Voix indisponible ici (navigateur intégré) : ouvre le lien dans Chrome ou Safari.', 6);
    else if (n === 0) H.hint('Aucune voix française installée sur cet appareil.', 6);
  }, 5500);
}
$('go').onclick = start; $('again').onclick = start; $('again2').onclick = start;
$('lv').innerHTML = LEVELS.map((l, i) => `<button data-i="${i}" class="${i === LI ? 'cur' : ''}">${i + 1}. ${l.level.name}</button>`).join('');
$('lv').onclick = e => { const i = +e.target.dataset.i; if (!isNaN(i) && i !== LI) goLevel(i); };
if (LI < LEVELS.length - 1) { $('next').hidden = false; $('next').onclick = () => goLevel(LI + 1); }
function aimTarget(w) { const ta = Math.atan2(w.z, w.x); let df = ta - faceA; df = Math.atan2(Math.sin(df), Math.cos(df)); faceA += df * Math.min(1, .2 + (aimVec || mouseAim ? .5 : 0)); }

// ---------- Boucle ----------
const clock = new THREE.Clock();
let fpsAcc = 0, fpsN = 0;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), .05); time += dt;
  if (running) update(dt);
  const sk = shake * .5;
  cam.position.set(ppos.x + OFF.x + (rnd() - .5) * sk, OFF.y + (rnd() - .5) * sk, ppos.y + OFF.z + (rnd() - .5) * sk); cam.lookAt(ppos.x, 0, ppos.y);
  cam.zoom = 1 + punch; cam.updateProjectionMatrix(); shake = Math.max(0, shake - dt * 1.8); punch = Math.max(0, punch - dt * .6);
  // vitesses lissées (pour l'animation)
  const k = Math.min(1, dt * 12), idt = 1 / Math.max(dt, 1e-3);
  pvx += ((ppos.x - pPrev.x) * idt - pvx) * k; pvz += ((ppos.y - pPrev.y) * idt - pvz) * k; pPrev.copy(ppos);
  evx += ((epos.x - ePrev.x) * idt - evx) * k; evz += ((epos.y - ePrev.y) * idt - evz) * k; ePrev.copy(epos);
  // le héros porte la torche : sa main (et ses tremblements) donnent la position et l'axe du faisceau
  const ho = hero.update(dt, { x: ppos.x, z: ppos.y, vx: pvx, vz: pvz, fx: face.x, fz: face.z, stress, time, dead,
    onStep: (side, run) => { if (running && A.AC) A.burst(2000 + rnd() * 700, .045 + stress * .02 + run * .07, .06 + run * .03, 'bandpass'); } });
  act.torch.position.copy(ho.torchPos); act.torch.target.position.copy(_tt.copy(ho.torchPos).addScaledVector(ho.torchDir, 6));
  act.torch.intensity = lightOn ? 60 * power * (.93 + rnd() * .07 * (1 + (1 - power) * 4)) : 0; act.torch.distance = 20 * (.45 + .55 * power);
  beast.update(dt, { x: epos.x, z: epos.y, vx: evx, vz: evz, seen, visible: eVisible || dead, px: ppos.x, pz: ppos.y, feint, lunge: dead,
    onPlant: (arm, p) => { const dd = Math.hypot(p.x - ppos.x, p.z - ppos.y); if (A.AC && dd < 9) A.burst(arm ? 3200 : 900, (1 - dd / 9) * (arm ? .12 : .18), arm ? .05 : .08, 'bandpass'); } });
  feint = false;
  act.glow.position.set(ppos.x + face.x * .4, 2.3, ppos.y + face.z * .4); act.glow.intensity = lightOn ? 2.2 : .5;
  act.key.position.set(K0.x, .45 + Math.sin(time * 2) * .06, K0.z); act.key.rotation.y = time * 1.2;
  act.exitLight.intensity = 3.4 + Math.sin(time * 3) * .8;
  W.updateLights(ppos.x, ppos.y);
  cam.updateMatrixWorld(); setTorch(act.torch.position, act.torch.target.position, lightOn ? power : 0, _pl.set(ppos.x, 1.0, ppos.y));
  flash = Math.max(0, flash - dt * 1.6); H.draw(dt);
  const u = post.uniforms; u.time.value = time; u.fear.value = fear; u.flash.value = flash; u.beat.value = beat; u.stress.value = stress; beat *= Math.exp(-dt * 4.5);
  render();
  if (debug) { fpsAcc += dt; fpsN++; if (fpsAcc > .5) { $('dbg').textContent = `${Math.round(fpsN / fpsAcc)} fps · ${stats.calls} draw calls · ${(stats.tris / 1000).toFixed(1)}k tris · ${W.placed.length} props · ${charSrc} · voix ${Voice.voiceCount()} (${Voice.voiceName()}) · pile ${Math.round(battery * 100)} %`; fpsAcc = fpsN = 0; } }
}
function update(dt) {
  // déplacement
  let sx = mv.x, sy = mv.y;
  if (keys.KeyW || keys.KeyZ || keys.ArrowUp) sy -= 1; if (keys.KeyS || keys.ArrowDown) sy += 1;
  if (keys.KeyA || keys.KeyQ || keys.ArrowLeft) sx -= 1; if (keys.KeyD || keys.ArrowRight) sx += 1;
  let mag = Math.min(1, Math.hypot(sx, sy)), moving = mag > .08;
  sprintT -= dt; sprintCD -= dt;
  let w = moving ? screenToWorld(sx, sy) : null;
  if (sprintT > 0 && !moving) { w = { x: face.x, z: face.z }; mag = 1; moving = true; }   // sprint sans joystick : droit devant
  if (moving) {
    const sp = 3.1 * mag * (sprintT > 0 ? 1.8 : 1) * dt;
    if (W.free(ppos.x + w.x * sp, ppos.y)) ppos.x += w.x * sp; if (W.free(ppos.x, ppos.y + w.z * sp)) ppos.y += w.z * sp;
    if (!aimVec && !mouseAim) aimTarget(w);
  }
  if (aimVec) aimTarget(aimVec);
  if (mouseAim) { const p = new THREE.Vector3(ppos.x, 1, ppos.y).project(cam); const dx = mouseAim.x - (p.x + 1) / 2 * innerWidth, dy = mouseAim.y - (1 - p.y) / 2 * innerHeight; if (Math.hypot(dx, dy) > 8) aimTarget(screenToWorld(dx, dy)); }
  face = { x: Math.cos(faceA), z: Math.sin(faceA) };

  // lampe qui flanche
  // batterie : se vide tant que la lampe est allumée ; plus elle est faible, plus la lampe flanche souvent et longtemps
  if (lightOn) battery = Math.max(0, battery - BAT.drain * dt);
  power = torchPower(battery); H.battery(battery);
  const wear = battery < .25 ? .3 : battery < .5 ? .6 : 1;
  flickT -= dt; if (flickT <= 0) { if (lightOn) { lightOn = false; flickT = (.15 + rnd() * .55) / Math.sqrt(wear); } else { lightOn = true; flickT = (6 + rnd() * 9) * wear; } }
  for (const b of act.batteries) {
    if (b.taken) continue;
    b.led.visible = (time * 1.5 + b.x) % 1 < .18;
    if (Math.hypot(ppos.x - b.x, ppos.y - b.z) < 1) { b.taken = true; b.g.visible = false; battery = Math.min(1, battery + BAT.refill); A.AC && A.burst(3500, .2, .08, 'bandpass'); A.AC && A.burst(1200, .15, .12, 'bandpass'); vib(30); H.hint('Pile : +50 %', 1.5); }
  }

  // perception : cône de la torche + ligne de vue (murs et props opaques)
  const ex = epos.x - ppos.x, ez = epos.y - ppos.y, d = Math.hypot(ex, ez);
  // Test sur 3 points du corps (centre + flancs) : un bras ou une épaule dans le faisceau suffit.
  // inBeam => elle est rendue (silhouette visible même dans la fumée) ; seen => assez nette pour la figer
  // (la poussière réduit la portée, la fumée aveugle presque : épaisseur optique > 1 => non figée)
  let inBeam = false, nowSeen = false;
  if (lightOn) {
    const nx = -ez / (d || 1), nz = ex / (d || 1);
    for (const o of [0, .45, -.45]) {
      const qx = epos.x + nx * o, qz = epos.y + nz * o, qdx = qx - ppos.x, qdz = qz - ppos.y, qd = Math.hypot(qdx, qdz);
      if (qd > 15 * (.45 + .55 * power) || Math.acos(Math.max(-1, Math.min(1, (qdx * face.x + qdz * face.z) / (qd || 1)))) > .52 || !W.los(ppos.x, ppos.y, qx, qz)) continue;
      inBeam = true;
      if (W.fog(ppos.x, ppos.y, qx, qz) < 1) { nowSeen = true; break; }
    }
  }
  const pan = clamp1((ex * R.x + ez * R.y) / 6);
  growlCD -= dt;
  if (inBeam && !wasInBeam && growlCD <= 0) {
    const close = Math.max(0, 1 - d / 9);
    A.hit(close, pan, movedSinceSeen > 1.5); if (movedSinceSeen > .6) feint = true;
    sightB = 1; flash = Math.max(flash, .55 + close * .45); shake = .45 + close * .9; punch = .12 + close * .25; growlCD = .9;
    vib(close > .55 ? [120, 40, 200] : [70]);
  }
  if (nowSeen) { movedSinceSeen = 0; lostArm = true; }
  seen = nowSeen; wasInBeam = inBeam; sightAgo = nowSeen ? 0 : sightAgo + dt;
  eVisible = inBeam || d < 2.3;
  H.setDanger(eVisible || d < 4);

  // la créature avance seulement hors champ
  pathT -= dt; if (pathT <= 0) { flood(); pathT = .25; }
  let emove = false;
  if (!seen) {
    const n = nextStep(), vx = n.x - epos.x, vz = n.z - epos.y, l = Math.hypot(vx, vz), sp = (lightOn ? 2.35 : 4.8) * dt;
    if (l > .001) { const s = Math.min(sp, l); epos.x += vx / l * s; epos.y += vz / l * s; movedSinceSeen += s; emove = true; }
  }

  // décor vivant
  B.update(dt, { px: ppos.x, pz: ppos.y, ex: epos.x, ez: epos.y, eSeen: seen, eMoving: emove, lightOn, face,
    pan: (x, z) => clamp1(((x - ppos.x) * R.x + (z - ppos.y) * R.y) / 6),
    onFalseAlarm: () => { sightB = Math.max(sightB, .6); flash = Math.max(flash, .22); shake = Math.max(shake, .25); vib(40); } });

  // peur, stress, cœur
  fear += (Math.max(0, 1 - d / 9) - fear) * Math.min(1, dt * 3);
  sightB = Math.max(0, sightB - dt * .12); stress += (Math.max(fear, sightB, hasKey ? .25 : 0, sprintT > 0 ? .45 : 0) - stress) * Math.min(1, dt * 2);
  heartT -= dt;
  if (heartT <= 0) { heartT = 60 / (62 + stress * 105); beat = 1; dubT = .16; H.beat(stress); A.beep(stress > .72 ? 1046 : 880, .07, .035 + stress * .03); A.AC && A.thump(.06 + stress * .5, A.AC.currentTime); vib([Math.round(22 + stress * 50), 100, Math.round(14 + stress * 34)]); }
  if (dubT > 0) { dubT -= dt; if (dubT <= 0) { beat = Math.max(beat, .7); A.AC && A.thump((.06 + stress * .5) * .7, A.AC.currentTime); } }

  if (A.AC) {
    A.ambience(dt, d, seen, sightAgo);
    A.scrape(emove && d < 11 ? (1 - d / 11) * .32 : 0, (ex * R.x + ez * R.y) / 6);
    breathT -= dt; if (!seen && d < 3.6 && breathT <= 0) { A.play('breath', { rate: .6 + rnd() * .12, gain: .25 + (1 - d / 3.6) * .9, pan: clamp1((ex * R.x + ez * R.y) / 3), rev: .35 }); breathT = 1.7 + rnd() * 1.3; }
  }

  // voix de l'enfant : peur qui monte, créature perdue de vue, supplique quand elle est tout près
  voiceCD -= dt;
  if (Voice.available && voiceCD <= 0 && !Voice.isBusy()) {
    let line = null;
    if (((d < 3 && !seen) || stress > .85) && Voice.since('please') > 14) line = 'please';
    else if (lostArm && sightAgo > 2.5 && sightAgo < 6 && d < 12 && Voice.since('lost') > 18) { line = 'lost'; lostArm = false; }
    else if (stress > .55 && Voice.since('fear') > 16) line = 'fear';
    if (line && Voice.say(line, stress)) voiceCD = 6 + rnd() * 4;
  }

  // objectifs
  if (!hasKey && Math.hypot(ppos.x - K0.x, ppos.y - K0.z) < 1.1) { hasKey = true; act.key.visible = false; H.gotKey(); H.hint('La trappe rouge. Ne te retourne pas trop vite.', 4); A.AC && A.burst(3000, .15, .3); }
  const atExit = Math.hypot(ppos.x - X0.x, ppos.y - X0.z) < 1.1;
  if (atExit && hasKey) end(true); else if (atExit) H.hint('Verrouillée. Il faut la clé.', 2);
  if (d < .85) { flash = 1; A.hit(1, 0, true); end(false); }
}

ppos.set(P0.x, P0.z); epos.set(E0.x, E0.z); H.hide();
frame();
