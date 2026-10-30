// Fonctionnalité : historique des séances (enregistrement, persistance, affichage, effacement).
const { test, expect } = require('./helpers/app');

const CLE = 'respiration-history';
const CFG = 'respiration-cfg';

// Fuseau et langue fixés : le texte des dates est alors identique partout.
test.use({ locale: 'fr-FR', timezoneId: 'Europe/Paris' });

const entree = (i, extra) => Object.assign({ d: i * 60000, s: 60 + i, c: i, r: [4, 0, 6, 0], done: false }, extra);
const stocke = (liste) => ({ [CLE]: JSON.stringify(liste) });
const lire = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), CLE);

test.describe('Historique des séances', () => {
  test.describe('Enregistrement', () => {
    test('une séance arrêtée à 30 s est enregistrée avec ses valeurs', async ({ app, page }) => {
      await app.open();
      await app.start(); // l'horloge simulée est figée à 1000 ms
      await app.advance(30.5);
      await app.stop();
      expect(await lire(page)).toEqual([{ d: 1000, s: 30, c: 3, r: [4, 0, 6, 0], done: false }]);
    });

    test('une séance de moins de 30 s n’est pas enregistrée', async ({ app, page }) => {
      await app.open();
      await app.start();
      await app.advance(29.5);
      await app.stop();
      expect(await lire(page)).toBeNull();
      await expect(page.locator('#history-list li')).toHaveCount(0);
    });

    test('le rythme est celui du démarrage, même modifié pendant la séance', async ({ app, page }) => {
      await app.open();
      await app.preset('Carrée 4').click();
      await app.start();
      await app.advance(10);
      await app.preset('5 – 5').click();
      await app.advance(25);
      await app.stop();
      const h = await lire(page);
      expect(h).toHaveLength(1);
      expect(h[0].r).toEqual([4, 4, 4, 4]);
    });

    test('le début est relevé au démarrage, pas à l’arrêt', async ({ app, page }) => {
      await app.open();
      await app.advance(5);
      await app.start();
      await app.advance(40);
      await app.stop();
      expect((await lire(page))[0].d).toBe(6000);
    });

    test('la fin automatique enregistre la durée prévue avec done = true', async ({ app, page }) => {
      await app.open({ storage: { [CFG]: JSON.stringify({ total: 1 }) } });
      await app.start();
      // La dernière seconde est jouée image par image : le nombre de cycles est à jour à l'arrêt.
      await app.advance(58);
      await app.advance(3);
      await expect(app.phase).toHaveText('Terminé');
      // 6 cycles de 10 s : le dernier se termine pile à la fin et il est compté.
      expect(await lire(page)).toEqual([{ d: 1000, s: 60, c: 6, r: [4, 0, 6, 0], done: true }]);
    });

    test('les séances s’ajoutent à la suite, de la plus ancienne à la plus récente', async ({ app, page }) => {
      await app.open();
      await app.start();
      await app.advance(40);
      await app.stop();
      await app.start();
      await app.advance(50);
      await app.stop();
      const h = await lire(page);
      expect(h.map((e) => e.s)).toEqual([40, 50]);
      expect(h[1].d).toBeGreaterThan(h[0].d);
    });

    test('l’historique est limité à 500 séances : les plus anciennes sont supprimées', async ({ app, page }) => {
      const pleine = Array.from({ length: 500 }, (_, i) => entree(i + 1));
      await app.open({ storage: stocke(pleine) });
      await app.start();
      await app.advance(40);
      await app.stop();
      const h = await lire(page);
      expect(h).toHaveLength(500);
      expect(h[0].d).toBe(2 * 60000);
      expect(h[499].s).toBe(40);
    });

    test('une séance courte ne modifie pas un historique existant', async ({ app, page }) => {
      const avant = [entree(1), entree(2)];
      await app.open({ storage: stocke(avant) });
      await app.start();
      await app.advance(10);
      await app.stop();
      expect(await lire(page)).toEqual(avant);
    });

    test('une séance guidée est enregistrée avec sa séquence et affichée sous son nom', async ({ app, page }) => {
      await app.open();
      await app.guide('Endormissement').click();
      await app.start();
      await app.advance(40);
      await app.stop();
      const h = await lire(page);
      expect(h[0].g).toBe('sommeil');
      expect(h[0].r).toEqual([4, 0, 6, 0]); // rythme de la première étape
      await expect(page.locator('#history-list li .meta').first()).toHaveText(/ · Endormissement$/);
    });

    test('sans séquence connue, la ligne affiche le rythme', async ({ app, page }) => {
      await app.open({ storage: stocke([entree(1), entree(2, { g: 'inconnue' })]) });
      await expect(page.locator('#history-list li .meta')).toHaveText([/ · 4 – 6$/, /ycles? · 4 – 6$/]);
    });
  });

  test.describe('Persistance', () => {
    test('l’historique est restauré après rechargement', async ({ app, page }) => {
      await app.open();
      await app.start();
      await app.advance(40);
      await app.stop();
      await app.reload();
      await page.locator('#history summary').click();
      await expect(page.locator('#history-list li')).toHaveCount(1);
      await expect(page.locator('#history-list li')).toContainText('0:40');
    });

    test('un stockage corrompu donne un historique vide et l’application fonctionne', async ({ app, page }) => {
      await app.open({ storage: { [CLE]: '{pas du json' } });
      await page.locator('#history summary').click();
      await expect(page.locator('#history-empty')).toBeVisible();
      await expect(page.locator('#history-list li')).toHaveCount(0);
      await app.start();
      await app.advance(40);
      await app.stop();
      expect(await lire(page)).toHaveLength(1);
      expect(app.errors).toEqual([]);
    });

    test('un contenu qui n’est pas un tableau est ignoré', async ({ app, page }) => {
      await app.open({ storage: { [CLE]: JSON.stringify({ d: 1 }) } });
      await expect(page.locator('#history-list li')).toHaveCount(0);
      await app.start();
      await app.advance(40);
      await app.stop();
      expect(await lire(page)).toHaveLength(1);
      expect(app.errors).toEqual([]);
    });

    test('des entrées invalides sont ignorées à l’affichage', async ({ app, page }) => {
      await app.open({ storage: stocke([null, 'x', { d: 0 }, entree(1)]) });
      await expect(page.locator('#history-list li')).toHaveCount(1);
      expect(app.errors).toEqual([]);
    });

    test('l’application reste utilisable si le stockage est interdit', async ({ app, page }) => {
      await app.open({ storageBroken: true });
      await app.start();
      await app.advance(40);
      await app.stop();
      await expect(app.phase).toHaveText('Prêt');
      await expect(page.locator('#history-list li')).toHaveCount(0);
      await expect(page.locator('#history-empty')).toHaveText('Aucune séance enregistrée');
      expect(app.errors).toEqual([]);
    });
  });

  test.describe('Affichage', () => {
    test('la section est repliée par défaut et s’ouvre au clic', async ({ app, page }) => {
      await app.open();
      await expect(page.locator('#history')).not.toHaveAttribute('open', '');
      await page.getByText('Historique', { exact: true }).click();
      await expect(page.locator('#history')).toHaveAttribute('open', '');
    });

    test('un historique vide affiche un message et pas de bouton d’effacement', async ({ app, page }) => {
      await app.open();
      await page.locator('#history summary').click();
      await expect(page.getByText('Aucune séance enregistrée')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Effacer l’historique' })).toBeHidden();
    });

    test('une ligne affiche date, heure, durée m:ss, cycles et rythme', async ({ app, page }) => {
      // 1er janvier 1970 à 00:00 UTC = jeudi 01:00 à Paris.
      await app.open({ storage: stocke([{ d: 0, s: 125, c: 12, r: [4, 7, 8, 0], done: true }]) });
      await page.locator('#history summary').click();
      const ligne = page.locator('#history-list li');
      await expect(ligne).toContainText(/jeu\.? 1 janv\.?,? 01:00/);
      await expect(ligne).toContainText('2:05');
      await expect(ligne).toContainText('12 cycles');
      await expect(ligne).toContainText('4 – 7 – 8');
    });

    test('le rythme suit le format des préréglages : virgule, pauses nulles omises', async ({ app, page }) => {
      await app.open({ storage: stocke([
        entree(1, { r: [4, 4, 4, 4] }),
        entree(2, { r: [4.5, 0, 5.5, 0] }),
        entree(3, { r: [4, 0, 6, 2] })
      ]) });
      await page.locator('#history summary').click();
      const lignes = page.locator('#history-list li');
      await expect(lignes.nth(0)).toContainText('4 – 6 – 2');
      await expect(lignes.nth(1)).toContainText('4,5 – 5,5');
      await expect(lignes.nth(1).locator('.meta')).toHaveText(/ · 4,5 – 5,5$/);
      await expect(lignes.nth(2)).toContainText('4 – 4 – 4 – 4');
    });

    test('la séance la plus récente est en premier', async ({ app, page }) => {
      await app.open({ storage: stocke([entree(1), entree(2), entree(3)]) });
      await page.locator('#history summary').click();
      const lignes = page.locator('#history-list li');
      await expect(lignes).toHaveCount(3);
      await expect(lignes.nth(0)).toContainText('1:03');
      await expect(lignes.nth(1)).toContainText('1:02');
      await expect(lignes.nth(2)).toContainText('1:01');
    });

    test('seules les 10 dernières séances sont listées', async ({ app, page }) => {
      await app.open({ storage: stocke(Array.from({ length: 25 }, (_, i) => entree(i + 1))) });
      await page.locator('#history summary').click();
      const lignes = page.locator('#history-list li');
      await expect(lignes).toHaveCount(10);
      await expect(lignes.first()).toContainText('1:25');
      await expect(lignes.last()).toContainText('1:16');
    });

    test('une séance terminée apparaît tout de suite dans la liste', async ({ app, page }) => {
      await app.open();
      await page.locator('#history summary').click();
      await app.start();
      await app.advance(40);
      await app.stop();
      await expect(page.locator('#history-list li')).toHaveCount(1);
      await expect(page.locator('#history-list li')).toContainText('0:40');
      await expect(page.locator('#history-list li')).toContainText('4 – 6');
      await expect(page.getByText('Aucune séance enregistrée')).toBeHidden();
    });
  });

  test.describe('Effacement', () => {
    const seed = () => stocke([entree(1), entree(2)]);

    test('confirmé : l’historique est vidé, affiché vide et annoncé', async ({ app, page }) => {
      let message = '';
      page.on('dialog', (d) => { message = d.message(); d.accept(); });
      await app.open({ storage: seed() });
      await page.locator('#history summary').click();
      await page.getByRole('button', { name: 'Effacer l’historique' }).click();
      expect(message).not.toBe('');
      await expect(page.locator('#history-list li')).toHaveCount(0);
      await expect(page.getByText('Aucune séance enregistrée')).toBeVisible();
      await expect(page.locator('#status')).toHaveText('Historique effacé');
      expect((await lire(page)) || []).toEqual([]);
      await app.reload();
      await expect(page.locator('#history-list li')).toHaveCount(0);
    });

    test('annulé : l’historique est conservé et rien n’est annoncé', async ({ app, page }) => {
      let vu = 0;
      page.on('dialog', (d) => { vu++; d.dismiss(); });
      await app.open({ storage: seed() });
      await page.locator('#history summary').click();
      await page.getByRole('button', { name: 'Effacer l’historique' }).click();
      expect(vu).toBe(1);
      await expect(page.locator('#history-list li')).toHaveCount(2);
      await expect(page.locator('#status')).toHaveText('');
      expect(await lire(page)).toHaveLength(2);
    });
  });

  test.describe('Accessibilité', () => {
    test('le résumé et le bouton d’effacement font au moins 44 px et sont accessibles au clavier', async ({ app, page }) => {
      await app.open({ storage: stocke([entree(1)]) });
      await page.locator('#history summary').focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('#history')).toHaveAttribute('open', '');
      for (const c of [page.locator('#history summary'), page.locator('#clear-history')]) {
        expect((await c.boundingBox()).height).toBeGreaterThanOrEqual(44);
      }
      await page.keyboard.press('Tab');
      await expect(page.locator('#clear-history')).toBeFocused();
      const contour = await page.locator('#clear-history').evaluate((e) => getComputedStyle(e).outlineStyle);
      expect(contour).not.toBe('none');
    });

    test('pas de défilement horizontal à 320 px avec un historique rempli', async ({ app, page }) => {
      await page.setViewportSize({ width: 320, height: 568 });
      await app.open({ storage: stocke(Array.from({ length: 10 }, (_, i) => entree(i + 1, { r: [4.5, 4.5, 4.5, 4.5] }))) });
      await page.locator('#history summary').click();
      const debordement = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(debordement).toBeLessThanOrEqual(0);
    });
  });
});
