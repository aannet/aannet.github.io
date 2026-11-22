// Rendu : renderer, caméra isométrique orthographique, post-process (basse résolution, grain,
// aberration chromatique, désaturation sauf rouge, letterbox, pulsation cardiaque) et atmosphère
// volumétrique : poussière / fumée intégrées le long du rayon de vue, éclairées par la torche.
// Coût maîtrisé : passe unique en basse résolution, 7 pas, sortie anticipée hors des zones.
import * as THREE from 'three';

export const canvas = document.getElementById('c');
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
export const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 120);
export const OFF = new THREE.Vector3(1, 1.35, 1).normalize().multiplyScalar(40);
export const R = new THREE.Vector2(1, -1).normalize();   // droite écran -> monde (x,z)
export const U = new THREE.Vector2(-1, -1).normalize();  // haut écran -> monde (x,z)

export function screenToWorld(dx, dy) {
  const x = R.x * dx - U.x * dy, z = R.y * dx - U.y * dy, l = Math.hypot(x, z) || 1;
  return { x: x / l, z: z / l };
}

const rt = new THREE.WebGLRenderTarget(1, 1, { depthTexture: new THREE.DepthTexture(1, 1) });
// Bruit 64x64 filtré, échantillonné en 2 octaves : moins cher qu'un bruit calculé dans le shader
const nzData = new Uint8Array(64 * 64 * 4); for (let i = 0; i < nzData.length; i++) nzData[i] = Math.random() * 255;
const noiseTex = new THREE.DataTexture(nzData, 64, 64, THREE.RGBAFormat);
noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping; noiseTex.magFilter = noiseTex.minFilter = THREE.LinearFilter; noiseTex.needsUpdate = true;
const blank = new THREE.DataTexture(new Uint8Array(4), 1, 1); blank.needsUpdate = true;
export const post = new THREE.ShaderMaterial({
  uniforms: {
    t: { value: rt.texture }, time: { value: 0 }, fear: { value: 0 }, flash: { value: 0 },
    beat: { value: 0 }, stress: { value: 0 }, bars: { value: .07 }, res: { value: new THREE.Vector2(1, 1) },
    dep: { value: rt.depthTexture }, atm: { value: blank }, nz: { value: noiseTex }, hasAtm: { value: 0 },
    grid: { value: new THREE.Vector2(1, 1) }, tileS: { value: 2 }, projInv: { value: cam.projectionMatrixInverse }, camW: { value: cam.matrixWorld },
    camDir: { value: new THREE.Vector3(0, -1, 0) }, torchP: { value: new THREE.Vector3() }, torchD: { value: new THREE.Vector3(1, 0, 0) }, torchOn: { value: 1 },
    plP: { value: new THREE.Vector3() }, dustC: { value: new THREE.Color(.55, .5, .42) }, smokeC: { value: new THREE.Color(.5, .53, .56) }
  },
  vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,
  fragmentShader: `uniform sampler2D t;uniform float time,fear,flash,bars,beat,stress;uniform vec2 res;varying vec2 vUv;
  uniform sampler2D dep,atm,nz;uniform vec2 grid;uniform float tileS,torchOn,hasAtm;uniform mat4 projInv,camW;
  uniform vec3 camDir,torchP,torchD,plP,dustC,smokeC;
  vec2 atmAt(vec2 xz){return texture2D(atm,(xz/tileS+.5)/grid).rg;}
  float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
  void main(){
    vec2 uv=vUv;
    float band=step(.992-flash*.3-fear*.01,h(vec2(floor(uv.y*48.),floor(time*24.))));
    uv.x+=band*(h(vec2(time,uv.y))-.5)*.05*(.4+flash);
    vec2 d=uv-.5;float k=.004+fear*.012+flash*.025;
    vec3 c=vec3(texture2D(t,uv+d*k).r,texture2D(t,uv).g,texture2D(t,uv-d*k).b);
    if(hasAtm>.5){
      float dz=texture2D(dep,vUv).r;
      if(dz<1.){
        vec4 vp=projInv*vec4(vUv*2.-1.,dz*2.-1.,1.);vp/=vp.w;vec3 P=(camW*vp).xyz;
        float top=2.6;
        if(P.y<top){
          float tl=(top-P.y)/max(-camDir.y,.05);vec3 E=P-camDir*tl;
          vec2 aE=atmAt(E.xz),aP=atmAt(P.xz),aM=atmAt((E.xz+P.xz)*.5);
          if(aE.r+aE.g+aP.r+aP.g+aM.r+aM.g>.003){
            float stp=tl/7.,T=1.,j=h(vUv*res+fract(time));vec3 L=vec3(0.);
            for(int i=0;i<7;i++){
              vec3 s=E+camDir*stp*(float(i)+j);
              vec2 a=atmAt(s.xz);
              float n=texture2D(nz,s.xz*.09+vec2(time*.02,time*.013)+s.y*.05).r*.65+texture2D(nz,s.xz*.27-vec2(time*.05,time*.02)).r*.35;
              float dd=a.r*(.5+n)*.12,ds=a.g*(.15+n*1.7)*smoothstep(2.6,.3,s.y)*.9,sg=dd+ds;
              if(sg<1e-4)continue;
              vec3 v=s-torchP;float dist=length(v);
              float beam=torchOn*smoothstep(.868,.959,dot(v/dist,torchD))/(1.+dist*dist*.06);
              vec3 q=s-plP;float glow=torchOn*.45/(1.+dot(q,q)*1.2);
              vec3 col=(dd*dustC+ds*smokeC)/sg;
              float a2=exp(-sg*stp);
              L+=T*(1.-a2)*col*(.012+beam*3.+glow);T*=a2;
            }
            c=c*T+L;
          }
        }
      }
    }
    float l=dot(c,vec3(.299,.587,.114));
    float rd=clamp((c.r-max(c.g,c.b))*4.5,0.,1.);
    c=mix(l*vec3(.86,.95,1.08),c,max(rd,.14));
    c=pow(max(c,0.),vec3(1./2.2));
    c=(c-.5)*1.15+.5;
    c*=1.-smoothstep(.32-fear*.12,.9,length(d*vec2(res.x/res.y,1.)*.9));
    c+=(h(uv*res+fract(time)*91.7)-.5)*(.1+fear*.07);
    float ed=length(d*vec2(res.x/res.y,1.)*.9);
    float pul=beat*(.25+stress*.75);
    c*=1.-smoothstep(.5-pul*.22,.95,ed)*pul*.9;
    c=mix(c,vec3(.62,0.,.03),smoothstep(.3-pul*.15,.85,ed)*min(1.,pul*1.1));
    c=mix(c,vec3(.45,0.,.01),flash*.3);
    if(vUv.y<bars||vUv.y>1.-bars)c=vec3(0.);
    gl_FragColor=vec4(max(c,0.),1.);
  }`
});
const postScene = new THREE.Scene(), postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post));

export function resize() {
  const w = innerWidth, h = innerHeight, a = w / h;
  renderer.setSize(w, h, false);
  const sc = Math.min(devicePixelRatio || 1, 2) * .55;
  rt.setSize(Math.max(1, w * sc | 0), Math.max(1, h * sc | 0));
  post.uniforms.res.value.set(w, h);
  const hh = a < 1 ? 10 : 7;
  cam.left = -hh * a; cam.right = hh * a; cam.top = hh; cam.bottom = -hh; cam.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

export function setAtmos(a, cols, rows, S, dustC, smokeC) {
  const u = post.uniforms; u.atm.value = a; u.grid.value.set(cols, rows); u.tileS.value = S; u.hasAtm.value = 1;
  if (dustC) u.dustC.value.set(dustC); if (smokeC) u.smokeC.value.set(smokeC);
}
const _d = new THREE.Vector3();
export function setTorch(pos, target, on, player) {
  const u = post.uniforms; u.torchP.value.copy(pos); u.torchD.value.copy(_d.copy(target).sub(pos).normalize()); u.torchOn.value = typeof on === 'number' ? on : (on ? 1 : 0);
  u.plP.value.copy(player); cam.getWorldDirection(u.camDir.value);
}
export const stats = { calls: 0, tris: 0 };
export function render() {
  renderer.setRenderTarget(rt); renderer.render(scene, cam);
  stats.calls = renderer.info.render.calls; stats.tris = renderer.info.render.triangles;
  renderer.setRenderTarget(null); renderer.render(postScene, postCam);
}
