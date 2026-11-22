// Voix de l'enfant : synthèse vocale du navigateur (Web Speech API), rendue plaintive et haletante par
// une voix aiguë, un débit lent, des phrases hachées en morceaux et des souffles synthétisés entre les mots.
// Limites : la voix dépend du téléphone et ne peut pas recevoir d'effets (elle ne passe pas par Web Audio).
// Remplaçable plus tard par de vrais enregistrements sans toucher aux déclencheurs (même API : say(ligne)).
import * as A from './audio.js';

const LINES = {
  fear:   [['J\'ai…', 'j\'ai peur…'], ['J\'ai peur…'], ['J\'ai…', 'peur…', 'j\'ai peur…']],
  lost:   [['Je ne sais pas…', 'où il est…'], ['Je…', 'je ne sais pas où il est…'], ['Il est où…', 'je ne sais pas où il est…']],
  please: [['S\'il vous plaît…'], ['S\'il vous plaît…', 's\'il vous plaît…'], ['Non…', 's\'il vous plaît…']]
};
const synth = window.speechSynthesis;
let voice = null, busy = false, queue = [], timer = 0, lastLine = '', lastAt = {}, unlocked = false, stress = 0;

function pickVoice() {
  if (!synth) return;
  // voix locales d'abord (pas de latence réseau), en français de France de préférence
  const vs = synth.getVoices().filter(v => /^fr/i.test(v.lang)).sort((a, b) => (b.localService ? 1 : 0) - (a.localService ? 1 : 0));
  const pref = /amélie|amelie|audrey|aurélie|aurelie|marie|céline|celine|julie|léa|lea|chantal|virginie|denise|female|femme/i;
  voice = vs.find(v => pref.test(v.name) && /fr-FR/i.test(v.lang)) || vs.find(v => pref.test(v.name)) || vs.find(v => /fr-FR/i.test(v.lang)) || vs[0] || null;
}
if (synth) { pickVoice(); synth.onvoiceschanged = pickVoice; }

// iOS / Android : la synthèse doit être lancée une première fois depuis un geste de l'utilisateur
export function unlock() {
  if (!synth || unlocked) return; unlocked = true;
  synth.cancel(); pickVoice();
  const u = new SpeechSynthesisUtterance(' '); u.volume = 0; synth.speak(u);
}
export const available = !!synth;

function next() {
  clearTimeout(timer);
  const it = queue.shift();
  if (!it) { busy = false; A.duck(false); return; }
  if (it.breath) { const d = A.breath(it.breath, it.g ?? .45) || .25; timer = setTimeout(next, (d + (it.pause || .05)) * 1000); return; }
  const u = new SpeechSynthesisUtterance(it.say);
  if (voice) u.voice = voice; u.lang = voice ? voice.lang : 'fr-FR';
  u.pitch = Math.min(2, 1.65 + stress * .35 + (Math.random() - .5) * .1);   // voix d'enfant, plus aiguë sous la peur
  u.rate = .82 + Math.random() * .08 - stress * .05;                         // lente, traînante
  u.volume = .9;
  let done = false; const go = () => { if (done) return; done = true; timer = setTimeout(next, 120 + Math.random() * 180); };
  u.onend = go; u.onerror = go; timer = setTimeout(go, 4000);   // garde-fou si onend ne vient jamais
  synth.speak(u);
}

// Dit une réplique : inspiration haletante, morceaux de phrase entrecoupés de souffles et de sanglots, puis halètement
export function say(line, s = 0) {
  if (!synth || busy) return false;
  if (!voice) pickVoice();
  const opts = LINES[line].filter(v => v.join() !== lastLine), v = opts[Math.random() * opts.length | 0];
  lastLine = v.join(); lastAt[line] = performance.now(); stress = s; busy = true; A.duck(true);
  queue = [{ breath: 'in', g: .5 }, { breath: 'out', g: .3, pause: .02 }, { breath: 'in', g: .55 }];
  v.forEach((chunk, i) => {
    queue.push({ say: chunk });
    if (i < v.length - 1) queue.push(Math.random() < .5 ? { breath: 'sob', g: .45 } : { breath: 'in', g: .5 });
  });
  const pants = 2 + (s * 3 | 0);
  for (let i = 0; i < pants; i++) queue.push({ breath: 'in', g: .35 + s * .2, pause: .01 }, { breath: 'out', g: .25 + s * .15, pause: .03 });
  next();
  return true;
}
export function since(line) { return lastAt[line] ? (performance.now() - lastAt[line]) / 1000 : 1e9; }
export function isBusy() { return busy; }
export function stop() { queue = []; clearTimeout(timer); if (synth) synth.cancel(); busy = false; A.duck(false); }
// Diagnostic : -1 = synthèse absente du navigateur (ex. navigateur intégré d'une app), 0 = aucune voix française
export function voiceCount() { return synth ? synth.getVoices().filter(v => /^fr/i.test(v.lang)).length : -1; }
export function voiceName() { return voice ? voice.name : '—'; }
