// Construit assets/soldier.glb à partir des bibliothèques d'animation Quaternius (CC0 1.0).
// Sources (non versionnées ici, à placer dans tools/src/) :
//  - UAL1_Standard.glb  « Universal Animation Library » Standard, sha256 69591853d817488edaa8fd9bf8fc1d821eaeaf789f8627b3cd23b41c4ed67997
//    https://quaternius.com/packs/universalanimationlibrary.html (miroir utilisé : github.com/As94tt/WoM, LFS)
//  - UAL2_Standard.glb  « Universal Animation Library 2 » Standard
//    https://quaternius.com/packs/universalanimationlibrary2.html (miroir utilisé : github.com/adharshsivan/animationlibrary)
// Usage : cd tools && npm i @gltf-transform/core@4 @gltf-transform/extensions@4 @gltf-transform/functions@4 meshoptimizer && node build-soldier.mjs
// Résultat : soldier.glb, puis converti en ../assets/soldier.gltf.json (glTF JSON auto-contenu, servable partout).
// Mannequin + 17 clips, pistes de doigts/scale retirées, rééchantillonné, quantifié, compressé meshopt (~320 Ko).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { resample, prune, dedup, quantize, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const A = await io.read('src/UAL1_Standard.glb');
const B = await io.read('src/UAL2_Standard.glb');
const KEEP1 = ['Crouch_Idle_Loop','Crouch_Fwd_Loop','Idle_Loop','Walk_Loop','Jog_Fwd_Loop','Sprint_Loop','Death01','Hit_Chest','Pistol_Idle_Loop','Pistol_Aim_Neutral','Pistol_Shoot','Fixing_Kneeling','Sword_Attack','PickUp_Table'];
const KEEP2 = ['OverhandThrow','Walk_Carry_Loop','Hit_Knockback'];
const ra = A.getRoot();
for (const an of ra.listAnimations()) if (!KEEP1.includes(an.getName())) { for (const c of an.listChannels()) c.dispose(); for (const sm of an.listSamplers()) { const i=sm.getInput(),o=sm.getOutput(); sm.dispose(); } an.dispose(); }
// copier les clips UAL2 sur les nœuds UAL1 (même squelette, mêmes noms)
const byName = new Map(ra.listNodes().map(n => [n.getName(), n]));
const buf = ra.listBuffers()[0];
for (const src of B.getRoot().listAnimations()) {
  if (!KEEP2.includes(src.getName())) continue;
  const an = A.createAnimation(src.getName());
  const cache = new Map();
  const copyAcc = acc => { if (cache.has(acc)) return cache.get(acc); const c = A.createAccessor().setArray(acc.getArray().slice()).setType(acc.getType()).setBuffer(buf); cache.set(acc, c); return c; };
  for (const ch of src.listChannels()) {
    const tgt = byName.get(ch.getTargetNode().getName()); if (!tgt) continue;
    const s = ch.getSampler();
    const ns = A.createAnimationSampler().setInput(copyAcc(s.getInput())).setOutput(copyAcc(s.getOutput())).setInterpolation(s.getInterpolation());
    an.addSampler(ns).addChannel(A.createAnimationChannel().setTargetNode(tgt).setTargetPath(ch.getTargetPath()).setSampler(ns));
  }
}
// retirer les pistes des os « leaf » et de translation inutile (hors bassin/racine)
for (const an of ra.listAnimations()) for (const ch of an.listChannels()) {
  const n = ch.getTargetNode().getName(), p = ch.getTargetPath();
  if (/leaf|index_|middle_|pinky_|ring_|thumb_/.test(n) || p === 'scale' || (p === 'translation' && !['pelvis','root'].includes(n))) { const s = ch.getSampler(); ch.dispose(); s.dispose(); }
}
for (const a of ra.listAccessors()) if (a.listParents().filter(p=>p.propertyType!=='Root').length===0) a.dispose();
await A.transform(resample({tolerance:4e-3}), dedup(), prune(), (doc)=>{for (const a of doc.getRoot().listAccessors()) if (a.listParents().filter(p=>p.propertyType!=='Root').length===0) a.dispose();}, quantize(), meshopt({encoder:MeshoptEncoder, level:'medium'}));
await io.write('soldier.glb', A);
// conversion en glTF JSON auto-contenu (les artifacts claude.ai ne servent pas les .glb)
{const { json, resources } = await io.writeJSON(A, { format: 'gltf' });for (const b of json.buffers || []) if (b.uri && resources[b.uri]) b.uri = 'data:application/octet-stream;base64,' + Buffer.from(resources[b.uri]).toString('base64');(await import('fs')).writeFileSync('../assets/soldier.gltf.json', JSON.stringify(json));}
console.log('clips', ra.listAnimations().map(a => a.getName() + ':' + a.listChannels().length).join(' '));
