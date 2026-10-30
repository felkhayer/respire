// Fonctionnalité : fonctionnement hors ligne avec un vrai service worker dans un vrai navigateur.
const { test, expect } = require('@playwright/test');

test.use({ serviceWorkers: 'allow' });

test.describe('Mode hors ligne', () => {
  test('après une première visite, l’application se recharge et fonctionne sans réseau', async ({ page, context }) => {
    await page.goto('/index.html');
    // Attendre que le service worker soit installé, activé et qu'il contrôle la page.
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 });

    const cache = await page.evaluate(async () => {
      const noms = await caches.keys();
      const urls = (await (await caches.open('respiration-v1')).keys()).map((r) => new URL(r.url).pathname);
      return { noms, urls };
    });
    expect(cache.noms).toContain('respiration-v1');
    expect(cache.urls).toEqual(expect.arrayContaining(['/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png']));

    await context.setOffline(true);
    await page.reload();
    await expect(page).toHaveTitle('Respiration lente');
    await expect(page.locator('#phase')).toHaveText('Prêt');

    // L'application reste pleinement utilisable : réglages, préréglages, démarrage.
    await page.getByRole('button', { name: 'Augmenter : Inspiration' }).click();
    await expect(page.locator('.row', { hasText: 'Inspiration' }).locator('output')).toHaveText('4,5 s');
    await page.getByRole('button', { name: 'Démarrer' }).click();
    await expect(page.locator('#phase')).toHaveText('Inspirez');
    await expect(page.locator('#go')).toHaveText('Arrêter');
  });

  test('le service worker couvre toute l’application (portée = racine du site)', async ({ page, baseURL }) => {
    await page.goto('/index.html');
    const portee = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
    expect(portee).toBe(baseURL + '/');
  });
});
