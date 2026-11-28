// Prépare les assets Quaternius pour le web : textures réduites, maps inutiles au toon retirées,
// géométrie quantifiée + compressée meshopt, clips d'animation triés.
// Usage : node convert.mjs <dossier UBC> <glb UAL1> <glb UAL2> <dossier de sortie>
// UAL1 : utiliser le FBX « Unreal Engine » converti par FBX2glTF (le GLB Godot a un rig Rigify incompatible).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, resample, quantize, meshopt, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import path from 'node:path';

const [ubc, ual1, ual2, out] = process.argv.slice(2);
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

async function stripMaps(doc) {
  for (const m of doc.getRoot().listMaterials()) {
    m.setNormalTexture(null).setMetallicRoughnessTexture(null).setOcclusionTexture(null);
    m.setMetallicFactor(0).setRoughnessFactor(1);
  }
}

async function finish(doc, file, texSize) {
  await doc.transform(
    prune(), dedup(), weld(),
    ...(texSize ? [textureCompress({ encoder: sharp, targetFormat: 'jpeg', resize: [texSize, texSize], quality: 80 })] : []),
    quantize(), meshopt({ encoder: MeshoptEncoder, level: 'high' })
  );
  await io.write(path.join(out, file), doc);
  console.log('wrote', file);
}

// Personnages
for (const [src, dst] of [['Superhero_Male_FullBody.gltf', 'male.glb'], ['Superhero_Female_FullBody.gltf', 'female.glb']]) {
  const doc = await io.read(path.join(ubc, 'Base Characters/Godot - UE', src));
  await stripMaps(doc);
  await finish(doc, dst, 512);
}

// Coiffures (statiques, origine au corps : rattachées à l'os de la tête au chargement)
for (const h of ['Hair_Buzzed', 'Hair_Beard', 'Hair_SimpleParted', 'Hair_Long']) {
  const doc = await io.read(path.join(ubc, 'Hairstyles/Origin at 0/glTF (Godot)', h + '.gltf'));
  await stripMaps(doc);
  for (const m of doc.getRoot().listMaterials()) m.setBaseColorTexture(null); // teinte unie au chargement
  await finish(doc, h.toLowerCase() + '.glb', 0);
}

// Animations : uniquement les clips utiles, sans le mannequin
// FBX Unreal (UAL1) : le nœud « Rig » porte échelle ×100 et rotation -90° X, alors que le personnage
// porte cette rotation sur l'os « root » et des translations en mètres. On reporte l'un sur l'autre.
function bakeRig(root) {
  const rig = root.listNodes().find((n) => n.getName() === 'Rig');
  if (!rig) return;
  const [qx, qy, qz, qw] = rig.getRotation(), k = rig.getScale()[0];
  const rot = (x, y, z) => { // v' = q v q*
    const ix = qw * x + qy * z - qz * y, iy = qw * y + qz * x - qx * z, iz = qw * z + qx * y - qy * x, iw = -qx * x - qy * y - qz * z;
    return [ix * qw + iw * -qx + iy * -qz - iz * -qy, iy * qw + iw * -qy + iz * -qx - ix * -qz, iz * qw + iw * -qz + ix * -qy - iy * -qx];
  };
  const done = new Set();
  for (const a of root.listAnimations()) for (const ch of a.listChannels()) {
    const node = ch.getTargetNode(), out = ch.getSampler().getOutput();
    if (!node || done.has(out)) continue;
    done.add(out);
    const arr = out.getArray().slice(), isRoot = node.getName() === 'root';
    if (ch.getTargetPath() === 'translation') {
      for (let i = 0; i < arr.length; i += 3) {
        let v = [arr[i] * k, arr[i + 1] * k, arr[i + 2] * k];
        if (isRoot) v = rot(...v);
        arr.set(v, i);
      }
    } else if (ch.getTargetPath() === 'rotation' && isRoot) {
      for (let i = 0; i < arr.length; i += 4) { // q' = qRig * q
        const [x, y, z, w] = arr.subarray(i, i + 4);
        arr.set([qw * x + qx * w + qy * z - qz * y, qw * y - qx * z + qy * w + qz * x, qw * z + qx * y - qy * x + qz * w, qw * w - qx * x - qy * y - qz * z], i);
      }
    }
    out.setArray(arr);
  }
}

async function anims(src, keep, file) {
  const doc = await io.read(src);
  const root = doc.getRoot();
  bakeRig(root);
  for (const a of root.listAnimations()) {
    a.setName(a.getName().replace(/^.*\|/, '')); // FBX2glTF préfixe « Rig| »
    if (!keep.has(a.getName())) a.dispose();
  }
  for (const n of root.listNodes()) if (n.getMesh()) { n.getMesh().dispose(); n.setMesh(null); n.setSkin(null); }
  for (const m of root.listMaterials()) m.dispose();
  await doc.transform(resample({ tolerance: 0.0005 }), prune({ keepLeaves: true }), dedup(), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
  await io.write(path.join(out, file), doc);
  console.log('wrote', file, root.listAnimations().length, 'clips');
}
const KEEP1 = new Set([
  'Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Punch_Jab', 'Punch_Cross', 'Hit_Chest', 'Hit_Head',
  'Death01', 'Roll', 'Jump_Start', 'Jump_Loop', 'Jump_Land', 'Sword_Idle',
]);
await anims(ual1, KEEP1, 'anims_ual1.glb');
const KEEP = new Set([
  'Melee_Hook', 'Melee_Hook_Rec', 'Hit_Knockback', 'LayToIdle', 'Idle_Shield_Break',
  'OverhandThrow', 'Walk_Carry_Loop',
  'Sword_Regular_A', 'Sword_Regular_A_Rec', 'Sword_Regular_B', 'Sword_Regular_B_Rec', 'Sword_Regular_C',
]);
await anims(ual2, KEEP, 'anims_ual2.glb');
