// Fonctionnalité : installation comme application (manifest, icônes, métadonnées).
// Tests purement « fichiers » : aucun navigateur n'est lancé.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const lire = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const manifest = JSON.parse(lire('manifest.json'));
const html = lire('index.html');

/** Dimensions lues dans l'en-tête IHDR d'un PNG. */
function dimensionsPng(f) {
  const b = fs.readFileSync(path.join(ROOT, f));
  expect(b.subarray(1, 4).toString()).toBe('PNG');
  return b.readUInt32BE(16) + 'x' + b.readUInt32BE(20);
}

test.describe('Manifest PWA', () => {
  test('identité de l’application', () => {
    expect(manifest).toMatchObject({ name: 'Respiration lente', short_name: 'Respirer', lang: 'fr' });
  });

  test('s’ouvre en plein écran (standalone) depuis la racine', () => {
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('./index.html');
    expect(manifest.scope).toBe('./');
    expect(fs.existsSync(path.join(ROOT, manifest.start_url))).toBe(true);
  });

  test('les couleurs du manifest correspondent au thème sombre de l’application', () => {
    expect(manifest.theme_color).toBe('#0e1b20');
    expect(manifest.background_color).toBe('#0e1b20');
    expect(html).toContain('<meta name="theme-color" content="' + manifest.theme_color + '">');
  });

  test('les icônes 192, 512 et maskable existent avec la bonne taille', () => {
    const parTaille = {};
    for (const i of manifest.icons) {
      expect(i.type).toBe('image/png');
      expect(dimensionsPng(i.src)).toBe(i.sizes);
      parTaille[i.sizes + (i.purpose ? ':' + i.purpose : '')] = i.src;
    }
    expect(Object.keys(parTaille).sort()).toEqual(['192x192', '512x512', '512x512:maskable']);
  });
});

test.describe('Métadonnées de la page', () => {
  test('référence le manifest et les icônes', () => {
    expect(html).toContain('<link rel="manifest" href="manifest.json">');
    expect(html).toContain('<link rel="apple-touch-icon" href="apple-touch-icon.png">');
    expect(dimensionsPng('apple-touch-icon.png')).toBe('180x180');
    expect(fs.existsSync(path.join(ROOT, 'icon-192.png'))).toBe(true);
  });

  test('viewport adapté aux mobiles à encoche', () => {
    expect(html).toContain('width=device-width, initial-scale=1, viewport-fit=cover');
  });

  test('métadonnées d’application web iOS / Android', () => {
    expect(html).toContain('<meta name="apple-mobile-web-app-capable" content="yes">');
    expect(html).toContain('<meta name="mobile-web-app-capable" content="yes">');
    expect(html).toContain('<meta name="apple-mobile-web-app-title" content="Respirer">');
  });

  test('le service worker est enregistré par la page', () => {
    expect(html).toContain("navigator.serviceWorker.register('sw.js')");
  });
});
