// Fonctionnalité : garder l'écran allumé pendant la séance (Wake Lock, repli NoSleep.js).
const { test, expect } = require('./helpers/app');

test.describe('Écran allumé pendant la séance', () => {
  test.describe('Avec l’API Wake Lock', () => {
    test.beforeEach(async ({ app }) => { await app.open(); });

    test('rien n’est demandé avant le démarrage', async ({ app }) => {
      expect((await app.wakeLock()).requests).toBe(0);
    });

    test('le démarrage demande un verrou d’écran', async ({ app }) => {
      await app.start();
      expect(await app.wakeLock()).toMatchObject({ requests: 1, releases: 0, lastType: 'screen' });
    });

    test('l’arrêt libère le verrou', async ({ app }) => {
      await app.start();
      await app.stop();
      expect((await app.wakeLock()).releases).toBe(1);
    });

    test('NoSleep n’est pas utilisé quand Wake Lock fonctionne', async ({ app }) => {
      await app.start();
      expect((await app.noSleep()).enabled).toBe(0);
    });

    test('le verrou est redemandé quand la page redevient visible', async ({ app, page }) => {
      await app.start();
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      expect((await app.wakeLock()).requests).toBe(2);
    });

    test('le retour de visibilité ne fait rien si aucune séance ne tourne', async ({ app, page }) => {
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      expect((await app.wakeLock()).requests).toBe(0);
      expect((await app.audio()).contexts).toBe(0);
    });

    test('le retour de visibilité reprogramme aussi le son', async ({ app, page }) => {
      await app.start();
      await app.advance(2);
      const avant = (await app.audioEvents({ param: 'frequency', method: 'cancelScheduledValues' })).length;
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      const apres = (await app.audioEvents({ param: 'frequency', method: 'cancelScheduledValues' })).length;
      expect(apres).toBeGreaterThan(avant);
    });
  });

  test.describe('Repli sur NoSleep.js', () => {
    test('utilisé quand l’API Wake Lock est absente (Safari/iOS ancien)', async ({ app }) => {
      await app.open({ wakeLock: 'absent' });
      await app.start();
      expect((await app.noSleep()).enabled).toBe(1);
      await app.stop();
      expect((await app.noSleep()).disabled).toBe(1);
    });

    test('utilisé quand la demande de verrou est refusée', async ({ app }) => {
      await app.open({ wakeLock: 'reject' });
      await app.start();
      await expect.poll(async () => (await app.noSleep()).enabled).toBe(1);
    });

    test('la séance démarre même sans Wake Lock ni NoSleep', async ({ app }) => {
      await app.open({ wakeLock: 'absent', noSleep: 'absent' });
      await app.start();
      await app.advance(0.5);
      await expect(app.phase).toHaveText('Inspirez');
      expect(app.errors).toEqual([]);
      await app.stop();
      await expect(app.phase).toHaveText('Prêt');
      expect(app.errors).toEqual([]);
    });
  });
});
