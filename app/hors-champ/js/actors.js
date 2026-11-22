// Acteurs : lumières du joueur (torche, halo), clé, trappe de sortie. Les corps sont dans characters.js.
import * as THREE from 'three';

export function makeActors(scene, theme, spawn) {
    const torch = new THREE.SpotLight(theme.torch, 60, 20, .52, .45, 1.1);
  torch.castShadow = true; torch.shadow.mapSize.set(1024, 1024); torch.shadow.camera.near = .2; torch.shadow.normalBias = .03;
  scene.add(torch, torch.target);
  const glow = new THREE.PointLight(0xffd9a8, 2.2, 3.6, 2); scene.add(glow);

  const key = new THREE.Group();
  const km = new THREE.MeshStandardMaterial({ color: 0xa8925a, metalness: .85, roughness: .3, emissive: 0x2a1d05 });
  const ks = new THREE.Mesh(new THREE.BoxGeometry(.05, .05, .4), km); ks.position.z = .32;
  key.add(new THREE.Mesh(new THREE.TorusGeometry(.14, .04, 8, 16), km), ks); key.rotation.x = -.6; scene.add(key);

  const X = spawn.exit;
  const hatch = new THREE.Mesh(new THREE.BoxGeometry(1.5, .06, 1.5), new THREE.MeshStandardMaterial({ color: 0x200202, emissive: 0x8a0006, emissiveIntensity: .9, roughness: .4 }));
  hatch.position.set(X.x, .03, X.z); scene.add(hatch);
  const exitLight = new THREE.PointLight(theme.exit, 4, 5, 2); exitLight.position.set(X.x, .6, X.z); scene.add(exitLight);

  // Piles de recharge : petit cylindre + LED blanche qui clignote (repérable dans le noir sans éclairer la scène)
  const batMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: .5, metalness: .4 }), capMat = new THREE.MeshStandardMaterial({ color: 0x9a9a9a, metalness: .8, roughness: .3 });
  const batteries = (spawn.batteries || []).map(p => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, .22, 10), batMat); body.position.y = .11;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, .03, 8), capMat); cap.position.y = .235;
    const led = new THREE.Mesh(new THREE.SphereGeometry(.022, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffffff })); led.position.set(0, .17, .06);
    g.add(body, cap, led); g.rotation.z = .25; g.position.set(p.x + .3, 0, p.z - .2); body.castShadow = true; scene.add(g);
    return { g, led, x: g.position.x, z: g.position.z, taken: false };
  });
  return { torch, glow, key, exitLight, batteries };
}
