# Tests de non-régression

Ces tests protègent le comportement existant de l'application pendant l'ajout de nouvelles
fonctionnalités. Ils pilotent la **vraie page `index.html`** dans Chromium (Playwright) : aucun
changement du code de l'application n'a été nécessaire pour les écrire.

## Lancer les tests

```bash
npm install
npx playwright install chromium   # une seule fois
npm test                          # toute la suite (~35 s)
npx playwright test reglages      # un seul fichier (filtre sur le nom)
npx playwright test --ui          # mode interactif pour déboguer
npm run test:mutation             # vérifie que la suite détecte les régressions (~1 h 30)
```

## Une fonctionnalité = un fichier

| Fichier | Fonctionnalité protégée |
|---|---|
| `affichage-initial.spec.js` | Écran d'accueil : titre, état « Prêt », valeurs par défaut |
| `reglages.spec.js` | Boutons − / +, pas, bornes, format `4,5 s`, « Illimitée », **persistance** (localStorage, corrompu, interdit) |
| `partage.spec.js` | Lien de partage des réglages : construction, import, validation, replis share / presse-papiers |
| `prereglages.spec.js` | 4 – 6, 5 – 5, 4 – 7 – 8, Carrée 4 : valeurs, sélection, interactions avec les réglages |
| `cycle-respiratoire.spec.js` | Phases, compte à rebours, cycles, animation (disque, arc, point), temps écoulé, arrêt, rattrapage après gel de l'affichage |
| `duree-seance.spec.js` | Fin automatique « Terminé », mode illimité, relance |
| `reglages-en-cours.spec.js` | Modifier durées / préréglage pendant que la séance tourne (dont l'ajout / le retrait d'une pause située avant la phase en cours) |
| `mode-guide.spec.js` | Séquences guidées : choix mémorisé, changement de rythme en fin de cycle (dont pile sur la limite), fin au total de la séquence, son programmé aux mêmes instants (reprogrammation, écran éteint), sortie par préréglage ou réglage, accessibilité |
| `guide-sonore.spec.js` | Web Audio : notes 220 → 440 Hz, volumes, pauses, programmation à l'avance, interrupteur, repli `webkitAudioContext` |
| `ecran-allume.spec.js` | Wake Lock, repli NoSleep.js, reprise à la visibilité |
| `theme-accessibilite.spec.js` | Thème clair/sombre, couleurs de phase, ARIA (libellés des boutons, interrupteur), clavier, cibles tactiles, responsive |
| `rappels.spec.js` | Rappel quotidien : fichier `.ics` téléchargé (champs, CRLF, repliement), premier créneau aujourd'hui / demain (horloge simulée), mémorisation de l'heure (valeur invalide, stockage interdit), accessibilité |
| `historique.spec.js` | Historique : enregistrement (≥ 30 s, fin automatique), persistance, limite de 500, stockage corrompu / interdit, liste des 10 dernières, effacement confirmé ou annulé |
| `statistiques.spec.js` | Statistiques : totaux, 7 derniers jours, série (aujourd'hui / hier / trou / même jour), 14 barres et hauteurs, `aria-label`, état vide, mise à jour (séance, effacement, minuit), limites de jour et changement d'heure (Europe/Paris) |
| `pwa-manifest.spec.js` | `manifest.json`, icônes (dimensions réelles), métadonnées de `index.html` |
| `pwa-service-worker.spec.js` | Logique de `sw.js` (install / activate / fetch) en isolation |
| `pwa-hors-ligne.spec.js` | Vrai service worker : rechargement et utilisation sans réseau |

## Pertinence des tests

Un test n'a sa place ici que s'il **prouve** quelque chose qui casserait pour l'utilisateur :
une fonctionnalité, un cas d'usage ou une limite (borne, panne d'API, stockage interdit…).
Concrètement :

- il doit pouvoir **échouer** sur un bug réaliste. Vérifier « pas d'erreur » ou « la phase n'est pas
  *Prêt* » ne prouve presque rien : on vérifie la valeur attendue ;
- il ne **duplique** pas un autre test (même scénario, même assertion) ;
- il vérifie un **comportement**, pas une valeur esthétique arbitraire (durée exacte d'une transition…) ;
- les instants audio (flottants) se comparent avec une **tolérance**, jamais à l'égalité stricte ;
- un défaut connu non corrigé s'écrit avec le comportement attendu, marqué `test.fail(...)` et
  commenté : la suite reste verte, et le jour où le défaut est corrigé Playwright le signale.

### Test de mutation

`tests/mutation/run.js` injecte un par un des bugs plausibles (`tests/mutation/mutants.js`) et relance
toute la suite. Il signale :

- les **mutants survivants** : bugs qu'aucun test ne détecte → il manque un test ;
- les **tests qui ne détectent aucun mutant** → test à justifier (ajouter le mutant qu'il protège) ou à supprimer.

Les mutants sans effet observable sont listés, avec leur justification, dans `EQUIVALENTS`.
Après l'ajout d'une fonctionnalité, ajoutez quelques mutants qui la cassent et vérifiez qu'ils sont détectés.

## Comment ça marche

- **Horloge simulée** (`page.clock`) : le temps est figé et ne progresse que via `app.advance(secondes)`.
  Une séance de 5 minutes se teste en quelques secondes, sans `sleep` et sans test instable.
  On échantillonne volontairement à mi-seconde (`x,5 s`) pour ne pas dépendre de la frame exacte
  d'un changement de phase.
- **Doublures** (`helpers/mocks.js`) injectées avant le chargement de la page :
  `AudioContext` (journalise chaque note et chaque volume programmés), `navigator.wakeLock`, et
  NoSleep.js (le CDN est remplacé par un faux, donc les tests n'ont pas besoin de réseau).
- **Fixture `app`** (`helpers/app.js`) : `app.open(options)`, `app.start()`, `app.advance(s)`,
  `app.setting('inh').plus`, `app.preset('Carrée 4')`, `app.guide('Détente')`, `app.step` (étape du mode guidé),
  `app.audioEvents(...)`, etc.
  Options d'`open` : `storage`, `storageBroken`, `audio` (`standard` | `webkit` | `none`),
  `audioState`, `wakeLock` (`ok` | `reject` | `absent`), `noSleep`.
- Le serveur statique (`helpers/server.js`) est lancé automatiquement par Playwright.

## Ajouter une fonctionnalité

1. Écrire d'abord (ou en même temps) un fichier `tests/ma-fonctionnalite.spec.js` avec `test.describe('Ma fonctionnalité', …)`.
2. Utiliser `const { test, expect } = require('./helpers/app');` et la fixture `app`.
3. Si la fonctionnalité ajoute une nouvelle API navigateur (vibration, notifications…), ajouter sa
   doublure dans `helpers/mocks.js`.
4. Si elle change volontairement un comportement existant, **mettre à jour le test concerné dans le même commit** :
   un test qui échoue après une modification voulue est le signe qu'il faut le faire évoluer, pas le supprimer.
5. Si elle ajoute un fichier à précacher (`sw.js`), le déclarer dans `FILES` : `pwa-service-worker.spec.js`
   vérifie que chaque fichier listé existe.

## Intégration continue

`.github/workflows/tests.yml` exécute la suite à chaque push et pull request ; le rapport est
conservé en artefact si un test échoue.
