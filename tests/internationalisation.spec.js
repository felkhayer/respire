// Fonctionnalité : internationalisation (français / anglais).
// Langue : préférence enregistrée (clé respiration-lang), sinon navigator.language (fr* → français,
// tout le reste → anglais). Le changement s'applique immédiatement, même pendant une séance.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, expect } = require('./helpers/app');

const LANG = 'respiration-lang';
const HIST = 'respiration-history';
const JOUR = 86400000;
// Mardi 20 octobre 2026, 12:00 à Paris (UTC+2).
const MAINTENANT = Date.UTC(2026, 9, 20, 10, 0, 0);

const status = (page) => page.locator('#status');
const bouton = (page, name) => page.getByRole('button', { name, exact: true });
const langue = (page, code) => page.locator('[data-lang="' + code + '"]');

/** Ouvre l'application à un instant précis (horloge figée), historique éventuel. */
async function ouvrirA(app, page, opts) {
  await page.clock.install({ time: MAINTENANT });
  await page.clock.pauseAt(MAINTENANT + 1000);
  await app.open(Object.assign({ clock: false }, opts));
}

/** Réglage par son libellé anglais (la fixture app.setting() suit les libellés français). */
function reglageEn(page, label) {
  return {
    plus: page.getByRole('button', { name: 'Increase: ' + label }),
    minus: page.getByRole('button', { name: 'Decrease: ' + label }),
    value: page.locator('.row', { hasText: label }).locator('output')
  };
}

test.describe('Internationalisation', () => {
  test.describe('Détection automatique (sans préférence enregistrée)', () => {
    for (const [locale, attendu] of [['fr-FR', 'fr'], ['fr-CA', 'fr'], ['en-US', 'en'], ['de-DE', 'en']]) {
      test.describe(locale, () => {
        test.use({ locale });
        test(`${locale} → ${attendu === 'fr' ? 'français' : 'anglais'}`, async ({ app, page }) => {
          await app.open();
          await expect(page.locator('html')).toHaveAttribute('lang', attendu);
          await expect(page).toHaveTitle(attendu === 'fr' ? 'Respiration lente' : 'Slow breathing');
          await expect(app.go).toHaveText(attendu === 'fr' ? 'Démarrer' : 'Start');
          await expect(langue(page, attendu)).toHaveAttribute('aria-pressed', 'true');
          await expect(langue(page, attendu === 'fr' ? 'en' : 'fr')).toHaveAttribute('aria-pressed', 'false');
          expect(app.errors).toEqual([]);
        });
      });
    }
  });

  test.describe('Préférence enregistrée', () => {
    test('la préférence enregistrée prime sur la langue du navigateur', async ({ app, page }) => {
      await app.open({ storage: { [LANG]: 'en' } }); // navigateur en fr-FR
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      await expect(app.phase).toHaveText('Ready');
    });

    test.describe('navigateur en anglais', () => {
      test.use({ locale: 'en-US' });

      test('le choix FR est mémorisé dans sa propre clé et survit au rechargement', async ({ app, page }) => {
        await app.open();
        await expect(app.go).toHaveText('Start');
        await langue(page, 'fr').click();
        await expect(app.go).toHaveText('Démarrer');
        await expect(langue(page, 'fr')).toHaveAttribute('aria-pressed', 'true');
        expect(await page.evaluate((k) => localStorage.getItem(k), LANG)).toBe('fr');
        // La config des réglages n'est pas touchée (format indépendant de la langue).
        expect(await page.evaluate(() => localStorage.getItem('respiration-cfg'))).toBeNull();
        await app.reload();
        await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
        await expect(app.go).toHaveText('Démarrer');
      });

      test('stockage interdit : la langue détectée s’applique et le sélecteur fonctionne quand même', async ({ app, page }) => {
        await app.open({ storageBroken: true });
        await expect(app.go).toHaveText('Start');
        await langue(page, 'fr').click();
        await expect(app.go).toHaveText('Démarrer');
        await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
        expect(app.errors).toEqual([]);
      });

      test('valeur enregistrée invalide : ignorée, la langue du navigateur s’applique', async ({ app, page }) => {
        await app.open({ storage: { [LANG]: 'de' } });
        await expect(page.locator('html')).toHaveAttribute('lang', 'en');
        await expect(app.go).toHaveText('Start');
        expect(app.errors).toEqual([]);
      });
    });
  });

  test.describe('Interface anglaise', () => {
    test.use({ locale: 'en-US', timezoneId: 'Europe/Paris' });

    test('textes visibles et libellés ARIA au repos', async ({ app, page }) => {
      await app.open();
      await expect(page.locator('h1')).toHaveText('Slow breathing');
      await expect(app.phase).toHaveText('Ready');
      await expect(page.locator('.stats')).toHaveText('Cycles: 0Time: 0:00 / 5:00');
      for (const l of ['Inhale', 'Hold, lungs full', 'Exhale', 'Hold, lungs empty', 'Session length']) {
        await expect(reglageEn(page, l).plus).toBeVisible();
        await expect(reglageEn(page, l).minus).toBeVisible();
      }
      await expect(page.getByRole('switch', { name: 'Sound guide' })).toBeVisible();
      await expect(page.getByRole('group', { name: 'Language' })).toBeVisible();
      await expect(page.locator('.hint')).toContainText('octave as you breathe in');
      for (const p of ['4 – 6', '5 – 5', '4 – 7 – 8', 'Square 4']) await expect(bouton(page, p)).toBeVisible();
      await expect(page.locator('#guidettl')).toHaveText('Guided mode');
      await expect(app.guide('Focus')).toHaveText('Focus 5 – 5 (2 min) → Square 4 (6 min) → 5 – 5 (2 min) · 10 min');
      await expect(bouton(page, 'Share these settings')).toBeVisible();
      await expect(page.locator('#history summary')).toHaveText('History');
      await expect(page.locator('#reminder summary')).toHaveText('Daily reminder');
      // Aucun texte français résiduel dans la page.
      const texte = await page.locator('main').evaluate((m) => m.textContent + ' ' +
        Array.from(m.querySelectorAll('[aria-label]')).map((e) => e.getAttribute('aria-label')).join(' '));
      expect(texte).not.toMatch(/Démarrer|Prêt|Inspiration|Pause poumons|Durée|Diminuer|Augmenter|Guide sonore|Carrée|Partager|Historique|Rappel|séance|agenda/);
    });

    test('phases pendant une séance, réglages dans l’unité anglaise, puis « Done » en fin automatique', async ({ app, page }) => {
      await app.open({ storage: { 'respiration-cfg': JSON.stringify({ total: 1 }) } });
      await bouton(page, 'Square 4').click();
      await app.start();
      await expect(app.go).toHaveText('Stop');
      await app.advance(1.5);
      await expect(app.phase).toHaveText('Breathe in');
      await app.advance(4);
      await expect(app.phase).toHaveText('Hold');
      await app.advance(4);
      await expect(app.phase).toHaveText('Breathe out');
      await app.advance(4);
      await expect(app.phase).toHaveText('Rest');
      await app.advance(48);
      await expect(app.phase).toHaveText('Done');
      await expect(app.go).toHaveText('Start');
    });

    test('arrêt manuel : « Ready » ; mode guidé : étape en anglais', async ({ app, page }) => {
      await app.open();
      await app.guide('Relax').click();
      await app.start();
      await app.advance(1.5);
      await expect(app.step).toHaveText('Step 1 / 3 · 4 – 4');
      await app.stop();
      await expect(app.phase).toHaveText('Ready');
    });

    test('dates, pluriels et graphique de l’historique et des statistiques', async ({ app, page }) => {
      const hist = [
        { d: MAINTENANT - 2 * JOUR, s: 90, c: 0, r: [4, 0, 6, 0], done: false },
        { d: MAINTENANT - JOUR, s: 60, c: 1, r: [4.5, 0, 5.5, 0], done: false },
        { d: MAINTENANT, s: 125, c: 12, r: [4, 0, 6, 0], done: true, g: 'sommeil' }
      ];
      await ouvrirA(app, page, { storage: { [HIST]: JSON.stringify(hist) } });
      await page.locator('#history summary').click();
      const lignes = page.locator('#history-list li');
      await expect(lignes.nth(0)).toHaveText(/^Tue, Oct 20, 12:00\sPM/);
      await expect(lignes.nth(0).locator('.meta')).toHaveText('2:05 · 12 cycles · Sleep');
      await expect(lignes.nth(1).locator('.meta')).toHaveText('1:00 · 1 cycle · 4.5 – 5.5');
      await expect(lignes.nth(2).locator('.meta')).toHaveText('1:30 · 0 cycles · 4 – 6');
      await expect(page.locator('#stats-title')).toHaveText('Progress');
      await expect(page.locator('#stat-streak')).toHaveText('3 days');
      await expect(page.locator('#stats-from')).toHaveText('Oct 7');
      await expect(page.locator('#stats-to')).toHaveText('Oct 20');
      await expect(page.locator('#stats-chart')).toHaveAttribute('aria-label',
        'Practice minutes per day over 14 days: 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 1, 2; today 2 min');
    });

    test('série au singulier', async ({ app, page }) => {
      await ouvrirA(app, page, { storage: { [HIST]: JSON.stringify([{ d: MAINTENANT, s: 60, c: 5, r: [4, 0, 6, 0] }]) } });
      await page.locator('#history summary').click();
      await expect(page.locator('#stat-streak')).toHaveText('1 day');
    });

    test('effacement de l’historique : confirmation et message en anglais', async ({ app, page }) => {
      let message = '';
      page.on('dialog', (d) => { message = d.message(); d.accept(); });
      await ouvrirA(app, page, { storage: { [HIST]: JSON.stringify([{ d: MAINTENANT - 3 * JOUR, s: 60, c: 5, r: [4, 0, 6, 0] }]) } });
      await page.locator('#history summary').click();
      await expect(page.locator('#stat-streak')).toHaveText('0 days');
      await bouton(page, 'Clear history').click();
      expect(message).toBe('Clear the whole session history?');
      await expect(status(page)).toHaveText('History cleared');
      await expect(page.locator('#history-empty')).toHaveText('No sessions recorded yet');
    });

    test('le fichier .ics est en anglais', async ({ app, page }) => {
      await ouvrirA(app, page);
      await page.locator('#reminder summary').click();
      await expect(page.getByLabel('Reminder time')).toHaveValue('08:00');
      const [dl] = await Promise.all([page.waitForEvent('download'), bouton(page, 'Add to my calendar').click()]);
      expect(dl.suggestedFilename()).toBe('breathing-reminder.ics');
      const lignes = fs.readFileSync(await dl.path(), 'utf8').replace(/\r\n /g, '').split('\r\n');
      expect(lignes).toContain('PRODID:-//Respirer//EN');
      expect(lignes).toContain('SUMMARY:Slow breathing');
      expect(lignes).toContain('DESCRIPTION:Take ten minutes to breathe slowly\\, away from screens.');
      expect(lignes.filter((l) => l === 'DESCRIPTION:Slow breathing')).toHaveLength(1); // alarme
      expect(lignes).toContain('DTSTART:20261021T080000'); // format de données inchangé
      await expect(status(page)).toHaveText('Reminder downloaded: open the file to add it to your calendar');
    });

    test('messages : lien copié, lien affiché, réglages importés ou invalides', async ({ app, page }) => {
      await app.open({ hash: '#r=4.5,0,6,0,5' });
      await expect(status(page)).toHaveText('Settings imported');
      await expect(reglageEn(page, 'Inhale').value).toHaveText('4.5 s');
      await bouton(page, 'Share these settings').click();
      await expect(status(page)).toHaveText('Link copied');
      // Le lien garde son format de données (point décimal), quelle que soit la langue.
      expect((await app.shareState()).copies[0]).toMatch(/#r=4\.5,0,6,0,5$/);
    });

    test('presse-papiers refusé et lien invalide', async ({ app, page }) => {
      await app.open({ clipboard: 'reject', hash: '#r=abc' });
      await expect(status(page)).toHaveText('Invalid settings link');
      await bouton(page, 'Share these settings').click();
      await expect(status(page)).toHaveText(/^Copy this link: http:\/\/127\.0\.0\.1:\d+\/index\.html#r=4,0,6,0,5$/);
    });

    test('navigator.share reçoit un titre et un texte en anglais', async ({ app, page }) => {
      await app.open({ share: 'ok' });
      await bouton(page, 'Share these settings').click();
      const { shares } = await app.shareState();
      expect(shares).toHaveLength(1);
      expect(shares[0].title).toBe('Slow breathing');
      expect(shares[0].text).toBe('My breathing settings');
    });

    test('nombres décimaux avec un point : réglages, compte à rebours, « Unlimited »', async ({ app, page }) => {
      await app.open();
      await reglageEn(page, 'Inhale').plus.click();
      await expect(reglageEn(page, 'Inhale').value).toHaveText('4.5 s');
      await expect(app.count).toHaveText('4.5');
      for (let i = 0; i < 5; i++) await reglageEn(page, 'Session length').minus.click();
      await expect(reglageEn(page, 'Session length').value).toHaveText('Unlimited');
    });

    test('pas de défilement horizontal à 320 px, sections dépliées et historique rempli', async ({ app, page }) => {
      await page.setViewportSize({ width: 320, height: 568 });
      const hist = Array.from({ length: 10 }, (_, i) => ({ d: MAINTENANT - i * JOUR, s: 754, c: 123, r: [4.5, 4.5, 4.5, 4.5], done: false, g: i % 2 ? 'concentration' : undefined }));
      await ouvrirA(app, page, { storage: { [HIST]: JSON.stringify(hist) } });
      await page.locator('#history summary').click();
      await page.locator('#reminder summary').click();
      await app.guide('Sleep').click();
      await app.start();
      await app.advance(1.5);
      const debord = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(debord).toBeLessThanOrEqual(0);
      // La phase la plus longue tient sur une ligne (pas de saut de mise en page).
      await app.advance(4);
      await expect(app.phase).toHaveText('Breathe out');
      const ph = await app.phase.evaluate((e) => ({ sw: e.scrollWidth, cw: e.clientWidth, h: e.getBoundingClientRect().height }));
      expect(ph.sw).toBeLessThanOrEqual(ph.cw);
      expect(ph.h).toBe(42);
    });
  });

  test.describe('Locale des dates', () => {
    test.use({ locale: 'en-GB', timezoneId: 'Europe/Paris' });
    test('en-GB : anglais, mais dates au format du navigateur', async ({ app, page }) => {
      await ouvrirA(app, page, { storage: { [HIST]: JSON.stringify([{ d: MAINTENANT, s: 60, c: 5, r: [4, 0, 6, 0] }]) } });
      await page.locator('#history summary').click();
      await expect(page.locator('#stats-to')).toHaveText('20 Oct');
      await expect(page.locator('#history summary')).toHaveText('History');
    });
  });

  test.describe('Changement de langue', () => {
    test.use({ timezoneId: 'Europe/Paris' });

    test('pendant une séance : phase, bouton, étape guidée et libellés changent sans attendre ni interrompre', async ({ app, page }) => {
      await app.open();
      await app.guide('Détente').click();
      await app.start();
      await app.advance(5.5);
      await expect(app.phase).toHaveText('Expirez');
      await expect(app.step).toHaveText('Étape 1 / 3 · 4 – 4');
      const avant = { cycles: await app.cycles.textContent(), elapsed: await app.elapsed.textContent(), count: await app.count.textContent() };
      await langue(page, 'en').click(); // horloge figée : aucune image n'est rendue entre-temps
      await expect(app.phase).toHaveText('Breathe out');
      await expect(app.go).toHaveText('Stop');
      await expect(app.step).toHaveText('Step 1 / 3 · 4 – 4');
      await expect(page.getByRole('button', { name: 'Decrease: Inhale' })).toBeVisible();
      await expect(app.guide('Relax')).toHaveAttribute('aria-pressed', 'true');
      await expect(page).toHaveTitle('Slow breathing');
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      // La séance continue au même point.
      expect({ cycles: await app.cycles.textContent(), elapsed: await app.elapsed.textContent(), count: await app.count.textContent() }).toEqual(avant);
      await app.advance(3);
      await expect(app.phase).toHaveText('Breathe in');
      await expect(app.cycles).toHaveText('1');
      await app.stop();
      await expect(app.phase).toHaveText('Ready');
      await langue(page, 'fr').click();
      await expect(app.phase).toHaveText('Prêt');
      await expect(app.go).toHaveText('Démarrer');
    });

    test('après la fin automatique, « Terminé » devient « Done »', async ({ app, page }) => {
      await app.open({ storage: { 'respiration-cfg': JSON.stringify({ total: 1 }) } });
      await app.start();
      await app.advance(61);
      await expect(app.phase).toHaveText('Terminé');
      await langue(page, 'en').click();
      await expect(app.phase).toHaveText('Done');
    });

    test('nombres, historique, statistiques et dernier message sont retraduits', async ({ app, page }) => {
      const hist = [{ d: MAINTENANT, s: 60, c: 1, r: [4.5, 0, 6, 0], done: false }];
      await ouvrirA(app, page, { storage: { [HIST]: JSON.stringify(hist) } });
      await page.locator('#history summary').click();
      await app.setting('inh').plus.click();
      await bouton(page, 'Partager ces réglages').click();
      await expect(status(page)).toHaveText('Lien copié');
      await expect(app.setting('inh').value).toHaveText('4,5 s');
      await expect(page.locator('#history-list .meta')).toHaveText('1:00 · 1 cycle · 4,5 – 6');
      await expect(page.locator('#history-list .when')).toHaveText(/^mar\. 20 oct\./);
      await expect(page.locator('#stat-streak')).toHaveText('1 jour');

      await langue(page, 'en').click();
      await expect(status(page)).toHaveText('Link copied');
      await expect(reglageEn(page, 'Inhale').value).toHaveText('4.5 s');
      await expect(app.count).toHaveText('4.5');
      await expect(page.locator('#history-list .meta')).toHaveText('1:00 · 1 cycle · 4.5 – 6');
      await expect(page.locator('#history-list .when')).toHaveText(/^Tue, Oct 20/);
      await expect(page.locator('#stat-streak')).toHaveText('1 day');
      await expect(page.locator('#stats-to')).toHaveText('Oct 20');
      await expect(page.locator('#stats-chart')).toHaveAttribute('aria-label', /^Practice minutes per day over 14 days: .*; today 1 min$/);
      await expect(page.locator('dl.stats-grid dt')).toHaveText(['Sessions', 'Minutes', 'Streak', 'Last 7 days']);
    });
  });

  test.describe('Sélecteur de langue', () => {
    test('groupe de deux boutons à bascule de 44 px, utilisable au clavier, avec un contour de focus', async ({ app, page }) => {
      await app.open();
      for (const code of ['fr', 'en']) {
        const box = await langue(page, code).boundingBox();
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
      await expect(page.getByRole('group', { name: 'Langue' }).getByRole('button')).toHaveText(['FR', 'EN']);
      await langue(page, 'fr').focus();
      await page.keyboard.press('Tab');
      await expect(langue(page, 'en')).toBeFocused();
      await expect(langue(page, 'en')).toHaveCSS('outline-style', 'solid');
      await expect(langue(page, 'en')).toHaveCSS('outline-width', '3px');
      await page.keyboard.press('Enter');
      await expect(langue(page, 'en')).toHaveAttribute('aria-pressed', 'true');
      await expect(langue(page, 'fr')).toHaveAttribute('aria-pressed', 'false');
      await expect(page.getByRole('group', { name: 'Language' })).toBeVisible();
    });
  });

  test.describe('Dictionnaires', () => {
    // Analyse du source : les dictionnaires sont des littéraux d'objet évalués hors de la page.
    const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const literal = src.slice(src.indexOf('var I18N = ') + 'var I18N = '.length, src.indexOf('\n  };\n', src.indexOf('var I18N = ')) + 4);
    const I18N = vm.runInNewContext('(' + literal + ')');
    const placeholders = (v) => [].concat(v).map((s) => (s.match(/\{\w+\}/g) || []).sort().join());

    test('mêmes clés, mêmes pluriels et mêmes paramètres en français et en anglais', () => {
      expect(Object.keys(I18N).sort()).toEqual(['en', 'fr']);
      expect(Object.keys(I18N.en).sort()).toEqual(Object.keys(I18N.fr).sort());
      for (const k of Object.keys(I18N.fr)) {
        expect(Array.isArray(I18N.en[k]), k).toBe(Array.isArray(I18N.fr[k]));
        expect(placeholders(I18N.en[k]), k).toEqual(placeholders(I18N.fr[k]));
        expect(String(I18N.en[k]).trim(), k).not.toBe('');
      }
    });

    test('chaque clé utilisée par la page existe dans le dictionnaire', () => {
      const used = new Set();
      for (const m of src.matchAll(/data-i18n="(\w+)"/g)) used.add(m[1]);
      for (const m of src.matchAll(/\b(?:t|say)\('(\w+)'[,)]/g)) used.add(m[1]);
      for (const m of src.matchAll(/\bkey: '(\w+)'/g)) used.add(m[1]);
      // Clés construites : t('f_' + k), t('ph_' + k), t('g_' + id).
      for (const k of ['inh', 'hold1', 'exh', 'hold2', 'total']) used.add('f_' + k);
      for (const k of ['in', 'h1', 'out', 'h2']) used.add('ph_' + k);
      for (const m of src.matchAll(/\{ id: '(\w+)', steps/g)) used.add('g_' + m[1]);
      expect(used.size).toBeGreaterThan(40);
      const absentes = [...used].filter((k) => !(k in I18N.fr));
      expect(absentes).toEqual([]);
    });
  });
});
