// Fonctionnalité : modifier les réglages pendant que la séance tourne.
const { test, expect } = require('./helpers/app');

test.describe('Réglages modifiés en cours de séance', () => {
  test.beforeEach(async ({ app }) => { await app.open(); await app.start(); });

  test('allonger l’inspiration prolonge la phase en cours', async ({ app }) => {
    await app.advance(1.5);
    await app.click('inh', '+', 2); // 4 s → 5 s
    await app.advance(0.1);
    await expect(app.count).toHaveText('4'); // il restait 3 s sur 4 s, il reste 3,4 s sur 5 s
    await app.advance(2.9); // t = 4,5 s : sans changement on serait déjà en expiration
    await expect(app.phase).toHaveText('Inspirez');
    await app.advance(1); // t = 5,5 s
    await expect(app.phase).toHaveText('Expirez');
  });

  test('changer de préréglage s’applique à la séance en cours', async ({ app }) => {
    await app.advance(0.5);
    await app.preset('Carrée 4').click();
    await app.advance(4); // t = 4,5 s
    await expect(app.phase).toHaveText('Retenez');
  });

  test('retirer une pause en cours de cycle ne casse pas l’enchaînement', async ({ app }) => {
    await app.preset('Carrée 4').click();
    await app.advance(8.5); // en expiration
    await app.click('hold2', '-', 8); // supprime la pause à vide
    await app.click('hold1', '-', 8); // supprime la rétention
    await app.advance(10);
    await expect(app.phase).not.toHaveText('Prêt');
    expect(app.errors).toEqual([]);
  });

  test('les modifications sont enregistrées même pendant la séance', async ({ app }) => {
    await app.advance(1);
    await app.click('exh', '+');
    expect((await app.storedConfig()).exh).toBe(6.5);
  });

  test('la séance continue sans erreur après de nombreuses modifications', async ({ app }) => {
    for (let i = 0; i < 10; i++) { await app.click('inh', '+'); await app.advance(0.3); }
    await app.click('inh', '-', 10);
    await app.advance(5);
    await expect(app.go).toHaveText('Arrêter');
    expect(app.errors).toEqual([]);
  });
});
