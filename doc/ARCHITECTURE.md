# Architecture - Application Respiration

## 🎯 Objectifs

Développer une **application de guidage respiratoire** qui :

1. **S'installe comme une application native** (PWA)
2. **Fonctionne complètement hors ligne** (pas de dépendance réseau)
3. **Continue de fonctionner lorsque l'écran est éteint ou le téléphone en veille**
4. **Est légère, rapide et accessible** sur tous les appareils
5. **Respecte la vie privée** (pas de tracking, pas de données envoyées)

---

## 🏗 Architecture Technique

### Stack Technique
- **100% HTML/CSS/JavaScript natif** (pas de framework)
- **Pas de dépendances externes** (sauf NoSleep.js pour la gestion de veille)
- **Service Worker** pour le cache et le mode hors ligne
- **Web Audio API** pour la génération sonore
- **LocalStorage** pour la persistance des préférences

### Structure des fichiers

```
index.html      # Interface utilisateur complète
manifest.json  # Configuration PWA (nom, icônes, thème)
sw.js          # Service Worker (cache des assets)
```

---

## 🔧 Fonctionnalités Clés et Implémentation

### 1. Installation comme PWA

**Solution** : `manifest.json` avec :
- Nom et description
- Icônes pour toutes les tailles d'écran
- Couleur de thème
- Mode standalone (sans barre d'URL)

**Code** :
```json
{
  "name": "Respirer",
  "short_name": "Respirer",
  "start_url": ".",
  "display": "standalone",
  "icons": [...]
}
```

### 2. Mode Hors Ligne

**Solution** : Service Worker (`sw.js`) qui :
- Met en cache tous les assets au premier chargement
- Intercepte les requêtes pour servir les fichiers cachés

**Fonctionnement** :
```javascript
// Dans sw.js
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open('respiration-v1').then((cache) => 
      cache.addAll([ '/', 'index.html', 'manifest.json', ... ])
    )
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => 
      response || fetch(e.request)
    )
  );
});
```

### 3. Fonctionnement en Veille/Écran Éteint

**Problème** : Les navigateurs limitent l'exécution JavaScript lorsque l'onglet est en arrière-plan ou l'écran éteint.

**Solutions combinées** :

#### a) Wake Lock API (standard moderne)
```javascript
// Empêche l'écran de s'éteindre
navigator.wakeLock.request('screen').then((lock) => {
  // Écran reste allumé
});
```

#### b) NoSleep.js (fallback pour iOS/Safari)
```javascript
// Library légère pour contourner les limitations
var noSleep = new NoSleep();
noSleep.enable();
```

#### c) Web Audio API en arrière-plan
**Astuce clé** : Les opérations audio programmées sur l'horloge Web Audio **continuent même lorsque l'onglet est en arrière-plan**.

```javascript
// Le son est programmé à l'avance sur l'horloge audio
// Ces opérations ne sont pas affectées par la mise en veille de l'onglet
var ctx = new AudioContext();
var osc = ctx.createOscillator();
var gain = ctx.createGain();

// Programme les changements de fréquence pour les 5 prochaines minutes
// Même si l'onglet est en arrière-plan, ces événements audio se produisent
osc.frequency.exponentialRampToValueAtTime(targetFrequency, ctx.currentTime + duration);
```

**Résultat** : Le guidage sonore continue **même écran éteint**, tant que le navigateur n'est pas complètement fermé.

### 4. Mode guidé (séquences prédéfinies)

Une séquence enchaîne plusieurs rythmes, chacun pendant une durée donnée :

| Séquence | Étapes | Total |
|---|---|---|
| Détente | 4 – 4 (1 min) → 4 – 6 (2 min) → 4 – 8 (3 min) | 6 min |
| Endormissement | 4 – 6 (2 min) → 4 – 7 – 8 (8 min) | 10 min |
| Concentration | 5 – 5 (2 min) → Carrée 4 (6 min) → 5 – 5 (2 min) | 10 min |

**Difficulté** : l'affichage (`frame()`, gelé écran éteint puis rattrapé d'un coup) et le son
(`schedule()`, programmé jusqu'à 30 min à l'avance) doivent changer de rythme exactement aux mêmes instants.

**Solution** :
- `stepAt(séquence, t)` est une **fonction pure** : l'étape d'un cycle qui commence `t` secondes après le
  début de la séance est la première dont la limite n'est pas atteinte (tolérance d'1 ms). Le rythme change
  donc à la fin du premier cycle qui atteint ou dépasse la limite, jamais au milieu d'une phase.
- `cycleList(début du cycle)` donne les phases d'un cycle (rythme de l'étape, sinon les réglages) ;
  `phases(r)` accepte désormais un rythme.
- `catchUp(now)` calcule, **sans rien modifier**, la position de la séance à l'instant `now` (phase, début de
  phase et de cycle, cycles). `frame()` l'enregistre ; `schedule()` s'en sert puis cumule les débuts de phase
  avec la même arithmétique (`+= durée * 1000`) : mêmes calculs, mêmes instants, même après un saut d'horloge.
- La séquence choisie est mémorisée dans `cfg.guide` (clé absente hors mode guidé : la config par défaut est
  inchangée). En mode guidé, les réglages affichent le rythme en vigueur et la durée de la séquence
  (`cfg.total`), ce qui fait tomber la fin de séance au total de la séquence sans autre changement.
- Choisir un préréglage, toucher un bouton − / + ou appuyer à nouveau sur la séquence quitte le mode guidé
  (`leaveGuide()`), en repartant du rythme en cours. Choisie pendant une séance, une séquence s'applique
  selon le temps déjà écoulé.
- L'étape en cours (« Étape 2 / 3 · 4 – 6 ») s'affiche sous les statistiques (`aria-live="polite"`).

### 5. Internationalisation (français / anglais)

- **Dictionnaires** `I18N.fr` et `I18N.en` (mêmes clés) dans `index.html`, et `t(clé, paramètres)` :
  `{nom}` est remplacé par le paramètre du même nom ; une valeur tableau `[singulier, pluriel]` est un pluriel
  choisi par `PLURAL[lang](n)` (français : 0 et 1 au singulier, « 0 jour » ; anglais : seul 1 au singulier,
  « 0 days »). Le français est la langue de référence : ses textes sont ceux d'avant, à l'identique.
- **Langue** : préférence enregistrée, sinon `navigator.language` (`fr`, `fr-*` → français, tout le reste →
  anglais). Elle est mémorisée dans une **clé dédiée `respiration-lang`** plutôt que dans `cfg` : la config des
  réglages (`DEF`, `respiration-cfg`) et le lien de partage `#r=…` sont des formats de données indépendants de
  la langue, et une préférence d'affichage n'a pas à voyager avec un lien de réglages. Une valeur inconnue est
  ignorée ; un stockage interdit laisse la détection s'appliquer.
- **Changement immédiat** : le sélecteur FR / EN (boutons `aria-pressed` du panneau de réglages) appelle
  `setLang()`, qui retraduit les éléments `data-i18n`, `<html lang>` et `document.title`, puis émet
  `emit('lang')`. Chaque partie s'y abonne : libellés et `aria-label` des réglages, préréglages, bouton
  principal et phase (y compris en pleine séance, sans attendre l'image suivante), séquences et étape guidée,
  historique et statistiques (formats de date recréés), dernier message `say()`.
- `say(clé, paramètres)` prend désormais une clé du dictionnaire (et non plus un texte).
- **Formats** : `num()` applique le séparateur décimal (`4,5 s` / `4.5 s`, rythme `4,5 – 6` / `4.5 – 6`) ; les
  dates utilisent `Intl.DateTimeFormat` avec la locale du navigateur si elle est de la langue choisie (`en-GB`
  → « 20 Oct »), sinon la langue elle-même. Le fichier `.ics` est traduit (`SUMMARY`, `DESCRIPTION`,
  `PRODID:-//Respirer//EN`) et son nom aussi (`respirer-rappel.ics` / `breathing-reminder.ics`), puisqu'il est
  vu par l'utilisateur.
- **Inchangés** : le format du lien `#r=…` (point décimal), les clés et le contenu du stockage.
- **Limite** : `manifest.json` reste en français (nom de l'application installée, description). Un manifeste
  par langue imposerait de servir un fichier différent selon la langue, sans gain réel ici ; une fois la PWA
  installée, son nom sur l'écran d'accueil reste « Respirer » / « Respiration lente ».

---

## 🎨 Interface Utilisateur

### Composants principaux

1. **Affichage du cycle** : Animation circulaire avec compte à rebours
2. **Bouton Démarrer/Arrêter** : Contrôle principal
3. **Réglages** : Durées personnalisables pour chaque phase
4. **Préréglages** : Boutons pour des configurations courantes
5. **Statistiques** : Compteur de cycles et durée écoulée

### Design
- **Responsive** : Adapte à tous les tailles d'écran
- **Thème clair/sombre** : Détection automatique ou manuelle via `prefers-color-scheme`
- **Accessible** : Boutons avec labels ARIA, navigation clavier

---

## 🔊 Système Audio

### Fonctionnement
- **Génération de sons** : Utilisation de Web Audio API (oscillateur sinusoïdal)
- **Variation de fréquence** : La note monte pendant l'inspiration, descend pendant l'expiration
- **Pauses** : Note constante à fréquence moyenne

### Paramètres
- Fréquence de base : 220Hz (La3)
- Octave : La fréquence double pendant l'inspiration (passage à La4)
- Volume : Réduit pendant les pauses pour un effet plus doux

---

## 📱 Gestion de l'État

### Persistance
- **LocalStorage** : Sauvegarde des préférences utilisateur (durées, son activé/désactivé)
- **Pas de backend** : Toutes les données restent locales

### Cycle de vie
```javascript
// États possibles
// - idle: Prêt à démarrer
// - in: Inspiration en cours
// - h1: Pause poumons pleins
// - out: Expiration en cours
// - h2: Pause poumons vides
```

---

## 🚀 Performances

### Optimisations
- **Pas de framework** : Réduction maximale de la taille du code
- **CSS optimisé** : Variables CSS pour le thème, transitions matérielles
- **JavaScript efficace** : Utilisation de `requestAnimationFrame` pour les animations
- **Assets légers** : Icônes optimisées pour le web

### Taille totale
- HTML : ~17 Ko
- CSS : Intégré dans le HTML
- JavaScript : ~5 Ko
- Icônes : ~80 Ko
- **Total** : ~100 Ko (très léger pour une PWA)

---

## 🔒 Contraintes et Solutions

| Contrainte | Solution | Statut |
|------------|----------|--------|
| Fonctionner hors ligne | Service Worker + Cache | ✅ Implémenté |
| Installation comme app | Manifest PWA | ✅ Implémenté |
| Continuer écran éteint | Web Audio API + Wake Lock | ✅ Implémenté |
| Pas de dépendances | Vanilla JS | ✅ Implémenté |
| Léger et rapide | Pas de framework, assets optimisés | ✅ Implémenté |
| Respect vie privée | Pas de tracking, localStorage seulement | ✅ Implémenté |
| Accessible | ARIA, clavier, thèmes | ✅ Implémenté |
| Multi-appareils | Design responsive | ✅ Implémenté |
| Séquences guidées, son fidèle écran éteint | Fonction pure `stepAt()` partagée par l'affichage et le son | ✅ Implémenté |
| Français / anglais sans rechargement | Dictionnaires + `t()`, événement `lang` | ✅ Implémenté |

---

## 🛠 Outils Utilisés

- **Éditeur** : VS Code ou équivalent
- **Test** : Navigateurs Chrome, Firefox, Safari
- **Déploiement** : GitHub Pages
- **Validation PWA** : Lighthouse (intégré à Chrome DevTools)

---

## 📊 Métriques de Qualité

### Lighthouse (estimations)
- Performance : 100 (chargement instantané, pas de ressources bloquantes)
- Accessibilité : 100 (bon contraste, labels, navigation)
- Bonnes pratiques : 100 (HTTPS via GitHub Pages, PWA valide)
- SEO : 100 (meta tags appropriés)

---

## 🧪 Tests

Suite de non-régression Playwright (`tests/`), un fichier par fonctionnalité, exécutée en CI.
Le code de l'application n'est pas importable (script inline dans `index.html`), donc les tests
pilotent la vraie page avec une **horloge simulée** et des **doublures** d'`AudioContext`, du Wake Lock
et de NoSleep.js. Voir [tests/README.md](../tests/README.md).

---

## 🔮 Améliorations Possibles

1. ✅ **Internationalisation** : français et anglais, détection de la langue, sélecteur FR / EN appliqué sans rechargement, dates et nombres localisés, voir § 5 (`manifest.json` reste en français)
2. ✅ **Historique** : clé `respiration-history` (500 séances au plus, d'au moins 30 s), 10 dernières séances dans un `<details>`, effacement confirmé
3. ✅ **Statistiques** : séances, minutes, série de jours, 7 derniers jours et graphique SVG de 14 jours, jours calculés en heure locale (sans erreur aux changements d'heure)
4. ✅ **Partage** : lien `#r=inh,hold1,exh,hold2,total` partagé par `navigator.share` ou copié, validé et borné à l'ouverture
5. ✅ **Rappels** : rappel quotidien par fichier agenda `.ics` (voir ci-dessous)
6. ✅ **Mode guidé** : séquences prédéfinies (Détente, Endormissement, Concentration), voir § 4

### Rappels : un fichier agenda plutôt que des notifications

Sans serveur, une notification programmée n'est pas fiable sur le web : Push exige un serveur, les
Notification Triggers ont été abandonnés et Periodic Background Sync est limité à Chrome installé, sans
heure précise. Le rappel est donc **confié à l'agenda de l'utilisateur** : la section « Rappel quotidien »
mémorise une heure (clé `localStorage` `respiration-reminder`, `08:00` par défaut) et le bouton
« Ajouter à mon agenda » télécharge `respirer-rappel.ics` (RFC 5545, lignes CRLF, repliées à 75 caractères) :
un `VEVENT` quotidien (`RRULE:FREQ=DAILY`) en heure locale flottante, première occurrence aujourd'hui si
l'heure est à venir, sinon demain, avec une `VALARM` à l'heure de l'événement. Cela fonctionne hors ligne,
sur tous les systèmes, et aucune donnée ne quitte l'appareil. Limite : l'événement n'est créé que si
l'utilisateur ouvre le fichier, et sa suppression ou modification se fait ensuite dans l'agenda.

---

## 📚 Ressources

- [MDN - Progressive Web Apps](https://developer.mozilla.org/fr/docs/Web/Progressive_web_apps)
- [MDN - Service Workers](https://developer.mozilla.org/fr/docs/Web/API/Service_Worker_API)
- [MDN - Web Audio API](https://developer.mozilla.org/fr/docs/Web/API/Web_Audio_API)
- [Wake Lock API](https://developer.mozilla.org/en-US/docs/Web/API/WakeLock)
- [NoSleep.js](https://github.com/richtr/NoSleep.js)
