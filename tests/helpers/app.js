// Fixture Playwright « app » : ouvre l'application avec horloge simulée et doublures,
// et expose des raccourcis lisibles pour écrire les tests par fonctionnalité.
const base = require('@playwright/test');
const { installMocks, NOSLEEP_STUB } = require('./mocks');

const expect = base.expect;

// Libellés des réglages, dans l'ordre d'affichage.
const LABELS = {
  inh: 'Inspiration',
  hold1: 'Pause poumons pleins',
  exh: 'Expiration',
  hold2: 'Pause poumons vides',
  total: 'Durée de l’exercice'
};

class App {
  constructor(page) {
    this.page = page;
    this.phase = page.locator('#phase');
    this.count = page.locator('#count');
    this.cycles = page.locator('#cycles');
    this.elapsed = page.locator('#elapsed');
    this.go = page.locator('#go');
    this.sound = page.locator('#sound');
    this.disc = page.locator('#disc');
    this.arc = page.locator('#arc');
    this.dot = page.locator('#dot');
  }

  /**
   * Ouvre l'application.
   * opts.storage      : { clé: valeur } écrit dans localStorage avant le chargement
   * opts.storageBroken: localStorage lève une exception
   * opts.audio        : 'standard' | 'webkit' | 'none'
   * opts.audioState   : état initial de l'AudioContext ('running' | 'suspended')
   * opts.wakeLock     : 'ok' | 'reject' | 'absent'
   * opts.noSleep      : 'ok' | 'absent' (script CDN indisponible)
   * opts.clock        : false pour désactiver l'horloge simulée
   */
  async open(opts) {
    opts = opts || {};
    const page = this.page;
    this.errors = [];
    page.on('pageerror', (e) => this.errors.push(e.message));

    await page.route('**/nosleep/**', (route) =>
      opts.noSleep === 'absent'
        ? route.abort()
        : route.fulfill({ contentType: 'text/javascript', body: NOSLEEP_STUB }));
    await page.addInitScript(installMocks, opts);
    if (opts.clock !== false) {
      // Horloge figée : le temps ne s'écoule que via app.advance(), les tests sont déterministes.
      await page.clock.install({ time: 0 });
      await page.clock.pauseAt(1000);
    }
    await page.goto('/index.html');
    return this;
  }

  async reload() {
    await this.page.reload();
  }

  /**
   * Fait avancer l'horloge simulée de `s` secondes.
   * Les longues durées sont franchies d'un saut (comme un écran en veille dont l'affichage
   * est gelé), puis la dernière seconde est rejouée frame par frame pour que l'affichage
   * soit à jour. C'est aussi bien plus rapide que de simuler chaque frame de 16 ms.
   */
  async advance(s) {
    const ms = Math.round(s * 1000);
    if (ms > 2000) {
      await this.page.clock.fastForward(ms - 1000);
      await this.page.clock.runFor(1000);
    } else {
      await this.page.clock.runFor(ms);
    }
  }

  async start() { await this.go.click(); }
  async stop() { await this.go.click(); }

  /** Boutons +/− et affichage d'un réglage : 'inh' | 'hold1' | 'exh' | 'hold2' | 'total'. */
  setting(key) {
    const label = LABELS[key];
    return {
      plus: this.page.getByRole('button', { name: 'Augmenter : ' + label }),
      minus: this.page.getByRole('button', { name: 'Diminuer : ' + label }),
      value: this.page.locator('.row', { hasText: label }).locator('output')
    };
  }
  async click(key, sign, times) {
    const s = this.setting(key);
    for (let i = 0; i < (times || 1); i++) await (sign === '+' ? s.plus : s.minus).click();
  }
  preset(name) { return this.page.getByRole('button', { name: name, exact: true }); }

  async dataPhase() { return this.page.evaluate(() => document.body.getAttribute('data-phase')); }
  /** Échelle (0.5 → 1) du disque central. */
  async scale() {
    return this.page.evaluate(() => parseFloat(document.getElementById('disc').style.transform.replace('scale(', '')));
  }
  async dashOffset() {
    return this.page.evaluate(() => parseFloat(document.getElementById('arc').style.strokeDashoffset));
  }
  async storedConfig() {
    return this.page.evaluate(() => JSON.parse(localStorage.getItem('respiration-cfg')));
  }

  audio() { return this.page.evaluate(() => {
    const a = window.__audio;
    return {
      contexts: a.contexts.length,
      resumeCalls: a.contexts.map((c) => c.resumeCalls),
      oscillators: a.oscillators.map((o) => ({ id: o.id, type: o.type, started: o.started, stopCalls: o.stopCalls })),
      events: a.events
    };
  }); }
  /** Événements audio filtrés, ex. audioEvents({ param: 'frequency', method: 'exponentialRampToValueAtTime' }). */
  async audioEvents(filter) {
    const evs = (await this.audio()).events;
    return evs.filter((e) => Object.keys(filter || {}).every((k) => e[k] === filter[k]));
  }
  wakeLock() { return this.page.evaluate(() => window.__wakeLock); }
  noSleep() { return this.page.evaluate(() => window.__noSleep || null); }
}

const test = base.test.extend({
  app: async ({ page }, use) => { await use(new App(page)); }
});

module.exports = { test, expect };
