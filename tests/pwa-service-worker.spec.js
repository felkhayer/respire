// Fonctionnalité : logique du service worker (cache hors ligne), testée en isolation
// en exécutant sw.js dans un bac à sable Node avec de fausses API `self` / `caches`.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SOURCE = fs.readFileSync(path.resolve(__dirname, '..', 'sw.js'), 'utf8');

function charger(cachesExistants) {
  const handlers = {};
  const journal = { skipWaiting: 0, claim: 0, added: [], deleted: [], fetched: [] };
  const stock = {}; // url → réponse en cache
  const cachesFake = {
    open: async (nom) => ({ addAll: async (fichiers) => { journal.added.push({ nom, fichiers }); } }),
    keys: async () => cachesExistants,
    delete: async (nom) => { journal.deleted.push(nom); return true; },
    match: async (req) => stock[req.url]
  };
  const ctx = {
    self: {
      addEventListener: (type, fn) => { handlers[type] = fn; },
      skipWaiting: () => { journal.skipWaiting++; },
      clients: { claim: () => { journal.claim++; } }
    },
    caches: cachesFake,
    fetch: async (req) => { journal.fetched.push(req.url); return { reseau: req.url }; }
  };
  vm.createContext(ctx);
  vm.runInContext(SOURCE, ctx);
  const evenement = (extra) => {
    const e = Object.assign({ promesses: [] }, extra);
    e.waitUntil = (p) => e.promesses.push(p);
    e.respondWith = (p) => e.promesses.push(p);
    return e;
  };
  return { handlers, journal, stock, ctx, evenement };
}

test.describe('Service worker', () => {
  test('install : pré-cache l’application et s’active immédiatement', async () => {
    const { handlers, journal, ctx, evenement } = charger([]);
    const e = evenement();
    handlers.install(e);
    await Promise.all(e.promesses);
    expect(journal.skipWaiting).toBe(1);
    expect(journal.added).toHaveLength(1);
    expect(journal.added[0].nom).toBe(vm.runInContext('CACHE', ctx));
    expect(journal.added[0].fichiers).toEqual(expect.arrayContaining(['./index.html', './manifest.json', './icon-192.png', './icon-512.png', './apple-touch-icon.png']));
  });

  test('tous les fichiers pré-cachés existent réellement', () => {
    const { ctx } = charger([]);
    const fichiers = vm.runInContext('FILES', ctx);
    for (const f of fichiers) {
      expect(fs.existsSync(path.resolve(__dirname, '..', f === './' ? 'index.html' : f)), f).toBe(true);
    }
  });

  test('activate : supprime les anciens caches et garde le courant', async () => {
    const { handlers, journal, ctx, evenement } = charger(['respiration-v0', 'autre-app', 'respiration-v1']);
    const courant = vm.runInContext('CACHE', ctx);
    const e = evenement();
    handlers.activate(e);
    await Promise.all(e.promesses);
    expect(journal.deleted).not.toContain(courant);
    expect(journal.deleted.sort()).toEqual(['autre-app', 'respiration-v0', 'respiration-v1'].filter((n) => n !== courant).sort());
    expect(journal.claim).toBe(1);
  });

  test('fetch : sert le cache d’abord, sans toucher au réseau', async () => {
    const { handlers, journal, stock, evenement } = charger([]);
    stock['http://x/index.html'] = { cache: true };
    const e = evenement({ request: { url: 'http://x/index.html' } });
    handlers.fetch(e);
    expect(await e.promesses[0]).toEqual({ cache: true });
    expect(journal.fetched).toEqual([]);
  });

  test('fetch : retombe sur le réseau quand la ressource n’est pas en cache', async () => {
    const { handlers, journal, evenement } = charger([]);
    const e = evenement({ request: { url: 'http://x/inconnu.js' } });
    handlers.fetch(e);
    expect(await e.promesses[0]).toEqual({ reseau: 'http://x/inconnu.js' });
    expect(journal.fetched).toEqual(['http://x/inconnu.js']);
  });
});
