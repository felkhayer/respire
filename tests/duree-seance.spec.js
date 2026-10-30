// Fonctionnalité : durée de la séance (fin automatique ou mode illimité).
const { test, expect } = require('./helpers/app');

const CLE = 'respiration-cfg';
const UNE_MINUTE = { storage: { [CLE]: JSON.stringify({ total: 1 }) } };
const ILLIMITEE = { storage: { [CLE]: JSON.stringify({ total: 0 }) } };

test.describe('Durée de la séance', () => {
  test('la séance se termine automatiquement à la durée choisie', async ({ app }) => {
    await app.open(UNE_MINUTE);
    await app.start();
    await app.advance(59.5);
    await expect(app.go).toHaveText('Arrêter');
    await app.advance(1); // t = 60,5 s
    await expect(app.phase).toHaveText('Terminé');
    await expect(app.go).toHaveText('Démarrer');
    await expect(app.elapsed).toHaveText('1:00 / 1:00');
    expect(await app.dataPhase()).toBe('idle');
    await expect(app.dot).toHaveAttribute('opacity', '0');
  });

  test('la fin de séance libère l’écran et arrête le son', async ({ app }) => {
    await app.open(UNE_MINUTE);
    await app.start();
    await app.advance(60.5);
    expect((await app.wakeLock()).releases).toBe(1);
    const [osc] = (await app.audio()).oscillators;
    // Arrêt programmé à l'avance (60,6 s) + coupure effective à la fin de la séance (≈ 60,5 s).
    expect(osc.stopCalls).toContain(60.6);
    expect(osc.stopCalls.some((t) => t > 60.4 && t < 60.59)).toBe(true);
  });

  test('on peut relancer une séance après la fin', async ({ app }) => {
    await app.open(UNE_MINUTE);
    await app.start();
    await app.advance(60.5);
    await app.start();
    await app.advance(0.5);
    await expect(app.phase).toHaveText('Inspirez');
    await expect(app.go).toHaveText('Arrêter');
    await expect(app.cycles).toHaveText('0');
  });

  test('en mode illimité la séance continue et le total n’est pas affiché', async ({ app }) => {
    await app.open(ILLIMITEE);
    await app.start();
    await app.advance(125.5); // plus de 2 minutes
    await expect(app.go).toHaveText('Arrêter');
    await expect(app.elapsed).toHaveText('2:05');
    await expect(app.cycles).toHaveText('12');
  });

  test('raccourcir la durée pendant la séance la termine si le temps est déjà dépassé', async ({ app }) => {
    await app.open();
    await app.start();
    await app.advance(61.5);
    await app.click('total', '-', 4); // 5 min → 1 min
    await app.advance(0.1);
    await expect(app.phase).toHaveText('Terminé');
  });

  test('un arrêt manuel n’affiche pas « Terminé »', async ({ app }) => {
    await app.open(UNE_MINUTE);
    await app.start();
    await app.advance(5.5);
    await app.stop();
    await expect(app.phase).toHaveText('Prêt');
  });
});
