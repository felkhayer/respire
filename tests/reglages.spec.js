// Fonctionnalité : réglage des durées (boutons − / +), bornes, formatage et persistance.
const { test, expect } = require('./helpers/app');

const CLE = 'respiration-cfg';

test.describe('Réglages des durées', () => {
  test('les durées avancent par pas de 0,5 s, affichées avec une virgule', async ({ app }) => {
    await app.open();
    await app.click('inh', '+');
    await expect(app.setting('inh').value).toHaveText('4,5 s');
    await app.click('inh', '+');
    await expect(app.setting('inh').value).toHaveText('5 s');
    await app.click('inh', '-');
    await expect(app.setting('inh').value).toHaveText('4,5 s');
  });

  test('chaque phase a ses propres boutons − / +', async ({ app }) => {
    await app.open();
    await app.click('hold1', '+');
    await app.click('exh', '-');
    await app.click('hold2', '+', 2);
    await expect(app.setting('inh').value).toHaveText('4 s');
    await expect(app.setting('hold1').value).toHaveText('0,5 s');
    await expect(app.setting('exh').value).toHaveText('5,5 s');
    await expect(app.setting('hold2').value).toHaveText('1 s');
  });

  test('inspiration et expiration ne descendent pas sous 1 s', async ({ app }) => {
    await app.open({ storage: { [CLE]: JSON.stringify({ inh: 1, exh: 1 }) } });
    await app.click('inh', '-');
    await app.click('exh', '-');
    await expect(app.setting('inh').value).toHaveText('1 s');
    await expect(app.setting('exh').value).toHaveText('1 s');
  });

  test('les pauses peuvent descendre jusqu’à 0 s mais pas en dessous', async ({ app }) => {
    await app.open({ storage: { [CLE]: JSON.stringify({ hold1: 0.5 }) } });
    await app.click('hold1', '-');
    await expect(app.setting('hold1').value).toHaveText('0 s');
    await app.click('hold1', '-');
    await expect(app.setting('hold1').value).toHaveText('0 s');
  });

  test('chaque durée est plafonnée à 30 s', async ({ app }) => {
    await app.open({ storage: { [CLE]: JSON.stringify({ inh: 29.5, hold1: 30, exh: 30, hold2: 30 }) } });
    await app.click('inh', '+', 3);
    await app.click('hold1', '+');
    await app.click('exh', '+');
    await app.click('hold2', '+');
    for (const k of ['inh', 'hold1', 'exh', 'hold2']) await expect(app.setting(k).value).toHaveText('30 s');
  });

  test('la durée de l’exercice avance par pas d’1 minute', async ({ app }) => {
    await app.open();
    await app.click('total', '+');
    await expect(app.setting('total').value).toHaveText('6 min');
    await app.click('total', '-', 2);
    await expect(app.setting('total').value).toHaveText('4 min');
  });

  test('0 minute signifie « Illimitée » et ne descend pas plus bas', async ({ app }) => {
    await app.open({ storage: { [CLE]: JSON.stringify({ total: 1 }) } });
    await app.click('total', '-');
    await expect(app.setting('total').value).toHaveText('Illimitée');
    await app.click('total', '-');
    await expect(app.setting('total').value).toHaveText('Illimitée');
    await expect(app.elapsed).toHaveText('0:00');
  });

  test('la durée de l’exercice est plafonnée à 60 minutes', async ({ app }) => {
    await app.open({ storage: { [CLE]: JSON.stringify({ total: 60 }) } });
    await app.click('total', '+');
    await expect(app.setting('total').value).toHaveText('60 min');
    await expect(app.elapsed).toHaveText('0:00 / 60:00');
  });

  test('avant la première séance, le total affiché suit le réglage', async ({ app }) => {
    await app.open();
    await app.click('total', '+');
    await expect(app.elapsed).toHaveText('0:00 / 6:00');
  });

  test('au repos, le grand compteur affiche la durée d’inspiration', async ({ app }) => {
    await app.open();
    await app.click('inh', '+');
    await expect(app.count).toHaveText('4,5');
    await app.click('inh', '+', 5);
    await expect(app.count).toHaveText('7');
  });

  test('les boutons ont des libellés accessibles explicites', async ({ page }) => {
    await page.goto('/index.html');
    for (const l of ['Inspiration', 'Pause poumons pleins', 'Expiration', 'Pause poumons vides', 'Durée de l’exercice']) {
      await expect(page.getByRole('button', { name: 'Augmenter : ' + l })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Diminuer : ' + l })).toBeVisible();
    }
  });

  test.describe('Persistance', () => {
    test('les réglages sont enregistrés dans le stockage local', async ({ app }) => {
      await app.open();
      await app.click('inh', '+');
      await app.click('hold1', '+', 2);
      await app.click('total', '+');
      expect(await app.storedConfig()).toEqual({ inh: 4.5, hold1: 1, exh: 6, hold2: 0, total: 6, sound: true });
    });

    test('les réglages sont restaurés après rechargement', async ({ app }) => {
      await app.open();
      await app.click('exh', '+', 3);
      await app.click('total', '-', 5);
      await app.reload();
      await expect(app.setting('exh').value).toHaveText('7,5 s');
      await expect(app.setting('total').value).toHaveText('Illimitée');
    });

    test('un réglage partiel est complété par les valeurs par défaut', async ({ app }) => {
      await app.open({ storage: { [CLE]: JSON.stringify({ inh: 7 }) } });
      await expect(app.setting('inh').value).toHaveText('7 s');
      await expect(app.setting('exh').value).toHaveText('6 s');
      await expect(app.setting('total').value).toHaveText('5 min');
    });

    test('un stockage corrompu retombe sur les valeurs par défaut', async ({ app }) => {
      await app.open({ storage: { [CLE]: '{pas du json' } });
      await expect(app.setting('inh').value).toHaveText('4 s');
      await expect(app.phase).toHaveText('Prêt');
      expect(app.errors).toEqual([]);
    });

    test('l’application reste utilisable si le stockage est interdit', async ({ app }) => {
      await app.open({ storageBroken: true });
      await expect(app.setting('inh').value).toHaveText('4 s');
      await app.click('inh', '+');
      await expect(app.setting('inh').value).toHaveText('4,5 s');
      expect(app.errors).toEqual([]);
    });
  });
});
