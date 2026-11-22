// Audio : nappes calme/danger, Shepard tone, échantillons CC0 (sfx/), choc d'apparition,
// battements, frottement de la créature. Tout passe par Web Audio.
const rnd = Math.random;
export let AC=null;let master,scrapeG,scrapePan,noiseBuf;
export function init(){
  if(AC){AC.resume();return}
  try{AC=new (window.AudioContext||window.webkitAudioContext)()}catch(e){AC=null;return}
  master=AC.createGain();master.gain.value=.8;master.connect(AC.destination);
  noiseBuf=AC.createBuffer(1,AC.sampleRate*2,AC.sampleRate);const ch=noiseBuf.getChannelData(0);for(let i=0;i<ch.length;i++)ch[i]=rnd()*2-1;
  const ns=AC.createBufferSource();ns.buffer=noiseBuf;ns.loop=true;
  const bp=AC.createBiquadFilter();bp.type='bandpass';bp.frequency.value=700;bp.Q.value=1.2;
  buildAmbience();
  // réverbe : réponse impulsionnelle générée (bruit à décroissance exponentielle, 2,4 s)
  conv=AC.createConvolver();const L=AC.sampleRate*2.4|0,ir=AC.createBuffer(2,L,AC.sampleRate);
  for(let c=0;c<2;c++){const d=ir.getChannelData(c);for(let i=0;i<L;i++)d[i]=(rnd()*2-1)*Math.pow(1-i/L,3.2)}
  conv.buffer=ir;const rg=AC.createGain();rg.gain.value=.6;conv.connect(rg).connect(master);
  loadSfx();
  scrapeG=AC.createGain();scrapeG.gain.value=0;
  scrapePan=AC.createStereoPanner?AC.createStereoPanner():null;
  ns.connect(bp).connect(scrapeG);if(scrapePan)scrapeG.connect(scrapePan).connect(master);else scrapeG.connect(master);ns.start();
}
// ---- Échantillons réels (CC0), chargés depuis sfx/
const SFX={scream:['dino_ptero_screech1','dino_ptero_screech2','dino_ptero_screech3','dino_ptero_screech4'],growl:['dino_rex_snarl1','dino_rex_snarl3','dino_rex_snarl4'],rasp:['dino_raptor_growl8','dino_raptor_growl9'],long:['dino_snarl_long1'],breath:['dino_breath']};
const sbuf={};let conv=null;
async function loadSfx(){for(const k in SFX){sbuf[k]=[];for(const n of SFX[k]){try{const r=await fetch('sfx/'+n+'.mp3');sbuf[k].push(await AC.decodeAudioData(await r.arrayBuffer()))}catch(e){}}}}
function curve(k){const c=new Float32Array(1024);for(let i=0;i<1024;i++)c[i]=Math.tanh((i/512-1)*k)/Math.tanh(k);return c}
export function play(k,o={}){
  const l=sbuf[k];if(!AC||!l||!l.length)return false;
  const t=AC.currentTime+(o.delay||0),src=AC.createBufferSource();src.buffer=l[rnd()*l.length|0];src.playbackRate.value=o.rate||1;
  let n=src;
  if(o.drive){const w=AC.createWaveShaper();w.curve=curve(o.drive);n.connect(w);n=w}
  if(o.rough){const a=AC.createGain();a.gain.value=1-o.rough;const m=AC.createOscillator(),mg=AC.createGain();m.frequency.value=55+rnd()*50;mg.gain.value=o.rough;m.connect(mg).connect(a.gain);m.start(t);m.stop(t+src.buffer.duration/(o.rate||1)+.1);n.connect(a);n=a}
  const g=AC.createGain();g.gain.value=o.gain??1;n.connect(g);n=g;
  if(o.pan!=null&&AC.createStereoPanner){const pn=AC.createStereoPanner();pn.pan.value=o.pan;n.connect(pn);n=pn}
  n.connect(master);if(o.rev&&conv){const rs=AC.createGain();rs.gain.value=o.rev;n.connect(rs).connect(conv)}
  src.start(t);return true;
}
function sampleHit(close,pan,big){
  const r=x=>x+rnd()*.1;let ok;
  if(close>.45){ok=play('scream',{rate:r(.8),gain:1,drive:2.2,rough:.3,pan,rev:.45});play('growl',{rate:r(1.2),gain:.85,drive:1.5,pan,rev:.3,delay:.04})}
  else{ok=play('growl',{rate:r(1.2),gain:.95,drive:1.8,rough:.2,pan,rev:.65});play('rasp',{rate:r(1.2),gain:.35,pan,rev:.5,delay:.12})}
  if(big)play('long',{rate:1.25,gain:.55,drive:1.5,pan,rev:.5,delay:.08});
  return ok;
}
// ---- Nappes : calme (pad mineur, vent, Shepard descendant) / danger (cluster dissonant rugueux, sub, Shepard montant)
let ambG,calmG,dangerG,shepG,shep=[],shepPhase=0,danger=0,hush=0;
function lfo(f,depth,target){const o=AC.createOscillator(),g=AC.createGain();o.frequency.value=f;g.gain.value=depth;o.connect(g).connect(target);o.start();return o}
function buildAmbience(){
  ambG=AC.createGain();ambG.connect(master);
  calmG=AC.createGain();calmG.gain.value=1;calmG.connect(ambG);
  dangerG=AC.createGain();dangerG.gain.value=0;dangerG.connect(ambG);
  // pad calme
  const plp=AC.createBiquadFilter();plp.type='lowpass';plp.frequency.value=320;plp.Q.value=4;lfo(.045,220,plp.frequency);
  const pg=AC.createGain();pg.gain.value=.03;plp.connect(pg).connect(calmG);
  [55,82.41,123.47,130.81].forEach(f=>[-7,7].forEach(c=>{const o=AC.createOscillator();o.type='sawtooth';o.frequency.value=f;o.detune.value=c;o.connect(plp);o.start()}));
  // vent
  const ws=AC.createBufferSource();ws.buffer=noiseBuf;ws.loop=true;const wb=AC.createBiquadFilter();wb.type='bandpass';wb.frequency.value=420;wb.Q.value=.6;lfo(.07,260,wb.frequency);
  const wg=AC.createGain();wg.gain.value=.045;lfo(.11,.03,wg.gain);ws.connect(wb).connect(wg).connect(calmG);ws.start();
  // danger : cluster de demi-tons + triton, modulé en amplitude dans la zone de rugosité (30-150 Hz)
  const dlp=AC.createBiquadFilter();dlp.type='lowpass';dlp.frequency.value=1600;
  const am=AC.createGain();am.gain.value=.55;lfo(47,.45,am.gain);
  const dsh=AC.createWaveShaper(),cv=new Float32Array(512);for(let i=0;i<512;i++)cv[i]=Math.tanh((i/256-1)*2.5);dsh.curve=cv;
  const dg=AC.createGain();dg.gain.value=.05;dlp.connect(am).connect(dsh).connect(dg).connect(dangerG);
  [233.08,246.94,261.63,329.63].forEach(f=>{const o=AC.createOscillator();o.type='sawtooth';o.frequency.value=f;lfo(.3+rnd()*.4,f*.006,o.frequency);o.connect(dlp);o.start()});
  const sub=AC.createOscillator();sub.frequency.value=34;const sg=AC.createGain();sg.gain.value=.22;lfo(1.6,.15,sg.gain);sub.connect(sg).connect(dangerG);sub.start();
  [2793,2961].forEach(f=>{const o=AC.createOscillator();o.frequency.value=f;const g=AC.createGain();g.gain.value=.008;o.connect(g).connect(dangerG);o.start()});
  // Shepard tone
  shepG=AC.createGain();shepG.gain.value=.02;shepG.connect(ambG);
  for(let i=0;i<7;i++){const o=AC.createOscillator(),g=AC.createGain();o.frequency.value=100;g.gain.value=0;o.connect(g).connect(shepG);o.start();shep.push([o,g])}
}
export function ambience(dt,d,seenNow,sightAgo){
  const t=AC.currentTime;
  const want=(d<5.5&&(seenNow||sightAgo<1.5))?1:0;
  danger+=(want-danger)*Math.min(1,dt*(want>danger?4:.45));
  // silence d'anticipation : le monde se tait quand il est juste derrière toi
  const near=(!seenNow&&d<4.5)?1-d/4.5:0;hush+=(near-hush)*Math.min(1,dt*1.5);
  calmG.gain.setTargetAtTime((1-danger*.92)*(1-hush*.85),t,.05);
  dangerG.gain.setTargetAtTime(danger,t,.05);
  shepPhase+=(-1/22+danger*(1/3.2+1/22))*dt;
  const N=shep.length;shep.forEach(([o,g],i)=>{const pos=(((i+shepPhase)%N)+N)%N/N;o.frequency.setTargetAtTime(38*2**(pos*N),t,.03);g.gain.setTargetAtTime(Math.sin(pos*Math.PI)**2,t,.03)});
  shepG.gain.setTargetAtTime((.016+danger*.05)*(1-hush*.7),t,.1);
}
// ---- Choc d'apparition : silence brutal + impact sub + cri non linéaire rugueux
export function hit(close,pan,big){
  if(!AC)return;const t=AC.currentTime,scream=close>.45,dur=scream?1.7:1.4;
  ambG.gain.cancelScheduledValues(t);ambG.gain.setValueAtTime(.0001,t);ambG.gain.setTargetAtTime(1,t+.9,.7);
  const o=AC.createOscillator(),g=AC.createGain();o.frequency.setValueAtTime(150,t);o.frequency.exponentialRampToValueAtTime(30,t+.55);
  g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.95,t+.01);g.gain.exponentialRampToValueAtTime(.0001,t+1);o.connect(g).connect(master);o.start(t);o.stop(t+1.05);
  if(sampleHit(close,pan,big))return;
  const out=AC.createGain();out.gain.setValueAtTime(.0001,t);out.gain.exponentialRampToValueAtTime(.5+close*.4+(big?.15:0),t+.012);
  out.gain.setValueAtTime(.5+close*.4,t+dur*.35);out.gain.exponentialRampToValueAtTime(.0001,t+dur);
  const sh=AC.createWaveShaper(),cv=new Float32Array(1024);for(let i=0;i<1024;i++){const x=i/512-1;cv[i]=Math.sign(x)*Math.min(1,Math.abs(x)*9)}sh.curve=cv;
  const rough=AC.createGain();rough.gain.value=.15;const am=AC.createOscillator();am.frequency.setValueAtTime(40+rnd()*30,t);am.frequency.linearRampToValueAtTime(110+rnd()*40,t+dur);const amg=AC.createGain();amg.gain.value=.85;am.connect(amg).connect(rough.gain);am.start(t);am.stop(t+dur);
  const pn=AC.createStereoPanner?AC.createStereoPanner():null;
  rough.connect(sh).connect(out);if(pn){pn.pan.value=pan;out.connect(pn).connect(master)}else out.connect(master);
  const base=scream?540:150,steps=24;
  [1,1.059,1.122,1.414,1.49].forEach(r=>{const v=AC.createOscillator();v.type='sawtooth';
    for(let k=0;k<steps;k++){const u=k/steps,env=scream?(u<.15?1+u*3:1.45-u*.75):(1-u*.45);v.frequency.setValueAtTime(base*r*env*(1+(rnd()-.5)*.14),t+u*dur)}
    const vg=AC.createGain();vg.gain.value=.22;v.connect(vg).connect(rough);v.start(t);v.stop(t+dur)});
  const subh=AC.createOscillator();subh.type='square';subh.frequency.setValueAtTime(base/2,t);subh.frequency.exponentialRampToValueAtTime(base/2*.6,t+dur);
  const shg=AC.createGain();shg.gain.setValueAtTime(0,t);shg.gain.linearRampToValueAtTime(.2,t+.35);subh.connect(shg).connect(rough);subh.start(t);subh.stop(t+dur);
  const n=AC.createBufferSource();n.buffer=noiseBuf;const nb=AC.createBiquadFilter();nb.type='bandpass';nb.frequency.setValueAtTime(scream?3200:900,t);nb.frequency.exponentialRampToValueAtTime(scream?1400:300,t+dur);nb.Q.value=1.4;
  const ng=AC.createGain();ng.gain.value=scream?.5:.8;n.connect(nb).connect(ng).connect(rough);n.start(t,rnd());n.stop(t+dur);
}
export function thump(v,t){const o=AC.createOscillator(),g=AC.createGain();o.frequency.setValueAtTime(75,t);o.frequency.exponentialRampToValueAtTime(38,t+.16);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(v,t+.02);g.gain.exponentialRampToValueAtTime(.0001,t+.26);o.connect(g).connect(master);o.start(t);o.stop(t+.3)}
export function burst(f,v,d,type='highpass'){const s=AC.createBufferSource();s.buffer=noiseBuf;const fl=AC.createBiquadFilter();fl.type=type;fl.frequency.value=f;const g=AC.createGain(),t=AC.currentTime;g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(.0001,t+d);s.connect(fl).connect(g).connect(master);s.start(t,rnd());s.stop(t+d+.05)}

export function beep(f,d,v){if(!AC)return;const o=AC.createOscillator(),g=AC.createGain(),t=AC.currentTime;o.type='sine';o.frequency.value=f;g.gain.setValueAtTime(v,t);g.gain.setValueAtTime(v,t+d-.01);g.gain.linearRampToValueAtTime(0,t+d);o.connect(g).connect(master);o.start(t);o.stop(t+d+.02)}
export function scrape(level,pan){if(!AC)return;const t=AC.currentTime;scrapeG.gain.setTargetAtTime(level,t,.08);if(scrapePan)scrapePan.pan.setTargetAtTime(Math.max(-1,Math.min(1,pan)),t,.1)}
export function startRun(){if(AC&&calmG){danger=0;hush=0;calmG.gain.setTargetAtTime(1,AC.currentTime,.5)}}
export function endRun(win){if(!AC)return;const t=AC.currentTime;scrapeG.gain.setTargetAtTime(0,t,.05);calmG.gain.setTargetAtTime(win?1:0,t,.3);dangerG.gain.setTargetAtTime(0,t,.4)}

// ---- Sons de décor (synthétisés, spatialisés gauche/droite)
function outNode(gain, pan, rev = 0) {
  const g = AC.createGain(); g.gain.value = gain; let n = g;
  if (AC.createStereoPanner) { const p = AC.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); n = p; }
  n.connect(master); if (rev && conv) { const r = AC.createGain(); r.gain.value = rev; n.connect(r).connect(conv); }
  return g;
}
export function oneShot(kind, gain, pan) {
  if (!AC || gain <= .002) return;
  const t = AC.currentTime, out = outNode(gain, pan, .35);
  const osc = (type, f0, f1, t0, d, v) => { const o = AC.createOscillator(), g = AC.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t + t0); o.frequency.exponentialRampToValueAtTime(f1, t + t0 + d); g.gain.setValueAtTime(.0001, t + t0); g.gain.exponentialRampToValueAtTime(v, t + t0 + .005); g.gain.exponentialRampToValueAtTime(.0001, t + t0 + d); o.connect(g).connect(out); o.start(t + t0); o.stop(t + t0 + d + .02); };
  const noise = (type, f, q, t0, d, v) => { const s = AC.createBufferSource(); s.buffer = noiseBuf; const fl = AC.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = AC.createGain(); g.gain.setValueAtTime(v, t + t0); g.gain.exponentialRampToValueAtTime(.0001, t + t0 + d); s.connect(fl).connect(g).connect(out); s.start(t + t0, rnd()); s.stop(t + t0 + d + .02); };
  if (kind === 'drip') osc('sine', 1700 + rnd() * 500, 500, 0, .09, .5);
  else if (kind === 'squeak') for (let i = 0; i < 3; i++) osc('sine', 3200 + rnd() * 900, 2600 + rnd() * 600, i * .09 + rnd() * .03, .06, .25);
  else if (kind === 'scratch') for (let i = 0; i < 9; i++) noise('bandpass', 3500, 2, i * .06 + rnd() * .02, .03, .5);
  else if (kind === 'crackle') for (let i = 0; i < 6; i++) noise('highpass', 4000, .7, rnd() * .22, .015, .6);
  else if (kind === 'thud') { noise('lowpass', 320, .7, 0, .25, .9); osc('sine', 110, 55, 0, .18, .6); noise('bandpass', 1500, 3, .02, .2, .2); }
}
// Grincement de porte : frottement collé-glissé (impulsions 20-60 Hz filtrées en bande étroite)
export function creakLoop() {
  const o = AC.createOscillator(); o.type = 'square'; o.frequency.value = 30;
  const bp = AC.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 7;
  const g = AC.createGain(); g.gain.value = 0;
  const p = AC.createStereoPanner ? AC.createStereoPanner() : null;
  o.connect(bp).connect(g); if (p) g.connect(p).connect(master); else g.connect(master);
  const r = AC.createGain(); r.gain.value = .3; g.connect(r).connect(conv || master); o.start();
  return (level, rate, pan) => { const t = AC.currentTime; g.gain.setTargetAtTime(level, t, .05); o.frequency.setTargetAtTime(rate * (1 + (rnd() - .5) * .35), t, .03); bp.frequency.setTargetAtTime(900 + rate * 9, t, .1); if (p) p.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), t, .1); };
}
// Souffle de télé (neige)
export function hissLoop() {
  const s = AC.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const hp = AC.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
  const g = AC.createGain(); g.gain.value = 0; const p = AC.createStereoPanner ? AC.createStereoPanner() : null;
  s.connect(hp).connect(g); if (p) g.connect(p).connect(master); else g.connect(master); s.start();
  return (level, pan) => { const t = AC.currentTime; g.gain.setTargetAtTime(level, t, .1); if (p) p.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), t, .1); };
}

// ---- Souffles de l'enfant : inspiration haletante, expiration, sanglot (bruit filtré, aucun échantillon)
export function breath(kind, gain = .5) {
  if (!AC) return 0;
  const t = AC.currentTime, s = AC.createBufferSource(); s.buffer = noiseBuf;
  const bp = AC.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = kind === 'sob' ? 4 : 1.6;
  const g = AC.createGain(); g.gain.value = 0;
  s.connect(bp).connect(g).connect(master); if (conv) { const r = AC.createGain(); r.gain.value = .25; g.connect(r).connect(conv); }
  let d;
  if (kind === 'in') {          // inspiration rapide, aiguë, qui monte
    d = .28 + rnd() * .1; bp.frequency.setValueAtTime(1300, t); bp.frequency.linearRampToValueAtTime(2300, t + d);
    g.gain.linearRampToValueAtTime(gain * .9, t + d * .6); g.gain.linearRampToValueAtTime(0, t + d);
  } else if (kind === 'out') {  // expiration, plus grave, qui retombe
    d = .32 + rnd() * .12; bp.frequency.setValueAtTime(1500, t); bp.frequency.linearRampToValueAtTime(700, t + d);
    g.gain.linearRampToValueAtTime(gain * .7, t + .04); g.gain.linearRampToValueAtTime(0, t + d);
  } else {                      // sanglot : hoquet bref + petite note voisée
    d = .22; bp.frequency.setValueAtTime(900, t);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(.001, t + .12);
    const o = AC.createOscillator(), og = AC.createGain(); o.type = 'triangle';
    o.frequency.setValueAtTime(420 + rnd() * 80, t + .02); o.frequency.exponentialRampToValueAtTime(300, t + .2);
    og.gain.setValueAtTime(.0001, t + .02); og.gain.exponentialRampToValueAtTime(gain * .35, t + .04); og.gain.exponentialRampToValueAtTime(.0001, t + .2);
    o.connect(og).connect(master); o.start(t + .02); o.stop(t + .22);
  }
  s.start(t, rnd()); s.stop(t + d + .05);
  return d;
}
// Baisse l'ambiance pendant que l'enfant parle (la synthèse vocale du navigateur ne passe pas par Web Audio)
export function duck(on) { if (AC && ambG) ambG.gain.setTargetAtTime(on ? .35 : 1, AC.currentTime, .15); }
