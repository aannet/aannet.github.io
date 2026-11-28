import * as THREE from 'three';

// Briques du rendu toon partagées par le décor et les objets.
let gradientMap = null;
export function toonGradient() {
  if (gradientMap) return gradientMap;
  const data = new Uint8Array([70, 70, 70, 255, 160, 160, 160, 255, 255, 255, 255, 255]);
  gradientMap = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  gradientMap.minFilter = gradientMap.magFilter = THREE.NearestFilter;
  gradientMap.needsUpdate = true;
  return gradientMap;
}

// Contour par inverted hull pour les meshes statiques : géométrie gonflée le long des normales, faces arrière.
const outlineMat = new THREE.ShaderMaterial({
  uniforms: { t: { value: 0.018 } },
  vertexShader: `uniform float t;
    void main(){ vec3 p = position + normal * t;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
  fragmentShader: `void main(){ gl_FragColor = vec4(0.05, 0.03, 0.06, 1.0); }`,
  side: THREE.BackSide,
});

export function toonMesh(geo, mat, parent, outline = true) {
  const m = new THREE.Mesh(geo, mat);
  parent.add(m);
  if (outline) m.add(new THREE.Mesh(geo, outlineMat));
  return m;
}
