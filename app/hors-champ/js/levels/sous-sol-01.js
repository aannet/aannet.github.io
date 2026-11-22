// Niveau 2 — Sous-sol. Même moteur, même catalogue de props, autre thème et autre carte.
export default {
  id: 'sous-sol-01',
  name: 'Sous-sol',
  theme: 'sous-sol',
  map: [
    '############################',
    '#P....#.........#.........B#',
    '#.....#....p....#..x.......#',
    '#..x..d....n....d.......l..#',
    '#.....#.........#..........#',
    '###.###...g.....#####d######',
    '#.....####.######..........#',
    '#.g...#.........#....K.....#',
    '#.....#...B.....d....n.....#',
    '#..l..d.........#..........#',
    '#####.#####.#####.#####d####',
    '#.........g.....#..........#',
    '#.x....c........d....g.....#',
    '#...........E...#..........#',
    '#.....n.........#..xx..t...#',
    '#B......p.......d..........#',
    '#...............#.......X..#',
    '############################'
  ],
  legend: {
    '#': 'wall', '.': 'floor',
    P: 'player', E: 'enemy', K: 'key', X: 'exit', B: 'battery',
    b: 'bed', l: 'locker', s: 'screen', c: 'cart', h: 'chair', w: 'wheelchair',
    n: 'neon', d: 'door', r: 'curtain', t: 'tv', x: 'crate', p: 'pipe', g: 'drip'
  },
  // La chaufferie crache de la vapeur : la bête démarre dedans, et le couloir central en est plein
  zones: [
    { type: 'smoke', from: [1, 11], to: [15, 16], density: .75 },
    { type: 'smoke', from: [11, 6], to: [11, 9], density: .9 },
    { type: 'dust', from: [17, 1], to: [26, 4] },
    { type: 'dust', from: [1, 6], to: [5, 9] },
    { type: 'dust', from: [17, 11], to: [26, 16], density: .6 }
  ],
  battery: { drain: .0075 },
  seed: 2024
};
