# John Max — Jalon 0 « ça tape »

*NO PAST. NO LIMIT.* Beat'em up 2.5D jouable sur mobile dans le navigateur, direction artistique inspirée de *Replaced* (pixel art, nuit pluvieuse, néons). Fiche du héros : [`docs/john-max.md`](docs/john-max.md). Three.js + Rapier, modules ES natifs, pas de build.

## Lancer

- En ligne : pousser le dossier dans `aannet.github.io/app/<nom>/`, ouvrir l'URL sur le téléphone.
- En local : `npx serve .` (ou `python3 -m http.server`) puis ouvrir `http://localhost:3000`. Le `file://` ne marche pas (modules ES).

## Contrôles

- Tactile : stick virtuel n'importe où sur la moitié gauche, bouton PAF à droite.
- Tactile : bouton UP (orange) pour l'uppercut.
- Manette Bluetooth : reconnue au premier bouton. Stick gauche ou croix, A/X pour frapper, Y/B pour l'uppercut, Start pour les réglages.
- Clavier : flèches ou ZQSD/WASD, J/Espace pour frapper, K pour l'uppercut, G pour les réglages.
- Combo : jab, cross, crochet (le 3e coup envoie en ragdoll). Avec la batte : 2 swings lourds.
- Uppercut : seul ou en annulation d'un jab/cross. Il envoie l'ennemi à la verticale. Les coups suivants le maintiennent en l'air (juggle) et le combo repart du jab.
- La batte est au fond à gauche : marcher dessus pour la prendre. Elle casse au bout de N coups, une autre tombe 5 s plus tard.

## Panneau de réglages (⚙)

Tout le game feel est réglable en direct : hitstop, shake, punch caméra, impulsions, délai avant ragdoll, ragdoll 7 ou 11 corps, raideur des joints, buffer d'input, slow-mo du dernier KO, durabilité de la batte. « Garder ces réglages » les stocke dans le navigateur, « Copier » les met en JSON dans le presse-papiers (à recoller dans `js/config.js` pour en faire les valeurs par défaut).

## Architecture

| Module | Rôle |
|---|---|
| `config.js` | Tous les paramètres de game feel, groupes de collision |
| `time.js` | Boucle à pas fixe 60 Hz, `timeScale` global (hitstop = 0, slow-mo) |
| `input.js` | Couche d'actions : tactile, manette, clavier |
| `assets.js` | Chargement des GLB (meshopt) et des clips |
| `model.js` | Personnage riggé Quaternius : toon, contour skinné, liseré, habillage par sommet selon l'os dominant, AnimationMixer |
| `toon.js` | Dégradé toon et contour des objets statiques |
| `ragdoll.js` | Bascule animation → ragdoll sur le squelette 65 os, recopie pose et vélocité, mode 7 ou 11 corps |
| `character.js` | Base héros/ennemis : capsule cinématique, pose, bascule |
| `hero.js` / `enemy.js` | Combo + buffer, IA à jeton d'attaque, états de réaction, choix des clips |
| `combat.js` | Coups calés sur les clips (fenêtres en secondes de clip), résolution des coups, juggle |
| `juice.js` / `audio.js` | Shake, punch, flash, étincelles, étoiles d'impact, sons synthétisés |
| `level.js` | Rue jouable : physique statique, décor poussable, éclairage |
| `decor.js` | Habillage Neo-Tokyo : façade peinte, néons en atlas, halos et reflets fusionnés, pluie GPU, vapeur |
| `blobs.js` | Ombres « blob » instanciées (remplace la shadow map) |
| `bat.js` | Batte ramassable |

## Choix d'optimisation (feintes assumées)

- Rendu à ~360 lignes puis upscale `pixelated` : look pixel art et 4 à 6× moins de pixels (réglable dans ⚙ > Rendu).
- Pas de shadow map : ombres blob en 1 draw call.
- Pas de post-process : néons, halos, reflets de flaques et cônes de lumière sont des quads additifs fusionnés.
- Rim light par patch du shader toon (un seul programme GPU) plutôt que des lumières en plus.
- Pluie entièrement dans le vertex shader. Façade et détails peints dans une texture canvas.

Règle de bascule : coup léger = animation de hit ; coup fort ou KO = quelques frames de réaction animée puis ragdoll avec l'impulsion. Un ragdoll lancé renverse les ennemis debout qu'il percute (« bowling », désactivable).

## Personnages et animations

Modèles et clips Quaternius (CC0), squelette commun de 65 os au nommage Unreal. Pour ajouter des clips :

```
npm i @gltf-transform/core@4 @gltf-transform/extensions@4 @gltf-transform/functions@4 meshoptimizer sharp fbx2gltf
npx FBX2glTF --binary --input "Animation Library[Standard]/Unreal Engine/AL_Standard.fbx" --output ual1_ue
node tools/convert-assets.mjs <dossier UBC> ual1_ue.glb <UAL2_Standard.glb> assets/chars
```

Pour la Library 1, il faut le FBX « Unreal Engine » : le GLB Godot utilise un rig Rigify incompatible. Le script reporte l'échelle ×100 et la rotation du nœud `Rig` du FBX sur l'os `root`. Les listes `KEEP1` / `KEEP` du script choisissent les clips.

Absents des packs gratuits : coup de pied et uppercut (le bouton UP réutilise le crochet en lanceur).
