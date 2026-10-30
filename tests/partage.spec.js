// Fonctionnalité : partage des réglages par lien (#r=inh,hold1,exh,hold2,total) :
// construction du lien, import à l'ouverture, validation et bornes, replis share / presse-papiers.
const { test, expect, App } = require('./helpers/app');

const SHARE = 'Partager ces réglages';
const status = (app) => app.page.locator('#status');
const hashNow = (app) => app.page.evaluate(() => location.hash);

async function expectDefaults(app) {
  await expect(app.setting('inh').value).toHaveText('4 s');
  await expect(app.setting('hold1').value).toHaveText('0 s');
  await expect(app.setting('exh').value).toHaveText('6 s');
  await expect(app.setting('hold2').value).toHaveText('0 s');
  await expect(app.setting('total').value).toHaveText('5 min');
}

test.describe('Partage des réglages', () => {
  test.describe('Envoi du lien', () => {
    test('sans navigator.share, le lien est copié dans le presse-papiers', async ({ app }) => {
      await app.open();
      await app.preset('Carrée 4').click();
      await app.page.getByRole('button', { name: SHARE }).click();
      await expect(status(app)).toHaveText('Lien copié');
      const { copies } = await app.shareState();
      expect(copies).toHaveLength(1);
      expect(copies[0]).toMatch(/\/index\.html#r=4,4,4,4,5$/);
    });

    test('avec navigator.share, le lien part dans la feuille de partage et rien n’est copié', async ({ app }) => {
      await app.open({ share: 'ok' });
      await app.page.getByRole('button', { name: SHARE }).click();
      const { shares, copies } = await app.shareState();
      expect(shares).toHaveLength(1);
      expect(shares[0].url).toMatch(/#r=4,0,6,0,5$/);
      expect(copies).toEqual([]);
    });

    test('annuler le partage (AbortError) ne produit aucun message et ne copie rien', async ({ app }) => {
      await app.open({ share: 'abort' });
      await app.page.getByRole('button', { name: SHARE }).click();
      expect((await app.shareState()).shares).toHaveLength(1);
      expect((await app.shareState()).copies).toEqual([]);
      await expect(status(app)).toHaveText('');
    });

    test('une autre erreur de partage bascule sur le presse-papiers', async ({ app }) => {
      await app.open({ share: 'error' });
      await app.page.getByRole('button', { name: SHARE }).click();
      await expect(status(app)).toHaveText('Lien copié');
      const { copies } = await app.shareState();
      expect(copies).toHaveLength(1);
      expect(copies[0]).toMatch(/#r=4,0,6,0,5$/);
    });

    test('presse-papiers refusé : le lien est affiché dans le message', async ({ app }) => {
      await app.open({ clipboard: 'reject' });
      await app.page.getByRole('button', { name: SHARE }).click();
      await expect(status(app)).toHaveText(/^Copiez ce lien : http:\/\/127\.0\.0\.1:\d+\/index\.html#r=4,0,6,0,5$/);
    });

    test('presse-papiers absent : le lien est affiché dans le message', async ({ app }) => {
      await app.open({ clipboard: 'absent' });
      await app.page.getByRole('button', { name: SHARE }).click();
      await expect(status(app)).toHaveText(/^Copiez ce lien : http:\/\/127\.0\.0\.1:\d+\/index\.html#r=4,0,6,0,5$/);
    });
  });

  test.describe('Ouverture d’un lien', () => {
    test('un lien valide applique, enregistre et retire le fragment', async ({ app }) => {
      await app.open({ hash: '#r=5,2,7,1,10' });
      await expect(app.setting('inh').value).toHaveText('5 s');
      await expect(app.setting('hold1').value).toHaveText('2 s');
      await expect(app.setting('exh').value).toHaveText('7 s');
      await expect(app.setting('hold2').value).toHaveText('1 s');
      await expect(app.setting('total').value).toHaveText('10 min');
      expect(await app.storedConfig()).toEqual({ inh: 5, hold1: 2, exh: 7, hold2: 1, total: 10, sound: true });
      await expect(status(app)).toHaveText('Réglages importés');
      expect(await hashNow(app)).toBe('');
    });

    test('les valeurs sont arrondies au pas du champ et bornées', async ({ app }) => {
      await app.open({ hash: '#r=4.3,-2,99,0,1000' });
      await expect(app.setting('inh').value).toHaveText('4,5 s');
      await expect(app.setting('hold1').value).toHaveText('0 s');
      await expect(app.setting('exh').value).toHaveText('30 s');
      await expect(app.setting('hold2').value).toHaveText('0 s');
      await expect(app.setting('total').value).toHaveText('60 min');
      await expect(status(app)).toHaveText('Réglages importés');
    });

    for (const hash of ['#r=4,0,6', '#r=a,0,6,0,5', '#r=4,0,6,0,5,1', '#r=4,,6,0,5']) {
      test(`un lien invalide (${hash}) est ignoré avec un message et le fragment est retiré`, async ({ app }) => {
        await app.open({ hash });
        await expect(status(app)).toHaveText('Lien de réglages invalide');
        await expectDefaults(app);
        expect(await app.storedConfig()).toBeNull();
        expect(await hashNow(app)).toBe('');
      });
    }

    test('un fragment sans rapport ne produit aucun message et reste en place', async ({ app }) => {
      await app.open({ hash: '#autre' });
      await expectDefaults(app);
      await expect(status(app)).toHaveText('');
      expect(await hashNow(app)).toBe('#autre');
    });

    test('aller-retour : le lien copié restaure les mêmes réglages dans un navigateur vide', async ({ app, browser }) => {
      await app.open();
      await app.preset('5 – 5').click();
      await app.click('hold2', '+', 2);
      await app.click('total', '+');
      await app.page.getByRole('button', { name: SHARE }).click();
      const copied = (await app.shareState()).copies[0];
      expect(copied).toMatch(/#r=5,0,5,1,6$/);

      const ctx = await browser.newContext({ baseURL: new URL(copied).origin, serviceWorkers: 'block' });
      try {
        const other = new App(await ctx.newPage());
        await other.open({ hash: new URL(copied).hash });
        await expect(other.setting('inh').value).toHaveText('5 s');
        await expect(other.setting('hold1').value).toHaveText('0 s');
        await expect(other.setting('exh').value).toHaveText('5 s');
        await expect(other.setting('hold2').value).toHaveText('1 s');
        await expect(other.setting('total').value).toHaveText('6 min');
        expect(await other.storedConfig()).toEqual({ inh: 5, hold1: 0, exh: 5, hold2: 1, total: 6, sound: true });
      } finally {
        await ctx.close();
      }
    });
  });
});
