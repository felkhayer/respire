// Fonctionnalité : préréglages de respiration (4-6, 5-5, 4-7-8, carrée).
const { test, expect } = require('./helpers/app');

const PRESETS = [
  { nom: '4 – 6',     inh: '4 s', hold1: '0 s', exh: '6 s', hold2: '0 s' },
  { nom: '5 – 5',     inh: '5 s', hold1: '0 s', exh: '5 s', hold2: '0 s' },
  { nom: '4 – 7 – 8', inh: '4 s', hold1: '7 s', exh: '8 s', hold2: '0 s' },
  { nom: 'Carrée 4',  inh: '4 s', hold1: '4 s', exh: '4 s', hold2: '4 s' }
];

test.describe('Préréglages', () => {
  test.beforeEach(async ({ app }) => { await app.open(); });

  for (const p of PRESETS) {
    test('« ' + p.nom + ' » applique ses durées', async ({ app }) => {
      // On part d'un autre préréglage pour que le clic change réellement quelque chose.
      await app.preset(p.nom === '5 – 5' ? 'Carrée 4' : '5 – 5').click();
      await app.preset(p.nom).click();
      for (const k of ['inh', 'hold1', 'exh', 'hold2']) await expect(app.setting(k).value).toHaveText(p[k]);
      await expect(app.preset(p.nom)).toHaveAttribute('aria-pressed', 'true');
    });
  }

  test('un seul préréglage est sélectionné à la fois', async ({ app }) => {
    await app.preset('4 – 7 – 8').click();
    await expect(app.preset('4 – 7 – 8')).toHaveAttribute('aria-pressed', 'true');
    for (const autre of ['4 – 6', '5 – 5', 'Carrée 4']) {
      await expect(app.preset(autre)).toHaveAttribute('aria-pressed', 'false');
    }
  });

  test('modifier une durée à la main désélectionne le préréglage, la rétablir le resélectionne', async ({ app }) => {
    await app.preset('5 – 5').click();
    await app.click('inh', '+');
    await expect(app.preset('5 – 5')).toHaveAttribute('aria-pressed', 'false');
    await app.click('inh', '-');
    await expect(app.preset('5 – 5')).toHaveAttribute('aria-pressed', 'true');
  });

  test('un préréglage ne change ni la durée totale ni le son', async ({ app }) => {
    await app.click('total', '+', 5);
    await app.sound.click();
    await app.preset('Carrée 4').click();
    await expect(app.setting('total').value).toHaveText('10 min');
    await expect(app.sound).toHaveAttribute('aria-checked', 'false');
  });

  test('passer de « Carrée 4 » à « 4 – 6 » remet les pauses à zéro', async ({ app }) => {
    await app.preset('Carrée 4').click();
    await app.preset('4 – 6').click();
    await expect(app.setting('hold1').value).toHaveText('0 s');
    await expect(app.setting('hold2').value).toHaveText('0 s');
  });

  test('le préréglage choisi est conservé après rechargement', async ({ app }) => {
    await app.preset('4 – 7 – 8').click();
    await app.reload();
    await expect(app.preset('4 – 7 – 8')).toHaveAttribute('aria-pressed', 'true');
    await expect(app.setting('exh').value).toHaveText('8 s');
  });

  test('le grand compteur au repos reflète le préréglage', async ({ app }) => {
    await app.preset('5 – 5').click();
    await expect(app.count).toHaveText('5');
  });
});
