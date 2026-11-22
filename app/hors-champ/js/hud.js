// HUD : moniteur cardiaque façon bloc opératoire, clé, indications.
const $ = id => document.getElementById(id);
const ecg = $('ecg'), ctx = ecg.getContext('2d'), mon = $('mon'), bpmEl = $('bpm'), hrt = $('hrt'), hud = $('hud'), bat = $('bat'), batFill = $('batFill'), batTxt = $('batTxt');
let danger = false, flat0 = false;
let W = 0, H = 0, x0 = 0, y0 = null, since = 9, flat = false, hintTO;

function size() {
  const k = Math.min(devicePixelRatio || 1, 2); W = ecg.clientWidth; H = ecg.clientHeight;
  ecg.width = W * k; ecg.height = H * k; ctx.setTransform(k, 0, 0, k, 0, 0); ctx.clearRect(0, 0, W, H); x0 = 0; y0 = null;
}
addEventListener('resize', size);
function wave(t) {
  if (t < .02) return -.12 * t / .02; if (t < .04) return -.12 + 1.12 * (t - .02) / .02;
  if (t < .065) return 1 - 1.3 * (t - .04) / .025; if (t < .09) return -.3 + .3 * (t - .065) / .025;
  if (t > .2 && t < .36) return .22 * Math.sin((t - .2) / .16 * Math.PI); return 0;
}
export function draw(dt) {
  if (!mon.classList.contains('on')) return;
  if (!W) size(); if (!W) return;
  ctx.lineWidth = 1.6; ctx.lineJoin = 'round'; const col = getComputedStyle(mon).color; ctx.strokeStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 4;
  for (let i = 0; i < 4; i++) {
    const st = dt / 4; since += st; let x1 = x0 + 52 * st;
    if (x1 > W) { x0 = 0; x1 = 52 * st; y0 = null; }
    const v = flat ? 0 : wave(since) + (Math.random() - .5) * .025, y = H * .64 - v * H * .5;
    ctx.clearRect(x0 + .5, 0, 14, H);
    if (y0 !== null) { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y); ctx.stroke(); }
    x0 = x1; y0 = y;
  }
}
export function beat(stress) {
  since = 0; bpmEl.textContent = Math.round(62 + stress * 105);
  hrt.classList.remove('off'); setTimeout(() => hrt.classList.add('off'), 120);
}
export function show() { flat = false; danger = false; mon.className = 'on'; bat.className = 'on'; bpmEl.textContent = '--'; hud.className = 'tw on'; $('ks').textContent = 'Clé introuvable'; }
export function hide() { mon.className = ''; hud.className = 'tw'; bat.className = ''; }
export function flatline() { flat = true; bpmEl.textContent = '---'; mon.classList.add('hi'); }
export function gotKey() { hud.classList.add('got'); $('ks').textContent = 'Clé'; }
// HUD blanc translucide ; tout passe au rouge quand la bête est là (visible ou à moins de 4 m)
export function setDanger(on) { if (on === danger || flat) return; danger = on; mon.classList.toggle('hi', on); hud.classList.toggle('hi', on); bat.classList.toggle('hi', on); }
export function battery(b) {
  const p = Math.round(b * 100); batFill.setAttribute('width', (16 * b).toFixed(1)); batTxt.textContent = p + ' %';
  bat.classList.toggle('low', b < .25); bat.classList.toggle('mid', b >= .25 && b < .5);
}
export function hint(s, sec) { const h = $('hint'); h.textContent = s; h.style.opacity = 1; clearTimeout(hintTO); hintTO = setTimeout(() => h.style.opacity = 0, sec * 1000); }
