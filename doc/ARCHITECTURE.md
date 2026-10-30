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

1. **Internationalisation** : Traduire en anglais et autres langues
2. ~~**Historique** : Sauvegarder l'historique des séances~~ — **réalisé** : clé `respiration-history` (500 séances au plus, séances d'au moins 30 s), liste des 10 dernières dans un `<details>`, effacement confirmé ; `loadHistory()` / `renderHistory()` servent de base aux statistiques
3. **Statistiques** : Graphiques de progression sur le long terme
4. **Partage** : Permettre de partager ses configurations
5. **Notifications** : Rappels pour pratiquer régulièrement
6. **Mode guidé** : Séquences prédéfinies (méditation, endormissement, etc.)

---

## 📚 Ressources

- [MDN - Progressive Web Apps](https://developer.mozilla.org/fr/docs/Web/Progressive_web_apps)
- [MDN - Service Workers](https://developer.mozilla.org/fr/docs/Web/API/Service_Worker_API)
- [MDN - Web Audio API](https://developer.mozilla.org/fr/docs/Web/API/Web_Audio_API)
- [Wake Lock API](https://developer.mozilla.org/en-US/docs/Web/API/WakeLock)
- [NoSleep.js](https://github.com/richtr/NoSleep.js)
