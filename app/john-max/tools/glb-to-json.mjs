// GLB -> { "glb": "<base64>" } pour les hébergeurs qui ne servent pas .glb.
// Le jeu décode le base64 en mémoire et parse le GLB : aucune URL data: à charger (souvent bloquées par CSP).
import fs from 'node:fs'; import path from 'node:path';
const [src, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(src).filter((f) => f.endsWith('.glb'))) {
  const dst = path.join(out, f.replace('.glb', '.json'));
  fs.writeFileSync(dst, JSON.stringify({ glb: fs.readFileSync(path.join(src, f)).toString('base64') }));
  console.log(f, '->', fs.statSync(dst).size);
}
