import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// Charge les personnages, coiffures et animations (GLB compressés meshopt).
const FILES = {
  male: 'assets/chars/male.glb',
  female: 'assets/chars/female.glb',
  hair_buzzed: 'assets/chars/hair_buzzed.glb',
  hair_beard: 'assets/chars/hair_beard.glb',
  hair_simpleparted: 'assets/chars/hair_simpleparted.glb',
  hair_long: 'assets/chars/hair_long.glb',
  anims_ual1: 'assets/chars/anims_ual1.glb',
  anims_ual2: 'assets/chars/anims_ual2.glb',
};

export async function loadLibrary(onProgress) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const keys = Object.keys(FILES);
  let done = 0;
  const lib = { clips: {} };
  // Certains hébergeurs ne servent pas .glb : repli sur une copie { glb: base64 } de même nom (.json),
  // décodée en mémoire. Les images passent par <img> (blob:) plutôt que fetch, souvent bloqué par CSP.
  const fromJson = async (url) => {
    const { glb } = await (await fetch(url.replace(/\.glb$/, '.json'))).json();
    const bytes = Uint8Array.from(atob(glb), (c) => c.charCodeAt(0));
    const saved = window.createImageBitmap;
    window.createImageBitmap = undefined; // GLTFLoader choisit alors TextureLoader (le choix se fait à la construction du parseur)
    const p = loader.parseAsync(bytes.buffer, '');
    window.createImageBitmap = saved;
    return p;
  };
  const load = (url) => loader.loadAsync(url).catch(() => fromJson(url));
  await Promise.all(keys.map(async (k) => {
    const gltf = await load(FILES[k]);
    lib[k] = gltf;
    for (const c of gltf.animations) lib.clips[c.name] = c;
    onProgress && onProgress(++done / keys.length);
  }));
  // Garde = 1re frame du jab, dans une action à part pour pouvoir fondre jab → garde
  lib.clips.Guard = lib.clips.Punch_Jab.clone();
  lib.clips.Guard.name = 'Guard';
  return lib;
}
