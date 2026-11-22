# Derrière les lignes — dossier de reprise

Jeu d'infiltration tactique façon *Commandos: Behind Enemy Lines* (1998), jouable au doigt sur téléphone, dans **un seul fichier** `index.html` (~870 lignes, ~95 Ko). Three.js r160 via CDN, aucun build, aucun asset externe : tout est procédural (géométrie, textures, sons).

- En ligne : https://aannet.github.io/app/derriere-les-lignes/
- Source : ce dossier, fichier `index.html`
- Lien depuis la page d'accueil du dépôt : carte « DERRIÈRE LES LIGNES » dans `/index.html`

Ce document sert à reprendre le projet plus tard, seul ou avec un LLM. La partie 9 s'adresse directement au LLM.

---

## 1. Le jeu en bref

Une mission solo. Le commando part de la forêt au sud-ouest, entre dans une base clôturée (brèche dans la clôture ouest ou portail gardé au sud), pose un explosif sur les cuves du dépôt de carburant, a 25 s pour s'éloigner, puis rejoint le camion d'extraction au sud-est pendant que la garnison converge vers le dépôt.

| Élément | Comportement |
|---|---|
| Déplacement | Tap au sol : marche. Double-tap : course (bruyante, rayon 4,5). Bouton Ramper : reptation lente, profil bas |
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

- **Three.js 0.160.0** via `importmap` sur `cdn.jsdelivr.net` (`three` + `three/addons/` pour `BufferGeometryUtils.mergeGeometries`).
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
| HTML + CSS | HUD (objectif, cœurs, alerte, mèche, toast), barre d'actions (Ramper, Couteau, Pistolet, Sniper, Pierre, bouton contextuel), bouton Centrer flottant, lunette (`#scope`), écrans intro et fin, vignette `#grade`, grain `#grain` |
| `grille` | Grille 48×48, tableaux `mv` (bloque le passage) et `si` (bloque la vue), `mark()`, `rng()` déterministe (seed 11) |
| `rendu` | Renderer, caméra orthographique iso, lumières, textures de nuages, `patchMat()` (ombres de nuages + vent), géométrie statique fusionnée (`colored`, `addS`), textures peintes (`stoneTex`, `plasterTex`, `tileTex`, `plankTex`), tous les objets de la carte, forêt, barbelés |
| `sol peint` | Canvas 2048 px peint une fois : boue, route, dalle de la base, cratères, flaques, AO autour des obstacles |
| `herbe instanciée` | `InstancedMesh` de ~2600 touffes, vent dans le vertex shader |
| `ambiance` | Fumée de cheminées, drapeau animé, poussière (désactivée en A+), objet `quality` |
| `pathfinding` | A* 8 directions sans coupe de coin, lissage par ligne de vue, `losClear` (vue), `castRay` (cônes) |
| `soldats : rig articulé` | Géométries des soldats, `makeSoldier()`, système d'animation procédurale `animate()` |
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

**Rig des soldats** (signes des rotations, piège classique)
- Hiérarchie : `root → body (bassin, y=0,98) → thL/thR (cuisses) → shL/shR (tibias)` et `body → torso → head, uaL/uaR (bras) → faL/faR (avant-bras)`.
- Cuisse `x < 0` = jambe vers l'avant. Tibia `x > 0` = genou plié.
- Bras `x < 0` = bras vers l'avant / le haut. Avant-bras `x < 0` = coude plié.
- `body.rotation.x > 0` = bascule vers l'avant (à plat ventre ≈ 1,5). `< 0` = sur le dos.
- `animate(s, pose, {dt, speed, look, p, fall})` calcule une cible par articulation (clés `JK`) puis lisse vers elle. Poses : `stand`, `carry`, `rifle`, `ready`, `aimRifle`, `aimPistol`, `prone`, `proneAim`, `kneel`, `throw`, `stab`, `dying`, `dead`. `p` = progression 0→1 des poses ponctuelles, `fall` = +1 face contre terre, −1 sur le dos.
- Cycle de marche : phase `s.ph` qui avance selon la vitesse réelle divisée par la longueur de foulée (1,45 marche, 2,7 course, 0,85 reptation). `walkLeg`/`runLeg` donnent hanche et genou en fonction de la phase (appui sur [0,π), balancier sur [π,2π)).
- Le fusil des gardes est enfant du torse et interpole entre 3 positions `RQ` : `sling` (bretelle), `ready` (position basse), `aim` (épaulé). Le sniper du joueur entre `SQ.back` et `SQ.aim`.

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
- `seesPlayer(e)` : distance ≤ portée (NEAR=5 si le commando rampe, RANGE=10 sinon, ×1,2 pendant l'alerte), angle dans le demi-angle `HALF=0,6 rad`, puis `losClear`.
- Le soupçon `e.sus` monte plus vite si le commando est proche, s'il court, ou si l'alerte est active. À 1 → `goAlert`.
- Les gardes repèrent aussi les corps non cachés (`found`) dans leur cône, ce qui déclenche `raiseAlarm` à l'emplacement du corps.

**Machine à états des gardes** (`e.state`)
`routine` (patrouille par waypoints ou sentinelle qui balaie) → `suspicious` (s'arrête, se tourne) → `investigate` (va voir un bruit, regarde autour 3,5 s) → `return` (revient au poste ou au waypoint le plus proche). `alert` (voit le commando : tire toutes les 1,1–1,6 s, poursuit s'il est à plus de 8 m) → `hunt` (cherche autour de la dernière position) → `return` quand l'alerte retombe. `dead`.

**Ajouter un garde** : une entrée dans `ENEMIES`, soit sentinelle `{x, z, a, scan}` (scan = amplitude du balayage en radians), soit patrouille `{path: [[x,z], ...]}`. Les waypoints doivent être sur des cases libres (voir test partie 7).

**Tirs ennemis** : probabilité 0,2–0,7 selon la distance (−0,12 si le commando rampe), portée 12 m. **Invariant à garder** : portée du pistolet (15) > portée de tir ennemie (12) > portée de vue en alerte (12). Sinon le joueur se fait tirer dessus sans pouvoir répondre (bug déjà corrigé une fois).

**Bruit** : `makeNoise(x, z, rayon)` envoie en `investigate` les gardes calmes dans le rayon, et redirige ceux en `hunt`.

**Qualité adaptative** : sur les 150 premières frames de jeu, si la moyenne dépasse 1/42 s par frame, `lowerQuality()` baisse la résolution, divise l'herbe par deux, coupe la fumée et le grain.

## 6. Direction artistique actuelle (A+)

Choisie après comparaison de plusieurs pistes (diorama doré, toon, nuit, hiver, A sépia) :
- Lumière couverte mais soleil franc (`DirectionalLight 0xfff0d8`, intensité 2,7) et ciel froid (`Hemisphere 0xa8b6c6 / 0x5a4c3a`), tone mapping ACES, exposition 1,2, brume grise `0x6e7376`.
- Pas de filtre de couleur global. Le contraste vient de la hiérarchie des valeurs : sol sombre et peu bruité, route et murs plus clairs.
- Liseré lumineux (rim light) dans le shader des soldats : doré pour le commando (`soldierMatP`), bleu pâle pour les gardes (`soldierMatE`). Sert à distinguer ami/ennemi.
- Cônes verts (jaunes en soupçon, rouges en alerte) avec contour clair.
- Décor de guerre : barbelés en accordéon (`wire()`, un seul `LineSegments`), chevaux de frise (`frise()`), cratères, ~20 % d'arbres morts.

Décisions écartées et pourquoi : sprites pré-rendus (rotation saccadée, artefacts au zoom, la géométrie des persos n'est pas le goulot de perf) ; tilt-shift (rendu « jouet », contraire au ton adulte voulu).

## 7. Tester

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
await p.goto('file:///chemin/vers/dbg.html'); await p.waitForTimeout(2500);
await p.click('#start');
// ... scénario, captures : await p.screenshot({ path: 'x.png' });
console.log(errs); await b.close();
```

**Hook de debug** : pour piloter le jeu depuis le test, faire une copie `dbg.html` où l'on insère, juste après le premier `requestAnimationFrame(loop);` :

```js
window.__g={cam,camTarget,findPath,walk,get P(){return P},get enemies(){return enemies},ctx:()=>ctxAction(),setT:e=>{P.task={t:'knife',e};P.repath=0}};
```

Ne jamais laisser ce hook dans `index.html` publié.

**Vérifications à refaire après toute modif de la carte** : depuis le départ `(3.5, 44.5)`, `findPath` doit trouver un chemin vers chaque waypoint de chaque garde, la brèche `(21.5, 13.5)`, le portail `(31.5, 25.5)`, le devant du dépôt `(38.5, 9.8)` et l'extraction `(41.5, 44.5)`.

Le rendu swiftshader est lent (quelques fps) : le temps de jeu avance moins vite que le temps réel. Utiliser `waitForFunction` sur un état plutôt que des délais fixes.

## 8. Limites connues et pistes

- Les gardes ne se gênent pas entre eux ni avec le commando (pas de collision entre personnages).
- Pas de sauvegarde, une seule mission.
- Les persos à proximité immédiate d'un mur peuvent visuellement le traverser un peu.
- Le passage de la qualité haute à basse est définitif pendant la session.
- Idées déjà évoquées avec le propriétaire : traîner un corps accroupi (plus lent, plus discret) ; mission d'hiver de nuit avec projecteur de mirador comme second type de cône mobile (lookdev réalisé) ; éclaircir la forêt de départ ; alléger les cônes rouges en alerte ; ajuster la fenêtre « par derrière » du couteau.

## 9. Instructions pour un LLM qui reprend le projet

1. **Lis ce document, puis le fichier entier** avant de modifier. Le code est compact (une ligne peut contenir plusieurs instructions). Repère-toi aux commentaires de section.
2. **Garde le format** : un seul fichier HTML, Three.js 0.160 en importmap, pas de build, pas d'asset externe, pas de framework. Le propriétaire publie sur GitHub Pages et parfois en artifact claude.ai.
3. **Édite par remplacements exacts et vérifiés.** Méthode qui a bien marché : un script Python qui fait `assert s.count(ancien) == 1` avant chaque `replace`, puis `node --check` sur le module extrait :
   ```bash
   python3 -c "s=open('index.html').read();i=s.index('<script type=\"module\">')+22;j=s.index('</script>',i);open('/tmp/m.mjs','w').write(s[i:j])" && node --check /tmp/m.mjs
   ```
4. **Respecte les conventions de la partie 4**, surtout les signes des rotations du rig, `addS` avant la fusion, `mark()` pour tout obstacle, et `shadowMap.needsUpdate` quand le décor statique change.
5. **Après chaque changement** : vérification syntaxique, test headless (zéro erreur `pageerror`), test d'accessibilité des chemins si la carte a bougé, capture d'écran pour juger le visuel. Regarde les captures avant d'annoncer que c'est réussi.
6. **Performance mobile** : préfère cuire au chargement (textures canvas, ombres, fusion de géométrie) plutôt que calculer à chaque frame. Évite les filtres plein écran et les post-process WebGL. Une nouvelle lumière dynamique coûte cher.
7. **Préférences du propriétaire** : réponses en français, directes, sans remplissage. Il aime qu'on lui propose 2–3 options argumentées avant un gros chantier visuel, et qu'on chiffre la probabilité que la solution lui convienne. Il teste sur son téléphone.
8. **Déploiement** : copier le fichier dans `app/derriere-les-lignes/index.html` du dépôt `aannet/aannet.github.io`, commit sur `master` (c'est la branche publiée par GitHub Pages), push. Mettre à jour la carte de la page d'accueil si la description change.
