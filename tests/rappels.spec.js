// Rappel quotidien : l'heure choisie est confiée à l'agenda de l'utilisateur via un fichier .ics.
const fs = require('fs');
const { test, expect } = require('./helpers/app');

// Les dates sont calculées en heure locale : on fixe le fuseau pour que les tests soient les mêmes partout.
test.use({ timezoneId: 'Europe/Paris' });

// Paris est à UTC+1 en janvier : 07:30 locale = 06:30 UTC.
const T_0730 = new Date('2026-01-15T07:30:00+01:00').getTime();

test.describe('Rappels', () => {
  /** Ouvre l'application à un instant précis (horloge figée). */
  async function openAt(app, page, ms, opts) {
    await page.clock.install({ time: ms - 1000 });
    await app.open(Object.assign({ clock: false }, opts));
    await page.clock.pauseAt(ms);
  }
  const addButton = (page) => page.getByRole('button', { name: 'Ajouter à mon agenda' });
  async function openPanel(page) { await page.locator('summary', { hasText: 'Rappel quotidien' }).click(); }
  /** Clique sur « Ajouter à mon agenda » et renvoie le fichier téléchargé (lignes, CRLF compris). */
  async function download(page) {
    const [dl] = await Promise.all([page.waitForEvent('download'), addButton(page).click()]);
    const text = fs.readFileSync(await dl.path(), 'utf8');
    return { name: dl.suggestedFilename(), text, lines: text.split('\r\n') };
  }
  const unfold = (text) => text.replace(/\r\n /g, '');

  test('la section est repliée, avec une heure à 08:00 et une phrase d’aide', async ({ app, page }) => {
    await app.open();
    const details = page.locator('details', { hasText: 'Rappel quotidien' });
    await expect(details).not.toHaveAttribute('open', '');
    await expect(addButton(page)).toBeHidden();
    await openPanel(page);
    await expect(page.getByLabel('Heure du rappel')).toHaveValue('08:00');
    await expect(addButton(page)).toBeVisible();
    await expect(details).toContainText('agenda de votre téléphone');
    await expect(details).toContainText('hors ligne');
  });

  test('le fichier respirer-rappel.ics contient l’événement quotidien avec son alarme', async ({ app, page }) => {
    await page.addInitScript(() => {
      // Journalise le Blob créé et la libération de l'URL.
      window.__blobs = []; window.__revoked = [];
      const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
      URL.createObjectURL = (b) => { const u = create(b); window.__blobs.push({ type: b.type, url: u }); return u; };
      URL.revokeObjectURL = (u) => { window.__revoked.push(u); revoke(u); };
    });
    await openAt(app, page, T_0730);
    await openPanel(page);
    const { name, text, lines } = await download(page);
    expect(name).toBe('respirer-rappel.ics');
    expect(lines.pop()).toBe('');                       // le fichier se termine par CRLF
    expect(text.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/); // et il n'y a aucun saut de ligne isolé
    expect(lines).toEqual([
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Respirer//FR',
      'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      'UID:' + T_0730 + '@respirer',
      'DTSTAMP:20260115T063000Z',
      'DTSTART:20260115T080000',
      'DURATION:PT10M',
      'RRULE:FREQ=DAILY',
      'SUMMARY:Respiration lente',
      'DESCRIPTION:Prenez dix minutes pour respirer lentement\\, sans écran.',
      'URL:' + (await page.evaluate(() => location.href)),
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'DESCRIPTION:Respiration lente',
      'TRIGGER:PT0M',
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR'
    ]);
    const blobs = await page.evaluate(() => window.__blobs);
    expect(blobs).toHaveLength(1);
    expect(blobs[0].type).toBe('text/calendar;charset=utf-8');
    expect(await page.evaluate(() => window.__revoked)).toEqual([blobs[0].url]);
    await expect(page.locator('#status')).toHaveText('Rappel téléchargé : ouvrez le fichier pour l’ajouter à votre agenda');
  });

  test('l’heure choisie figure dans DTSTART, sans fuseau (heure locale flottante)', async ({ app, page }) => {
    await openAt(app, page, T_0730);
    await openPanel(page);
    await page.getByLabel('Heure du rappel').fill('21:45');
    const { text } = await download(page);
    expect(text).toContain('\r\nDTSTART:20260115T214500\r\n');
  });

  test.describe('première occurrence : aujourd’hui ou demain', () => {
    const cas = [
      ['heure encore à venir : aujourd’hui', '2026-01-15T07:30:00+01:00', '08:00', '20260115T080000'],
      ['heure déjà passée : demain', '2026-01-15T08:30:00+01:00', '08:00', '20260116T080000'],
      ['une minute avant : aujourd’hui', '2026-01-15T07:59:59+01:00', '08:00', '20260115T080000'],
      ['à la minute pile : demain', '2026-01-15T08:00:00+01:00', '08:00', '20260116T080000'],
      ['fin de mois : le 1er du mois suivant', '2026-01-31T23:00:00+01:00', '08:00', '20260201T080000'],
      ['fin d’année : le 1er janvier', '2026-12-31T22:00:00+01:00', '21:00', '20270101T210000']
    ];
    for (const [titre, now, heure, attendu] of cas) {
      test(titre, async ({ app, page }) => {
        await openAt(app, page, new Date(now).getTime());
        await openPanel(page);
        await page.getByLabel('Heure du rappel').fill(heure);
        const { text } = await download(page);
        expect(text).toContain('\r\nDTSTART:' + attendu + '\r\n');
      });
    }
  });

  test('les lignes longues sont repliées à 75 caractères et l’URL ne contient pas le fragment', async ({ app, page }) => {
    await openAt(app, page, T_0730);
    const long = '/index.html?x=' + 'a'.repeat(150);
    await page.goto(long + '#r=4,0,6,0,5');
    await openPanel(page);
    const { text, lines } = await download(page);
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(75);
    expect(lines.some((l) => l.startsWith(' '))).toBe(true);
    const url = unfold(text).split('\r\n').find((l) => l.startsWith('URL:'));
    expect(url).toBe('URL:' + (await page.evaluate(() => location.href.split('#')[0])));
    expect(url).not.toContain('#');
  });

  test.describe('mémorisation de l’heure', () => {
    test('l’heure choisie est conservée après rechargement', async ({ app, page }) => {
      await app.open();
      await openPanel(page);
      await page.getByLabel('Heure du rappel').fill('21:45');
      expect(await page.evaluate(() => localStorage.getItem('respiration-reminder'))).toBe('21:45');
      await app.reload();
      await openPanel(page);
      await expect(page.getByLabel('Heure du rappel')).toHaveValue('21:45');
    });

    test('ne touche pas aux réglages de respiration', async ({ app, page }) => {
      await app.open();
      await openPanel(page);
      await page.getByLabel('Heure du rappel').fill('21:45');
      expect(await page.evaluate(() => localStorage.getItem('respiration-cfg'))).toBeNull();
    });

    for (const invalide of ['abc', '25:99', '8:00', '']) {
      test('une valeur stockée invalide (' + JSON.stringify(invalide) + ') ramène à 08:00', async ({ app, page }) => {
        await app.open({ storage: { 'respiration-reminder': invalide } });
        await openPanel(page);
        await expect(page.getByLabel('Heure du rappel')).toHaveValue('08:00');
        expect(app.errors).toEqual([]);
      });
    }

    test('un champ vidé ne remplace pas l’heure mémorisée : le fichier garde la dernière heure valide', async ({ app, page }) => {
      await openAt(app, page, T_0730, { storage: { 'respiration-reminder': '19:15' } });
      await openPanel(page);
      await page.getByLabel('Heure du rappel').fill('');
      const { text } = await download(page);
      expect(text).toContain('\r\nDTSTART:20260115T191500\r\n');
      expect(await page.evaluate(() => localStorage.getItem('respiration-reminder'))).toBe('19:15');
    });

    test('stockage interdit : l’heure se choisit et le fichier se télécharge quand même', async ({ app, page }) => {
      await openAt(app, page, T_0730, { storageBroken: true });
      await openPanel(page);
      await expect(page.getByLabel('Heure du rappel')).toHaveValue('08:00');
      await page.getByLabel('Heure du rappel').fill('18:20');
      const { text } = await download(page);
      expect(text).toContain('\r\nDTSTART:20260115T182000\r\n');
      expect(app.errors).toEqual([]);
    });
  });

  test.describe('accessibilité', () => {
    test('l’en-tête, le champ et le bouton font au moins 44 px et sont atteignables au clavier', async ({ app, page }) => {
      await app.open();
      await openPanel(page);
      for (const c of [page.locator('summary', { hasText: 'Rappel quotidien' }), page.getByLabel('Heure du rappel'), addButton(page)]) {
        const box = await c.boundingBox();
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.width).toBeGreaterThanOrEqual(44);
      }
      await page.locator('summary', { hasText: 'Rappel quotidien' }).focus();
      await page.keyboard.press('Tab');
      await expect(page.getByLabel('Heure du rappel')).toBeFocused();
    });

    test('le contour de focus (3 px) est visible au clavier sur l’en-tête, le champ et le bouton', async ({ app, page }) => {
      await app.open();
      await page.locator('summary', { hasText: 'Rappel quotidien' }).focus();
      const outline = () => page.evaluate(() => { const s = getComputedStyle(document.activeElement); return s.outlineStyle + ' ' + s.outlineWidth; });
      await page.keyboard.press('Enter');                   // ouvre la section au clavier
      expect(await outline()).toBe('solid 3px');
      await page.keyboard.press('Tab');
      await expect(page.getByLabel('Heure du rappel')).toBeFocused();
      expect(await outline()).toBe('solid 3px');
      await page.getByLabel('Heure du rappel').focus();
      // Le champ d'heure compte plusieurs arrêts (heures, minutes, sélecteur) avant le bouton.
      for (let i = 0; i < 6 && !(await addButton(page).evaluate((e) => e === document.activeElement)); i++) await page.keyboard.press('Tab');
      await expect(addButton(page)).toBeFocused();
      expect(await outline()).toBe('solid 3px');
    });

    test('pas de défilement horizontal à 320 px, section ouverte', async ({ app, page }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await app.open();
      await openPanel(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    });
  });
});
