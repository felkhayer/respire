# Respiration

Une **application web progressive (PWA)** pour guider des exercices de respiration lente et consciente. Conçue pour fonctionner **hors ligne**, s'installer comme une application native, et continuer à fonctionner même lorsque l'écran est éteint ou le téléphone en veille.

---

## 📱 Installation

### En tant qu'application (PWA)
1. Ouvrez [https://felkhayer.github.io/respire/](https://felkhayer.github.io/respire/) dans votre navigateur (Chrome, Edge, Safari, Firefox)
2. Cliquez sur **"Installer"** dans la barre d'adresse ou via le menu du navigateur
3. L'application s'installe comme une app native sur votre écran d'accueil

### Utilisation directe
Accédez simplement à [https://felkhayer.github.io/respire/](https://felkhayer.github.io/respire/) depuis n'importe quel navigateur.

---

## 🎯 Fonctionnalités

- **Guidage visuel et sonore** : Animation circulaire et sons pour l'inspiration/expiration
- **Personnalisable** : Réglage des durées d'inspiration, expiration, et pauses
- **Préréglages** : 4-6, 5-5, 4-7-8, Carré 4
- **Partage des réglages** : bouton « Partager ces réglages » qui produit un lien (`…#r=4,0,6,0,5`) ; ouvert, le lien applique les réglages reçus
- **Historique des séances** : les 10 dernières séances (date, durée, cycles, rythme), conservées sur l'appareil (500 au plus, seules les séances d'au moins 30 s), effaçables
- **Mode guidé** : séquences qui enchaînent plusieurs rythmes (Détente, Endormissement, Concentration), étape en cours affichée, son fidèle même écran éteint
- **Statistiques de progression** : séances et minutes cumulées, série de jours consécutifs, minutes des 7 derniers jours et graphique des 14 derniers jours (jours calculés en heure locale)
- **Français / anglais** : langue du navigateur par défaut, sélecteur FR / EN dans les réglages (choix mémorisé, appliqué immédiatement, même pendant une séance) ; dates, nombres décimaux et rappel `.ics` suivent la langue
- **Thème clair/sombre** : Adaptation automatique ou manuelle
- **Fonctionne en arrière-plan** : Le son continue même écran éteint
- **Rappel quotidien** : choisissez une heure et ajoutez un événement récurrent à l'agenda de votre téléphone (fichier `.ics`), sans serveur ni notification
- **Mode hors ligne** : Pas de connexion internet requise après installation
- **Sans publicité, sans tracking**

---

## 🛠 Développement

### Prérequis
- Git
- Un navigateur moderne (Chrome, Firefox, Safari, Edge)

### Cloner le dépôt
```bash
git clone https://github.com/Felkhayer/respire.git
cd respire
```

### Structure du projet
```
respire/
├── index.html          # Page principale
├── manifest.json      # Manifest pour l'installation PWA
├── sw.js              # Service Worker (cache et hors ligne)
├── README.md           # Ce fichier
├── doc/
│   └── ARCHITECTURE.md # Documentation technique
├── tests/              # Tests de non-régression (un fichier par fonctionnalité)
├── playwright.config.js
├── package.json
├── apple-touch-icon.png
├── icon-192.png
├── icon-512.png
└── icon-maskable-512.png
```

### Tester localement
Ouvrez simplement `index.html` dans un navigateur, ou utilisez un serveur local :
```bash
# Avec Python 3
python3 -m http.server 8000
# Puis ouvrez http://localhost:8000
```

### Tests de non-régression
Une suite de tests (Playwright + Chromium) vérifie chaque fonctionnalité : réglages, préréglages,
cycle respiratoire, durée de séance, mode guidé, guide sonore, écran allumé, thème, accessibilité, historique,
statistiques, partage, rappels, internationalisation et PWA hors ligne.
```bash
npm install
npx playwright install chromium   # une seule fois
npm test
```
Détails, organisation et mode d'emploi pour ajouter une fonctionnalité : [tests/README.md](tests/README.md).
Les tests s'exécutent aussi automatiquement sur GitHub à chaque push et pull request.

### Déploiement
Les modifications poussées sur la branche `main` doivent être fusionnées vers `gh-pages` pour être déployées :
```bash
git checkout main
# ... faites vos modifications ...
git add .
git commit -m "votre message"
git push origin main
# Puis merge vers gh-pages
```

---

## 📄 Documentation technique

Voir [doc/ARCHITECTURE.md](doc/ARCHITECTURE.md) pour les détails sur :
- Les objectifs du projet
- L'architecture technique
- Les contraintes et solutions mises en œuvre

---

## 🤝 Contribuer

Les contributions sont les bienvenues ! Ouvrez une *Issue* ou un *Pull Request*.

---

## 📜 Licence

[MIT](LICENSE) - Libre d'utiliser, modifier, distribuer.
