// Doublures injectées dans la page AVANT le chargement de index.html.
// Elles remplacent les API matérielles (audio, wake lock, stockage) par des
// versions qui enregistrent les appels, pour que les tests puissent les inspecter.
//
// Cette fonction est sérialisée par Playwright : elle ne doit référencer aucune
// variable extérieure, seulement `opts`.
function installMocks(opts) {
  // ----- Stockage : amorçage (une seule fois par onglet, pas à chaque rechargement) -----
  try {
    if (!sessionStorage.getItem('__seeded')) {
      sessionStorage.setItem('__seeded', '1');
      Object.keys(opts.storage || {}).forEach(function (k) { localStorage.setItem(k, opts.storage[k]); });
    }
  } catch (e) {}
  if (opts.storageBroken) {
    // Simule un navigateur qui interdit le stockage (mode privé strict, quota…).
    var boom = function () { throw new Error('storage disabled'); };
    Storage.prototype.getItem = boom;
    Storage.prototype.setItem = boom;
  }

  // ----- Audio : faux AudioContext qui journalise tout ce que fait l'application -----
  var log = { contexts: [], oscillators: [], gains: [], events: [] };
  window.__audio = log;
  var now = function () { return performance.now() / 1000; };

  function Param(node, name, value) { this.node = node; this.name = name; this.value = value; }
  ['setValueAtTime', 'exponentialRampToValueAtTime', 'linearRampToValueAtTime', 'setTargetAtTime', 'cancelScheduledValues']
    .forEach(function (m) {
      Param.prototype[m] = function () {
        var args = Array.prototype.slice.call(arguments);
        log.events.push({ node: this.node.id, param: this.name, method: m, args: args, at: now() });
        if (m === 'setValueAtTime' && args[1] <= this.node.ctx.currentTime + 1e-6) this.value = args[0];
        return this;
      };
    });

  function FakeAudioContext() {
    this.state = opts.audioState || 'running';
    this.destination = { id: 'destination' };
    this.resumeCalls = 0;
    this._t0 = now();
    log.contexts.push(this);
  }
  Object.defineProperty(FakeAudioContext.prototype, 'currentTime', { get: function () { return now() - this._t0; } });
  FakeAudioContext.prototype.resume = function () { this.resumeCalls++; this.state = 'running'; return Promise.resolve(); };
  FakeAudioContext.prototype.createOscillator = function () {
    var o = { id: 'osc' + log.oscillators.length, ctx: this, type: 'sine', started: false, stopCalls: [] };
    o.frequency = new Param(o, 'frequency', 440);
    o.connect = function () {};
    o.start = function () { o.started = true; };
    o.stop = function (t) { o.stopCalls.push(t === undefined ? 0 : t); };
    log.oscillators.push(o);
    return o;
  };
  FakeAudioContext.prototype.createGain = function () {
    var g = { id: 'gain' + log.gains.length, ctx: this };
    g.gain = new Param(g, 'gain', 1);
    g.connect = function () {};
    log.gains.push(g);
    return g;
  };

  var audio = opts.audio || 'standard';
  window.AudioContext = audio === 'standard' ? FakeAudioContext : undefined;
  window.webkitAudioContext = audio === 'webkit' ? FakeAudioContext : undefined;

  // ----- Wake Lock -----
  var wl = window.__wakeLock = { requests: 0, releases: 0 };
  var mode = opts.wakeLock || 'ok';
  var value;
  if (mode === 'absent') {
    value = undefined;
  } else {
    value = {
      request: function (type) {
        wl.requests++;
        wl.lastType = type;
        if (mode === 'reject') return Promise.reject(new Error('NotAllowedError'));
        return Promise.resolve({ release: function () { wl.releases++; return Promise.resolve(); } });
      }
    };
  }
  Object.defineProperty(navigator, 'wakeLock', { value: value, configurable: true });
}

// Faux NoSleep.js servi à la place du CDN (réseau indisponible, comportement déterministe).
const NOSLEEP_STUB = [
  'window.__noSleep = { created: 0, enabled: 0, disabled: 0 };',
  'window.NoSleep = function () {',
  '  window.__noSleep.created++;',
  '  this.enable = function () { window.__noSleep.enabled++; };',
  '  this.disable = function () { window.__noSleep.disabled++; };',
  '};'
].join('\n');

module.exports = { installMocks, NOSLEEP_STUB };
