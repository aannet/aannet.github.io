// Niveau 1 — Aile Est. Une carte en caractères, une légende, un thème. Rien d'autre.
export default {
  id: 'asile-01',
  name: 'Aile Est',
  theme: 'asile',
  map: [
    '########################',
    '#Pb.b.l#.p...c.#b....b.#',
    '#..g...#.......#...K.n.#',
    '#....h.d..s.B..#......l#',
    '#......#...n...####d####',
    '###d####.......#......t#',
    '#ll..b.#####d###..rr...#',
    '#p.....#......t#..B.g..#',
    '#..n.....rr....#......c#',
    '#x.....#...g...###d#####',
    '####d###.....n.#b.....b#',
    '#x...h.#....w..#...E...#',
    '#x.Bg..#x......#.s..n..#',
    '#......####.####..g..wp#',
    '#..X...................#',
    '########################'
  ],
  // Caractère -> rôle. Les rôles en minuscules renvoient au catalogue de props.
  legend: {
    '#': 'wall', '.': 'floor',
    P: 'player', E: 'enemy', K: 'key', X: 'exit', B: 'battery',
    b: 'bed', l: 'locker', s: 'screen', c: 'cart', h: 'chair', w: 'wheelchair',
    n: 'neon', d: 'door', r: 'curtain', t: 'tv', x: 'crate', p: 'pipe', g: 'drip'
  },
  // Atmosphère : la poussière gêne un peu, la fumée aveugle (la créature y avance même dans ton faisceau)
  zones: [
    { type: 'dust', from: [1, 1], to: [6, 4] },
    { type: 'dust', from: [8, 1], to: [14, 5] },
    { type: 'dust', from: [16, 5], to: [22, 8], density: .8 },
    { type: 'smoke', from: [16, 10], to: [22, 13] },
    { type: 'smoke', from: [12, 14], to: [15, 14], density: .7 }
  ],
  seed: 1337
};
