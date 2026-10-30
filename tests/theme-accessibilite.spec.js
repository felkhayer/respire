// Fonctionnalité : thème clair/sombre, accessibilité (ARIA, clavier, cibles tactiles) et mise en page.
const { test, expect } = require('./helpers/app');

const CLAIR = 'rgb(237, 242, 238)'; // #edf2ee
const SOMBRE = 'rgb(14, 27, 32)';   // #0e1b20

test.describe('Thème clair / sombre', () => {
  test('suit la préférence du système : clair', async ({ app, page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await app.open();
    await expect(page.locator('body')).toHaveCSS('background-color', CLAIR);
  });

  test('suit la préférence du système : sombre', async ({ app, page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await app.open();
    await expect(page.locator('body')).toHaveCSS('background-color', SOMBRE);
  });

  test('data-theme="light" force le thème clair même si le système est sombre', async ({ app, page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await app.open();
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    await expect(page.locator('body')).toHaveCSS('background-color', CLAIR);
  });

  test('data-theme="dark" force le thème sombre même si le système est clair', async ({ app, page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await app.open();
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await expect(page.locator('body')).toHaveCSS('background-color', SOMBRE);
  });

  test('chaque phase a sa couleur : inspiration, expiration, pauses', async ({ app, page }) => {
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' }); // pas de transition de couleur
    await app.open();
    await app.preset('Carrée 4').click();
    await app.start();
    await app.advance(0.5);
    await expect(app.phase).toHaveCSS('color', 'rgb(35, 121, 111)');  // inspiration #23796f
    await app.advance(4);
    await expect(app.phase).toHaveCSS('color', 'rgb(74, 95, 147)');   // rétention #4a5f93
    await app.advance(4);
    await expect(app.phase).toHaveCSS('color', 'rgb(156, 95, 29)');   // expiration #9c5f1d
    await app.advance(4);
    await expect(app.phase).toHaveCSS('color', 'rgb(74, 95, 147)');   // pause : même couleur que la rétention
  });

  test('les transitions sont désactivées si l’utilisateur préfère réduire les animations', async ({ app, page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await app.open();
    await expect(app.phase).toHaveCSS('transition-duration', '0s');
    await expect(app.disc).toHaveCSS('transition-duration', '0s');
  });

  test('les transitions de couleur sont actives par défaut', async ({ app, page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await app.open();
    // On vérifie la présence d'une transition, pas sa durée exacte (choix esthétique libre).
    await expect(app.phase).not.toHaveCSS('transition-duration', '0s');
    await expect(app.disc).not.toHaveCSS('transition-duration', '0s');
  });
});

test.describe('Accessibilité', () => {
  test.beforeEach(async ({ app }) => { await app.open(); });

  test('l’interrupteur sonore est annoncé comme un « switch » nommé « Guide sonore »', async ({ page }) => {
    await expect(page.getByRole('switch', { name: 'Guide sonore' })).toBeVisible();
  });

  test('chaque bouton − / + annonce l’action et le réglage concerné', async ({ page }) => {
    for (const l of ['Inspiration', 'Pause poumons pleins', 'Expiration', 'Pause poumons vides', 'Durée de l’exercice']) {
      await expect(page.getByRole('button', { name: 'Augmenter : ' + l })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Diminuer : ' + l })).toBeVisible();
    }
  });

  test('les cibles tactiles font au moins 44 px', async ({ app, page }) => {
    const cibles = [app.go, ...['inh', 'hold1', 'exh', 'hold2', 'total'].flatMap((k) => [app.setting(k).plus, app.setting(k).minus])];
    for (const c of cibles) {
      const box = await c.boundingBox();
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    for (const chip of await page.locator('.chip').all()) {
      expect((await chip.boundingBox()).height).toBeGreaterThanOrEqual(36);
    }
  });

  test('l’illustration SVG est masquée aux lecteurs d’écran', async ({ page }) => {
    await expect(page.locator('.dial svg')).toHaveAttribute('aria-hidden', 'true');
  });

  test('toutes les actions se font au clavier (Entrée / Espace)', async ({ app, page }) => {
    await app.go.focus();
    await page.keyboard.press('Enter');
    await expect(app.go).toHaveText('Arrêter');
    await page.keyboard.press('Space');
    await expect(app.go).toHaveText('Démarrer');
    await app.sound.focus();
    await page.keyboard.press('Space');
    await expect(app.sound).toHaveAttribute('aria-checked', 'false');
    await app.preset('5 – 5').focus();
    await page.keyboard.press('Enter');
    await expect(app.preset('5 – 5')).toHaveAttribute('aria-pressed', 'true');
  });

  test('l’élément atteint au clavier est entouré d’un contour visible', async ({ app, page }) => {
    await page.keyboard.press('Tab');
    await expect(app.go).toBeFocused();
    await expect(app.go).toHaveCSS('outline-style', 'solid');
    await expect(app.go).toHaveCSS('outline-width', '3px');
  });

  test('l’ordre de tabulation commence par le bouton principal', async ({ app, page }) => {
    await page.keyboard.press('Tab');
    await expect(app.go).toBeFocused();
  });
});

test.describe('Mise en page', () => {
  // La mise en page est fluide jusqu'à 440 px : le plus petit écran courant (320 px) est le cas limite,
  // un débordement sur un écran plus large y apparaîtrait aussi.
  test('pas de défilement horizontal sur petit mobile (320 px)', async ({ app, page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await app.open();
    const { scroll, inner } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
    expect(scroll).toBeLessThanOrEqual(inner);
  });

  test('le contenu est limité à 440 px de large sur grand écran', async ({ app, page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await app.open();
    expect((await page.locator('main').boundingBox()).width).toBeLessThanOrEqual(440);
  });

  test('le cadran reste carré et ne dépasse pas 320 px', async ({ app, page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await app.open();
    const box = await page.locator('.dial').boundingBox();
    expect(Math.abs(box.width - box.height)).toBeLessThanOrEqual(1);
    expect(box.width).toBeLessThanOrEqual(320);
  });
});
