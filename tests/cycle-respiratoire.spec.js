// Fonctionnalité : déroulement d'une séance (phases, compte à rebours, animation, cycles, arrêt).
// L'horloge est simulée : app.advance(s) fait avancer le temps de s secondes.
// On échantillonne à mi-seconde (x,5 s) pour ne pas dépendre de la frame exacte d'un changement de phase.
const { test, expect } = require('./helpers/app');

test.describe('Cycle respiratoire (4 s / 6 s par défaut)', () => {
  test.beforeEach(async ({ app }) => { await app.open(); await app.start(); });

  test('le démarrage lance l’inspiration et le bouton devient « Arrêter »', async ({ app }) => {
    await app.advance(0.5);
    await expect(app.phase).toHaveText('Inspirez');
    expect(await app.dataPhase()).toBe('in');
    await expect(app.go).toHaveText('Arrêter');
    await expect(app.dot).toHaveAttribute('opacity', '1');
  });

  test('le compte à rebours affiche les secondes restantes, arrondies au-dessus', async ({ app }) => {
    // Échantillons en début de seconde (x,2 s → 3,8 s restantes) : un arrondi au plus proche
    // afficherait 3 au lieu de 4, ce qu'un échantillon à x,5 s ne distingue pas.
    const vus = [];
    let t0 = 0;
    for (const t of [0.2, 1.2, 2.2, 3.2]) {
      await app.advance(t - t0); t0 = t;
      vus.push(await app.count.textContent());
    }
    expect(vus).toEqual(['4', '3', '2', '1']);
  });

  test('l’inspiration (4 s) est suivie de l’expiration (6 s), puis d’un nouveau cycle', async ({ app }) => {
    await app.advance(4.5);
    await expect(app.phase).toHaveText('Expirez');
    expect(await app.dataPhase()).toBe('out');
    await expect(app.count).toHaveText('6');
    await app.advance(5); // t = 9,5 s
    await expect(app.phase).toHaveText('Expirez');
    await expect(app.count).toHaveText('1');
    await app.advance(1); // t = 10,5 s
    await expect(app.phase).toHaveText('Inspirez');
    await expect(app.cycles).toHaveText('1');
  });

  test('le compteur de cycles s’incrémente à chaque cycle complet', async ({ app }) => {
    await app.advance(31.5); // 3 cycles de 10 s
    await expect(app.cycles).toHaveText('3');
  });

  test('le disque grossit pendant l’inspiration et rétrécit pendant l’expiration', async ({ app }) => {
    await app.advance(0.5);
    const debutIn = await app.scale();
    await app.advance(1.5); // t = 2 s, mi-inspiration
    const milieuIn = await app.scale();
    await app.advance(1.9); // t ≈ 3,9 s, fin d'inspiration
    const finIn = await app.scale();
    expect(debutIn).toBeGreaterThan(0.5);
    expect(milieuIn).toBeCloseTo(0.75, 1);
    expect(finIn).toBeGreaterThan(0.95);
    expect(finIn).toBeLessThanOrEqual(1);

    await app.advance(3.1); // t = 7 s, mi-expiration
    expect(await app.scale()).toBeCloseTo(0.75, 1);
    await app.advance(2.9); // t ≈ 9,9 s, fin d'expiration
    const finOut = await app.scale();
    expect(finOut).toBeGreaterThanOrEqual(0.5);
    expect(finOut).toBeLessThan(0.55);
  });

  test('l’arc de progression se remplit sur la durée de chaque phase', async ({ app }) => {
    const C = 2 * Math.PI * 140;
    await app.advance(2); // mi-inspiration
    expect(await app.dashOffset()).toBeCloseTo(C / 2, -1);
    await app.advance(3.5); // t = 5,5 s, quart de l'expiration : l'arc repart de zéro et se remplit
    // (il suit la progression de la phase, pas le niveau des poumons qui, lui, diminue)
    expect(await app.dashOffset()).toBeCloseTo(C * 0.75, -1);
    await app.advance(1.5); // t = 7 s, mi-expiration
    expect(await app.dashOffset()).toBeCloseTo(C / 2, -1);
  });

  test('le point suit l’arc : en haut au début, en bas à mi-phase', async ({ app }) => {
    await app.advance(0.05);
    expect(parseFloat(await app.dot.getAttribute('cy'))).toBeLessThan(15);
    await app.advance(1.95); // t = 2 s
    expect(parseFloat(await app.dot.getAttribute('cx'))).toBeCloseTo(150, -1);
    expect(parseFloat(await app.dot.getAttribute('cy'))).toBeGreaterThan(275);
  });

  test('le temps écoulé est affiché en m:ss avec le total prévu', async ({ app }) => {
    await app.advance(0.5);
    await expect(app.elapsed).toHaveText('0:00 / 5:00');
    await app.advance(9);
    await expect(app.elapsed).toHaveText('0:09 / 5:00');
    await app.advance(52); // t = 61,5 s
    await expect(app.elapsed).toHaveText('1:01 / 5:00');
  });

  test('après un long gel de l’affichage (écran en veille), la séance se recale sur l’heure réelle', async ({ app, page }) => {
    await app.advance(0.5);
    // 125 s sans aucune frame d'animation (écran éteint) : 12 cycles complets + 5 s, rattrapés d'un coup.
    await page.clock.fastForward(125000);
    await app.advance(0.1);
    await expect(app.cycles).toHaveText('12');
    await expect(app.phase).toHaveText('Expirez');
    await expect(app.count).toHaveText('5');
  });

  test.describe('Arrêt manuel', () => {
    test.beforeEach(async ({ app }) => { await app.advance(2.5); await app.stop(); });

    test('revient à l’état « Prêt » et réinitialise l’animation', async ({ app }) => {
      await expect(app.phase).toHaveText('Prêt');
      await expect(app.go).toHaveText('Démarrer');
      expect(await app.dataPhase()).toBe('idle');
      expect(await app.scale()).toBe(0.5);
      expect(await app.dashOffset()).toBeCloseTo(2 * Math.PI * 140, 1);
      await expect(app.dot).toHaveAttribute('opacity', '0');
      await expect(app.count).toHaveText('4');
    });

    test('l’affichage ne bouge plus ensuite', async ({ app }) => {
      await app.advance(30);
      await expect(app.phase).toHaveText('Prêt');
      await expect(app.cycles).toHaveText('0');
      await expect(app.elapsed).toHaveText('0:02 / 5:00');
    });

    test('un nouveau démarrage repart de zéro', async ({ app }) => {
      await app.advance(20);
      await app.start();
      await app.advance(0.5);
      await expect(app.phase).toHaveText('Inspirez');
      await expect(app.cycles).toHaveText('0');
      await expect(app.elapsed).toHaveText('0:00 / 5:00');
    });
  });

  test('démarrer, arrêter, redémarrer n’accélère pas le déroulement', async ({ app }) => {
    await app.advance(1);
    await app.stop();
    await app.start();
    await app.advance(10.5);
    await expect(app.cycles).toHaveText('1');
  });
});

test.describe('Cycle avec pauses', () => {
  test('« 4 – 7 – 8 » : inspiration, rétention, expiration, sans pause à vide', async ({ app }) => {
    await app.open();
    await app.preset('4 – 7 – 8').click();
    await app.start();

    await app.advance(0.5);
    await expect(app.phase).toHaveText('Inspirez');
    await app.advance(4); // t = 4,5 s
    await expect(app.phase).toHaveText('Retenez');
    expect(await app.dataPhase()).toBe('h1');
    await expect(app.count).toHaveText('7');
    expect(await app.scale()).toBe(1); // poumons pleins : disque au maximum
    await app.advance(7); // t = 11,5 s
    await expect(app.phase).toHaveText('Expirez');
    await expect(app.count).toHaveText('8');
    await app.advance(8); // t = 19,5 s : cycle de 19 s terminé, retour direct à l'inspiration
    await expect(app.phase).toHaveText('Inspirez');
    await expect(app.cycles).toHaveText('1');
  });

  test('« Carrée 4 » : les quatre phases s’enchaînent, la pause à vide garde le disque petit', async ({ app }) => {
    await app.open();
    await app.preset('Carrée 4').click();
    await app.start();

    const vus = [];
    for (let i = 0; i < 4; i++) {
      await app.advance(i === 0 ? 0.5 : 4);
      vus.push([await app.phase.textContent(), await app.dataPhase()]);
    }
    expect(vus).toEqual([['Inspirez', 'in'], ['Retenez', 'h1'], ['Expirez', 'out'], ['Pause', 'h2']]);
    expect(await app.scale()).toBe(0.5); // poumons vides
    await app.advance(4); // t = 16,5 s
    await expect(app.phase).toHaveText('Inspirez');
    await expect(app.cycles).toHaveText('1');
  });

  test('une pause de 0,5 s est bien affichée', async ({ app }) => {
    await app.open();
    await app.click('hold1', '+');
    await app.start();
    await app.advance(4.25);
    await expect(app.phase).toHaveText('Retenez');
    await expect(app.count).toHaveText('1');
    await app.advance(0.5); // t = 4,75 s
    await expect(app.phase).toHaveText('Expirez');
  });
});
