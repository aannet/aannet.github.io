# John Max — Jalon 0 « ça tape »

*NO PAST. NO LIMIT.* Beat'em up 2.5D jouable sur mobile dans le navigateur, direction artistique inspirée de *Replaced* (pixel art, nuit pluvieuse, néons). Fiche du héros : [`docs/john-max.md`](docs/john-max.md). Three.js + Rapier, modules ES natifs, pas de build.

## Lancer

- Démarrage par le bouton JOUER (ou Entrée). Plein écran au premier toucher. Pour un plein écran direct dès l'ouverture, menu du navigateur → « Ajouter à l'écran d'accueil » (manifeste `display: fullscreen`, paysage).

- En ligne : pousser le dossier dans `aannet.github.io/app/<nom>/`, ouvrir l'URL sur le téléphone.
- En local : `npx serve .` (ou `python3 -m http.server`) puis ouvrir `http://localhost:3000`. Le `file://` ne marche pas (modules ES).

## Stage 1 (Jalon 3)

Une rue de 72 m en 4 zones. La caméra se verrouille sur chaque zone tant que ses vagues ne sont pas vaincues ; « GO » ouvre la suivante (pas de retour hors champ). Vagues décrites dans `js/stage.js` (`ZONES`), entrées alternées droite / gauche.

- Voyou : coup de poing télégraphié (il rougit).
- Fonceur : s'aligne, rougit, charge en ligne et renverse John. Esquive par roulade ou saut ; après la charge il est sonné ~0,9 s.
- Costaud : plus grand, barre de fer à la main, insensible aux coups légers, impossible à saisir, son coup renverse. Coup lourd, arme, charge ou smash.
- Lanceuse : garde ses distances, change de couloir, lance des bouteilles visées là où est John.
- Boss ONI (520 PV, barre dédiée) : combo de 3 coups, charge, saut avec onde de choc au sol (sauter au passage de l'anneau). Il encaisse tout sans broncher sauf quand il est sonné (après chacune de ses attaques, 5 coups max) ; saisissable seulement sonné ; le smash le met à terre. À mi-vie il s'énerve (plus rapide, plus de sauts) et appelle deux voyous.
- Jetons d'attaque : 1 au corps à corps, 2 à partir de 3 ennemis.
- Nourriture : une caisse par zone cache un bol de ramen (+30 PV).
- Boss KO : ralenti, ses sbires tombent avec lui, écran STAGE CLEAR (KO, temps, continues) et REJOUER.

## Effets d'impact

Atlas `assets/fx/fx.webp` (130 Ko) découpé dans la planche « attaque normale » fournie (`tools/fx/sheet.jpg`, script `tools/fx/make_atlas.py`). Fond rendu transparent, sprites en pools (`juice.js`, `FxPool`) qui grossissent et s'effacent.

- Coup léger (jab, cross) : éclair en X bleu, gerbe et halo bleus, pixels qui se dissipent, traînée du poing.
- Coup lourd (crochet, Charged Punch, projections) : étoile et flamme orange, fumée ; charge pleine = brûlure au sol. Pendant la charge, le poing s'entoure d'anneaux de feu.
- Arme : arc en croissant cyan pendant le coup, étoile à 4 branches à l'impact, dissipation « circuit » ; reflet au ramassage.
- Roulade et charge du fonceur : traînée de vitesse. Ennemi KO qui disparaît : dissipation numérique.
- Le smash garde son éclair cyan-violet plein écran.

## Contrôles

- Toutes les commandes sont listées dans le bouton AIDE de l'accueil.
- Tactile : stick virtuel n'importe où sur la moitié gauche, bouton PAF à droite, SAUT (vert).
- Tactile : croix directionnelle fixe en bas à gauche (un appui n'importe où sur la moitié gauche se lit par rapport à son centre), bouton UP pour le smash (jauge pleine), ESQ pour la roulade, ❚❚ en haut à droite pour la pause. PAF maintenu : Charged Punch.
- Manette Bluetooth : reconnue au premier bouton. Stick gauche ou croix, X frapper (maintenu : Charged Punch), Y smash, A saut, B ou RB roulade, Start pause, Select réglages.
- Clavier : flèches ou ZQSD/WASD, J frapper (maintenu : Charged Punch), K smash, Espace saut, L ou Maj roulade, P ou Échap pause, G réglages.
- Combo : jab, cross, crochet (le 3e coup projette l'ennemi). Avec la batte : 2 swings lourds.
- Charged Punch : PAF maintenu. John se fige épaule en arrière, l'énergie orange monte au poing (halo, étincelles aspirées, zoom), puis le cross part au relâchement. Dégâts, projection et onde de choc à distance selon la charge ; ralenti à pleine charge.
- Saut : contrôle réduit en l'air, un coup aérien par saut (fait tomber, rattrape les ennemis en l'air).
- Saisie : pousser le stick 0,3 s contre un ennemi sonné ou immobile (pas juste après un PAF) ; John le tient au col et peut avancer avec lui. Frapper le lance devant, UP (ou frapper + stick arrière) le lance derrière, par-dessus l'épaule (`OverhandThrow`). Il se libère après 2,5 s ; un coup reçu, un saut ou une roulade le relâchent.
- Décor : un coup fort, la batte ou un ennemi projeté casse les caisses (deux coups légers aussi) ; les poubelles valsent ; un ennemi projeté traverse les vitrines des abribus, qui bloquent le passage tant qu'elles sont intactes. Tout réapparaît après 18 s, quand John est loin.
- Roulade : direction du stick, invincible sur 75 % de la durée, annule la fin d'un coup ou la charge.
- Jauge spéciale : se remplit à chaque coup donné (plus avec les coups forts, lancers, Charged Punch) et reçu. Pleine, elle débloque le smash sur UP ; avant, UP est éteint.
- Smash : uppercut (crochet en lanceur) avec flash plein écran, ralenti, vibration du téléphone ou de la manette, onde de choc ; casse tout le décor cassable dans un rayon de 3 m et projette loin les ennemis proches (6 à 7 m, plus fort au contact).
- Smash : invincible 0,6 s pendant l'élan, 40 dégâts ; il doit battre le Charged Punch. L'éclair (cyan/violet, distinct de l'orange du Charged Punch) part au contact du poing.
- Ennemi tué : animation de mort `Death01` (recule, tombe à la renverse, reste étendu bras en croix), clignote puis disparaît. Un ennemi simplement mis au sol garde `Hit_Knockback` puis se relève.
- Pause › OPTIONS : son, vibrations, qualité (360/540/720 lignes), compteur FPS ; gardés dans le navigateur.
- Attaque ennemie télégraphiée : l'ennemi rougit pendant la préparation (bip d'annonce). Pendant son attaque, jab et cross le blessent sans l'interrompre ; il faut un coup lourd, une arme, une saisie, ou esquiver.
- John peut tomber : trois coups encaissés en 4 s, ou plus de vie. Il lâche son arme, se relève invincible 1 s. À 0 PV : écran K.O. et CONTINUER.
- Charged Punch : ne se déclenche plus qu'aux fenêtres d'annulation d'un coup ; appui 0,35 s ; onde de choc 1,8 m.
- Le buffer d'input compte en temps de jeu : un appui pendant le hitstop ou le ralenti n'est plus perdu.
- Armes : marcher dessus pour les prendre. Batte (au fond à gauche, lourde), barre de fer (près du départ, rapide, 10 coups), panneau de signalisation (à droite, lent, très large, projette fort, 5 coups). Elles cassent à l'usure ; une du même type retombe 6 s plus tard.
- Poubelle : frapper à côté d'une poubelle (sans ennemi tout près) la soulève ; frapper la lance devant, UP derrière. En vol, elle renverse les ennemis et casse caisses et vitrines, puis redevient un objet du décor.

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
| `hero.js` / `enemy.js` | Combo + buffer ; types d'ennemis (voyou, fonceur, costaud, lanceuse, boss) en table, IA à jetons, télégraphie, bouteilles et onde de choc (`Hazards`) |
| `stage.js` | Zones, vagues, verrouillage caméra, GO, pool d'ennemis, boss, nourriture, fin de stage |
| `combat.js` | Coups calés sur les clips (fenêtres en secondes de clip), résolution des coups, juggle |
| `juice.js` / `audio.js` | Shake, punch, flash, étincelles, étoiles d'impact, sons synthétisés |
| `level.js` | Rue jouable : physique statique, décor poussable, éclairage |
| `decor.js` | Habillage Neo-Tokyo : façade peinte, néons en atlas, halos et reflets fusionnés, pluie GPU, vapeur |
| `blobs.js` | Ombres « blob » instanciées (remplace la shadow map) |
| `breakables.js` | Décor qui casse : caisses en planches physiques, poubelles qui valsent, vitrines d'abribus qui éclatent, respawn hors champ |
| `weapons.js` | Armes ramassables (batte, barre de fer, panneau : forme, combo, durabilité), poubelle à soulever et lancer |

## Choix d'optimisation (feintes assumées)

- Rue infinie à coût fixe : le décor fait 30 m ; deux copies (mêmes géométries et matériaux) se relaient autour de la caméra. Le stage de 72 m ne coûte pas un draw call de plus qu'une rue de 60 m.
- Matériaux transparents double face en une passe (`forceSinglePass`) : sinon three reconstruit leur clé de programme à chaque frame.
- Portrait du HUD rendu au chargement dans un coin du canvas principal (mêmes shaders, aucune compilation en plus), puis copié.
- Props : on ne lit Rapier que pour les corps éveillés ; géométries partagées (plus de fuite au respawn) ; CCD réservé à la poubelle lancée.
- Persos : culling sur une sphère fixe ; ennemis inactifs retirés de la scène ; enfants statiques du décor à matrices figées.
- HUD : barres en `scaleX` (compositeur), pulsations en opacité, zones de lueur (drop-shadow) limitées aux boutons, écran titre en `display:none` après le fondu.
- Pool d'ennemis fixe (7 modèles chargés au démarrage, 4 à l'écran au maximum) : aucun modèle créé pendant la partie ; les inactifs sont masqués et ne sont pas mis à jour.

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
