# Derrière les lignes — dossier de reprise

Jeu d'infiltration tactique façon *Commandos: Behind Enemy Lines* (1998), jouable au doigt sur téléphone, dans une page `index.html` (~900 lignes, ~100 Ko) plus un asset `assets/soldier.gltf.json` (~390 Ko, glTF JSON auto-contenu) pour les personnages. Three.js r160 via CDN, aucun build. Les personnages sont le mannequin animé de Quaternius (Universal Animation Library, CC0, animations mocap) ; tout le reste est procédural (décor, textures, sons, équipement des soldats).

- En ligne : https://aannet.github.io/app/derriere-les-lignes/
- Source : ce dossier, fichier `index.html`
- Lien depuis la page d'accueil du dépôt : carte « DERRIÈRE LES LIGNES » dans `/index.html`

Ce document sert à reprendre le projet plus tard, seul ou avec un LLM. La partie 10 s'adresse directement au LLM.

---

## 1. Le jeu en bref

Une mission solo. Le commando part de la forêt au sud-ouest, entre dans une base clôturée (brèche dans la clôture ouest ou portail gardé au sud), pose un explosif sur les cuves du dépôt de carburant, a 25 s pour s'éloigner, puis rejoint le camion d'extraction au sud-est pendant que la garnison converge vers le dépôt.

| Élément | Comportement |
|---|---|
| Déplacement | Tap au sol : marche. Double-tap : course (bruyante, rayon 4,5). Bouton Accroupi : marche accroupie lente, profil bas (même règle de détection que l'ancienne reptation) |
| Cônes de vision | Partie foncée (0–5 m) : voit le commando même à plat ventre. Partie claire (5–10 m) : seulement debout. Bloqués par murs, arbres, buissons, sacs. **La clôture ne bloque pas la vue** |
| Soupçon | Jauge par garde : « ? » jaune, puis « ! » rouge = alerte |
| Alerte | Sirène, gardes dans un rayon de 22 m chassent la dernière position connue. Retombe après 25 s sans contact visuel |
| Couteau (défaut) | Tap sur un garde : approche puis élimination silencieuse **si on est hors de son cône frontal** (angle > HALF+0,35 rad). Anneau vert/rouge sous la cible. De face : il se retourne et déclenche l'alerte |
| Pistolet (6) | Portée 15 m, 85 % de réussite, bruit rayon 14. Dégainage automatique sur un garde qui voit le commando ou qui est en alerte, même couteau équipé |
| Sniper (3) | Allonge le commando, ouvre une lunette (zoom ×3,4, glisser pour viser, pincer pour zoomer). Portée 30 m, ligne de tir dégagée requise (sinon la balle s'écrase sur l'obstacle). Réarmement 1,5 s. Tir raté = bruit à l'impact (diversion possible) |
| Pierre (5) | Lancer jusqu'à 10 m, bruit rayon 7 : les gardes viennent enquêter |
| Corps | Bouton Porter près d'un corps (ou tap sur le corps), puis Poser. Anneau sous chaque corps : vert caché, orange exposé, rouge dans un cône. Corps vu par un garde = alerte |
| Explosif | Bouton contextuel à moins de 3,4 m du dépôt. Mèche 25 s. Tue tout dans un rayon de 7 m (commando compris à moins de 6 m) |
| Victoire | Dépôt détruit puis commando dans la zone d'extraction (rayon 2,2) |
| Défaite | 3 impacts de balle, ou pris dans l'explosion |

## 2. Pile technique

- **Three.js 0.160.0** via `importmap` sur `cdn.jsdelivr.net` (`three` + `three/addons/` pour `BufferGeometryUtils`, `GLTFLoader`, `SkeletonUtils` et le décodeur meshopt).
- **Personnages** : `assets/soldier.gltf.json`, mannequin Quaternius + 17 clips (UAL1 et UAL2, CC0), construit par `tools/build-soldier.mjs` (glTF-Transform : tri des clips, rééchantillonnage, quantification, compression meshopt). Crédits dans `assets/CREDITS.md`.
- **Un seul `<script type="module">`**, tout le code est dans un bloc `{ ... }` pour éviter les globales.
- **Polices** : Google Fonts (Black Ops One pour les titres, Barlow Condensed pour l'interface).
- **Audio** : WebAudio pur (bruit filtré + oscillateurs), initialisé au premier clic (« Commencer »).
- **Entrées** : Pointer Events (tap, double-tap, glisser, pincer), molette pour le zoom sur desktop.
- **Cible** : téléphone en portrait, ~60 fps sur un téléphone récent. Fonctionne aussi sur desktop.
- **Contraintes de l'hébergement artifact claude.ai** (si republié là) : scripts uniquement depuis cdnjs, jsdelivr, unpkg ; pas de `fetch` externe ; pas d'images distantes. Le fichier respecte déjà ces règles.

## 3. Carte du fichier

Le script est découpé par des commentaires `// ---------- nom ----------`. Ordre d'exécution = ordre du fichier.

| Section | Contenu |
|---|---|
| HTML + CSS | HUD (objectif, cœurs, alerte, mèche, toast), barre d'actions (Accroupi, Couteau, Pistolet, Sniper, Pierre, bouton contextuel), bouton Centrer flottant, lunette (`#scope`), écrans intro et fin, vignette `#grade`, grain `#grain` |
| `grille` | Grille 48×48, tableaux `mv` (bloque le passage) et `si` (bloque la vue), `mark()`, `rng()` déterministe (seed 11) |
| `rendu` | Renderer, caméra orthographique iso, lumières, textures de nuages, `patchMat()` (ombres de nuages + vent), géométrie statique fusionnée (`colored`, `addS`), textures peintes (`stoneTex`, `plasterTex`, `tileTex`, `plankTex`), tous les objets de la carte, forêt, barbelés |
| `sol peint` | Canvas 2048 px peint une fois : boue, route, dalle de la base, cratères, flaques, AO autour des obstacles |
| `herbe instanciée` | `InstancedMesh` de ~2600 touffes, vent dans le vertex shader |
| `ambiance` | Fumée de cheminées, drapeau animé, poussière (désactivée en A+), objet `quality` |
| `pathfinding` | A* 8 directions sans coupe de coin, lissage par ligne de vue, `losClear` (vue), `castRay` (cônes) |
| `soldats : modèle Quaternius` | Chargement de `soldier.gltf.json` (top-level await), peinture des uniformes par os, équipement accroché aux os, `makeSoldier()`, `animate()` (pose → clip), `placeGear()` (armes en main), `placeBody()` (corps au sol ou porté) |
| `cônes de vision` | Maillages dynamiques des cônes (proche/lointain + contour), recalculés à chaque frame avec occlusion |
| `audio` | `sfx.*`, sirène |
| `HUD` | `toast()`, cœurs, `setMode()` (pierre), `setWeapon()` (couteau/pistolet) |
| `état de jeu` | Définition des gardes `ENEMIES`, variables globales de partie, `reset()` |
| `perception` | `seesPoint`, `seesPlayer`, `setReturn`, `investigate`, `raiseAlarm`, `goAlert`, `makeNoise` |
| `actions` | `kill`, tirs, pierre, particules, explosion, corps (`exposure`, `pickUp`, `dropBody`), `ctxAction`, sniper (`enterScope`, `sniperFire`…), couteau (`stabOK`, `startStab`) |
| `mise à jour` | `updatePlayer`, `moveAlong`, `updateEnemy` (machine à états), `update` (boucle logique), `sync` (positions 3D, transparence des bâtiments), `updateFx`, `updateCamera` |
| `entrées` | Conversion écran → sol, sélection d'un personnage au tap (`pickChar`), `onTap`, gestes, boutons, `endGame` |
| `boucle` | Grain, `reset()`, `loop()`, qualité adaptative |

## 4. Conventions à connaître absolument

**Monde et grille**
- 1 case = 1 unité monde. La carte couvre x ∈ [0,48], z ∈ [0,48]. Une case `(i,j)` a son centre en `(i+0.5, j+0.5)`.
- x croît vers l'est, z vers le sud (bas-gauche de l'écran = sud-ouest).
- `mark(x,z,w,d,move,sight)` bloque des cases. Tout obstacle visuel qui doit compter pour le gameplay doit passer par `mark()`.

**Orientation**
- Un angle `a` correspond à la direction `(sin a, cos a)` sur le plan XZ. `a = 0` regarde vers +z (sud). `root.rotation.y = a`.
- `wrapA()` ramène un angle dans [-π, π], `turnTo(a, cible, vitesseMax)` tourne progressivement.

**Caméra**
- Orthographique, décalage fixe `CAM_OFF = (22, 26, 22)` depuis `camTarget`. `cam.zoom` entre 0,55 et 2,4 (2,2 à 5 en lunette).
- `follow = true` : la caméra suit le commando. Glisser passe `follow` à false, le bouton Centrer le remet.

**Personnages** (modèle Quaternius)
- `soldier.gltf.json` contient un mannequin skinné (65 os, nommage façon Unreal : `pelvis`, `spine_01..03`, `Head`, `upperarm_l/r`, `lowerarm_l/r`, `hand_l/r`, `thigh_l/r`, `calf_l/r`, `foot_l/r`) et 17 clips sans root motion.
- Au chargement, `painted('p'|'e')` clone la géométrie et peint une couleur par sommet selon l'os dominant (`zone()` : peau, mains, veste, manches, pantalon, bottes). La même passe calcule des boîtes englobantes par os (`ZB`) qui servent à placer l'équipement. **Utiliser `getVertexPosition` (position skinnée)** : la pose par défaut des os n'est pas la pose de bind brute.
- L'équipement (`GEAR`) est construit en coordonnées de pose de repos puis accroché aux os avec `bone.attach()` : casque ou béret sur `Head`, sac et fusil dans le dos sur `spine_03`, ceinturon sur `pelvis`.
- Les armes en main (fusil des gardes, couteau, pistolet, sniper couché) sont des meshes de scène replacés à chaque frame par `placeGear(s, yaw)` sur `hand_r`, après le positionnement de la racine.
- `animate(s, pose, {dt, speed, p, fall})` choisit un clip et fait un fondu de 0,22 s quand il change. Clips en boucle : vitesse de lecture = vitesse réelle / vitesse du clip (`SPEED` : marche 1,0, jogging 3,0, sprint 5,0, accroupi 0,75, porter 0,65 m/s), pour éviter que les pieds glissent. Clips « pilotés » (lancer, couteau, ramasser, chute) : `timeScale = 0` et le temps du clip suit la progression `p`.
- Correspondance pose → clip : `stand` → Idle / Jog (commando) ou Walk / Jog (gardes) / Sprint ; `crouch` → Crouch_Idle / Crouch_Fwd ; `rifle` (garde calme, fusil dans le dos) ; `ready` → Pistol_Idle + fusil en main ; `aimRifle`, `aimPistol` → Pistol_Aim_Neutral ; `carry` → Walk_Carry ; `kneel` → Fixing_Kneeling (explosif) ; `pickup` → PickUp_Table ; `throw` → OverhandThrow ; `stab` → Sword_Attack ; `dying`/`dead` → Hit_Knockback (couteau) ou Death01 (balle) ; `proneAim` → dernière image de Hit_Knockback, retournée face contre terre (`model.rotation.z = π`).
- Un corps tué se « pose » quand la chute est finie : `e.x/e.z` sont déplacés sur le bassin, puis `placeBody()` garde le bassin à cet endroit. Porté, le corps est tenu à 1 m de haut devant le commando.
- Échelle : `SCALE = 1.03` (environ 1,75 m). Le modèle regarde vers +z dans sa pose de repos, comme le reste du jeu.

**Ombres statiques** (optimisation clé)
- `renderer.shadowMap.autoUpdate = false`. La carte d'ombres est calculée une fois au chargement. Les persos ne projettent pas d'ombre réelle mais un disque dégradé (`blob`), et reçoivent les ombres du décor.
- **Si un objet statique change** (exemple : le dépôt qui explose), il faut appeler `renderer.shadowMap.needsUpdate = true`.

**Géométrie statique fusionnée**
- Tout le petit décor (arbres, rochers, caisses, clôtures, sacs, camion…) passe par `addS(geo, couleur, x, y, z, {rx,ry,rz,sx,sy,sz,ao,j})`, empilé dans `S`, puis fusionné en un seul mesh `staticMesh` à vertex colors. `ao` assombrit les sommets bas (fausse occlusion ambiante), `j` ajoute une variation de teinte.
- Conséquence : `addS` ne marche **qu'avant** la ligne `const staticMesh=...`. Après, il faut créer des meshes séparés.

**Bâtiments**
- `building(x,z,w,d,h,teinteMur,teinteToit,kind)` avec `kind` ∈ `stone`, `plaster`, `plank`. Ils sont ajoutés à `occluders` : `sync()` les rend transparents (opacité 0,3) quand ils masquent le commando.

## 5. Gameplay : comment ça marche dans le code

**Perception** (`updateEnemy`)
- `seesPlayer(e)` : distance ≤ portée (NEAR=5 si le commando est accroupi, RANGE=10 sinon, ×1,2 pendant l'alerte), angle dans le demi-angle `HALF=0,6 rad`, puis `losClear`.
- Le soupçon `e.sus` monte plus vite si le commando est proche, s'il court, ou si l'alerte est active. À 1 → `goAlert`.
- Les gardes repèrent aussi les corps non cachés (`found`) dans leur cône, ce qui déclenche `raiseAlarm` à l'emplacement du corps.

**Machine à états des gardes** (`e.state`)
`routine` (patrouille par waypoints ou sentinelle qui balaie) → `suspicious` (s'arrête, se tourne) → `investigate` (va voir un bruit, regarde autour 3,5 s) → `return` (revient au poste ou au waypoint le plus proche). `alert` (voit le commando : tire toutes les 1,1–1,6 s, poursuit s'il est à plus de 8 m) → `hunt` (cherche autour de la dernière position) → `return` quand l'alerte retombe. `dead`.

**Ajouter un garde** : une entrée dans `ENEMIES`, soit sentinelle `{x, z, a, scan}` (scan = amplitude du balayage en radians), soit patrouille `{path: [[x,z], ...]}`. Les waypoints doivent être sur des cases libres (voir test partie 8).

**Tirs ennemis** : probabilité 0,2–0,7 selon la distance (−0,12 si le commando est accroupi), portée 12 m. **Invariant à garder** : portée du pistolet (15) > portée de tir ennemie (12) > portée de vue en alerte (12). Sinon le joueur se fait tirer dessus sans pouvoir répondre (bug déjà corrigé une fois).

**Bruit** : `makeNoise(x, z, rayon)` envoie en `investigate` les gardes calmes dans le rayon, et redirige ceux en `hunt`.

**Qualité adaptative** : sur les 150 premières frames de jeu, si la moyenne dépasse 1/42 s par frame, `lowerQuality()` baisse la résolution, divise l'herbe par deux, coupe la fumée et le grain.

## 6. Direction artistique actuelle (A+)

Choisie après comparaison de plusieurs pistes (diorama doré, toon, nuit, hiver, A sépia) :
- Lumière couverte mais soleil franc (`DirectionalLight 0xfff0d8`, intensité 2,7) et ciel froid (`Hemisphere 0xa8b6c6 / 0x5a4c3a`), tone mapping ACES, exposition 1,2, brume grise `0x6e7376`.
- Pas de filtre de couleur global. Le contraste vient de la hiérarchie des valeurs : sol sombre et peu bruité, route et murs plus clairs.
- Liseré lumineux (rim light) dans le shader des soldats : doré pour le commando (`MAT_P`, `GEAR_P`), bleu pâle pour les gardes (`MAT_E`, `GEAR_E`). Sert à distinguer ami/ennemi.
- Cônes verts (jaunes en soupçon, rouges en alerte) avec contour clair.
- Décor de guerre : barbelés en accordéon (`wire()`, un seul `LineSegments`), chevaux de frise (`frise()`), cratères, ~20 % d'arbres morts.

Personnages : passage du rig procédural maison au mannequin Quaternius animé en mocap pour le réalisme des mouvements (novembre 2026). Décisions écartées et pourquoi : sprites pré-rendus (rotation saccadée, artefacts au zoom, la géométrie des persos n'est pas le goulot de perf) ; tilt-shift (rendu « jouet », contraire au ton adulte voulu).

## 7. Contraintes non fonctionnelles (NFR)

Chiffres mesurés le 22/11/2026 sur la version publiée, sauf mention « cible ».

**Performance**

| Exigence | Valeur |
|---|---|
| Fluidité (cible) | 60 fps sur un téléphone récent, 30 fps minimum sur un milieu de gamme de 3 ans (qualité basse automatique) |
| Draw calls par frame | ~104 mesurés (scène complète, 11 gardes, 2 primitives skinnées + 3 pièces d'équipement par soldat). Plafond à ne pas dépasser : ~140 |
| Triangles par frame | ~265 000 mesurés, dont l'essentiel dans le mesh statique fusionné. Plafond : ~400 000 |
| Programmes shader | 9. Chaque nouveau type de matériau en ajoute un : réutiliser les matériaux existants |
| Ombres | Carte 2048², calculée une fois. Aucune ombre dynamique par frame (règle dure) |
| Lumières dynamiques | 1 directionnelle + 1 hémisphère en permanence. Une PointLight seulement le temps de l'explosion (0,8 s) |
| Pas de temps | `dt` plafonné à 0,05 s : le jeu ralentit plutôt que de sauter si le téléphone rame |
| Résolution | `devicePixelRatio` plafonné à 1,75 (1,1 en qualité basse) |
| Qualité adaptative | Bascule en qualité basse si la moyenne des 150 premières frames dépasse 1/42 s |

**Chargement et poids**

| Exigence | Valeur |
|---|---|
| Fichier `index.html` | ~100 Ko. Plafond conseillé : 150 Ko, au-delà la relecture complète par un LLM devient coûteuse |
| Asset personnages | `assets/soldier.gltf.json` ~390 Ko (mesh quantifié + 17 clips compressés meshopt, buffer en base64 : format JSON choisi parce que les artifacts claude.ai ne servent pas les `.glb`). Ajouter un clip coûte 5 à 30 Ko |
| Dépendances réseau | Three.js 0.160 (~1,3 Mo non compressé, ~300 Ko gzip, mis en cache par le CDN), `BufferGeometryUtils`, `GLTFLoader`, `SkeletonUtils`, décodeur meshopt, `soldier.gltf.json` (même origine que la page), 2 polices Google. Rien d'autre |
| Génération au démarrage | Textures canvas (sol 2048², 4 textures de matériaux, nuages), fusion de géométrie, carte d'ombres : quelques centaines de ms sur téléphone (cible < 1,5 s avant l'écran d'intro jouable) |
| Mémoire | ~40 Mo de tas JS mesurés. Côté GPU, environ 40 Mo dominés par la texture du sol (2048² + mipmaps) et la carte d'ombres. Cible : rester sous 150 Mo au total |

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

- L'audio échoue silencieusement si WebAudio est indisponible ou bloqué.
- `localStorage`, `fetch`, `alert` ne sont pas utilisés : compatible avec les iframes sandboxées (artifact claude.ai).
- La carte est déterministe (`rng` à graine fixe 11) : même disposition à chaque partie. Le gameplay (tirs, hésitations) utilise `Math.random`.
- Toute modification de la carte doit garder l'accessibilité de tous les points clés (test de la partie 8).

**Sécurité et vie privée**

- Aucune donnée collectée, aucun compte, aucun cookie, aucun stockage local.
- Seules requêtes sortantes : `cdn.jsdelivr.net` (Three.js) et Google Fonts. Remplacer les polices par des polices système supprime l'appel à Google si besoin.
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
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.route('**/three.module.js', r => r.fulfill({ path: 'node_modules/three/build/three.module.js', contentType: 'text/javascript' }));
await p.route('**/examples/jsm/**', r => { const u = new URL(r.request().url());
  r.fulfill({ path: 'node_modules/three' + u.pathname.split('three@0.160.0')[1], contentType: 'text/javascript' }); });
await p.route('**/fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
await p.goto('file:///chemin/vers/dbg.html'); // lancer Chrome avec --allow-file-access-from-files, ou servir en HTTP, pour que soldier.gltf.json se charge await p.waitForTimeout(2500);
await p.click('#start');
// ... scénario, captures : await p.screenshot({ path: 'x.png' });
console.log(errs); await b.close();
```

**Hook de debug** : pour piloter le jeu depuis le test, faire une copie `dbg.html` où l'on insère, juste après le premier `requestAnimationFrame(loop);` :

```js
window.__g={cam,camTarget,findPath,walk,get P(){return P},get enemies(){return enemies},ctx:()=>ctxAction(),setT:e=>{P.task={t:'knife',e};P.repath=0}};
```

Ne jamais laisser ce hook dans `index.html` publié.

**Mesurer les budgets NFR** : ajouter `window.__r=renderer;` dans la même copie, puis lire `__r.info.render.calls`, `__r.info.render.triangles` et `__r.info.programs.length` après quelques secondes de jeu.

**Vérifications à refaire après toute modif de la carte** : depuis le départ `(3.5, 44.5)`, `findPath` doit trouver un chemin vers chaque waypoint de chaque garde, la brèche `(21.5, 13.5)`, le portail `(31.5, 25.5)`, le devant du dépôt `(38.5, 9.8)` et l'extraction `(41.5, 44.5)`.

Le rendu swiftshader est lent (quelques fps) : le temps de jeu avance moins vite que le temps réel. Utiliser `waitForFunction` sur un état plutôt que des délais fixes.

## 9. Limites connues et pistes

- Les gardes ne se gênent pas entre eux ni avec le commando (pas de collision entre personnages).
- Pas de sauvegarde, une seule mission.
- Pas de reptation : la bibliothèque gratuite de Quaternius n'en contient pas (elle existe dans la version payante « Pro »). Accroupi la remplace ; la position couchée du sniper est une image fixe.
- Les mannequins n'ont pas de visage, et la main gauche ne tient pas vraiment le fusil (clips de pistolet à deux mains réutilisés).
- Les persos à proximité immédiate d'un mur peuvent visuellement le traverser un peu.
- Le passage de la qualité haute à basse est définitif pendant la session.
- Idées déjà évoquées avec le propriétaire : traîner un corps accroupi (plus lent, plus discret) ; mission d'hiver de nuit avec projecteur de mirador comme second type de cône mobile (lookdev réalisé) ; éclaircir la forêt de départ ; alléger les cônes rouges en alerte ; ajuster la fenêtre « par derrière » du couteau.

## 10. Instructions pour un LLM qui reprend le projet

1. **Lis ce document, puis le fichier entier** avant de modifier. Le code est compact (une ligne peut contenir plusieurs instructions). Repère-toi aux commentaires de section.
2. **Garde le format** : une page HTML plus `assets/soldier.gltf.json`, Three.js 0.160 en importmap, pas de build, pas d'asset externe, pas de framework. Le propriétaire publie sur GitHub Pages et parfois en artifact claude.ai.
3. **Édite par remplacements exacts et vérifiés.** Méthode qui a bien marché : un script Python qui fait `assert s.count(ancien) == 1` avant chaque `replace`, puis `node --check` sur le module extrait :
   ```bash
   python3 -c "s=open('index.html').read();i=s.index('<script type=\"module\">')+22;j=s.index('</script>',i);open('/tmp/m.mjs','w').write(s[i:j])" && node --check /tmp/m.mjs
   ```
4. **Respecte les conventions de la partie 4**, surtout les signes des rotations du rig, `addS` avant la fusion, `mark()` pour tout obstacle, et `shadowMap.needsUpdate` quand le décor statique change.
5. **Après chaque changement** : respect des budgets NFR de la partie 7, vérification syntaxique, test headless (zéro erreur `pageerror`), test d'accessibilité des chemins si la carte a bougé, capture d'écran pour juger le visuel. Regarde les captures avant d'annoncer que c'est réussi.
6. **Performance mobile** : préfère cuire au chargement (textures canvas, ombres, fusion de géométrie) plutôt que calculer à chaque frame. Évite les filtres plein écran et les post-process WebGL. Une nouvelle lumière dynamique coûte cher.
7. **Préférences du propriétaire** : réponses en français, directes, sans remplissage. Il aime qu'on lui propose 2–3 options argumentées avant un gros chantier visuel, et qu'on chiffre la probabilité que la solution lui convienne. Il teste sur son téléphone.
8. **Déploiement** : copier `index.html` et `assets/` dans `app/derriere-les-lignes/` du dépôt `aannet/aannet.github.io`, commit sur `master` (c'est la branche publiée par GitHub Pages), push. Mettre à jour la carte de la page d'accueil si la description change.
