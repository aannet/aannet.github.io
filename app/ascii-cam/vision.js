/*
 * Vision heuristique pour ASCII CAM.
 *
 * analyze(imageData, seedX, seedY) renvoie :
 *   - mask : Uint8Array (1 = pixel de l'objet touché)
 *   - dist : Float32Array, distance normalisée [0..1] au point touché,
 *            mesurée DANS LE PLAN de l'objet (-1 hors masque)
 *   - quad : les 4 coins utilisés pour estimer le plan
 *   - mode : 'quad' (contour rectangulaire détecté) ou 'texture' (trapèze estimé)
 *
 * Étapes :
 *   1. flou 3x3 + gradient Sobel (barrière de contours)
 *   2. croissance de région depuis le tap (couleur locale + couleur moyenne)
 *   3. ouverture morphologique (coupe les fuites fines) + remplissage des trous
 *   4. plan : enveloppe convexe réduite à 4 coins. Si la forme n'est pas un
 *      quadrilatère, trapèze déduit du gradient de densité de texture
 *      (une texture paraît plus dense quand elle s'éloigne).
 *   5. ratio réel du rectangle (Zhang & He, focale supposée) puis homographie
 *      image -> plan rectifié. Les cercles tracés dans ce plan deviennent des
 *      ellipses en perspective à l'écran.
 */
(function () {
  'use strict';

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------- 1. prétraitement ----------
  function preprocess(img) {
    const { width: w, height: h, data } = img;
    const N = w * h;
    const R = new Float32Array(N), G = new Float32Array(N), B = new Float32Array(N);
    // flou boîte 3x3
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let r = 0, g = 0, b = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy; if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx; if (xx < 0 || xx >= w) continue;
            const i = (yy * w + xx) * 4;
            r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
          }
        }
        const k = y * w + x;
        R[k] = r / n; G[k] = g / n; B[k] = b / n;
      }
    }
    const L = new Float32Array(N);
    for (let k = 0; k < N; k++) L[k] = 0.299 * R[k] + 0.587 * G[k] + 0.114 * B[k];
    // Sobel sur la luminance (image non floutée pour garder les contours nets)
    const raw = new Float32Array(N);
    for (let k = 0; k < N; k++) raw[k] = 0.299 * data[k * 4] + 0.587 * data[k * 4 + 1] + 0.114 * data[k * 4 + 2];
    const E = new Float32Array(N);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const k = y * w + x;
        const gx = -raw[k - w - 1] - 2 * raw[k - 1] - raw[k + w - 1] + raw[k - w + 1] + 2 * raw[k + 1] + raw[k + w + 1];
        const gy = -raw[k - w - 1] - 2 * raw[k - w] - raw[k - w + 1] + raw[k + w - 1] + 2 * raw[k + w] + raw[k + w + 1];
        E[k] = Math.hypot(gx, gy) / 4;
      }
    }
    return { w, h, N, R, G, B, L, E };
  }

  function percentile(arr, p) {
    const s = Float32Array.from(arr).sort();
    return s[Math.floor(clamp(p, 0, 1) * (s.length - 1))];
  }

  // ---------- 2. croissance de région ----------
  function growRegion(P, sx, sy) {
    const { w, h, N, R, G, B, E } = P;
    // déplace la graine sur le pixel le moins "contour" du voisinage 5x5
    let best = sy * w + sx, bestE = Infinity;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const x = sx + dx, y = sy + dy;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const k = y * w + x;
      if (E[k] < bestE) { bestE = E[k]; best = k; }
    }
    const edgeT = Math.max(18, percentile(E, 0.82));
    const LOCAL_T = 14, GLOBAL_T = 46;

    const mask = new Uint8Array(N);
    const queue = new Int32Array(N);
    let qh = 0, qt = 0, count = 1;
    let mr = R[best], mg = G[best], mb = B[best];
    mask[best] = 1; queue[qt++] = best;
    const cap = Math.floor(N * 0.9);

    while (qh < qt && count < cap) {
      const p = queue[qh++];
      const px = p % w, py = (p / w) | 0;
      for (let n = 0; n < 4; n++) {
        let q;
        if (n === 0) { if (px === 0) continue; q = p - 1; }
        else if (n === 1) { if (px === w - 1) continue; q = p + 1; }
        else if (n === 2) { if (py === 0) continue; q = p - w; }
        else { if (py === h - 1) continue; q = p + w; }
        if (mask[q] || E[q] > edgeT) continue;
        const dl = Math.hypot(R[q] - R[p], G[q] - G[p], B[q] - B[p]);
        if (dl > LOCAL_T) continue;
        const dg = Math.hypot(R[q] - mr, G[q] - mg, B[q] - mb);
        if (dg > GLOBAL_T) continue;
        mask[q] = 1; queue[qt++] = q; count++;
        mr += (R[q] - mr) / count; mg += (G[q] - mg) / count; mb += (B[q] - mb) / count;
      }
    }
    return { mask, seed: best };
  }

  // ---------- 3. morphologie ----------
  function erode(m, w, h) {
    const o = new Uint8Array(m.length);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const k = y * w + x;
      o[k] = m[k] & m[k - 1] & m[k + 1] & m[k - w] & m[k + w];
    }
    // les bords de l'image restent dans le masque s'ils y étaient
    for (let x = 0; x < w; x++) { o[x] = m[x] & m[x + w]; o[(h - 1) * w + x] = m[(h - 1) * w + x] & m[(h - 2) * w + x]; }
    for (let y = 0; y < h; y++) { o[y * w] = m[y * w] & m[y * w + 1]; o[y * w + w - 1] = m[y * w + w - 1] & m[y * w + w - 2]; }
    return o;
  }
  function dilate(m, w, h) {
    const o = new Uint8Array(m.length);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = y * w + x;
      o[k] = m[k] || (x > 0 && m[k - 1]) || (x < w - 1 && m[k + 1]) || (y > 0 && m[k - w]) || (y < h - 1 && m[k + w]) ? 1 : 0;
    }
    return o;
  }
  function component(m, w, h, seed) {
    const o = new Uint8Array(m.length);
    if (!m[seed]) return null;
    const q = new Int32Array(m.length); let qh = 0, qt = 0;
    o[seed] = 1; q[qt++] = seed;
    while (qh < qt) {
      const p = q[qh++], x = p % w, y = (p / w) | 0;
      if (x > 0 && m[p - 1] && !o[p - 1]) { o[p - 1] = 1; q[qt++] = p - 1; }
      if (x < w - 1 && m[p + 1] && !o[p + 1]) { o[p + 1] = 1; q[qt++] = p + 1; }
      if (y > 0 && m[p - w] && !o[p - w]) { o[p - w] = 1; q[qt++] = p - w; }
      if (y < h - 1 && m[p + w] && !o[p + w]) { o[p + w] = 1; q[qt++] = p + w; }
    }
    return o;
  }
  function fillHoles(m, w, h) {
    // tout ce qui n'est pas atteignable depuis le bord sans traverser le masque = trou
    const outside = new Uint8Array(m.length);
    const q = new Int32Array(m.length); let qh = 0, qt = 0;
    const push = k => { if (!m[k] && !outside[k]) { outside[k] = 1; q[qt++] = k; } };
    for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
    while (qh < qt) {
      const p = q[qh++], x = p % w, y = (p / w) | 0;
      if (x > 0) push(p - 1); if (x < w - 1) push(p + 1);
      if (y > 0) push(p - w); if (y < h - 1) push(p + w);
    }
    const o = new Uint8Array(m.length);
    for (let k = 0; k < m.length; k++) o[k] = outside[k] ? 0 : 1;
    return o;
  }

  // ---------- 4. géométrie ----------
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  function convexHull(pts) {
    pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const lo = [], up = [];
    for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    up.pop(); lo.pop();
    return lo.concat(up);
  }
  const polyArea = P => { let a = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a) / 2; };
  function reduceTo4(hull) {
    const P = hull.slice();
    while (P.length > 4) {
      let bi = 0, ba = Infinity;
      for (let i = 0; i < P.length; i++) {
        const a = Math.abs(cross(P[(i - 1 + P.length) % P.length], P[i], P[(i + 1) % P.length]));
        if (a < ba) { ba = a; bi = i; }
      }
      P.splice(bi, 1);
    }
    return P;
  }

  // ratio largeur/hauteur réel d'un rectangle vu en perspective (Zhang & He 2007)
  function rectAspect(quad, cx, cy, f) {
    const m = quad.map(p => [p[0] - cx, p[1] - cy, 1]);
    const [m1, m2, m4, m3] = m; // ordre cyclique p0,p1,p2,p3 -> (0,0),(w,0),(w,h),(0,h)
    const cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const c14 = cr(m1, m4);
    const k2 = dot(c14, m3) / dot(cr(m2, m4), m3);
    const k3 = dot(c14, m2) / dot(cr(m3, m4), m2);
    const len = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const naive = (len(m1, m2) + len(m3, m4)) / (len(m1, m3) + len(m2, m4));
    if (!(k2 > 0) || !(k3 > 0)) return naive;
    const n2 = [k2 * m2[0] - m1[0], k2 * m2[1] - m1[1], k2 - 1];
    const n3 = [k3 * m3[0] - m1[0], k3 * m3[1] - m1[1], k3 - 1];
    const q = n => (n[0] * n[0] + n[1] * n[1]) / (f * f) + n[2] * n[2];
    const a = Math.sqrt(q(n2) / q(n3));
    return isFinite(a) && a > 0.05 && a < 20 ? a : naive;
  }

  // homographie : résout H tel que H * src = dst (4 correspondances)
  function homography(src, dst) {
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = src[i], [u, v] = dst[i];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
    }
    // élimination de Gauss avec pivot partiel
    for (let c = 0; c < 8; c++) {
      let piv = c;
      for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
      [A[c], A[piv]] = [A[piv], A[c]]; [b[c], b[piv]] = [b[piv], b[c]];
      if (Math.abs(A[c][c]) < 1e-12) return null;
      for (let r = 0; r < 8; r++) {
        if (r === c) continue;
        const f = A[r][c] / A[c][c];
        for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k];
        b[r] -= f * b[c];
      }
    }
    const h = b.map((v, i) => v / A[i][i]);
    return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
  }

  // trapèze déduit du gradient de densité de texture
  function textureQuad(P, mask) {
    const { w, h, E } = P;
    let x0 = w, x1 = 0, y0 = h, y1 = 0, sumE = 0, n = 0;
    for (let k = 0; k < mask.length; k++) if (mask[k]) {
      const x = k % w, y = (k / w) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      sumE += E[k]; n++;
    }
    const bw = Math.max(2, x1 - x0), bh = Math.max(2, y1 - y0);
    const zone = (fx0, fx1, fy0, fy1) => {
      let s = 0, c = 0;
      for (let y = Math.floor(y0 + fy0 * bh); y <= y0 + fy1 * bh; y++)
        for (let x = Math.floor(x0 + fx0 * bw); x <= x0 + fx1 * bw; x++) {
          const k = y * w + x; if (mask[k]) { s += E[k]; c++; }
        }
      return c ? s / c : 0;
    };
    const eps = 2;
    let rv = (zone(0, 1, 0, 1 / 3) + eps) / (zone(0, 1, 2 / 3, 1) + eps);
    let rh = (zone(0, 1 / 3, 0, 1) + eps) / (zone(2 / 3, 1, 0, 1) + eps);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    if (sumE / Math.max(1, n) < 5) {
      // surface lisse : sans indice de texture, on suppose qu'une surface basse
      // dans l'image est horizontale (table, sol) et une surface haute verticale (mur)
      rv = cy > h * 0.55 ? 1.5 : 1.0; rh = 1.0;
    }
    const sT = clamp(1 / Math.pow(rv, 0.8), 0.35, 1), sB = clamp(Math.pow(rv, 0.8), 0.35, 1);
    const sL = clamp(1 / Math.pow(rh, 0.8), 0.35, 1), sR = clamp(Math.pow(rh, 0.8), 0.35, 1);
    return [
      [cx - sT * bw / 2, cy - sL * bh / 2],
      [cx + sT * bw / 2, cy - sR * bh / 2],
      [cx + sB * bw / 2, cy + sR * bh / 2],
      [cx - sB * bw / 2, cy + sL * bh / 2]
    ];
  }

  // ---------- pipeline ----------
  function analyze(img, sx, sy, opts = {}) {
    const P = preprocess(img);
    const { w, h, N } = P;
    sx = clamp(Math.round(sx), 0, w - 1); sy = clamp(Math.round(sy), 0, h - 1);

    let { mask, seed } = growRegion(P, sx, sy);
    // ouverture : coupe les ponts de 1-2 px vers l'arrière-plan
    const opened = component(erode(mask, w, h), w, h, seed);
    if (opened) mask = dilate(opened, w, h);
    mask = fillHoles(mask, w, h);

    let area = 0;
    for (let k = 0; k < N; k++) area += mask[k];

    // trop petit : disque par défaut autour du tap, vu de face
    if (area < 25) {
      const r = Math.min(w, h) * 0.15;
      mask = new Uint8Array(N); area = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
        if (Math.hypot(x - sx, y - sy) <= r) { mask[y * w + x] = 1; area++; }
    }

    // contour -> enveloppe convexe -> 4 coins
    const pts = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = y * w + x;
      if (!mask[k]) continue;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1 || !mask[k - 1] || !mask[k + 1] || !mask[k - w] || !mask[k + w])
        pts.push([x + 0.5, y + 0.5]);
    }
    let quad = null, mode = 'texture';
    if (pts.length >= 4) {
      const hull = convexHull(pts);
      if (hull.length >= 4) {
        const hullArea = polyArea(hull);
        const q = reduceTo4(hull);
        const qa = polyArea(q);
        // la forme ressemble à un quadrilatère convexe ?
        if (area / hullArea > 0.82 && qa / hullArea > 0.88) { quad = q; mode = 'quad'; }
      }
    }
    if (!quad) quad = textureQuad(P, mask);

    // ratio réel + homographie image -> plan rectifié
    const f = opts.focal || w * 0.8; // ~64° de champ horizontal, typique d'une caméra de téléphone
    const aspect = rectAspect(quad, w / 2, h / 2, f);
    const rect = [[0, 0], [aspect, 0], [aspect, 1], [0, 1]];
    const H = homography(quad, rect);

    const toPlane = (x, y) => {
      if (!H) return [x / w, y / w];
      const z = H[6] * x + H[7] * y + 1;
      if (z <= 1e-6) return null; // au-delà de l'horizon
      return [(H[0] * x + H[1] * y + H[2]) / z, (H[3] * x + H[4] * y + H[5]) / z];
    };

    const s = toPlane(sx + 0.5, sy + 0.5) || [aspect / 2, 0.5];
    const dist = new Float32Array(N).fill(-1);
    const ds = [];
    for (let k = 0; k < N; k++) {
      if (!mask[k]) continue;
      const p = toPlane(k % w + 0.5, ((k / w) | 0) + 0.5);
      const d = p ? Math.hypot(p[0] - s[0], p[1] - s[1]) : Infinity;
      dist[k] = d; if (isFinite(d)) ds.push(d);
    }
    // normalisation par le 98e centile (robuste aux pixels proches de l'horizon)
    ds.sort((a, b) => a - b);
    const maxD = ds.length ? Math.max(1e-6, ds[Math.floor(0.98 * (ds.length - 1))]) : 1;
    for (let k = 0; k < N; k++) if (dist[k] >= 0) dist[k] = Math.min(1.2, dist[k] / maxD);

    return { w, h, mask, dist, quad, mode, aspect, area };
  }

  window.Vision = { analyze };
})();
