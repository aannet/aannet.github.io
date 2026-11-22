// Thèmes : textures générées par code, matériaux partagés par les props, couleurs de lumière.
// Un niveau référence un thème par son nom ; un nouveau thème réutilise le même catalogue de props.
import * as THREE from 'three';

const rnd = Math.random;
function tex(w, draw, rx = 1, ry = rx) {
  const c = document.createElement('canvas'); c.width = c.height = w;
  const g = c.getContext('2d'); draw(g, w);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
const std = (o) => new THREE.MeshStandardMaterial(o);

export const THEMES = {
  asile: () => ({
    wallH: 1.5,
    hemi: [0x7a8ca0, 0x1a1414, .35],
    torch: 0xfff0d8,
    neon: 0xcfe6ff,
    exit: 0xff1a10,
    dust: 0x8c806b,
    smoke: 0x7f878f,
    floorTex: (cols, rows) => tex(512, (g, w) => {
      g.fillStyle = '#6b665f'; g.fillRect(0, 0, w, w);
      for (let i = 0; i < 9000; i++) { const v = rnd() * 50 | 0; g.fillStyle = `rgba(${v},${v},${v},${rnd() * .3})`; g.fillRect(rnd() * w, rnd() * w, 2, 2); }
      for (let i = 0; i < 16; i++) { const x = rnd() * w, y = rnd() * w, r = 20 + rnd() * 90, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(12,9,7,.4)'); gr.addColorStop(1, 'rgba(12,9,7,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
      g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 3;
      for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * w / 4, 0); g.lineTo(i * w / 4, w); g.moveTo(0, i * w / 4); g.lineTo(w, i * w / 4); g.stroke(); }
      g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 1;
      for (let i = 0; i < 7; i++) { let x = rnd() * w, y = rnd() * w; g.beginPath(); g.moveTo(x, y); for (let j = 0; j < 9; j++) { x += (rnd() - .5) * 44; y += (rnd() - .5) * 44; g.lineTo(x, y); } g.stroke(); }
    }, cols / 2, rows / 2),
    wallTex: () => tex(256, (g, w) => {
      g.fillStyle = '#77726a'; g.fillRect(0, 0, w, w);
      for (let i = 0; i < 5000; i++) { const v = rnd() * 60 | 0; g.fillStyle = `rgba(${v},${v},${v},${rnd() * .25})`; g.fillRect(rnd() * w, rnd() * w, 2, 2); }
      for (let i = 0; i < 34; i++) { const x = rnd() * w, ww = 2 + rnd() * 12, hh = w * (.2 + rnd() * .8), gr = g.createLinearGradient(0, 0, 0, hh); gr.addColorStop(0, 'rgba(15,12,10,.55)'); gr.addColorStop(1, 'rgba(15,12,10,0)'); g.fillStyle = gr; g.fillRect(x, 0, ww, hh); }
      const b = g.createLinearGradient(0, w * .6, 0, w); b.addColorStop(0, 'rgba(0,0,0,0)'); b.addColorStop(1, 'rgba(0,0,0,.6)'); g.fillStyle = b; g.fillRect(0, 0, w, w);
    }),
    splatTex: () => tex(256, (g, w) => {
      g.fillStyle = 'rgba(98,6,8,.92)';
      for (let i = 0; i < 70; i++) { const a = rnd() * 6.28, d = rnd() ** 2 * 85, r = Math.max(2, 4 + rnd() * (26 - d / 4)); g.beginPath(); g.arc(w / 2 + Math.cos(a) * d, w / 2 + Math.sin(a) * d, r, 0, 7); g.fill(); }
      for (let i = 0; i < 30; i++) { const a = rnd() * 6.28, d = 60 + rnd() * 60; g.beginPath(); g.arc(w / 2 + Math.cos(a) * d, w / 2 + Math.sin(a) * d, 1 + rnd() * 3, 0, 7); g.fill(); }
    }),
    // Matériaux partagés par tout le catalogue de props (clé -> matériau)
    mats: () => {
      const sheet = tex(128, (g, w) => {
        g.fillStyle = '#bdb8ac'; g.fillRect(0, 0, w, w);
        for (let i = 0; i < 1500; i++) { const v = 120 + rnd() * 60 | 0; g.fillStyle = `rgba(${v},${v - 6},${v - 14},.25)`; g.fillRect(rnd() * w, rnd() * w, 2, 2); }
        for (let i = 0; i < 3; i++) { const x = rnd() * w, y = rnd() * w, r = 6 + rnd() * 18, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(110,40,20,.5)'); gr.addColorStop(1, 'rgba(110,40,20,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
      });
      return {
        metal: std({ color: 0x8a8d8f, metalness: .6, roughness: .45 }),
        rust: std({ color: 0x6e5a4a, metalness: .4, roughness: .8 }),
        paint: std({ color: 0x6f7a6c, roughness: .7 }),
        paintDark: std({ color: 0x4e574c, roughness: .75 }),
        fabric: std({ map: sheet, roughness: .95 }),
        curtain: std({ color: 0x9aa5a0, roughness: .9, side: THREE.DoubleSide }),
        wood: std({ color: 0x6b5238, roughness: .8 }),
        woodDark: std({ color: 0x3f2f20, roughness: .85 }),
        dark: std({ color: 0x1b1c1e, roughness: .6 }),
        rubber: std({ color: 0x111111, roughness: .9 }),
        glass: std({ color: 0x223035, roughness: .1, metalness: .3 }),
        red: std({ color: 0x8a0a0a, roughness: .5 }),
        glow: new THREE.MeshBasicMaterial({ color: 0xdff2ff }),
        water: std({ color: 0x0a0d10, roughness: .04, metalness: .3, transparent: true, opacity: .85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
        screen: std({ color: 0x0b0f12, emissive: 0x6a7d88, emissiveIntensity: .5 })
      };
    }
  })
};

// Sous-sol : béton noirci et détrempé, murs de briques, lumière de sodium. Réutilise les matériaux de l'asile.
THEMES['sous-sol'] = () => {
  const a = THEMES.asile();
  return {
    ...a,
    wallH: 1.6,
    hemi: [0x6a6f78, 0x120e0c, .28],
    neon: 0xffc88a,
    dust: 0x7a7468,
    smoke: 0x8a9096,
    floorTex: (cols, rows) => tex(512, (g, w) => {
      g.fillStyle = '#4c4a47'; g.fillRect(0, 0, w, w);
      for (let i = 0; i < 12000; i++) { const v = rnd() * 40 | 0; g.fillStyle = `rgba(${v},${v},${v},${rnd() * .35})`; g.fillRect(rnd() * w, rnd() * w, 2, 2); }
      for (let i = 0; i < 22; i++) { const x = rnd() * w, y = rnd() * w, r = 15 + rnd() * 70, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(5,6,8,.55)'); gr.addColorStop(1, 'rgba(5,6,8,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
      g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 2;
      for (let i = 0; i <= 2; i++) { g.beginPath(); g.moveTo(i * w / 2, 0); g.lineTo(i * w / 2, w); g.moveTo(0, i * w / 2); g.lineTo(w, i * w / 2); g.stroke(); }
      g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 1;
      for (let i = 0; i < 12; i++) { let x = rnd() * w, y = rnd() * w; g.beginPath(); g.moveTo(x, y); for (let j = 0; j < 10; j++) { x += (rnd() - .5) * 50; y += (rnd() - .5) * 50; g.lineTo(x, y); } g.stroke(); }
    }, cols / 2, rows / 2),
    wallTex: () => tex(256, (g, w) => {
      g.fillStyle = '#3b3430'; g.fillRect(0, 0, w, w);
      const bh = w / 10, bw = w / 4;
      for (let r = 0; r < 10; r++) for (let c = -1; c < 5; c++) {
        const x = c * bw + (r % 2) * bw / 2, v = 75 + rnd() * 30 | 0;
        g.fillStyle = `rgb(${v + 12},${v},${v - 8})`; g.fillRect(x + 2, r * bh + 2, bw - 4, bh - 4);
      }
      for (let i = 0; i < 4000; i++) { const v = rnd() * 50 | 0; g.fillStyle = `rgba(${v},${v},${v},${rnd() * .3})`; g.fillRect(rnd() * w, rnd() * w, 2, 2); }
      for (let i = 0; i < 26; i++) { const x = rnd() * w, ww = 3 + rnd() * 14, hh = w * (.3 + rnd() * .7), gr = g.createLinearGradient(0, 0, 0, hh); gr.addColorStop(0, 'rgba(10,9,8,.6)'); gr.addColorStop(1, 'rgba(10,9,8,0)'); g.fillStyle = gr; g.fillRect(x, 0, ww, hh); }
      const b = g.createLinearGradient(0, w * .55, 0, w); b.addColorStop(0, 'rgba(0,0,0,0)'); b.addColorStop(1, 'rgba(0,0,0,.7)'); g.fillStyle = b; g.fillRect(0, 0, w, w);
    })
  };
};
