# Découpe la planche d'impacts (sheet.jpg, 1024x572) en atlas d'effets RGBA 1024x512 (cases de 256x128).
# Usage : python3 tools/fx/make_atlas.py  -> assets/fx/fx.webp ; les UV affichés vont dans FX_UV (js/juice.js).
import json, os
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
CELLS = {  # (x0, y0, x1, y1) sur la planche, numéros de case exclus
    'trail': (95, 148, 238, 198), 'zap': (252, 117, 452, 212), 'burstB': (468, 138, 594, 212), 'glowB': (632, 150, 822, 212),
    'pixB': (836, 148, 992, 212), 'fire': (92, 284, 208, 350), 'flame': (288, 252, 462, 352), 'starO': (470, 250, 596, 372),
    'smoke': (628, 250, 812, 362), 'embers': (834, 296, 994, 366), 'glint': (55, 462, 218, 488), 'slash': (248, 412, 404, 538),
    'star4': (472, 416, 584, 534), 'streak': (648, 462, 804, 488), 'digital': (830, 442, 992, 522),
}
SW, SH = 256, 128

im = Image.open(os.path.join(HERE, 'sheet.jpg')).convert('RGB')
atlas = np.zeros((512, 1024, 4), np.uint8)
uv = {}
for i, (key, box) in enumerate(CELLS.items()):
    c = im.crop(box)
    w, h = c.size
    s = min((SW - 8) / w, (SH - 8) / h)
    nw, nh = int(w * s), int(h * s)
    a = np.asarray(c.resize((nw, nh), Image.LANCZOS)).astype(np.float32)
    yy, xx = np.mgrid[0:nh, 0:nw]
    # bords adoucis (coupures du recadrage) ; le voile sombre du JPEG devient transparent
    m = np.minimum(np.minimum(xx, nw - 1 - xx) / max(1, nw * 0.12), np.minimum(yy, nh - 1 - yy) / max(1, nh * 0.12)).clip(0, 1)
    k = ((a.max(axis=2) - 14) / 241).clip(0, 1)
    rgb = a * (k[..., None] > 0) * m[..., None]
    alpha = np.sqrt(k) * 255 * m
    x0, y0 = (i % 4) * SW + (SW - nw) // 2, (i // 4) * SH + (SH - nh) // 2
    atlas[y0:y0 + nh, x0:x0 + nw, :3] = rgb.clip(0, 255).astype(np.uint8)
    atlas[y0:y0 + nh, x0:x0 + nw, 3] = alpha.clip(0, 255).astype(np.uint8)
    uv[key] = [round(x0 / 1024, 4), round(1 - (y0 + nh) / 512, 4), round(nw / 1024, 4), round(nh / 512, 4), round(nw / nh, 3)]

out = os.path.join(HERE, '..', '..', 'assets', 'fx', 'fx.webp')
Image.fromarray(atlas, 'RGBA').save(out, quality=88, method=6)
print(json.dumps(uv))
