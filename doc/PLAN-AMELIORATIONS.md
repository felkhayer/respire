# Plan de mise en œuvre des améliorations

Ce plan couvre les six « Améliorations possibles » listées dans [ARCHITECTURE.md](ARCHITECTURE.md).
Il fixe les choix de conception, l'ordre de réalisation et les règles communes, pour que chaque
fonctionnalité puisse être confiée à un agent (ou à une personne) indépendamment des autres.

## Contraintes qui guident tous les choix

Les objectifs de l'architecture restent prioritaires : **tout dans `index.html`, sans framework ni
dépendance, 100 % hors ligne, aucune donnée ne quitte l'appareil**. Conséquences directes :

- pas de serveur, donc **pas de notifications push** ;
- les données (historique, préférences) restent dans `localStorage` et doivent résister à un
  stockage interdit ou corrompu, comme `load()` / `save()` aujourd'hui ;
- le partage passe par un **lien** (le fragment `#…` n'est jamais envoyé au serveur, et le service
  worker sert la page hors ligne quel que soit le fragment).

## Fondations communes (déjà en place)

Pour que plusieurs fonctionnalités puissent être développées en parallèle sans se marcher dessus :

| Élément | Rôle |
|---|---|
| `on(nom, fn)` / `emit(nom, données)` | Cycle de vie de la séance. `on('start')` ; `on('stop', { done, seconds, cycles })`. Une fonctionnalité s'abonne au lieu de modifier `start()` / `stop()`. |
| `say(message)` | Message bref dans `#status` (`role="status"`, annoncé aux lecteurs d'écran). |
| Ancres `Mode guidé`, `Partage`, `Historique et statistiques`, `Rappels` | Emplacements réservés dans le CSS, le HTML (après le panneau de réglages) et le JavaScript (avant `renderSettings()` final) de `index.html`. |
| Ancres dans `tests/mutation/mutants.js` | Un bloc de mutants par fonctionnalité. |
| `npm run test:mutants-check` | Vérifie en quelques millisecondes que chaque mutant trouve encore son texte (le test de mutation complet dure ~1 h 30). |

## Conception par fonctionnalité

### 1. Historique des séances

- Clé `localStorage` **`respiration-history`** : tableau JSON, du plus ancien au plus récent, limité
  aux **500** dernières séances. Entrée : `{ d: <début, ms epoch>, s: <secondes>, c: <cycles>,
  r: [inh, hold1, exh, hold2], done: <bool> }`.
- Une séance est enregistrée à l'arrêt (`on('stop')`) si elle a duré **au moins 30 s** (un appui
  accidentel n'encombre pas l'historique). Le début est noté sur `on('start')` avec `Date.now()`.
- Interface : section repliable `<details>` « Historique » avec les **10 dernières séances**
  (date et heure locales, durée `m:ss`, cycles, rythme `4 – 6`), un message si l'historique est
  vide, et un bouton « Effacer l'historique » confirmé par `confirm()`.
- Stockage interdit ou JSON corrompu : l'application fonctionne, l'historique est vide.

### 2. Statistiques de progression *(dépend de l'historique)*

- Calculées uniquement à partir de `respiration-history`, dans la même section ou une section voisine.
- Indicateurs : nombre de séances, minutes cumulées, **série** de jours consécutifs de pratique
  (jusqu'à aujourd'hui, ou hier si rien aujourd'hui), minutes des 7 derniers jours.
- Graphique : barres des **minutes par jour sur les 14 derniers jours**, en SVG inline, couleurs du
  thème (`var(--in)`, `var(--line)`), lisible en clair et en sombre. Accessible : `role="img"` et un
  `aria-label` résumant les données.
- Jours calculés en heure locale. Mise à jour à chaque nouvelle séance enregistrée.

### 3. Partage des configurations

- Bouton « Partager ces réglages » : construit `<page>#r=inh,hold1,exh,hold2,total`
  (ex. `#r=4,0,6,0,5`, point décimal).
- Ordre de repli : `navigator.share({ title, text, url })` → `navigator.clipboard.writeText(url)`
  puis `say('Lien copié')` → `say('Copiez ce lien : ' + url)`. L'annulation du partage
  (`AbortError`) ne produit aucun message.
- À l'ouverture d'un lien `#r=…` : 5 nombres finis attendus, chacun borné et arrondi selon le
  réglage correspondant (pas de 0,5 s, 1 min pour la durée). Valide → appliqué, enregistré,
  `say('Réglages importés')`. Invalide → ignoré, `say('Lien de réglages invalide')`. Dans les deux
  cas le fragment est retiré avec `history.replaceState`.

### 4. Rappels

Sans serveur, une notification programmée n'est pas fiable sur le web (Push = serveur ;
Notification Triggers abandonné ; Periodic Background Sync limité à Chrome installé et sans
heure précise). **Choix : confier le rappel à l'agenda de l'utilisateur.**

- Section repliable « Rappel quotidien » : champ `<input type="time">` (défaut `08:00`, mémorisé)
  et bouton « Ajouter à mon agenda » qui télécharge `respirer-rappel.ics`.
- Fichier iCalendar (RFC 5545, fins de ligne CRLF) : un `VEVENT` quotidien
  (`RRULE:FREQ=DAILY`) à l'heure choisie, heure locale « flottante », première occurrence au
  prochain créneau à venir, `DURATION:PT10M`, `SUMMARY:Respiration lente`, `URL` de l'application,
  et une `VALARM` (`ACTION:DISPLAY`, `TRIGGER:PT0M`).
- Fonctionne hors ligne, sur tous les systèmes, et aucune donnée ne sort de l'appareil.

### 5. Mode guidé (séquences prédéfinies)

Une séquence enchaîne plusieurs rythmes, chacun pendant une durée donnée :

| Séquence | Étapes | Total |
|---|---|---|
| Détente | 4 – 4 (1 min) → 4 – 6 (2 min) → 4 – 8 (3 min) | 6 min |
| Endormissement | 4 – 6 (2 min) → 4 – 7 – 8 (8 min) | 10 min |
| Concentration | 5 – 5 (2 min) → Carrée 4 (6 min) → 5 – 5 (2 min) | 10 min |

- Le changement de rythme a lieu **à la fin d'un cycle** (jamais au milieu d'une phase) : à la fin
  du premier cycle qui atteint ou dépasse la limite de l'étape. La séance s'arrête au total prévu, comme
  aujourd'hui.
- Le **son programmé à l'avance** suit les changements d'étape, même écran éteint (c'est la
  difficulté principale : `schedule()` doit prévoir les rythmes futurs).
- L'étape en cours est affichée (« Étape 2 / 3 · 4 – 6 »). Choisir un préréglage ou modifier un
  réglage quitte le mode guidé. La séquence choisie est mémorisée.

### 6. Internationalisation *(en dernier : elle traduit toutes les chaînes, y compris les nouvelles)*

- Dictionnaires `fr` et `en` dans `index.html`, fonction `t(clé, paramètres)`.
- Langue : choix enregistré, sinon `navigator.language` (`fr*` → français, sinon anglais).
  Sélecteur FR / EN dans le panneau. `<html lang>`, `document.title`, libellés ARIA, dates
  (`Intl.DateTimeFormat`), séparateur décimal (`4,5 s` / `4.5 s`) et fichier `.ics` suivent la langue.
- Les tests existants décrivent l'interface française : `playwright.config.js` fixe la locale
  `fr-FR` ; un nouveau fichier de tests vérifie l'anglais (locale `en-US`) et le changement de langue.
- `manifest.json` reste en français (un manifeste par langue n'apporte rien ici) : limite documentée.

## Ordre de réalisation et répartition

Toutes les fonctionnalités modifient `index.html` ; chaque vague travaille dans des copies de travail
isolées, puis les branches sont fusionnées et la suite complète relancée avant la vague suivante.

| Vague | Fonctionnalité | Difficulté | Modèle | Pourquoi |
|---|---|---|---|---|
| 1 | Mode guidé | Élevée | **Opus** | Touche le cœur temporel (`frame`, `schedule`) : synchronisation image / horloge audio, cas limites. |
| 1 | Historique | Moyenne | **Sonnet** | Spécification précise, mais persistance robuste et interface à concevoir. |
| 1 | Rappels (.ics) | Moyenne | **Sonnet** | Format iCalendar strict, calcul de date, test de téléchargement. |
| 1 | Partage | Faible | **Haiku** | Spécification complète et isolée (encodage, validation, replis). |
| 2 | Statistiques | Moyenne | **Sonnet** | Calculs de dates locales, série, graphique SVG accessible. |
| 3 | Internationalisation | Élevée (étendue) | **Opus** | Transverse : toutes les chaînes, ARIA, formats, ~150 mutants à garder valides. |

## Règles communes (définition de « terminé »)

1. Code dans le style existant (ES5 : `var`, `function`), uniquement dans `index.html`, aux ancres
   prévues. Toute modification du code partagé (`start`, `stop`, `frame`, `schedule`,
   `renderSettings`) reste minimale et est signalée.
2. Aucune dépendance, aucun appel réseau, fonctionnement hors ligne, `localStorage` protégé par `try/catch`.
3. Accessibilité : clavier, ARIA, cibles de 44 px, contour de focus, thèmes clair et sombre, pas de
   défilement horizontal à 320 px.
4. Tests : un fichier `tests/<fonctionnalité>.spec.js` qui respecte les règles de pertinence de
   [tests/README.md](../tests/README.md) ; doublures nouvelles dans `tests/helpers/mocks.js`.
5. 5 à 10 mutants dans le bloc réservé de `mutants.js`, tous détectés
   (`npm run test:mutation -- id1,id2,…`). `npm run test:mutants-check` et `npm test` au vert.
6. Documentation : tableau de `tests/README.md`, `README.md`, statut dans `ARCHITECTURE.md`.
