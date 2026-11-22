// Catalogue de props, indépendant du niveau et du thème.
// Chaque entrée décrit ce que le prop FAIT en jeu, puis comment il se construit.
//   solid   : bloque le passage (collisions joueur + pathfinding de la créature)
//   opaque  : bloque la ligne de vue (la créature peut s'y cacher)
//   shadow  : projette une ombre sous la torche
//   place   : 'wall' (dos au mur), 'free' (rotation aléatoire), 'door' (dans une ouverture)
//   size    : emprise au sol [largeur x, profondeur z] en unités monde (1 case = 2)
//   light   : lumière émise (pool partagé, sans ombre)
//   behave  : comportement animé (voir behaviours.js) · pushable : la créature peut le déplacer
//   parts() : liste de pièces {geo, mat}, en repère local (dos du prop vers -z)
import * as THREE from 'three';

const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const C = (rt, rb, h, s = 8) => new THREE.CylinderGeometry(rt, rb, h, s);
const T = (r, t, rs = 6, ts = 16) => new THREE.TorusGeometry(r, t, rs, ts);
const E = new THREE.Euler(), M = new THREE.Matrix4();
function P(geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  if (rx || ry || rz) { E.set(rx, ry, rz); geo.applyMatrix4(M.makeRotationFromEuler(E)); }
  geo.translate(x, y, z);
  return { geo, mat };
}
const legs = (mat, w, d, h, r = .02) => [-1, 1].flatMap(sx => [-1, 1].map(sz => P(C(r, r, h, 6), mat, sx * w, h / 2, sz * d)));

export const PROPS = {
  bed: {
    label: 'Lit d\'hôpital', solid: true, opaque: false, shadow: true, place: 'wall', size: [1, 1.95],
    parts: () => [
      P(B(.95, .1, 1.9), 'metal', 0, .45, 0),
      P(B(.88, .16, 1.78), 'fabric', 0, .58, .03, 0, 0, .02),
      P(B(.5, .08, .3), 'fabric', 0, .7, -.68, .15),
      P(B(.95, .7, .04), 'metal', 0, .55, -.93),
      P(B(.95, .4, .04), 'metal', 0, .45, .93),
      P(B(.03, .03, 1.2), 'metal', .48, .72, .2),
      ...legs('metal', .44, .88, .45)
    ]
  },
  locker: {
    label: 'Armoire', solid: true, opaque: true, shadow: true, place: 'wall', size: [.95, .6],
    parts: () => [
      P(B(.9, 1.9, .55), 'paint', 0, .95, 0),
      P(B(.42, 1.72, .03), 'paintDark', -.22, .95, .28),
      P(B(.42, 1.72, .03), 'paintDark', .25, .95, .34, 0, -.35),
      P(B(.03, .14, .04), 'metal', -.05, 1.0, .31),
      ...[0, 1, 2].map(i => P(B(.3, .02, .02), 'dark', -.22, 1.65 - i * .06, .3)),
      P(B(.5, .3, .4), 'woodDark', .1, 2.05, -.02, 0, .2)
    ]
  },
  screen: {
    label: 'Paravent', solid: true, opaque: true, shadow: true, place: 'free', size: [1.75, .45],
    parts: () => [-1, 0, 1].flatMap(i => {
      const x = i * .56, ry = i === 0 ? .32 : -.32, z = i === 0 ? .08 : -.08;
      return [P(B(.56, 1.6, .04), 'metal', x, .9, z, 0, ry), P(B(.5, 1.36, .05), 'curtain', x, .92, z, 0, ry),
        P(C(.03, .03, .06, 6), 'rubber', x, .03, z)];
    })
  },
  cart: {
    label: 'Chariot de soins', solid: true, pushable: true, opaque: false, shadow: true, place: 'free', size: [.65, 1.05],
    parts: () => [
      P(B(.6, .04, 1), 'metal', 0, .9, 0), P(B(.6, .03, 1), 'metal', 0, .42, 0),
      ...legs('metal', .27, .47, .9, .015),
      P(B(.2, .12, .3), 'dark', -.1, .98, -.2), P(C(.04, .04, .22), 'glass', .15, 1.03, .2),
      P(C(.03, .03, .16), 'red', .05, 1.0, .3), P(B(.4, .15, .3), 'fabric', 0, .52, .1, 0, .3)
    ]
  },
  chair: {
    label: 'Chaise', solid: true, pushable: true, opaque: false, shadow: true, place: 'free', size: [.55, .55],
    parts: () => [
      P(B(.45, .05, .45), 'wood', 0, .45, 0), P(B(.45, .42, .04), 'wood', 0, .7, -.21, -.08),
      ...legs('metal', .2, .2, .45, .018)
    ]
  },
  wheelchair: {
    label: 'Fauteuil roulant', solid: true, pushable: true, opaque: false, shadow: true, place: 'free', size: [.75, .9],
    parts: () => [
      P(B(.5, .05, .45), 'fabric', 0, .5, 0), P(B(.5, .45, .04), 'fabric', 0, .78, -.24, -.12),
      ...[-1, 1].flatMap(s => [P(T(.3, .022, 6, 20), 'rubber', s * .3, .32, -.05, 0, Math.PI / 2),
        P(T(.07, .02, 5, 10), 'rubber', s * .2, .08, .32, 0, Math.PI / 2),
        P(C(.015, .015, .6, 5), 'metal', s * .26, .62, -.24), P(B(.03, .03, .45), 'metal', s * .26, .7, .0)])
    ]
  },
  tv: {
    label: 'Télévision', solid: true, opaque: false, shadow: true, place: 'wall', size: [.75, .55],
    behave: 'static', light: { y: .95, intensity: 2.5, distance: 3.8 },
    parts: () => [
      P(B(.65, .7, .45), 'wood', 0, .35, 0), P(B(.6, .46, .45), 'dark', 0, .93, 0),
      P(B(.5, .36, .02), 'screen', 0, .93, .23),
      P(C(.006, .006, .45, 4), 'metal', -.1, 1.35, 0, 0, 0, .5), P(C(.006, .006, .45, 4), 'metal', .1, 1.35, 0, 0, 0, -.5)
    ]
  },
  crate: {
    label: 'Caisse', solid: true, opaque: false, shadow: true, place: 'free', size: [1, 1],
    parts: () => [
      P(B(.9, .8, .9), 'wood', 0, .4, 0), P(B(.93, .08, .93), 'woodDark', 0, .15, 0), P(B(.93, .08, .93), 'woodDark', 0, .65, 0),
      P(B(.5, .4, .5), 'wood', .1, 1.0, -.05, 0, .45)
    ]
  },
  pipe: {
    label: 'Tuyauterie', solid: false, opaque: false, shadow: true, place: 'wall', size: [1.9, .3],
    parts: () => [
      P(C(.06, .06, 1.95, 8), 'rust', 0, 1.15, 0, 0, 0, Math.PI / 2),
      P(C(.04, .04, 1.95, 8), 'rust', 0, 1.33, .02, 0, 0, Math.PI / 2),
      P(C(.05, .05, 1.15, 8), 'rust', .6, .57, 0), P(new THREE.SphereGeometry(.07, 8, 6), 'rust', .6, 1.15, 0),
      P(T(.09, .018, 5, 12), 'red', .6, .8, .08)
    ]
  },
  curtain: {
    label: 'Rideau d\'hôpital', solid: false, opaque: true, shadow: true, place: 'free', size: [1.9, .25],
    parts: () => {
      const cloth = new THREE.PlaneGeometry(1.85, 1.7, 24, 1), p = cloth.attributes.position;
      for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 9) * .06);
      cloth.computeVertexNormals();
      return [P(cloth, 'curtain', 0, 1.1, 0), P(B(1.95, .03, .03), 'metal', 0, 2.0, 0),
        P(C(.015, .015, 2, 5), 'metal', -.97, 1, 0), P(C(.015, .015, 2, 5), 'metal', .97, 1, 0)];
    }
  },
  neon: {
    label: 'Néon suspendu', solid: false, opaque: false, shadow: false, place: 'free', size: [0, 0],
    light: { y: 2.15, intensity: 9, distance: 7 }, behave: 'flicker',
    parts: () => [
      P(C(.005, .005, .9, 3), 'dark', -.5, 2.75, 0), P(C(.005, .005, .9, 3), 'dark', .5, 2.75, 0),
      P(B(1.2, .06, .18), 'metal', 0, 2.3, 0),
      P(C(.03, .03, 1.1, 6), 'glow', 0, 2.25, 0, 0, 0, Math.PI / 2)
    ]
  },
  drip: {
    label: 'Fuite d\'eau', solid: false, opaque: false, shadow: false, place: 'free', size: [0, 0], behave: 'drip',
    parts: () => [P(new THREE.CircleGeometry(.55, 20), 'water', 0, .012, 0, -Math.PI / 2), P(new THREE.CircleGeometry(.3, 14), 'water', .4, .013, .25, -Math.PI / 2)]
  },
  door: {
    label: 'Porte entrouverte', solid: false, opaque: false, shadow: true, place: 'door', size: [0, 0], behave: 'swing',
    parts: () => {
      const leaf = B(1.75, 1.45, .06); leaf.translate(-.875, .73, 0);
      const win = B(.32, .42, .07); win.translate(-1.3, 1.05, 0);
      const knob = B(.04, .04, .14); knob.translate(-1.6, .7, 0);
      return [P(leaf, 'paint', .95, 0, 0, 0, 1.15), P(win, 'glass', .95, 0, 0, 0, 1.15), P(knob, 'metal', .95, 0, 0, 0, 1.15)];
    }
  }
};
