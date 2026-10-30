# Tests de non-régression

Ces tests protègent le comportement existant de l'application pendant l'ajout de nouvelles
fonctionnalités. Ils pilotent la **vraie page `index.html`** dans Chromium (Playwright) : aucun
changement du code de l'application n'a été nécessaire pour les écrire.

## Lancer les tests

```bash
npm install
npx playwright install chromium   # une seule fois
npm test                          # toute la suite (~40 s)
npx playwright test reglages      # un seul fichier (filtre sur le nom)
npx playwright test --ui          # mode interactif pour déboguer
```

## Une fonctionnalité = un fichier

| Fichier | Fonctionnalité protégée |
|---|---|
| `affichage-initial.spec.js` | Écran d'accueil : titre, état « Prêt », valeurs par défaut |
| `reglages.spec.js` | Boutons − / +, pas, bornes, format `4,5 s`, « Illimitée », **persistance** (localStorage, corrompu, interdit) |
| `prereglages.spec.js` | 4 – 6, 5 – 5, 4 – 7 – 8, Carrée 4 : valeurs, sélection, interactions avec les réglages |
| `cycle-respiratoire.spec.js` | Phases, compte à rebours, cycles, animation (disque, arc, point), temps écoulé, arrêt, rattrapage après gel de l'affichage |
| `duree-seance.spec.js` | Fin automatique « Terminé », mode illimité, relance |
| `reglages-en-cours.spec.js` | Modifier durées / préréglage pendant que la séance tourne |
| `guide-sonore.spec.js` | Web Audio : notes 220 → 440 Hz, volumes, pauses, programmation à l'avance, interrupteur, repli `webkitAudioContext` |
| `ecran-allume.spec.js` | Wake Lock, repli NoSleep.js, reprise à la visibilité |
| `theme-accessibilite.spec.js` | Thème clair/sombre, couleurs de phase, ARIA, clavier, cibles tactiles, responsive |
| `pwa-manifest.spec.js` | `manifest.json`, icônes (dimensions réelles), métadonnées de `index.html` |
| `pwa-service-worker.spec.js` | Logique de `sw.js` (install / activate / fetch) en isolation |
| `pwa-hors-ligne.spec.js` | Vrai service worker : rechargement et utilisation sans réseau |

## Comment ça marche

- **Horloge simulée** (`page.clock`) : le temps est figé et ne progresse que via `app.advance(secondes)`.
  Une séance de 5 minutes se teste en quelques secondes, sans `sleep` et sans test instable.
  On échantillonne volontairement à mi-seconde (`x,5 s`) pour ne pas dépendre de la frame exacte
  d'un changement de phase.
- **Doublures** (`helpers/mocks.js`) injectées avant le chargement de la page :
  `AudioContext` (journalise chaque note et chaque volume programmés), `navigator.wakeLock`, et
  NoSleep.js (le CDN est remplacé par un faux, donc les tests n'ont pas besoin de réseau).
- **Fixture `app`** (`helpers/app.js`) : `app.open(options)`, `app.start()`, `app.advance(s)`,
  `app.setting('inh').plus`, `app.preset('Carrée 4')`, `app.audioEvents(...)`, etc.
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
