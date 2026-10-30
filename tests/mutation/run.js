// Test de mutation : vérifie que la suite détecte réellement les régressions.
//
// Chaque mutant de mutants.js (un bug plausible) est injecté seul dans une copie du dépôt,
// puis toute la suite est exécutée. On obtient :
//   - les mutants SURVIVANTS : bugs qu'aucun test ne détecte → trou dans la suite ;
//   - les tests qui ne détectent AUCUN mutant : test à justifier (ajouter le mutant
//     qu'il protège) ou à supprimer.
//
//   npm run test:mutation                 # tous les mutants (~1 h 30)
//   npm run test:mutation -- f0,level-out # quelques mutants seulement
//
// Code de sortie 1 si un mutant non équivalent survit.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const { MUTANTS, EQUIVALENTS } = require('./mutants');

const ROOT = path.resolve(__dirname, '..', '..');
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'respire-mutation-'));
const only = process.argv[2] ? process.argv[2].split(',') : null;

// Copie des fichiers suivis par git (dans leur état actuel, modifications comprises).
execSync(`git ls-files -z | xargs -0 tar cf - | tar xf - -C "${WORK}"`, { cwd: ROOT });
fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(WORK, 'node_modules'));

function suite() {
  let raw;
  try {
    raw = execSync('npx playwright test --reporter=json', {
      cwd: WORK, maxBuffer: 1e9, stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, PORT: process.env.PORT || '4199', CI: '' }
    }).toString();
  } catch (e) { raw = e.stdout.toString(); }
  const tests = [], failed = [];
  (function walk(suites, prefix) {
    for (const s of suites || []) {
      const p = s.file === s.title ? prefix : prefix.concat(s.title);
      for (const spec of s.specs || []) {
        const id = p.concat(spec.title).join(' › ');
        tests.push(id);
        // Un test.fail « attendu » est ok tant qu'il échoue ; il devient en échec s'il réussit.
        if (!spec.ok) failed.push(id);
      }
      walk(s.suites, p);
    }
  })(JSON.parse(raw).suites, []);
  return { tests, failed };
}

const kills = {};
const survivors = [];
const todo = MUTANTS.filter(([id]) => !only || only.includes(id));
todo.forEach(([id, file, find, replace], n) => {
  const p = path.join(WORK, file);
  const orig = fs.readFileSync(p, 'utf8');
  const count = orig.split(find).length - 1;
  if (count !== 1) throw new Error(`Mutant ${id} : texte trouvé ${count} fois dans ${file} (attendu : 1)`);
  fs.writeFileSync(p, orig.replace(find, () => replace));
  const r = suite();
  fs.writeFileSync(p, orig);
  r.tests.forEach((t) => { kills[t] = kills[t] || []; });
  r.failed.forEach((t) => kills[t].push(id));
  const status = r.failed.length ? `détecté par ${r.failed.length} test(s)`
    : EQUIVALENTS[id] ? 'survit (équivalent : ' + EQUIVALENTS[id] + ')' : 'SURVIT';
  if (!r.failed.length && !EQUIVALENTS[id]) survivors.push(id);
  console.log(`[${n + 1}/${todo.length}] ${id} : ${status}`);
});

fs.rmSync(WORK, { recursive: true, force: true });

console.log('\nMutants survivants : ' + (survivors.length ? survivors.join(', ') : 'aucun'));
if (!only) {
  const inutiles = Object.keys(kills).filter((t) => kills[t].length === 0);
  console.log('Tests ne détectant aucun mutant : ' + (inutiles.length ? '\n  - ' + inutiles.join('\n  - ') : 'aucun'));
}
process.exit(survivors.length ? 1 : 0);
