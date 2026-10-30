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

  test('retirer la pause à vide pendant l’expiration : la séance continue en 4 / 4 / 4', async ({ app }) => {
    await app.preset('Carrée 4').click();
    await app.advance(8.5); // en expiration
    await app.click('hold2', '-', 8); // supprime la pause à vide (phase située après la phase en cours)
    await app.advance(0.1);
    await expect(app.phase).toHaveText('Expirez');
    await app.advance(4); // t = 12,6 s : sans pause à vide, on enchaîne directement sur l'inspiration
    await expect(app.phase).toHaveText('Inspirez');
    await expect(app.cycles).toHaveText('1');
  });

  // Limite connue : la phase en cours est repérée par sa position dans la liste des phases.
  // Ajouter ou retirer une pause SITUÉE AVANT la phase en cours décale cette position :
  // l'utilisateur passe brutalement de « Expirez » à une autre phase et le cycle n'est pas compté.
  // Ces tests décrivent le comportement attendu ; ils échoueront (« expected to fail ») le jour
  // où l'anomalie sera corrigée, il suffira alors de retirer `test.fail`.
  test.fail('retirer la rétention pendant l’expiration ne doit pas interrompre l’expiration', async ({ app }) => {
    await app.preset('Carrée 4').click();
    await app.advance(8.5); // en expiration
    await app.click('hold1', '-', 8);
    await app.advance(0.1);
    await expect(app.phase).toHaveText('Expirez', { timeout: 500 }); // constaté : « Pause »
  });

  test.fail('ajouter une rétention pendant l’expiration ne doit pas renvoyer à la rétention', async ({ app }) => {
    await app.advance(5.5); // 4 – 6, en expiration
    await app.preset('Carrée 4').click();
    await app.advance(0.1);
    await expect(app.phase).toHaveText('Expirez', { timeout: 500 }); // constaté : « Retenez »
  });

  test('raccourcir la phase en cours sous le temps déjà écoulé passe à la phase suivante, au bon moment', async ({ app }) => {
    await app.click('inh', '+', 8); // 4 s → 8 s
    await app.advance(6.5);
    await app.click('inh', '-', 8); // 8 s → 4 s : 2,5 s de « retard »
    await app.advance(0.1);
    // L'expiration a commencé à t = 4 s comme si l'inspiration avait toujours duré 4 s.
    await expect(app.phase).toHaveText('Expirez');
    await expect(app.count).toHaveText('4'); // 6 s − 2,6 s = 3,4 s restantes
  });

  test('les modifications sont enregistrées même pendant la séance', async ({ app }) => {
    await app.advance(1);
    await app.click('exh', '+');
    expect((await app.storedConfig()).exh).toBe(6.5);
  });

  test('des modifications successives qui s’annulent ne décalent pas la séance', async ({ app }) => {
    for (let i = 0; i < 10; i++) { await app.click('inh', '+'); await app.advance(0.3); } // t = 3 s, inspiration à 9 s
    await app.click('inh', '-', 10); // retour à 4 s
    await app.advance(7.5); // t = 10,5 s : exactement comme si rien n'avait changé
    await expect(app.phase).toHaveText('Inspirez');
    await expect(app.cycles).toHaveText('1');
    expect(app.errors).toEqual([]);
  });
});
