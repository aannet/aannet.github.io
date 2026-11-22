# Derrière les lignes — dossier de reprise

Jeu d'infiltration tactique façon *Commandos: Behind Enemy Lines* (1998), jouable au doigt sur téléphone, dans une page `index.html` (~875 lignes, ~95 Ko) plus un asset `assets/soldier.gltf.json` (~605 Ko, glTF JSON auto-contenu) pour les personnages. Three.js r160 via CDN, aucun build. Les personnages sont le mannequin animé de Quaternius (Universal Animation Library, CC0, animations mocap) ; tout le reste est procédural (décor, textures, sons, équipement des soldats).

- En ligne : https://aannet.github.io/app/derriere-les-lignes/
- Source : ce dossier, fichier `index.html`
- Lien depuis la page d'accueil du dépôt : carte « DERRIÈRE LES LIGNES » dans `/index.html`

Ce document sert à reprendre le projet plus tard, seul ou avec un LLM. La partie 10 s'adresse directement au LLM.

---

## 1. Le jeu en bref

Une mission solo. Le commando part de la forêt au sud-ouest, entre dans une base clôturée (brèche dans la clôture ouest ou portail gardé au sud) tenue par 10 gardes, pose un explosif sur les cuves du dépôt de carburant, a 25 s pour s'éloigner, puis rejoint le camion d'extraction au sud-est pendant que la garnison converge vers le dépôt.

| Élément | Comportement |
|---|---|
| Déplacement | Tap au sol : marche. Double-tap : course (bruyante, rayon 4,5). Bouton Accroupi : marche accroupie lente, profil bas |
| Cônes de vision | Partie foncée (0–5 m) : voit le commando même accroupi. Partie claire (5–10 m) : seulement debout ou chargé d'un corps. Portée ×1,2 pendant l'alerte. Bloqués par murs, arbres, buissons, sacs. **La clôture ne bloque pas la vue** |
| Soupçon | Jauge par garde : « ? » jaune, puis « ! » rouge = alerte |
| Alerte | Sirène, gardes dans un rayon de 22 m chassent la dernière position connue. Retombe après 25 s sans contact visuel |
| Couteau (défaut) | Tap sur un garde : approche puis élimination silencieuse **si on est hors de son cône frontal** (angle > HALF+0,35 rad). Anneau vert/rouge sous la cible. De face : il se retourne et déclenche l'alerte |
| Pistolet (6) | Portée 15 m, 85 % de réussite, bruit rayon 14. Dégainage automatique, même couteau équipé, sur un garde en alerte ou dont le soupçon dépasse 0,5, à 15 m au plus et en ligne de tir dégagée |
| Sniper (3) | Couche le commando (seule position couchée du jeu), ouvre une lunette (zoom ×3,4, glisser pour viser, pincer ou molette pour zoomer entre 2,2 et 5). Portée 30 m, ligne de tir dégagée requise (sinon la balle s'écrase sur l'obstacle). Réarmement 1,5 s. Chaque tir fait du bruit autour du tireur (rayon 9) ; tir raté = bruit rayon 6 à l'impact (diversion possible) |
| Pierre (5) | Lancer jusqu'à 10 m, bruit rayon 7 : les gardes viennent enquêter. Impossible en portant un corps |
| Corps | Bouton Porter près d'un corps (ou tap sur le corps), puis Poser. Anneau sous chaque corps : vert caché, orange exposé, rouge dans un cône. Corps vu par un garde = alerte. Pas de pierre ni de tir en portant |
| Explosif | Bouton contextuel à moins de 3,4 m du dépôt. Mèche 25 s. Tue tout dans un rayon de 7 m (commando compris à moins de 6 m) ; les gardes pris dans le souffle disparaissent sans laisser de corps |
| Victoire | Dépôt détruit puis commando dans la zone d'extraction (rayon 2,2) |
| Défaite | 3 impacts de balle, ou pris dans l'explosion |

## 2. Pile technique

- **Three.js 0.160.0** via `importmap` sur `cdn.jsdelivr.net` (`three` + `three/addons/` pour `BufferGeometryUtils`, `GLTFLoader`, `SkeletonUtils`). Aucun décodeur (ni meshopt, ni Draco, ni WebAssembly).
- **Personnages** : `assets/soldier.gltf.json`, mannequin Quaternius + 15 clips (UAL1 et UAL2, CC0), construit par `tools/build-soldier.mjs` (glTF-Transform : tri des clips, retrait des pistes inutiles, rééchantillonnage, quantification `KHR_mesh_quantization`, buffer en base64). Crédits dans `assets/CREDITS.md`.
- **Build de l'asset** : `tools/build-soldier.mjs` impose `setVertexLayout(VertexLayout.SEPARATE)`. Indispensable : sans cela glTF-Transform entrelace les attributs, Three.js les charge en `InterleavedBufferAttribute` et `painted()` plante (pas de `getComponent` sur ce type en r160). Pas de compression meshopt : voir partie 7.
- **Deux scripts** : un petit `<script>` classique de secours (avant l'importmap) qui débloque le bouton si le chargement échoue, puis un seul `<script type="module">` dont tout le code est dans un bloc `{ ... }` pour éviter les globales.
- **Polices** : Google Fonts (Black Ops One pour les titres, Barlow Condensed pour l'interface), CSS sur `fonts.googleapis.com`, fichiers sur `fonts.gstatic.com`.
- **Audio** : WebAudio pur (bruit filtré + oscillateurs), initialisé au premier clic (« Commencer »), suspendu quand l'onglet est caché.
- **Entrées** : Pointer Events (tap, double-tap, glisser, pincer), molette pour le zoom sur desktop.
- **Cible** : téléphone en portrait, ~60 fps sur un téléphone récent. Fonctionne aussi sur desktop.
- **Contraintes de l'hébergement artifact claude.ai** (si republié là) : scripts uniquement depuis cdnjs, jsdelivr, unpkg ; pas de `fetch` externe ; pas d'images distantes ; pas de WebAssembly (CSP sans `'wasm-unsafe-eval'`). Le fichier respecte déjà ces règles.

## 3. Carte du fichier

Le module est découpé par des commentaires `// ---------- nom ----------`. Ordre d'exécution = ordre du fichier.

| Section | Contenu |
|---|---|
| HTML + CSS | HUD (objectif, cœurs, alerte, mèche, toast), barre d'actions (Accroupi, Couteau, Pistolet, Sniper, Pierre, bouton contextuel), bouton Centrer flottant, lunette (`#scope`), écrans intro et fin, vignette `#grade`, grain `#grain` |
| script de secours | Script classique : après 15 s, sur erreur de chargement d'un script ou sur promesse rejetée, le bouton Commencer devient « Touchez pour réessayer » et recharge la page. N'agit que si le bouton affiche encore son texte initial |
| `grille` | Grille 48×48, tableaux `mv` (bloque le passage) et `si` (bloque la vue), `mark()`, `rng()` déterministe (seed 11) |
| `rendu` | Renderer, caméra orthographique iso, lumières, textures de nuages, `patchMat()` (ombres de nuages + vent), géométrie statique fusionnée (`colored`, `addS`), textures peintes (`stoneTex`, `plasterTex`, `tileTex`, `plankTex`), `building()`, tous les objets de la carte, lumière `flash`, forêt hors carte en blocs (`FOREST`), barbelés |
| `sol peint` | Canvas 2048 px peint une fois : boue, route, dalle de la base, cratères, flaques, AO autour des obstacles |
| `herbe instanciée` | `InstancedMesh` de ~2600 touffes, vent dans le vertex shader |
| `ambiance : fumée` | Fumée de cheminées (24 sprites), drapeau animé, objet `quality` |
| `pathfinding` | A* 8 directions sans coupe de coin, lissage par ligne de vue, `losClear` (vue), `castRay` (cônes) |
| `soldats : modèle Quaternius` | Chargement de `soldier.gltf.json` (top-level await), sphère `BSPH`, peinture des uniformes par os, équipement accroché aux os, `makeSoldier()`, `disposeSoldier()`, `animate()` (pose → clip), `placeGear()` (armes en main), `placeBody()` (corps au sol ou porté) |
| `cônes de vision` | Maillages dynamiques des cônes (proche/lointain + contour), recalculés à chaque frame avec occlusion quand ils sont à l'écran |
| `audio` | `sfx.*`, sirène |
| `HUD` | `$()`, `setDom()`, `toast()`, cœurs, `setMode()` (pierre), `setWeapon()` (couteau/pistolet) |
| `état de jeu` | Définition des gardes `ENEMIES` (10), variables globales de partie, `disposeFx()`, `reset()` |
| `perception` | `seesPoint`, `seesPlayer`, `setReturn`, `investigate`, `raiseAlarm`, `goAlert`, `makeNoise` |
| `actions` | `kill`, tirs, pierre, particules, explosion, corps (`bodyRange`, `exposure`, `nearestBody`, `pickUp`, `dropBody`), `ctxAction`, sniper (`enterScope`, `sniperFire`…), couteau (`stabOK`, `startStab`) |
| `mise à jour` | `updatePlayer`, `moveAlong`, `updateEnemy` (machine à états), `onScreen`, `update` (boucle logique), `sync` (positions 3D, transparence des bâtiments), `updateFx`, `updateCamera` |
| `entrées` | Conversion écran → sol, sélection d'un personnage au tap (`pickChar`), `onTap`, gestes, boutons, `endGame` |
| `boucle` | Grain, premier `reset()` puis `renderer.compile()`, `loop()`, qualité adaptative (`lowerQuality`) |

## 4. Conventions à connaître absolument

**Monde et grille**
- 1 case = 1 unité monde. La carte couvre x ∈ [0,48], z ∈ [0,48]. Une case `(i,j)` a son centre en `(i+0.5, j+0.5)`.
- x croît vers l'est, z vers le sud (bas-gauche de l'écran = sud-ouest).
- `mark(x,z,w,d,move,sight)` bloque des cases. Tout obstacle visuel qui doit compter pour le gameplay doit passer par `mark()`.

**Orientation**
- Un angle `a` correspond à la direction `(sin a, cos a)` sur le plan XZ. `a = 0` regarde vers +z (sud). `root.rotation.y = a`.
- `wrapA()` ramène un angle dans [-π, π], `turnTo(a, cible, vitesseMax)` tourne progressivement. L'angle des gardes est ramené dans [-π, π] à chaque frame.

**Caméra**
- Orthographique, décalage fixe `CAM_OFF = (22, 26, 22)` depuis `camTarget`. `cam.zoom` entre 0,55 et 2,4 (2,2 à 5 en lunette), 1,1 au départ et à chaque `reset()`.
- `follow = true` : la caméra suit le commando. Glisser passe `follow` à false, le bouton Centrer le remet.

**Personnages** (modèle Quaternius)
- `soldier.gltf.json` contient un mannequin skinné (65 os, nommage façon Unreal : `pelvis`, `spine_01..03`, `Head`, `upperarm_l/r`, `lowerarm_l/r`, `hand_l/r`, `thigh_l/r`, `calf_l/r`, `foot_l/r`) et 15 clips sans root motion.
- Au chargement, `painted('p'|'e')` clone la géométrie et peint une couleur par sommet selon l'os dominant (`zone()` : peau, mains, veste, manches, pantalon, bottes). La même passe calcule des boîtes englobantes par os (`ZB`) qui servent à placer l'équipement. **Utiliser `getVertexPosition` (position skinnée)** : la pose par défaut des os n'est pas la pose de bind brute. `painted()` lit `skinIndex`/`skinWeight` avec `getComponent` : d'où la contrainte `VertexLayout.SEPARATE` du build.
- L'équipement (`GEAR`) est construit en coordonnées de pose de repos puis accroché aux os avec `bone.attach()` : casque ou béret sur `Head`, sac et fusil dans le dos sur `spine_03`, ceinturon sur `pelvis`.
- Les armes en main (fusil des gardes, couteau, pistolet, sniper couché) sont des meshes de scène replacés à chaque frame par `placeGear(s, yaw)` sur `hand_r`, après le positionnement de la racine.
- `animate(s, pose, {dt, speed, p, fall})` choisit un clip et fait un fondu de 0,22 s quand il change (0,12 s vers la chute). Clips en boucle : vitesse de lecture = vitesse réelle / vitesse du clip (`SPEED` : marche 1,0, jogging 3,0, sprint 5,0, accroupi 0,75, porter 0,65 m/s), pour éviter que les pieds glissent. Clips « pilotés » (lancer, couteau, ramasser, chute, porter à l'arrêt) : `timeScale = 0` et le temps du clip suit la progression `p`.
- Correspondance pose → clip : `stand` → Idle / Jog (commando) ou Walk / Jog (gardes) / Sprint ; `crouch` → Crouch_Idle / Crouch_Fwd ; `rifle` (garde calme, fusil dans le dos) ; `ready` → Pistol_Idle + fusil en main ; `aimRifle`, `aimPistol` → Pistol_Aim_Neutral ; `carry` → Walk_Carry ; `kneel` → Fixing_Kneeling (explosif) ; `pickup` → PickUp_Table ; `throw` → OverhandThrow ; `stab` → Sword_Attack ; `dying`/`dead` → Hit_Knockback (`fall` > 0, couteau) ou Death01 (`fall` = −1, balle) ; `proneAim` → dernière image de Hit_Knockback, retournée face contre terre (`model.rotation.z = π`).
- Un corps tué se « pose » quand la chute est finie (`e.dieT ≥ 0,9`, `e.settled`) : `e.x/e.z` sont déplacés sur le bassin si la case est franchissable, puis `placeBody()` garde le bassin à cet endroit. Porté, le corps est tenu à 1 m de haut devant le commando.
- **Couteau** : `startStab()` met `e.dieT = -0.3`. Tant que `dieT < 0`, le garde garde sa pose debout ; la chute démarre quand la lame arrive. `updateEnemy` utilise `Math.max(0, e.dieT)` pour la progression.
- **`e.gone`** : garde volatilisé par l'explosion (`kill(e,'boom')`). Racine et ombre cachées, pas d'anneau de corps. Toute boucle sur les corps (`exposure`, `nearestBody`, découverte de corps, sélection au tap, anneaux) doit exclure `gone`.
- Échelle : `SCALE = 1.03` (environ 1,75 m). Le modèle regarde vers +z dans sa pose de repos, comme le reste du jeu.

**Coût des soldats** (optimisations à préserver)
- **Frustum culling** : chaque `SkinnedMesh` reçoit `boundingSphere = BSPH[k]`, sphère de la pose de repos au rayon doublé pour couvrir chutes et corps couchés. Ne pas remettre `frustumCulled = false`.
- **`s.cull` et `s.still`** : `update()` met `e.s.cull = !onScreen(e.x, e.z, 3)` pour chaque garde. `animate()` saute `mixer.update` si le soldat est hors champ (`s.cull`), caché (`root.visible` faux) ou posé mort depuis plus de 0,5 s (`s.still`). `s.posed` garantit au moins une mise à jour après création. Toute nouvelle pose qui doit bouger hors champ doit en tenir compte.
- **`onScreen(x, z, r)`** : test sphère contre le frustum de la caméra (`_fr`, mis à jour en tête de `update()`). Sert aussi à ne recalculer que les cônes visibles (`updateCone` sauté hors champ).

**HUD**
- **`setDom(id, clé, valeur)`** pour toute écriture DOM faite à chaque frame (mèche, bouton contextuel, lunette) : n'écrit que si la valeur change. Clés `hide` et `lock` = bascule de classe, sinon propriété (`textContent`, `innerHTML`). Les écritures ponctuelles (toast, compteurs) passent directement par `$()`.

**Mémoire et `reset()`**
- **`disposeFx(f)`** libère un effet temporaire (traceurs, éclairs, particules, pierre) : retrait de la scène, géométrie (sauf sprites, qui partagent la géométrie interne de Three.js), matériau (sauf pierre, qui utilise un matériau du cache `mat()`).
- **`reset()` libère** : pour chaque garde, le soldat (`disposeSoldier` : retrait, `mixer.uncacheRoot`, `skeleton.dispose`), les géométries et matériaux des 3 parties du cône, le matériau du marqueur « ? / ! », le matériau de l'anneau de corps ; le soldat du commando ; tous les effets en cours (`disposeFx`). Il remet la caméra, le toast, la lunette, `flash` et les anneaux à zéro, et redemande la carte d'ombres.
- **Partagé, à ne PAS libérer** : `GEO_P`/`GEO_E` (géométries peintes), `GEAR` (géométries d'équipement), `MAT_P`, `MAT_E`, `GEAR_P`, `GEAR_E`, `blobGeo`/`blobMat`, `ringGeo`, `TEX_Q`/`TEX_X`, `SOFT`, le cache `mat()`, et tout le décor.
- Critère : après chaque Rejouer, `renderer.info.memory` (géométries, textures), `renderer.info.programs.length` et `scene.children.length` reviennent aux mêmes valeurs (test mémoire, partie 8).

**Ombres statiques** (optimisation clé)
- `renderer.shadowMap.autoUpdate = false`, type `PCFShadowMap`. La carte d'ombres est calculée une fois au chargement. Les persos ne projettent pas d'ombre réelle mais un disque dégradé (`blob`), et reçoivent les ombres du décor.
- **Si un objet statique change** (exemple : le dépôt qui explose), il faut appeler `renderer.shadowMap.needsUpdate = true`. `explode()` et `reset()` le font.

**Lumières et shaders**
- **Lumière `flash`** : `PointLight` du dépôt, créée au chargement et toujours dans la scène à intensité 0. `explode()` met `flashT = 0.8`, `updateFx()` fait décroître l'intensité de 60 à 0. Ne jamais ajouter ni retirer de lumière en cours de partie : cela change le nombre de lumières et recompile tous les shaders (à-coup).
- **`renderer.compile(scene, cam)`** est appelé après le premier `reset()` et après Rejouer : tous les programmes (y compris objets cachés ou hors champ) sont compilés avant le jeu. Un nouveau type de matériau créé en cours de partie échappe à cette compilation.

**Géométrie statique fusionnée**
- Tout le petit décor (arbres, rochers, caisses, clôtures, sacs, camion…) passe par `addS(geo, couleur, x, y, z, {rx,ry,rz,sx,sy,sz,ao,j})`, empilé dans `S`, puis fusionné en un seul mesh `staticMesh` à vertex colors. `ao` assombrit les sommets bas (fausse occlusion ambiante), `j` ajoute une variation de teinte.
- Conséquence : `addS` ne marche **qu'avant** la ligne `const staticMesh=...`. Après, il faut créer des meshes séparés.
- **Forêt hors carte** : `tree(x, z, false)` utilise des géométries allégées (`CYL4`, `CYL3`, `CONE5`, moins de branches et de boules de feuillage). Ses géométries sont retirées de `S` juste après création et rangées par blocs de 19 cases dans `FOREST`, puis fusionnées en un mesh par bloc (même matériau `worldMat`). Seuls les blocs dans le champ sont dessinés. Ne pas les remettre dans `staticMesh` (un seul mesh géant n'est jamais exclu par le frustum culling).

**Bâtiments**
- `building(x,z,w,d,h,teinteMur,teinteToit,kind)` avec `kind` ∈ `stone`, `plaster`, `plank`. Cinq matériaux par bâtiment (mur, toit, soubassement + porte, vitres, cadres), un mesh par matériau : les fenêtres, cadres et la porte sont fusionnés par matériau (`merged()`), soit 5 draw calls par bâtiment quel que soit le nombre de fenêtres.
- Ils sont ajoutés à `occluders` sous la forme `{meshes, ray, mats}` : `sync()` lance un rayon caméra → commando sur `oc.ray` (mur et toit seulement, pour un raycast bon marché) et passe tous les `oc.mats` à l'opacité 0,3 si un bâtiment masque le commando. Tout nouveau matériau d'un bâtiment doit être `transparent: true` et ajouté à `mats`. Le dépôt utilise le même mécanisme (sans `ray`, il raycaste ses `meshes`).

**Matériaux transparents double face**
- Three.js r160 dessine un matériau `transparent` + `DoubleSide` en deux passes (deux draw calls). Les cônes et la balise d'objectif ont `forceSinglePass: true` (géométrie plate ou mélange additif : aucun écart visuel). Faire de même pour tout nouvel objet de ce type qui ne se recouvre pas lui-même.

## 5. Gameplay : comment ça marche dans le code

**Perception** (`updateEnemy`)
- `seesPlayer(e)` : distance ≤ portée (NEAR=5 si le commando est accroupi sans corps, RANGE=10 sinon, ×1,2 pendant l'alerte), angle dans le demi-angle `HALF=0,6 rad`, puis `losClear`.
- Le soupçon `e.sus` monte plus vite si le commando est proche, s'il court, ou si l'alerte est active. À 1 → `goAlert`.
- Les gardes repèrent aussi les corps non cachés (`found`) dans leur cône, à la portée `bodyRange()` (RANGE ×1,2 pendant l'alerte, comme les cônes affichés), ce qui déclenche `raiseAlarm` à l'emplacement du corps. `exposure()` (couleur de l'anneau d'un corps) utilise la même portée. Garder `bodyRange()` partout où l'on teste la visibilité d'un corps.

**Machine à états des gardes** (`e.state`)
`routine` (patrouille par waypoints ou sentinelle qui balaie) → `suspicious` (s'arrête, se tourne) → `investigate` (va voir un bruit, regarde autour 3,5 s) → `return` (revient au poste ou au waypoint le plus proche). `alert` (voit le commando : tire toutes les 1,1–1,6 s, poursuit s'il est à plus de 8 m) → `hunt` (cherche autour de la dernière position) → `return` quand l'alerte retombe. `dead`.

**Ajouter un garde** : une entrée dans `ENEMIES`, soit sentinelle `{x, z, a, scan}` (scan = amplitude du balayage en radians), soit patrouille `{path: [[x,z], ...]}`. Les waypoints doivent être sur des cases libres (voir test partie 8).

**Tirs ennemis** : probabilité 0,2–0,6 selon la distance (`0,6 − 0,025 × d`, −0,12 si le commando est accroupi, bornée à 0,2), portée 12 m. **Invariant à garder** : portée du pistolet (15) > portée de tir ennemie (12) ≥ portée de vue en alerte (12). Sinon le joueur se fait tirer dessus sans pouvoir répondre (bug déjà corrigé une fois).

**Bruit** : `makeNoise(x, z, rayon)` envoie en `investigate` les gardes calmes dans le rayon, et redirige ceux en `hunt`. Sources : course 4,5 (toutes les 0,35 s), pierre 7 à l'impact, tir de sniper 9 autour du tireur, balle de sniper perdue 6 à l'impact, pistolet 14.

**Actions bloquantes** : pendant `P.busy` (couteau, ramasser, poser, explosif), le bouton contextuel est masqué et `ctxAction()` ne fait rien. Un corps inatteignable (`findPath` vide) annule la tâche avec le message « Impossible d'atteindre le corps ».

**Qualité adaptative** : en qualité haute et en jeu, la durée moyenne des frames est mesurée par fenêtres de 150 frames ; si une fenêtre dépasse 1/42 s par frame, `lowerQuality()` passe en qualité basse : DPR plafonné à 1,1, herbe × 0,45, fumée masquée, grain masqué (classe `lowq`). La mesure s'arrête alors : la qualité ne remonte jamais pendant la session (même après Rejouer).

## 6. Direction artistique actuelle (A+)

Choisie après comparaison de plusieurs pistes (diorama doré, toon, nuit, hiver, A sépia) :
- Lumière couverte mais soleil franc (`DirectionalLight 0xfff0d8`, intensité 2,7) et ciel froid (`Hemisphere 0xa8b6c6 / 0x5a4c3a`), tone mapping ACES, exposition 1,2, brume grise `0x6e7376`.
- Pas de filtre de couleur global. Le contraste vient de la hiérarchie des valeurs : sol sombre et peu bruité, route et murs plus clairs. Vignette légère (`#grade`) et grain animé (`#grain`) en CSS.
- Liseré lumineux (rim light) dans le shader des soldats : doré pour le commando (`MAT_P`, `GEAR_P`), bleu pâle pour les gardes (`MAT_E`, `GEAR_E`). Sert à distinguer ami/ennemi.
- Cônes verts (jaunes en soupçon, rouges en alerte) avec contour clair.
- Décor de guerre : barbelés en accordéon (`wire()`, un seul `LineSegments`), chevaux de frise (`frise()`), cratères, ~20 % d'arbres morts.

Personnages : passage du rig procédural maison au mannequin Quaternius animé en mocap pour le réalisme des mouvements (novembre 2026). Décisions écartées et pourquoi : sprites pré-rendus (rotation saccadée, artefacts au zoom, la géométrie des persos n'est pas le goulot de perf) ; tilt-shift (rendu « jouet », contraire au ton adulte voulu ; le CSS qui restait a été supprimé). La poussière en particules, déjà masquée en A+ mais recalculée à chaque frame, a été retirée du code.

## 7. Contraintes non fonctionnelles (NFR)

Chiffres mesurés le 22/11/2026 en Chrome headless (swiftshader, 390 × 844, DPR 1, qualité haute), sauf mention « cible » ou « estimé ». Les vues sont des positions de caméra fixes : départ (3,5 ; 44,5) zoom 1,1, base (34 ; 15) zoom 1,0, large (24 ; 24) zoom 0,55 (dézoom maximal), explosion (dépôt, image suivant la détonation).

**Performance**

| Exigence | Valeur |
|---|---|
| Fluidité (cible) | 60 fps sur un téléphone récent, 30 fps minimum sur un milieu de gamme de 3 ans (qualité basse automatique) |
| Draw calls par frame | Départ 47, base 126, large 143, explosion 204 (pic à la détonation : ~80 sprites de particules, éteints en 1 à 5 s), 1 s après ~136. **Plafond : 140 en vue de jeu normale (zoom ≥ 1)**. La vue large et le pic d'explosion sont tolérés au-dessus : dézoom maximal rare, pic transitoire. Les postes principaux : soldats (2 primitives skinnées + 3 pièces d'équipement + armes par soldat visible), cônes (3 par garde vivant, dessinés même hors champ), 24 sprites de fumée, 5 par bâtiment |
| Triangles par frame | Départ ~131 000, base ~232 000, large ~257 000, explosion ~289 000. Plafond : ~400 000 |
| Programmes shader | 20, tous compilés au chargement par `renderer.compile()`. Le nombre ne bouge plus ensuite (vérifié sur 3 parties complètes avec explosion et Rejouer). Chaque nouveau type de matériau en ajoute un : réutiliser les matériaux existants |
| Ombres | `PCFShadowMap` (pas `PCFSoftShadowMap`, plus cher), carte 2048², calculée une fois, recalculée seulement à l'explosion et au `reset()`. Aucune ombre dynamique par frame (règle dure) |
| Lumières | 1 directionnelle + 1 hémisphère + 1 `PointLight` (`flash`) permanente à intensité 0, allumée 0,8 s à l'explosion. Le nombre de lumières ne change jamais en cours de partie |
| Soldats hors champ | Ni dessinés (frustum culling sur `BSPH`), ni animés (`mixer.update` sauté), cônes non recalculés |
| Pas de temps | `dt` plafonné à 0,05 s : le jeu ralentit plutôt que de sauter si le téléphone rame |
| Résolution | `devicePixelRatio` plafonné à 1,75 (1,1 en qualité basse) |
| Qualité adaptative | Bascule définitive en qualité basse dès qu'une fenêtre de 150 frames de jeu dépasse 1/42 s par frame en moyenne |

**Chargement et poids**

| Exigence | Valeur |
|---|---|
| Fichier `index.html` | ~95 Ko. Plafond conseillé : 150 Ko, au-delà la relecture complète par un LLM devient coûteuse |
| Asset personnages | `assets/soldier.gltf.json` ~605 Ko (~250 Ko en gzip, GitHub Pages compresse) : mesh quantifié + 15 clips, buffer en base64. Format JSON choisi parce que les artifacts claude.ai ne servent pas les `.glb`. **Pas de meshopt** (l'asset faisait ~390 Ko avec) : son décodeur instancie du WebAssembly, que la CSP des artifacts claude.ai bloque (pas de `'wasm-unsafe-eval'`) ; sans lui le `GLTFLoader` lit le fichier sans dépendance. Ajouter un clip coûte 5 à 30 Ko |
| Dépendances réseau | Three.js 0.160 (~1,3 Mo non compressé, ~300 Ko gzip, mis en cache par le CDN), `BufferGeometryUtils`, `GLTFLoader`, `SkeletonUtils`, `soldier.gltf.json` (même origine que la page), 2 polices Google (`fonts.googleapis.com` pour la CSS, `fonts.gstatic.com` pour les fichiers). Rien d'autre |
| Génération au démarrage | Textures canvas (sol 2048², 4 textures de matériaux, nuages), fusion de géométrie, compilation des shaders, carte d'ombres : quelques centaines de ms sur téléphone (cible < 1,5 s avant l'écran d'intro jouable) |
| Échec de chargement | CDN injoignable, script en erreur, promesse rejetée ou plus de 15 s : le script de secours rend le bouton cliquable (« Touchez pour réessayer », recharge la page). Asset personnages introuvable : le `catch` de `loadAsync` affiche « Échec du chargement des personnages. Touchez pour réessayer » avec le même comportement |
| Mémoire | Tas JS ~9–10 Mo après GC (9,0 Mo au départ, 9,5 / 9,6 / 9,8 Mo après chacune de 3 parties). Ressources GPU constantes d'une partie à l'autre (104 géométries, 12 textures hors effets, 20 programmes). Côté GPU, estimé à ~40–50 Mo, dominés par la texture du sol (2048² + mipmaps) et la carte d'ombres. Cible : rester sous 150 Mo au total |

**Compatibilité**

| Exigence | Valeur |
|---|---|
| Navigateurs | Chrome Android récent, Safari iOS 16+ (`CanvasRenderingContext2D.roundRect`, import maps, modules ES), Chrome/Firefox/Safari desktop |
| WebGL | WebGL 2 (Three.js r160). Pas de repli WebGL 1 |
| Écran | Pensé pour le portrait, 360 px de large minimum (la barre de 6 boutons tient en 361 px). Paysage et desktop fonctionnent, sans mise en page dédiée |
| Encoches | Marges `env(safe-area-inset-*)` sur le HUD, la barre et la lunette |
| Entrées | Tactile (tap, double-tap, glisser, pincer) et souris (clic, glisser, molette). Pas de clavier ni de manette |
| Hors ligne | Non : il faut le CDN au premier chargement. Pas de service worker. La page doit être servie en HTTP (pas en `file://`) pour charger `soldier.gltf.json` |

**Ergonomie et accessibilité**

- Cibles tactiles d'au moins 48 px (boutons d'action 56 × 62 px, Centrer 48 px, Tirer 96 × 76 px).
- Tolérance de sélection d'un personnage au tap : 58 px autour des pieds, du torse et de la tête.
- Chaque information de gameplay est doublée en forme ou en texte en plus de la couleur : « ? » / « ! » au-dessus des gardes, messages toast, bandeau ALERTE, texte dans la lunette. Les anneaux des corps et les cônes reposent sur la couleur seule (dette connue pour les daltoniens).
- Retour haptique `navigator.vibrate` quand le commando est touché, s'il est disponible.
- Langue : français uniquement, chaînes en dur dans le code.
- Pas de gestion de `prefers-reduced-motion` dans le jeu (grain animé, secousses de caméra) : dette connue.

**Robustesse**

- L'audio échoue silencieusement si WebAudio est indisponible ou bloqué ; il est suspendu quand l'onglet passe en arrière-plan.
- `localStorage`, `fetch` externe, `alert` ne sont pas utilisés : compatible avec les iframes sandboxées (artifact claude.ai).
- La carte est déterministe (`rng` à graine fixe 11) : même disposition à chaque partie. Le gameplay (tirs, hésitations) utilise `Math.random`.
- Toute modification de la carte doit garder l'accessibilité de tous les points clés (test de la partie 8).

**Sécurité et vie privée**

- Aucune donnée collectée, aucun compte, aucun cookie, aucun stockage local.
- Seules requêtes sortantes : `cdn.jsdelivr.net` (Three.js), `fonts.googleapis.com` et `fonts.gstatic.com` (polices). Remplacer les polices par des polices système supprime les appels à Google si besoin.
- Pas d'accès caméra, micro ni localisation.

**Maintenabilité**

- Une page plus un asset, sans build ni dépendance npm à l'exécution, versions figées (Three.js 0.160.0) : le jeu doit tourner tel quel dans plusieurs années tant que le CDN sert cette version.
- Code compact mais découpé en sections commentées. Toute nouvelle fonctionnalité va dans la section correspondante plutôt qu'en fin de fichier.
- Le README est à mettre à jour à chaque changement de mécanique, de constante clé ou de convention.

## 8. Tester

Pas de tests unitaires. La méthode utilisée pendant le développement : un navigateur headless qui charge le fichier, avec les dépendances servies en local.

```bash
npm i three@0.160.0 playwright-core
```

```js
// test.mjs — squelette
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.route('**/three.module.js', r => r.fulfill({ path: 'node_modules/three/build/three.module.js', contentType: 'text/javascript' }));
await p.route('**/examples/jsm/**', r => { const u = new URL(r.request().url());
  r.fulfill({ path: 'node_modules/three' + u.pathname.split('three@0.160.0')[1], contentType: 'text/javascript' }); });
await p.route('**/fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' })); // CSS vide : fonts.gstatic.com n'est jamais appelé
// --allow-file-access-from-files (ou un serveur HTTP) est nécessaire pour que soldier.gltf.json se charge
await p.goto('file:///chemin/vers/dbg.html');
await p.waitForFunction(() => !document.getElementById('start').disabled, null, { timeout: 90000 });
await p.click('#start');
// ... scénario, captures : await p.screenshot({ path: 'x.png' });
console.log(errs); await b.close();
```

**Hook de debug** : pour piloter le jeu depuis le test, faire une copie `dbg.html` (dans un dossier qui contient aussi `assets/`) où l'on insère, juste après le **dernier** `requestAnimationFrame(loop);` du fichier (celui qui lance la boucle, hors de la fonction `loop`) :

```js
window.__g={cam,camTarget,findPath,walk,scene,renderer,quality,fx,DEPOT,EXTRACT,get P(){return P},get enemies(){return enemies},get state(){return state},get alarm(){return alarm},set alarm(v){alarm=v},get fuse(){return fuse},set fuse(v){fuse=v},get planted(){return planted},get exploded(){return exploded},ctx:()=>ctxAction(),onTap,reset,explode,kill,lowerQuality,nearestBody,exposure};
```

Un petit script Python qui fait `s.rindex('requestAnimationFrame(loop);')` et insère le hook après suffit. Ne jamais laisser ce hook dans `index.html` publié (`grep -c __g index.html` doit donner 0).

**Mesurer les budgets NFR** : avec le hook, lire `__g.renderer.info.render.calls`, `.render.triangles` et `.programs.length`. Pour des vues fixes, couper le suivi de caméra (simuler un glisser : `pointerdown` puis `pointermove` puis `pointercancel` sur le canvas), placer `camTarget` et `cam.zoom`, attendre 3 frames, lire les compteurs. Tas JS : session CDP, `HeapProfiler.collectGarbage` puis `Runtime.getHeapUsage`.

**Vérifications à refaire après toute modif de la carte** : depuis le départ `(3.5, 44.5)`, `findPath` doit trouver un chemin vers chaque waypoint de chaque garde, la brèche `(21.5, 13.5)`, le portail `(31.5, 25.5)`, le devant du dépôt `(38.5, 9.8)` et l'extraction `(41.5, 44.5)`.

**Scripts de régression utiles** (à réécrire au besoin, principe seulement) :
- **Mission complète** : vérifie les chemins ci-dessus, élimine les gardes via le hook, amène le commando au dépôt, pose l'explosif (`ctx()`), le recule, raccourcit la mèche (`fuse = 0.05`), attend `exploded`, l'amène à l'extraction, attend l'écran de victoire, clique Rejouer et vérifie `state === 'play'` avec 10 gardes. Zéro `pageerror`.
- **Mémoire sur 3 parties** : enchaîne 3 fois le scénario précédent (avec tirs, couteau et explosion pour créer des effets). Après chaque Rejouer, relever `renderer.info.memory.geometries/textures`, `programs.length`, `fx.length`, `scene.children.length` et le tas JS : les compteurs GPU et de scène doivent être identiques d'une partie à l'autre.
- **Mesures** : vues départ / base / large / explosion décrites en partie 7, avec captures à regarder (fenêtres des bâtiments, transparence quand le commando passe derrière un bâtiment).
- **Animation hors champ** : compter les appels à `mixer.update` par garde (en enveloppant `mixer.update`) caméra au départ : 0 pour les gardes hors champ et pour un corps posé.
- **Chargement dégradé** : refuser `three.module.js` (`route.abort()`) et vérifier que le bouton passe à « Touchez pour réessayer » et devient cliquable ; idem avec une copie de la page qui pointe vers un asset inexistant (Playwright n'intercepte pas les URL `file://`, d'où la copie).

Le rendu swiftshader est lent (quelques fps) : le temps de jeu avance moins vite que le temps réel. Utiliser `waitForFunction` sur un état plutôt que des délais fixes.

## 9. Limites connues et pistes

- Les gardes ne se gênent pas entre eux ni avec le commando (pas de collision entre personnages).
- Pas de sauvegarde, une seule mission.
- Pas de reptation : la bibliothèque gratuite de Quaternius n'en contient pas (elle existe dans la version payante « Pro »). Le commando s'accroupit à la place ; la position couchée du sniper est une pose fixe (dernière image de Hit_Knockback retournée).
- Les mannequins n'ont pas de visage, et la main gauche ne tient pas vraiment le fusil (clips de pistolet à deux mains réutilisés).
- Les persos à proximité immédiate d'un mur peuvent visuellement le traverser un peu.
- Le passage de la qualité haute à basse est définitif pendant la session.
- Cases franchissables isolées sur la carte (exemple : `(0, 32)` en bordure) : un corps posé là ne peut plus être atteint. Le jeu l'indique (« Impossible d'atteindre le corps ») mais la carte n'est pas corrigée.
- Un garde tué hors champ n'est pas animé (`mixer.update` sauté) : quand son corps se pose, le bassin n'a pas bougé et `e.x/e.z` restent à l'endroit où il se tenait, sans le décalage qu'aurait produit la chute vue à l'écran. Invisible en pratique.
- Seuls les matériaux présents dans la scène au chargement sont compilés d'avance : un nouveau type de matériau qui apparaît en cours de jeu provoquera un à-coup à sa première image.
- Vue large (dézoom maximal) et explosion au-dessus de 140 draw calls. Piste si besoin : fusionner l'équipement des soldats (3 pièces + armes par soldat) ou masquer les sprites de fumée d'opacité nulle.
- Idées déjà évoquées avec le propriétaire : traîner un corps accroupi (plus lent, plus discret) ; mission d'hiver de nuit avec projecteur de mirador comme second type de cône mobile (lookdev réalisé) ; éclaircir la forêt de départ ; alléger les cônes rouges en alerte ; ajuster la fenêtre « par derrière » du couteau.

## 10. Instructions pour un LLM qui reprend le projet

1. **Lis ce document, puis le fichier entier** avant de modifier. Le code est compact (une ligne peut contenir plusieurs instructions). Repère-toi aux commentaires de section.
2. **Garde le format** : une page HTML plus `assets/soldier.gltf.json`, Three.js 0.160 en importmap, pas de build, pas d'asset externe, pas de framework, pas de WebAssembly. Le propriétaire publie sur GitHub Pages et parfois en artifact claude.ai.
3. **Édite par remplacements exacts et vérifiés.** Méthode qui a bien marché : un script Python qui fait `assert s.count(ancien) == 1` avant chaque `replace`, puis `node --check` sur le module extrait (et sur le script classique de secours s'il est touché) :
   ```bash
   python3 -c "s=open('index.html').read();i=s.index('<script type=\"module\">')+22;j=s.index('</script>',i);open('/tmp/m.mjs','w').write(s[i:j])" && node --check /tmp/m.mjs
   ```
4. **Respecte les conventions de la partie 4**, surtout les signes des rotations du rig, `addS` avant la fusion, `mark()` pour tout obstacle, `shadowMap.needsUpdate` quand le décor statique change, pas de lumière ajoutée en jeu, `setDom()` pour le HUD par frame, `disposeFx()`/`reset()` pour la mémoire, et l'exclusion des gardes `gone`.
5. **Après chaque changement** : respect des budgets NFR de la partie 7, vérification syntaxique, test headless (zéro erreur `pageerror`), test d'accessibilité des chemins si la carte a bougé, test mémoire sur plusieurs parties si tu crées ou détruis des objets, capture d'écran pour juger le visuel. Regarde les captures avant d'annoncer que c'est réussi.
6. **Performance mobile** : préfère cuire au chargement (textures canvas, ombres, fusion de géométrie, compilation des shaders) plutôt que calculer à chaque frame. Évite les filtres plein écran et les post-process WebGL. Une nouvelle lumière dynamique coûte cher.
7. **Préférences du propriétaire** : réponses en français, directes, sans remplissage. Il aime qu'on lui propose 2–3 options argumentées avant un gros chantier visuel, et qu'on chiffre la probabilité que la solution lui convienne. Il teste sur son téléphone.
8. **Déploiement** : copier `index.html` et `assets/` dans `app/derriere-les-lignes/` du dépôt `aannet/aannet.github.io`, commit sur `master` (c'est la branche publiée par GitHub Pages), push. Mettre à jour la carte de la page d'accueil si la description change. Si l'asset est régénéré (`tools/build-soldier.mjs`), mettre à jour la liste des clips dans `assets/CREDITS.md`.
