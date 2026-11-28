# John Max — Jalon 0 « ça tape »

*NO PAST. NO LIMIT.* Beat'em up 2.5D jouable sur mobile dans le navigateur, direction artistique inspirée de *Replaced* (pixel art, nuit pluvieuse, néons). Fiche du héros : [`docs/john-max.md`](docs/john-max.md). Three.js + Rapier, modules ES natifs, pas de build.

## Lancer

- Démarrage par le bouton JOUER (ou Entrée). Plein écran au premier toucher. Pour un plein écran direct dès l'ouverture, menu du navigateur → « Ajouter à l'écran d'accueil » (manifeste `display: fullscreen`, paysage).

- En ligne : pousser le dossier dans `aannet.github.io/app/<nom>/`, ouvrir l'URL sur le téléphone.
- En local : `npx serve .` (ou `python3 -m http.server`) puis ouvrir `http://localhost:3000`. Le `file://` ne marche pas (modules ES).

## Contrôles

- Toutes les commandes sont listées dans le bouton AIDE de l'accueil.
- Tactile : stick virtuel n'importe où sur la moitié gauche, bouton PAF à droite, SAUT (vert).
- Tactile : bouton UP (orange) pour l'uppercut, ESQ (bleu) pour la roulade. PAF maintenu : Charged Punch.
- Manette Bluetooth : reconnue au premier bouton. Stick gauche ou croix, X frapper (maintenu : Charged Punch), Y uppercut, A saut, B ou RB roulade, Start réglages.
- Clavier : flèches ou ZQSD/WASD, J frapper (maintenu : Charged Punch), K uppercut, Espace saut, L ou Maj roulade, G réglages.
- Combo : jab, cross, crochet (le 3e coup projette l'ennemi). Avec la batte : 2 swings lourds.
- Charged Punch : PAF maintenu. John se fige épaule en arrière, l'énergie orange monte au poing (halo, étincelles aspirées, zoom), puis le cross part au relâchement. Dégâts, projection et onde de choc à distance selon la charge ; ralenti à pleine charge.
- Saut : contrôle réduit en l'air, un coup aérien par saut (fait tomber, rattrape les ennemis en l'air).
- Saisie : pousser le stick contre un ennemi debout ; John le tient au col et peut avancer avec lui. Frapper le lance devant, UP (ou frapper + stick arrière) le lance derrière, par-dessus l'épaule (`OverhandThrow`). Il se libère après 2,5 s ; un coup reçu, un saut ou une roulade le relâchent.
- Décor : un coup fort, la batte ou un ennemi projeté casse les caisses (deux coups légers aussi) ; les poubelles valsent ; un ennemi projeté traverse les vitrines des abribus, qui bloquent le passage tant qu'elles sont intactes. Tout réapparaît après 18 s, quand John est loin.
- Roulade : direction du stick, invincible sur 75 % de la durée, annule la fin d'un coup ou la charge.
- Jauge spéciale : se remplit à chaque coup donné (plus avec les coups forts, lancers, Charged Punch) et reçu. Pleine, elle débloque le smash sur UP ; avant, UP est éteint.
- Smash : uppercut (crochet en lanceur) avec flash plein écran, ralenti, vibration du téléphone ou de la manette, onde de choc ; casse tout le décor cassable dans un rayon de 3 m et projette loin les ennemis proches (6 à 7 m, plus fort au contact).
- Ancien uppercut : seul ou en annulation d'un jab/cross. Il envoie l'ennemi à la verticale. Les coups suivants le maintiennent en l'air (juggle) et le combo repart du jab.
- La batte est au fond à gauche : marcher dessus pour la prendre. Elle casse au bout de N coups, une autre tombe 5 s plus tard.

## Panneau de réglages (⚙)

Tout le game feel est réglable en direct : vitesse des animations, hitstop, shake, punch caméra, impulsions, frottement au sol, buffer d'input, slow-mo du dernier KO, durabilité de la batte. « Garder ces réglages » les stocke dans le navigateur, « Copier » les met en JSON dans le presse-papiers (à recoller dans `js/config.js` pour en faire les valeurs par défaut).

## Architecture

| Module | Rôle |
|---|---|
| `config.js` | Tous les paramètres de game feel, groupes de collision |
| `time.js` | Boucle à pas fixe 60 Hz, `timeScale` global (hitstop = 0, slow-mo) |
| `input.js` | Couche d'actions : tactile, manette, clavier |
| `assets.js` | Chargement des GLB (meshopt) et des clips |
| `model.js` | Personnage riggé Quaternius : toon, contour skinné, liseré, habillage par sommet selon l'os dominant, AnimationMixer |
| `toon.js` | Dégradé toon et contour des objets statiques |
| `character.js` | Base héros/ennemis : modèle, clips, capsule cinématique, hauteur en l'air |
| `hero.js` / `enemy.js` | Combo + buffer, IA à jeton d'attaque, états de réaction, choix des clips |
| `combat.js` | Coups calés sur les clips (fenêtres en secondes de clip), résolution des coups, juggle |
| `juice.js` / `audio.js` | Shake, punch, flash, étincelles, étoiles d'impact, sons synthétisés |
| `level.js` | Rue jouable : physique statique, décor poussable, éclairage |
| `decor.js` | Habillage Neo-Tokyo : façade peinte, néons en atlas, halos et reflets fusionnés, pluie GPU, vapeur |
| `blobs.js` | Ombres « blob » instanciées (remplace la shadow map) |
| `breakables.js` | Décor qui casse : caisses en planches physiques, poubelles qui valsent, vitrines d'abribus qui éclatent, respawn hors champ |
| `bat.js` | Batte ramassable |

## Choix d'optimisation (feintes assumées)

- Rendu à 540 lignes avec MSAA, agrandi en douceur : 2 à 3× moins de pixels qu'en natif. À 360 lignes ou moins, agrandissement `pixelated` pour un look pixel art (⚙ > Rendu).
- Vignettage qui vacille en CSS, par-dessus le canvas : aucun coût de rendu 3D.
- Pas de shadow map : ombres blob en 1 draw call.
- Pas de post-process : néons, halos, reflets de flaques et cônes de lumière sont des quads additifs fusionnés.
- Rim light par patch du shader toon (un seul programme GPU) plutôt que des lumières en plus.
- Pluie entièrement dans le vertex shader. Façade et détails peints dans une texture canvas.

Coup fort : chute animée (`Hit_Knockback` + trajectoire balistique, puis `LayToIdle` qui s'enchaîne sans saut). Un ennemi projeté renverse ceux qu'il percute (« bowling », désactivable). Rapier ne sert plus qu'au décor physique (caisses, poubelles, batte).

## Personnages et animations

Modèles et clips Quaternius (CC0), squelette commun de 65 os au nommage Unreal. Pour ajouter des clips :

```
npm i @gltf-transform/core@4 @gltf-transform/extensions@4 @gltf-transform/functions@4 meshoptimizer sharp fbx2gltf
npx FBX2glTF --binary --input "Animation Library[Standard]/Unreal Engine/AL_Standard.fbx" --output ual1_ue
node tools/convert-assets.mjs <dossier UBC> ual1_ue.glb <UAL2_Standard.glb> assets/chars
```

Pour la Library 1, il faut le FBX « Unreal Engine » : le GLB Godot utilise un rig Rigify incompatible. Le script reporte l'échelle ×100 et la rotation du nœud `Rig` du FBX sur l'os `root`. Les listes `KEEP1` / `KEEP` du script choisissent les clips.

Absents des packs gratuits : coup de pied et uppercut (le bouton UP réutilise le crochet en lanceur).
