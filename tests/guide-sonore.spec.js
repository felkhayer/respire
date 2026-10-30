// Fonctionnalité : guide sonore (Web Audio). Le son monte d'une octave (220 → 440 Hz) à l'inspiration,
// redescend à l'expiration, reste sur la même note (plus douce) pendant les pauses.
// Il est programmé à l'avance sur l'horloge audio pour continuer écran éteint.
const { test, expect } = require('./helpers/app');

const CLE = 'respiration-cfg';
const rampes = { param: 'frequency', method: 'exponentialRampToValueAtTime' };
const volumes = { param: 'gain', method: 'setTargetAtTime' };

test.describe('Guide sonore', () => {
  test.describe('Démarrage', () => {
    test('démarre un oscillateur sinusoïdal à 220 Hz', async ({ app }) => {
      await app.open();
      await app.start();
      const a = await app.audio();
      expect(a.contexts).toBe(1);
      expect(a.oscillators).toHaveLength(1);
      expect(a.oscillators[0]).toMatchObject({ type: 'sine', started: true });
      const [premier] = await app.audioEvents({ param: 'frequency', method: 'setValueAtTime' });
      expect(premier.args).toEqual([220, 0]);
    });

    test('rien n’est créé tant que la séance n’est pas lancée', async ({ app }) => {
      await app.open();
      expect((await app.audio()).contexts).toBe(0);
    });

    test('un contexte audio suspendu (politique d’autoplay) est relancé', async ({ app }) => {
      await app.open({ audioState: 'suspended' });
      await app.start();
      expect((await app.audio()).resumeCalls[0]).toBeGreaterThan(0);
    });

    test('utilise webkitAudioContext quand AudioContext n’existe pas (Safari)', async ({ app }) => {
      await app.open({ audio: 'webkit' });
      await app.start();
      expect((await app.audio()).oscillators).toHaveLength(1);
    });

    test('la séance fonctionne sans aucune API audio', async ({ app }) => {
      await app.open({ audio: 'none' });
      await app.start();
      await app.advance(0.5);
      await expect(app.phase).toHaveText('Inspirez');
      await app.advance(5);
      await expect(app.phase).toHaveText('Expirez');
      expect(app.errors).toEqual([]);
    });
  });

  test.describe('Programmation des notes', () => {
    test('4 – 6 : la note monte à 440 Hz sur 4 s puis redescend à 220 Hz sur 6 s, en boucle', async ({ app }) => {
      await app.open();
      await app.start();
      const r = (await app.audioEvents(rampes)).slice(0, 4).map((e) => e.args);
      expect(r).toEqual([[440, 4], [220, 10], [440, 14], [220, 20]]);
    });

    test('la note ne dépasse jamais l’octave 220–440 Hz', async ({ app }) => {
      await app.open();
      await app.preset('4 – 7 – 8').click();
      await app.start();
      await app.advance(9); // en pleine rétention : reprogrammation en cours de cycle
      await app.click('exh', '+');
      // Paliers ET cibles des rampes : toutes les notes jouées restent dans l'octave.
      const freqs = (await app.audioEvents({ param: 'frequency' }))
        .filter((e) => e.method !== 'cancelScheduledValues').map((e) => e.args[0]);
      expect(freqs.length).toBeGreaterThan(10);
      for (const f of freqs) { expect(f).toBeGreaterThanOrEqual(220 - 1e-9); expect(f).toBeLessThanOrEqual(440 + 1e-9); }
    });

    test('volume plein (0,15) en inspiration/expiration, plus doux (0,06) pendant les pauses', async ({ app }) => {
      await app.open();
      await app.preset('Carrée 4').click();
      await app.start();
      const v = (await app.audioEvents(volumes)).slice(0, 4).map((e) => [e.args[0], e.args[1]]);
      expect(v).toEqual([[0.15, 0], [0.06, 4], [0.15, 8], [0.06, 12]]);
    });

    test('sans pause configurée, le volume reste constant', async ({ app }) => {
      await app.open();
      await app.start();
      const v = (await app.audioEvents(volumes)).filter((e) => e.args[0] !== 0).map((e) => e.args[0]);
      expect(new Set(v)).toEqual(new Set([0.15]));
    });

    test('Carrée 4 : la fréquence ne varie pas pendant les pauses', async ({ app }) => {
      await app.open();
      await app.preset('Carrée 4').click();
      await app.start();
      // Seules l'inspiration (0→4 s) et l'expiration (8→12 s) montent/descendent.
      const r = (await app.audioEvents(rampes)).slice(0, 4).map((e) => e.args);
      expect(r).toEqual([[440, 4], [220, 12], [440, 20], [220, 28]]);
      // Pendant la rétention (4→8 s) la note reste au sommet (440), pendant la pause (12→16 s) en bas (220).
      const sauts = (await app.audioEvents({ param: 'frequency', method: 'setValueAtTime' })).map((e) => e.args);
      expect(sauts).toEqual(expect.arrayContaining([[440, 4], [220, 12]]));
    });

    test('la programmation couvre 30 minutes à l’avance en mode illimité', async ({ app }) => {
      await app.open({ storage: { [CLE]: JSON.stringify({ total: 0 }) } });
      await app.start();
      const fins = (await app.audioEvents(rampes)).map((e) => e.args[1]);
      const derniere = Math.max(...fins);
      expect(derniere).toBeGreaterThan(1790);
      expect(derniere).toBeLessThan(1810);
    });

    test('la programmation est renouvelée toutes les 5 minutes', async ({ app }) => {
      await app.open({ storage: { [CLE]: JSON.stringify({ total: 0 }) } });
      await app.start();
      const avant = (await app.audioEvents({ param: 'frequency', method: 'cancelScheduledValues' })).length;
      await app.advance(301);
      const apres = (await app.audioEvents({ param: 'frequency', method: 'cancelScheduledValues' })).length;
      expect(apres).toBeGreaterThan(avant);
      expect(app.errors).toEqual([]);
    });
  });

  test.describe('Fin de séance', () => {
    test('l’arrêt programmé est enregistré à l’avance sur l’horloge audio (durée limitée)', async ({ app }) => {
      await app.open({ storage: { [CLE]: JSON.stringify({ total: 1 }) } });
      await app.start();
      const fade = (await app.audioEvents(volumes)).find((e) => e.args[0] === 0);
      expect(fade.args[1]).toBe(60);
      const [osc] = (await app.audio()).oscillators;
      expect(osc.stopCalls).toContain(60.6);
    });

    test('reprogrammer le son en cours de séance garde la fin à l’heure prévue', async ({ app }) => {
      await app.open({ storage: { [CLE]: JSON.stringify({ total: 1 }) } });
      await app.start();
      await app.advance(30);
      await app.click('exh', '+'); // reprogramme le son à t = 30 s
      const gains = await app.audioEvents({ node: 'gain0', param: 'gain' });
      const derniere = gains.slice(gains.map((e) => e.method).lastIndexOf('cancelScheduledValues') + 1);
      const fade = derniere.find((e) => e.method === 'setTargetAtTime' && e.args[0] === 0);
      expect(fade.args[1]).toBeCloseTo(60, 1); // et non 30 + 60 = 90 s
      const [osc] = (await app.audio()).oscillators;
      expect(osc.stopCalls[osc.stopCalls.length - 1]).toBeCloseTo(60.6, 1);
    });

    test('pas d’arrêt programmé en mode illimité', async ({ app }) => {
      await app.open({ storage: { [CLE]: JSON.stringify({ total: 0 }) } });
      await app.start();
      const [osc] = (await app.audio()).oscillators;
      expect(osc.stopCalls).toEqual([]);
    });

    test('l’arrêt manuel coupe le son dans la demi-seconde', async ({ app }) => {
      await app.open();
      await app.start();
      await app.advance(2);
      await app.stop();
      const [osc] = (await app.audio()).oscillators;
      // Instants comparés avec tolérance : l'horloge audio est un flottant (2 peut valoir 1,9999999999999998).
      expect(osc.stopCalls.some((t) => Math.abs(t - 2.5) < 1e-6)).toBe(true); // en plus de l'arrêt programmé à 300,6 s
      const coupures = (await app.audioEvents(volumes)).filter((e) => e.args[0] === 0 && Math.abs(e.args[1] - 2) < 1e-6);
      expect(coupures).toHaveLength(1);
    });

    test('redémarrer après un arrêt crée un nouvel oscillateur', async ({ app }) => {
      await app.open();
      await app.start();
      await app.stop();
      await app.start();
      const a = await app.audio();
      expect(a.contexts).toBe(1); // le contexte est réutilisé
      expect(a.oscillators).toHaveLength(2);
      expect(a.oscillators[1].started).toBe(true);
    });
  });

  test.describe('Interrupteur « Guide sonore »', () => {
    test('l’interrupteur bascule son état et l’enregistre', async ({ app }) => {
      await app.open();
      await app.sound.click();
      await expect(app.sound).toHaveAttribute('aria-checked', 'false');
      expect((await app.storedConfig()).sound).toBe(false);
      await app.sound.click();
      await expect(app.sound).toHaveAttribute('aria-checked', 'true');
      expect((await app.storedConfig()).sound).toBe(true);
    });

    test('désactivé : la séance tourne sans créer de contexte audio', async ({ app }) => {
      await app.open({ storage: { [CLE]: JSON.stringify({ sound: false }) } });
      await expect(app.sound).toHaveAttribute('aria-checked', 'false');
      await app.start();
      await app.advance(5);
      await expect(app.phase).toHaveText('Expirez');
      expect((await app.audio()).contexts).toBe(0);
    });

    test('désactiver pendant la séance coupe le son sans arrêter la séance', async ({ app }) => {
      await app.open();
      await app.start();
      await app.advance(2);
      await app.sound.click();
      const [osc] = (await app.audio()).oscillators;
      expect(osc.stopCalls).toContain(2.5);
      await app.advance(3);
      await expect(app.go).toHaveText('Arrêter');
      await expect(app.phase).toHaveText('Expirez');
    });

    test('réactiver pendant la séance reprend le son à la bonne note', async ({ app }) => {
      await app.open();
      await app.start();
      await app.advance(7); // expiration, 3 s écoulées sur 6 : mi-chemin entre 440 et 220 Hz
      await app.sound.click(); // coupe
      await app.sound.click(); // rallume
      const a = await app.audio();
      expect(a.oscillators).toHaveLength(2);
      const evs = a.events.filter((e) => e.node === 'osc1' && e.param === 'frequency');
      const depart = evs.find((e) => e.method === 'setValueAtTime');
      expect(depart.args[0]).toBeCloseTo(220 * Math.SQRT2, 0);
      expect(depart.args[1]).toBeCloseTo(7, 1);
      const rampe = evs.find((e) => e.method === 'exponentialRampToValueAtTime');
      expect(rampe.args[0]).toBe(220);
      expect(rampe.args[1]).toBeCloseTo(10, 1);
    });

    test('changer de préréglage pendant la séance reprogramme le son', async ({ app }) => {
      await app.open();
      await app.start();
      await app.advance(0.5);
      await app.preset('Carrée 4').click();
      const evs = await app.audioEvents({ node: 'gain0', param: 'gain', method: 'setTargetAtTime' });
      expect(evs.some((e) => e.args[0] === 0.06 && e.args[1] === 4)).toBe(true); // la rétention de 4 s est programmée
    });

    test('changer une durée pendant la séance reprogramme le son', async ({ app }) => {
      await app.open();
      await app.start();
      await app.advance(1.5);
      await app.click('inh', '+', 2); // 5 s
      const evs = await app.audioEvents({ node: 'osc0', param: 'frequency' });
      // On ne garde que la programmation posée par le dernier clic (après le dernier « cancel »).
      const derniere = evs.slice(evs.map((e) => e.method).lastIndexOf('cancelScheduledValues') + 1);
      // 1,5 s écoulées sur 5 s → 30 % de l'octave, puis montée jusqu'à 440 Hz à t = 5 s.
      expect(derniere[0].method).toBe('setValueAtTime');
      expect(derniere[0].args[0]).toBeCloseTo(220 * Math.pow(2, 0.3), 0);
      expect(derniere[1]).toMatchObject({ method: 'exponentialRampToValueAtTime', args: [440, 5] });
    });
  });
});
