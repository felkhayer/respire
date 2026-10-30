// Fonctionnalité : mode guidé. Une séquence enchaîne plusieurs rythmes ; le rythme change à la fin
// du premier cycle qui atteint ou dépasse la limite de l'étape, et la séance dure le total de la séquence.
// Le son étant programmé jusqu'à 30 min à l'avance, il doit prévoir les changements d'étape futurs
// aux mêmes instants que l'affichage, y compris écran éteint (affichage gelé).
const { test, expect } = require('./helpers/app');

const CLE = 'respiration-cfg';
const rampes = { param: 'frequency', method: 'exponentialRampToValueAtTime' };

// Détente : 4 – 4 (1 min) → 4 – 6 (2 min) → 4 – 8 (3 min). Les cycles commencent à 0, 8, …, 56 (4 – 4),
// puis 64, 74, …, 174 (4 – 6), puis 184, 196, … (4 – 8) : aucun ne finit pile sur une limite.
const DETENTE = [{ inh: 4, exh: 4, min: 1 }, { inh: 4, exh: 6, min: 2 }, { inh: 4, exh: 8, min: 3 }];

/** Rampes de fréquence attendues [note, fin] pour une séquence sans pause, jusqu'à la fin de séance. */
function rampesAttendues(etapes) {
  const fin = etapes.reduce((s, e) => s + e.min * 60, 0);
  const r = [];
  let c = 0, lim = 0;
  etapes.forEach((e, n) => {
    lim += e.min * 60;
    // Cycles de cette étape : ceux qui commencent avant sa limite (avant la fin pour la dernière).
    while (c < (n === etapes.length - 1 ? fin : lim)) {
      r.push([440, c + e.inh]);
      if (c + e.inh < fin) r.push([220, c + e.inh + e.exh]);
      c += e.inh + e.exh;
    }
  });
  return r;
}

/** Programmation posée par le dernier appel à schedule() sur un oscillateur (après le dernier « cancel »). */
async function derniereProgrammation(app, osc) {
  const evs = await app.audioEvents({ node: osc, param: 'frequency' });
  return evs.slice(evs.map((e) => e.method).lastIndexOf('cancelScheduledValues') + 1);
}

function comparer(recu, attendu) {
  expect(recu.length).toBe(attendu.length);
  recu.forEach((r, n) => {
    expect(r[0]).toBe(attendu[n][0]);
    expect(r[1]).toBeCloseTo(attendu[n][1], 3);
  });
}

test.describe('Mode guidé', () => {
  test.describe('Choix d’une séquence', () => {
    test.beforeEach(async ({ app }) => { await app.open(); });

    test('« Détente » est sélectionnée, sa durée et son premier rythme s’affichent, le choix est mémorisé', async ({ app }) => {
      await app.guide('Détente').click();
      await expect(app.guide('Détente')).toHaveAttribute('aria-pressed', 'true');
      await expect(app.guide('Endormissement')).toHaveAttribute('aria-pressed', 'false');
      await expect(app.guide('Concentration')).toHaveAttribute('aria-pressed', 'false');
      await expect(app.setting('total').value).toHaveText('6 min');
      await expect(app.setting('exh').value).toHaveText('4 s');
      await expect(app.elapsed).toHaveText('0:00 / 6:00');
      // Le rythme affiché (4 – 4) n'est pas un préréglage choisi, et « 4 – 6 » n'est plus sélectionné.
      await expect(app.preset('4 – 6')).toHaveAttribute('aria-pressed', 'false');
      expect((await app.storedConfig()).guide).toBe('detente');

      await app.reload();
      await expect(app.guide('Détente')).toHaveAttribute('aria-pressed', 'true');
      await expect(app.setting('total').value).toHaveText('6 min');
    });

    test('aucun préréglage n’apparaît sélectionné quand l’étape a le même rythme', async ({ app }) => {
      await app.guide('Endormissement').click(); // première étape : 4 – 6
      await expect(app.setting('exh').value).toHaveText('6 s');
      await expect(app.preset('4 – 6')).toHaveAttribute('aria-pressed', 'false');
    });

    test('un second appui sur la séquence quitte le mode guidé', async ({ app }) => {
      await app.guide('Concentration').click();
      await app.guide('Concentration').click();
      await expect(app.guide('Concentration')).toHaveAttribute('aria-pressed', 'false');
      expect((await app.storedConfig()).guide).toBeUndefined();
      await app.start();
      await app.advance(0.5);
      await expect(app.step).toHaveText('');
    });

  });

  test('une séquence inconnue en mémoire est ignorée', async ({ app }) => {
    await app.open({ storage: { [CLE]: JSON.stringify({ guide: 'inconnue' }) } });
    for (const s of ['Détente', 'Endormissement', 'Concentration']) {
      await expect(app.guide(s)).toHaveAttribute('aria-pressed', 'false');
    }
    await expect(app.preset('4 – 6')).toHaveAttribute('aria-pressed', 'true');
    await app.start();
    await app.advance(10.5); // 4 – 6 et 5 min par défaut
    await expect(app.cycles).toHaveText('1');
    await expect(app.step).toHaveText('');
    await expect(app.elapsed).toHaveText('0:10 / 5:00');
    expect(app.errors).toEqual([]);
  });

  test.describe('Déroulement', () => {
    test('le rythme change à la fin du cycle qui dépasse la limite, jamais au milieu', async ({ app }) => {
      await app.open();
      await app.guide('Détente').click();
      await app.start();
      await app.advance(0.5);
      await expect(app.step).toHaveText('Étape 1 / 3 · 4 – 4');
      await app.advance(61); // t = 61,5 s : limite d'1 min dépassée, mais le cycle 56 → 64 s se termine en 4 – 4
      await expect(app.phase).toHaveText('Expirez');
      await expect(app.count).toHaveText('3');
      await expect(app.step).toHaveText('Étape 1 / 3 · 4 – 4');
      await app.advance(3); // t = 64,5 s : nouveau cycle, nouvelle étape
      await expect(app.phase).toHaveText('Inspirez');
      await expect(app.step).toHaveText('Étape 2 / 3 · 4 – 6');
      await expect(app.cycles).toHaveText('8');
      await expect(app.setting('exh').value).toHaveText('6 s'); // les réglages montrent le rythme en vigueur
      await app.advance(4); // t = 68,5 s
      await expect(app.phase).toHaveText('Expirez');
      await expect(app.count).toHaveText('6');
    });

    test('un cycle qui finit pile sur la limite passe à l’étape suivante', async ({ app }) => {
      await app.open();
      await app.guide('Endormissement').click(); // 12 cycles de 4 – 6 finissent exactement à 2 min
      await app.start();
      await app.advance(120.5);
      await expect(app.step).toHaveText('Étape 2 / 2 · 4 – 7 – 8');
      await app.advance(4); // t = 124,5 s : rétention du 4 – 7 – 8
      await expect(app.phase).toHaveText('Retenez');
      await expect(app.count).toHaveText('7');
    });

    test('après un long gel de l’affichage, la séance se recale sur l’étape en cours', async ({ app, page }) => {
      await app.open();
      await app.guide('Détente').click();
      await app.start();
      await app.advance(0.5);
      await page.clock.fastForward(199500); // écran éteint jusqu'à t = 200 s, rattrapé d'un coup
      await app.advance(0.1);
      // 8 cycles de 4 – 4 (→ 64 s), 12 de 4 – 6 (→ 184 s), 1 de 4 – 8 (→ 196 s), puis expiration entamée.
      await expect(app.step).toHaveText('Étape 3 / 3 · 4 – 8');
      await expect(app.cycles).toHaveText('21');
      await expect(app.phase).toHaveText('Expirez');
      await expect(app.count).toHaveText('8');
    });

    test('la séance s’arrête au total de la séquence', async ({ app }) => {
      await app.open();
      await app.guide('Détente').click(); // 6 min, alors que la durée réglée était de 5 min
      await app.start();
      await app.advance(359.5);
      await expect(app.go).toHaveText('Arrêter');
      await app.advance(1);
      await expect(app.phase).toHaveText('Terminé');
      await expect(app.elapsed).toHaveText('6:00 / 6:00');
      await expect(app.step).toHaveText('');
      await expect(app.setting('exh').value).toHaveText('4 s'); // prêt pour une nouvelle séance : première étape
      await expect(app.guide('Détente')).toHaveAttribute('aria-pressed', 'true');
    });
  });

  test.describe('Guide sonore', () => {
    test('le son programmé au démarrage change de rythme aux mêmes instants que l’affichage', async ({ app }) => {
      await app.open();
      await app.guide('Détente').click();
      await app.start();
      const r = (await app.audioEvents(rampes)).map((e) => e.args);
      comparer(r, rampesAttendues(DETENTE));
      const fade = (await app.audioEvents({ param: 'gain', method: 'setTargetAtTime' })).find((e) => e.args[0] === 0);
      expect(fade.args[1]).toBeCloseTo(360, 3); // fin au total de la séquence
    });

    test('reprogrammer le son en cours de séance garde les mêmes instants de changement d’étape', async ({ app }) => {
      await app.open();
      await app.guide('Détente').click();
      await app.start();
      await app.advance(30);
      await app.sound.click(); // coupe
      await app.sound.click(); // rallume : nouvelle programmation à t = 30 s, en pleine étape 1
      const r = (await derniereProgrammation(app, 'osc1'))
        .filter((e) => e.method === 'exponentialRampToValueAtTime').map((e) => e.args);
      comparer(r, rampesAttendues(DETENTE).filter(([, fin]) => fin > 30));
    });

    test('écran éteint : la reprogrammation des 5 minutes reste calée sur les étapes', async ({ app, page }) => {
      await app.open();
      await app.guide('Détente').click();
      await app.start();
      await app.advance(0.5);
      // Affichage gelé (plus aucune image) : seul le minuteur de reprogrammation tourne encore.
      await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
      await page.clock.fastForward(299600); // t = 300,1 s : la reprogrammation des 5 min a lieu
      const prog = await derniereProgrammation(app, 'osc0');
      // À 300,1 s : cycle 4 – 8 commencé à 292 s, expiration (296 → 304 s) entamée de 4,1 s sur 8.
      expect(prog[0].method).toBe('setValueAtTime');
      expect(prog[0].args[0]).toBeCloseTo(220 * Math.pow(2, 1 - 4.1 / 8), 0);
      expect(prog[0].args[1]).toBeCloseTo(300.1, 1);
      const r = prog.filter((e) => e.method === 'exponentialRampToValueAtTime').map((e) => e.args);
      comparer(r, rampesAttendues(DETENTE).filter(([, fin]) => fin > 300.1));
    });
  });

  test.describe('Sortie du mode guidé', () => {
    test.beforeEach(async ({ app }) => {
      await app.open();
      await app.guide('Détente').click();
      await app.start();
      await app.advance(64.5); // étape 2 (4 – 6), début d'un cycle
    });

    test('choisir un préréglage quitte le mode guidé et applique le préréglage', async ({ app }) => {
      await app.preset('5 – 5').click();
      await expect(app.guide('Détente')).toHaveAttribute('aria-pressed', 'false');
      await expect(app.preset('5 – 5')).toHaveAttribute('aria-pressed', 'true');
      expect((await app.storedConfig()).guide).toBeUndefined();
      await app.advance(5); // t = 69,5 s : inspiration de 5 s terminée (cycle commencé à 64 s)
      await expect(app.step).toHaveText('');
      await expect(app.phase).toHaveText('Expirez');
      await expect(app.count).toHaveText('5');
    });

    test('modifier un réglage quitte le mode guidé en partant du rythme en cours', async ({ app }) => {
      await app.click('exh', '+');
      await expect(app.guide('Détente')).toHaveAttribute('aria-pressed', 'false');
      await expect(app.setting('exh').value).toHaveText('6,5 s');
      await expect(app.setting('inh').value).toHaveText('4 s');
      expect((await app.storedConfig()).guide).toBeUndefined();
      await app.advance(4); // t = 68,5 s
      await expect(app.step).toHaveText('');
      await expect(app.phase).toHaveText('Expirez');
      await expect(app.count).toHaveText('7'); // 6,5 s et non 6 s
    });
  });

  test.describe('Accessibilité', () => {
    test('boutons à bascule de 44 px, utilisables au clavier, avec un contour de focus', async ({ app, page }) => {
      await app.open();
      for (const s of ['Détente', 'Endormissement', 'Concentration']) {
        const b = app.guide(s);
        await expect(b).toHaveAttribute('aria-pressed', 'false');
        expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(44);
      }
      await app.sound.focus();
      await page.keyboard.press('Tab'); // élément suivant : la première séquence
      await expect(app.guide('Détente')).toBeFocused();
      await expect(app.guide('Détente')).toHaveCSS('outline-style', 'solid');
      await expect(app.guide('Détente')).toHaveCSS('outline-width', '3px');
      await page.keyboard.press('Enter');
      await expect(app.guide('Détente')).toHaveAttribute('aria-pressed', 'true');
    });

    test('l’étape en cours est annoncée aux lecteurs d’écran', async ({ app }) => {
      await app.open();
      await app.guide('Détente').click();
      await app.start();
      await app.advance(0.5);
      await expect(app.step).toHaveAttribute('aria-live', 'polite');
      await expect(app.step).toHaveText('Étape 1 / 3 · 4 – 4');
    });

    test('pas de défilement horizontal à 320 px pendant une séance guidée', async ({ app, page }) => {
      await page.setViewportSize({ width: 320, height: 568 });
      await app.open();
      await app.guide('Concentration').click();
      await app.start();
      await app.advance(120.5); // étape « Carrée 4 », le libellé le plus long
      await expect(app.step).toHaveText('Étape 2 / 3 · Carrée 4');
      const { scroll, inner } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
      expect(scroll).toBeLessThanOrEqual(inner);
    });
  });
});
