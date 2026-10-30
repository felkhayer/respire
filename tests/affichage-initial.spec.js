// Fonctionnalité : écran d'accueil (état « Prêt » avant toute séance).
const { test, expect } = require('./helpers/app');

test.describe('Affichage initial', () => {
  test.beforeEach(async ({ app }) => { await app.open(); });

  test('la page est en français avec le bon titre', async ({ page }) => {
    await expect(page).toHaveTitle('Respiration lente');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Respiration lente');
  });

  test('l’état est « Prêt » avec les compteurs à zéro', async ({ app }) => {
    await expect(app.phase).toHaveText('Prêt');
    await expect(app.count).toHaveText('4');
    await expect(app.cycles).toHaveText('0');
    await expect(app.elapsed).toHaveText('0:00 / 5:00');
    await expect(app.go).toHaveText('Démarrer');
    expect(await app.dataPhase()).toBe('idle');
  });

  test('le cercle de progression est masqué au repos', async ({ app }) => {
    await expect(app.dot).toHaveAttribute('opacity', '0');
    await expect(app.arc).toHaveAttribute('stroke-dashoffset', '879.65');
  });

  test('les réglages par défaut sont 4 s / 0 s / 6 s / 0 s sur 5 minutes', async ({ app }) => {
    await expect(app.setting('inh').value).toHaveText('4 s');
    await expect(app.setting('hold1').value).toHaveText('0 s');
    await expect(app.setting('exh').value).toHaveText('6 s');
    await expect(app.setting('hold2').value).toHaveText('0 s');
    await expect(app.setting('total').value).toHaveText('5 min');
  });

  test('le guide sonore est activé par défaut', async ({ page }) => {
    await expect(page.getByRole('switch', { name: 'Guide sonore' })).toHaveAttribute('aria-checked', 'true');
  });

  test('le préréglage « 4 – 6 » est sélectionné par défaut', async ({ app }) => {
    await expect(app.preset('4 – 6')).toHaveAttribute('aria-pressed', 'true');
    for (const autre of ['5 – 5', '4 – 7 – 8', 'Carrée 4']) {
      await expect(app.preset(autre)).toHaveAttribute('aria-pressed', 'false');
    }
  });

  test('l’aide sur le guide sonore est affichée', async ({ page }) => {
    await expect(page.locator('.hint')).toContainText('octave');
  });

  test('aucune erreur JavaScript au chargement', async ({ app }) => {
    expect(app.errors).toEqual([]);
  });
});
