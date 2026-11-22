// Registre des niveaux, dans l'ordre de progression. Ajouter un niveau = ajouter un fichier et une ligne ici.
import asile01 from './asile-01.js';
import sousSol01 from './sous-sol-01.js';
export const LEVELS = [
  { slug: 'niveau-1', level: asile01 },
  { slug: 'niveau-2', level: sousSol01 }
];
