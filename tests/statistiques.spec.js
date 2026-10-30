// Fonctionnalité : statistiques de progression (totaux, 7 jours, série, graphique de 14 jours).
const { test, expect } = require('./helpers/app');

const CLE = 'respiration-history';
const JOUR = 86400000;

// Fuseau et langue fixés : les jours « locaux » sont alors identiques partout.
test.use({ locale: 'fr-FR', timezoneId: 'Europe/Paris' });

// Aujourd'hui simulé : mardi 20 octobre 2026, 12:00 à Paris (UTC+2, avant le changement d'heure du 25).
const MAINTENANT = Date.UTC(2026, 9, 20, 10, 0, 0);

// Une séance `n` jours avant aujourd'hui, à midi (heure de Paris), de `s` secondes.
const seance = (n, s) => ({ d: MAINTENANT - n * JOUR, s: s === undefined ? 60 : s, c: 5, r: [4, 0, 6, 0], done: false });

async function ouvrir(app, page, historique, maintenant) {
  const t = maintenant === undefined ? MAINTENANT : maintenant;
  await page.clock.install({ time: t });
  await page.clock.pauseAt(t + 1000);
  const storage = historique ? { [CLE]: JSON.stringify(historique) } : {};
  await app.open({ clock: false, storage });
  await page.locator('#history summary').click();
}

const texte = (page, id) => page.locator('#' + id);

// Les 14 barres, de la plus ancienne à aujourd'hui.
const barres = (page) => page.locator('#stats-chart rect').evaluateAll((els) => els.map((e) => ({
  h: parseFloat(e.getAttribute('height')),
  aujourdhui: e.classList.contains('today')
})));

test.describe('Statistiques de progression', () => {
  test.describe('Indicateurs', () => {
    test('séances et minutes cumulées : somme des secondes arrondie à la minute', async ({ app, page }) => {
      // 90 + 100 + 95 = 285 s = 4,75 min : arrondi à 5 (et non 4 ni 4,75)
      await ouvrir(app, page, [seance(3, 90), seance(2, 100), seance(0, 95)]);
      await expect(texte(page, 'stat-sessions')).toHaveText('3');
      await expect(texte(page, 'stat-minutes')).toHaveText('5');
    });

    test('les totaux comptent aussi les séances plus anciennes que 14 jours', async ({ app, page }) => {
      await ouvrir(app, page, [seance(40, 600), seance(0, 60)]);
      await expect(texte(page, 'stat-sessions')).toHaveText('2');
      await expect(texte(page, 'stat-minutes')).toHaveText('11');
    });

    test('7 derniers jours : aujourd’hui et les 6 jours précédents, pas le 8e jour', async ({ app, page }) => {
      // aujourd'hui 1 min, il y a 6 jours 2 min (inclus), il y a 7 jours 10 min (exclu)
      await ouvrir(app, page, [seance(7, 600), seance(6, 120), seance(0, 60)]);
      await expect(texte(page, 'stat-week')).toHaveText('3 min');
      await expect(texte(page, 'stat-minutes')).toHaveText('13');
    });
  });

  test.describe('Série de jours consécutifs', () => {
    test('aujourd’hui compris', async ({ app, page }) => {
      await ouvrir(app, page, [seance(4), seance(2), seance(1), seance(0)]);
      await expect(texte(page, 'stat-streak')).toHaveText('3 jours');
    });

    test('rien aujourd’hui : la série remonte depuis hier et n’est pas cassée', async ({ app, page }) => {
      await ouvrir(app, page, [seance(3), seance(2), seance(1)]);
      await expect(texte(page, 'stat-streak')).toHaveText('3 jours');
    });

    test('un jour sans pratique casse la série', async ({ app, page }) => {
      await ouvrir(app, page, [seance(3), seance(2), seance(0)]);
      await expect(texte(page, 'stat-streak')).toHaveText('1 jour');
    });

    test('rien aujourd’hui ni hier : série nulle', async ({ app, page }) => {
      await ouvrir(app, page, [seance(2), seance(3)]);
      await expect(texte(page, 'stat-streak')).toHaveText('0 jour');
    });

    test('plusieurs séances le même jour comptent pour un seul jour', async ({ app, page }) => {
      await ouvrir(app, page, [seance(1), seance(0, 40), seance(0, 50), seance(0, 70)]);
      await expect(texte(page, 'stat-streak')).toHaveText('2 jours');
      await expect(texte(page, 'stat-sessions')).toHaveText('4');
    });

    test('une série de plus de 14 jours est comptée en entier', async ({ app, page }) => {
      const h = [];
      for (let n = 0; n < 20; n++) h.push(seance(n));
      await ouvrir(app, page, h);
      await expect(texte(page, 'stat-streak')).toHaveText('20 jours');
    });
  });

  test.describe('Graphique des 14 derniers jours', () => {
    test('14 barres, hauteurs proportionnelles au maximum, jour sans pratique réduit à un trait', async ({ app, page }) => {
      // Le jour 14 (hors fenêtre) est énorme : il ne doit pas servir de maximum.
      await ouvrir(app, page, [seance(14, 6000), seance(13, 120), seance(5, 30), seance(0, 60)]);
      const b = await barres(page);
      expect(b).toHaveLength(14);
      expect(b[0].h).toBeCloseTo(60, 5); // le maximum (2 min) occupe toute la hauteur, le plus ancien jour en premier
      expect(b[8].h).toBeCloseTo(15, 5); // 0,5 min = 1/4 du maximum
      expect(b[13].h).toBeCloseTo(30, 5); // 1 min = 1/2
      // jours sans pratique : un trait visible, mais net plus bas que n'importe quelle barre
      for (const i of [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12]) {
        expect(b[i].h).toBeGreaterThan(0);
        expect(b[i].h).toBeLessThan(5);
      }
    });

    test('seule la barre d’aujourd’hui est mise en valeur', async ({ app, page }) => {
      await ouvrir(app, page, [seance(1), seance(0)]);
      const b = await barres(page);
      expect(b.map((x) => x.aujourdhui)).toEqual([false, false, false, false, false, false, false, false, false, false, false, false, false, true]);
      const ops = await page.locator('#stats-chart rect').evaluateAll((els) => els.map((e) => getComputedStyle(e).fillOpacity));
      expect(parseFloat(ops[13])).toBeGreaterThan(parseFloat(ops[12]));
    });

    test('couleurs du thème : la barre change entre le clair et le sombre', async ({ app, page }) => {
      await ouvrir(app, page, [seance(0)]);
      const fill = () => page.locator('#stats-chart rect').last().evaluate((e) => getComputedStyle(e).fill);
      await page.emulateMedia({ colorScheme: 'light' });
      const clair = await fill();
      await page.emulateMedia({ colorScheme: 'dark' });
      const sombre = await fill();
      expect(clair).toBe('rgb(35, 121, 111)'); // --in clair
      expect(sombre).toBe('rgb(95, 196, 181)'); // --in sombre
    });

    test('le graphique est une image accessible qui résume les 14 valeurs', async ({ app, page }) => {
      await ouvrir(app, page, [seance(13, 60), seance(2, 180), seance(0, 300)]);
      const svg = page.locator('#stats-chart');
      await expect(svg).toHaveAttribute('role', 'img');
      await expect(svg).toHaveAttribute('aria-label',
        'Minutes de pratique par jour sur 14 jours : 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 5 ; aujourd’hui 5 min');
    });

    test('les dates de début et de fin sont affichées sous le graphique', async ({ app, page }) => {
      await ouvrir(app, page, [seance(0)]);
      await expect(page.locator('#stats-from')).toHaveText('7 oct.');
      await expect(page.locator('#stats-to')).toHaveText('20 oct.');
    });

    test('le graphique s’adapte à 320 px sans défilement horizontal', async ({ app, page }) => {
      await page.setViewportSize({ width: 320, height: 568 });
      await ouvrir(app, page, [seance(1), seance(0)]);
      const { scroll, inner } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
      expect(scroll).toBeLessThanOrEqual(inner);
      expect((await page.locator('#stats-chart').boundingBox()).width).toBeLessThanOrEqual(320);
    });
  });

  test.describe('Historique vide', () => {
    test('aucune statistique, seulement le message', async ({ app, page }) => {
      await ouvrir(app, page, null);
      await expect(page.locator('#stats')).toBeHidden();
      await expect(page.locator('#history-empty')).toBeVisible();
    });
  });

  test.describe('Mise à jour', () => {
    test('une vraie séance d’une minute met les statistiques à jour', async ({ app, page }) => {
      await ouvrir(app, page, null);
      await app.start();
      await app.advance(60);
      await app.stop();
      await expect(page.locator('#stats')).toBeVisible();
      await expect(texte(page, 'stat-sessions')).toHaveText('1');
      await expect(texte(page, 'stat-minutes')).toHaveText('1');
      await expect(texte(page, 'stat-streak')).toHaveText('1 jour');
      await expect(texte(page, 'stat-week')).toHaveText('1 min');
      const b = await barres(page);
      expect(b[13].h).toBeCloseTo(60, 5);
    });

    test('une séance de plus s’ajoute aux totaux existants', async ({ app, page }) => {
      await ouvrir(app, page, [seance(1, 120)]);
      await app.start();
      await app.advance(60);
      await app.stop();
      await expect(texte(page, 'stat-sessions')).toHaveText('2');
      await expect(texte(page, 'stat-minutes')).toHaveText('3');
      await expect(texte(page, 'stat-streak')).toHaveText('2 jours');
    });

    test('l’effacement de l’historique supprime les statistiques', async ({ app, page }) => {
      await ouvrir(app, page, [seance(1), seance(0)]);
      await expect(texte(page, 'stat-sessions')).toHaveText('2');
      page.once('dialog', (d) => d.accept());
      await page.locator('#clear-history').click();
      await expect(page.locator('#stats')).toBeHidden();
      await expect(page.locator('#history-empty')).toBeVisible();
    });

    test('au passage de minuit, l’ouverture de l’historique recalcule les jours', async ({ app, page }) => {
      await ouvrir(app, page, [seance(0, 300)]);
      await expect(page.locator('#stats-chart')).toHaveAttribute('aria-label', /; aujourd’hui 5 min$/);
      await page.locator('#history summary').click(); // referme
      await app.advance(13 * 3600); // le lendemain, 01:00
      await page.locator('#history summary').click();
      await expect(page.locator('#stats-chart')).toHaveAttribute('aria-label', /5, 0 ; aujourd’hui 0 min$/);
      await expect(texte(page, 'stat-streak')).toHaveText('1 jour');
      await expect(page.locator('#stats-to')).toHaveText('21 oct.');
    });
  });

  test.describe('Limites de jour (heure locale)', () => {
    test('23:59 et 00:00 de part et d’autre de minuit sont deux jours différents', async ({ app, page }) => {
      const minuit = Date.UTC(2026, 9, 19, 22, 0, 0); // 20 octobre 00:00 à Paris
      const h = [
        { d: minuit - 30000, s: 60, c: 5, r: [4, 0, 6, 0], done: false },
        { d: minuit + 30000, s: 60, c: 5, r: [4, 0, 6, 0], done: false }
      ];
      await ouvrir(app, page, h);
      const b = await barres(page);
      expect(b[12].h).toBeCloseTo(60, 5);
      expect(b[13].h).toBeCloseTo(60, 5);
      expect(b[11].h).toBeLessThan(5);
      await expect(texte(page, 'stat-streak')).toHaveText('2 jours');
    });

    test('deux séances le même jour local, de part et d’autre de minuit UTC, ne font qu’un jour', async ({ app, page }) => {
      // 20 octobre 01:00 et 23:30 à Paris : les dates UTC sont les 19 et 20
      const h = [
        { d: Date.UTC(2026, 9, 19, 23, 0, 0), s: 60, c: 5, r: [4, 0, 6, 0], done: false },
        { d: Date.UTC(2026, 9, 20, 21, 30, 0), s: 60, c: 5, r: [4, 0, 6, 0], done: false }
      ];
      await ouvrir(app, page, h, Date.UTC(2026, 9, 20, 21, 45, 0));
      const b = await barres(page);
      expect(b[13].h).toBeCloseTo(60, 5);
      expect(b[12].h).toBeLessThan(5);
      await expect(texte(page, 'stat-streak')).toHaveText('1 jour');
    });

    test('changement d’heure du 25 octobre (Paris) : une séance à 23:30 chaque soir reste une série continue', async ({ app, page }) => {
      // 24 octobre 23:30 (UTC+2), 25 octobre 23:30 (UTC+1, journée de 25 h), 26 octobre 23:30 (UTC+1).
      // Maintenant : 27 octobre 00:10 à Paris. Compté en 24 h fixes, le 24 octobre serait à 2 jours et demi : la série serait coupée.
      const h = [
        { d: Date.UTC(2026, 9, 24, 21, 30, 0), s: 60, c: 5, r: [4, 0, 6, 0], done: false },
        { d: Date.UTC(2026, 9, 25, 22, 30, 0), s: 60, c: 5, r: [4, 0, 6, 0], done: false },
        { d: Date.UTC(2026, 9, 26, 22, 30, 0), s: 60, c: 5, r: [4, 0, 6, 0], done: false }
      ];
      await ouvrir(app, page, h, Date.UTC(2026, 9, 26, 23, 10, 0));
      await expect(texte(page, 'stat-streak')).toHaveText('3 jours');
      const b = await barres(page);
      expect(b.slice(10, 13).map((x) => Math.round(x.h))).toEqual([60, 60, 60]);
      expect(b[13].h).toBeLessThan(5);
      expect(b[9].h).toBeLessThan(5);
      await expect(page.locator('#stats-from')).toHaveText('14 oct.');
    });

    test('changement d’heure : tard le soir, chaque jour calendaire est compté une seule fois', async ({ app, page }) => {
      // Maintenant : 27 octobre 23:30 à Paris. Une séance à midi les 24, 25, 26 et 27.
      // Remonter par pas de 24 h depuis 23:30 ferait « atterrir » deux fois sur le 25 (journée de 25 h).
      const midi = (j, h) => ({ d: Date.UTC(2026, 9, j, h, 0, 0), s: 60, c: 5, r: [4, 0, 6, 0], done: false });
      await ouvrir(app, page, [midi(24, 10), midi(25, 11), midi(26, 11), midi(27, 11)], Date.UTC(2026, 9, 27, 22, 30, 0));
      await expect(texte(page, 'stat-streak')).toHaveText('4 jours');
      await expect(page.locator('#stats-from')).toHaveText('14 oct.');
      const b = await barres(page);
      expect(b.slice(10).map((x) => Math.round(x.h))).toEqual([60, 60, 60, 60]);
    });

    test('changement d’heure : la fenêtre de 14 jours et de 7 jours suit les jours calendaires', async ({ app, page }) => {
      // Maintenant : 30 octobre 12:00. Fenêtre de 7 jours : du 24 au 30 octobre (le 25 dure 25 h).
      // 24 octobre 00:30 (UTC+2) est dans la fenêtre, 23 octobre 23:30 n'y est pas.
      const h = [
        { d: Date.UTC(2026, 9, 23, 21, 30, 0), s: 600, c: 5, r: [4, 0, 6, 0], done: false },
        { d: Date.UTC(2026, 9, 23, 22, 30, 0), s: 120, c: 5, r: [4, 0, 6, 0], done: false }
      ];
      await ouvrir(app, page, h, Date.UTC(2026, 9, 30, 11, 0, 0));
      await expect(texte(page, 'stat-week')).toHaveText('2 min');
    });
  });
});
