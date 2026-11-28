import * as THREE from 'three';
import { CFG } from './config.js';
import { ARENA } from './level.js';
import { Enemy } from './enemy.js';
import { sfx } from './audio.js';

// Stage 1 : 4 zones de 18 m. La caméra se verrouille sur la zone (bornes de l'arène) tant que ses vagues
// ne sont pas vaincues, puis « GO » ouvre la suivante. Une vague = liste de types, entrées alternées droite/gauche.
export const ZONES = [
  { x0: -9, x1: 9, name: 'SEC-01', waves: [['thug', 'thug'], ['thug', 'thrower', 'thug']] },
  { x0: 9, x1: 27, name: 'SEC-02', waves: [['rusher', 'thug'], ['thug', 'rusher', 'thrower']] },
  { x0: 27, x1: 45, name: 'SEC-03', waves: [['brute', 'thug'], ['thrower', 'thug', 'rusher']] },
  { x0: 45, x1: 63, name: 'SEC-04', boss: true, waves: [['boss']] },
];
// Pool fixe : jamais plus de 4 ennemis à l'écran, aucun modèle créé en cours de partie
const POOL = { thug: 3, rusher: 1, brute: 1, thrower: 1, boss: 1 };

export class Stage {
  constructor(game) {
    this.game = game;
    this.pool = [];
    for (const [type, n] of Object.entries(POOL)) for (let i = 0; i < n; i++) this.pool.push(new Enemy(game, type, i));
    this.zone = -1;
    this.wave = 0;
    this.queue = [];
    this.state = 'idle';
    this.time = 0;
    this.boss = null;
    this.foods = [];
    this.goEl = document.getElementById('go');
    this.bossEl = document.getElementById('boss');
    this.bossFill = document.getElementById('boss-fill');
    this.locEl = document.querySelector('#status .loc');
    this.stageEl = document.getElementById('stage-n');
    this.foodGeo = [new THREE.CylinderGeometry(0.17, 0.11, 0.12, 12), new THREE.CylinderGeometry(0.15, 0.15, 0.02, 12)];
    this.foodMat = [new THREE.MeshToonMaterial({ color: 0xc8302a }), new THREE.MeshBasicMaterial({ color: 0xffd27a })];
  }

  start() {
    this.enterZone(0);
  }

  enterZone(i) {
    const Z = ZONES[i];
    this.zone = i;
    this.wave = 0;
    ARENA.minX = Z.x0;
    ARENA.maxX = Z.x1;
    this.state = 'fight';
    this.goEl.classList.remove('on');
    this.locEl.textContent = 'NEO-TOKYO // ' + Z.name;
    this.stageEl.textContent = String(i + 1).padStart(2, '0');
    if (Z.boss) this.game.ui.message('ONI', 1.4);
    this.queueWave(1);
  }

  queueWave(delay = 0.3) {
    ZONES[this.zone].waves[this.wave].forEach((type, k) => this.queue.push({ type, t: delay + k * 0.8, side: k % 2 ? -1 : 1 }));
  }

  spawn(type, side) {
    const g = this.game, e = this.pool.find((p) => p.type === type && !p.active);
    if (!e) return;
    const cx = g.camX;
    let enterX = Math.max(ARENA.minX + 0.6, Math.min(ARENA.maxX - 0.6, cx + side * (2.6 + Math.random() * 1.6)));
    for (const gl of g.level.breakables.glass) if (Math.abs(enterX - gl.x) < 0.7) enterX = gl.x - side * 0.7; // pas d'arrivée contre une vitrine
    e.waitSlot = g.enemies.length;
    e.spawn(cx + side * 6.8, ARENA.minZ + 0.3 + Math.random() * (ARENA.maxZ - ARENA.minZ - 0.6), enterX);
    g.enemies.push(e);
    if (e.T.boss) { this.boss = e; this.bossEl.classList.add('on'); }
  }

  // Ennemi KO qui a fini de clignoter : retour au pool
  remove(e) {
    const g = this.game;
    if (e.ko) g.juice.dissolve(new THREE.Vector3(e.x, 0.5, e.z)); // dissipation numérique du corps
    e.deactivate();
    const i = g.enemies.indexOf(e);
    if (i >= 0) g.enemies.splice(i, 1);
    if (e === this.boss) this.win();
  }

  zoneClear() {
    if (this.zone >= ZONES.length - 1) return;
    this.state = 'go';
    ARENA.maxX = ZONES[this.zone + 1].x1;
    this.goEl.classList.add('on');
    this.game.ui.message('GO !', 0.9);
    sfx.ready();
  }

  // Boss à mi-vie : il s'énerve et appelle deux voyous
  bossRage(boss) {
    this.game.ui.message('ONI EN RAGE', 1.2);
    this.game.juice.shake(0.5);
    sfx.smash();
    this.queue.push({ type: 'thug', t: 0.6, side: 1 }, { type: 'thug', t: 1.2, side: -1 });
  }

  // Boss KO : ralenti, les sbires tombent avec lui
  bossDown() {
    const g = this.game;
    this.state = 'won';
    this.queue.length = 0;
    // victoire acquise : plus rien ne doit toucher John pendant le ralenti
    if (g.hero.held) { g.hero.held = null; g.hero.setState('free'); }
    g.hero.invuln = 99;
    g.bottles.shock = null;
    g.bottles.ring.visible = false;
    g.time.slowmo(1.6);
    g.juice.camPunch(0.2);
    for (const e of g.enemies) {
      if (e === this.boss || e.ko) continue;
      e.hp = 0; e.ko = true;
      e.heavyHit({ x: (Math.sign(e.x - this.boss.x) || 1) * CFG.knockHeavy, y: CFG.knockUp });
    }
  }

  win() {
    this.bossEl.classList.remove('on');
    this.game.onStageClear({ time: this.time, kos: this.game.ui.kos });
  }

  // Nourriture (dans certaines caisses) : marcher dessus rend 30 PV
  food(x, z) {
    const m = new THREE.Mesh(this.foodGeo[0], this.foodMat[0]);
    const top = new THREE.Mesh(this.foodGeo[1], this.foodMat[1]);
    top.position.y = 0.06;
    m.add(top);
    m.position.set(x, 0.3, z);
    this.game.scene.add(m);
    this.foods.push({ m, t: 0 });
  }

  update(dt) {
    const g = this.game, hero = g.hero;
    if (this.state !== 'idle' && this.state !== 'won') this.time += dt;
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const q = this.queue[i];
      if ((q.t -= dt) <= 0) { this.queue.splice(i, 1); this.spawn(q.type, q.side); }
    }
    if (this.state === 'fight' && !this.queue.length && !g.enemies.length) {
      if (++this.wave < ZONES[this.zone].waves.length) this.queueWave();
      else this.zoneClear();
    }
    if (this.state === 'go') {
      ARENA.minX = Math.max(ARENA.minX, g.camX - 5.3); // pas de retour en arrière hors champ
      if (hero.x > ZONES[this.zone + 1].x0 + 4.5) this.enterZone(this.zone + 1);
    }
    if (this.boss && this.boss.active) this.bossFill.style.transform = `scaleX(${Math.max(0, this.boss.hp / this.boss.maxHp)})`;
    for (let i = this.foods.length - 1; i >= 0; i--) {
      const f = this.foods[i];
      f.t += dt;
      f.m.position.y = Math.max(0.08, 0.3 - f.t * 1.5) + Math.sin(f.t * 4) * 0.02;
      f.m.rotation.y += dt * 1.5;
      if (f.t > 0.3 && hero.y < 0.3 && Math.hypot(hero.x - f.m.position.x, hero.z - f.m.position.z) < 0.55) {
        hero.hp = Math.min(hero.maxHp, hero.hp + 30);
        g.ui.message('+30 PV', 0.8);
        g.juice.sparks(f.m.position, 1, 10, 0.5, [0.5, 1, 0.6]);
        sfx.pickup();
        g.scene.remove(f.m);
        this.foods.splice(i, 1);
      }
    }
  }
}
