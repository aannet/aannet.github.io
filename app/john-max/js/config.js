// Tous les réglages de game feel, exposés dans le panneau de debug.
export const CFG = {
  // Nervosité : vitesse de toutes les animations (1 = vitesse des clips)
  animSpeed: 1.15,

  // Rendu : nombre de lignes à l'écran (0 = résolution native)
  renderLines: 360,

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

  // Ragdoll (désactivé : chutes animées)
  ragdoll: false,
  ragdollDelay: 0.09,
  ragdollParts: 7,
  jointFriction: 0.25,
  linDamp: 0.05,
  angDamp: 0.6,
  ragdollBowling: true,

  // Uppercut & juggle
  upperUp: 5.8,
  upperX: 0.5,
  juggleUp: 4.2,
  juggleX: 0.8,

  // Combat
  inputBuffer: 0.25,
  damageMult: 1,
  heroSpeed: 3.9,
  heroInvincible: false,
  enemySpeed: 1.95,
  enemyAggro: 1,

  // Batte
  batDurability: 6,
};

// Groupes de collision Rapier : (membership << 16) | filter
export const G = {
  STATIC: 0x0001,
  PROPS: 0x0002,
  CHAR: 0x0004,
  RAG0: 0x0008, // ragdoll i = RAG0 << i (i de 0 à 4)
  ALLRAG: 0x00f8,
};
export const groups = (member, filter) => ((member & 0xffff) << 16) | (filter & 0xffff);
