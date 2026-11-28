// Tous les réglages de game feel, exposés dans le panneau de debug.
export const CFG = {
  // Nervosité : vitesse de toutes les animations (1 = vitesse des clips)
  animSpeed: 1.21,

  // Rendu : nombre de lignes à l'écran (0 = résolution native)
  renderLines: 540,

  // Temps
  timeScale: 1,
  hitstopLight: 0.055,
  hitstopHeavy: 0.11,
  hitstopBat: 0.14,
  slowmoScale: 0.2,
  slowmoDuration: 0.9,

  // Caméra
  shakeLight: 0.12,
  shakeHeavy: 0.4,
  shakeDecay: 3.2,
  shakeMax: 0.35,
  camPunch: 0.09,

  // Impact visuel
  flashTime: 0.07,
  particles: 1,

  // Knockback
  knockLight: 2.2,
  knockHeavy: 4.5,
  knockUp: 4.5,
  batMult: 1.2,
  groundDrag: 5,
  gravity: 13,

  // Chutes
  bowling: true,

  // Uppercut & juggle
  upperUp: 5.8,
  upperX: 0.5,
  juggleUp: 4.2,
  juggleX: 0.8,

  // Charged Punch (PAF maintenu)
  chargeDelay: 0.28,
  chargeFull: 0.9,
  chargeKnock: 1.6,
  chargeWave: 2.6,

  // Esquive (roulade)
  dodgeDist: 2.8,
  dodgeInvuln: 0.75,

  // Combat
  inputBuffer: 0.25,
  damageMult: 1,
  heroSpeed: 4.1,
  heroInvincible: false,
  enemySpeed: 2.05,
  enemyAggro: 1,

  // Batte
  batDurability: 6,
};

// Groupes de collision Rapier : (membership << 16) | filter
export const G = {
  STATIC: 0x0001,
  PROPS: 0x0002,
  CHAR: 0x0004,
};
export const groups = (member, filter) => ((member & 0xffff) << 16) | (filter & 0xffff);
