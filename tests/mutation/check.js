// Vérification rapide (quelques millisecondes) : chaque mutant de mutants.js doit trouver son
// texte exactement une fois dans le fichier visé, sinon run.js s'arrêterait en cours de route.
// À lancer après toute modification du code de l'application : npm run test:mutants-check
const fs = require('fs');
const path = require('path');
const { MUTANTS, EQUIVALENTS } = require('./mutants');

const ROOT = path.resolve(__dirname, '..', '..');
const errors = [];
const ids = new Set();
for (const [id, file, find, replace] of MUTANTS) {
  if (ids.has(id)) errors.push(`${id} : identifiant en double`);
  ids.add(id);
  const count = fs.readFileSync(path.join(ROOT, file), 'utf8').split(find).length - 1;
  if (count !== 1) errors.push(`${id} : texte trouvé ${count} fois dans ${file} (attendu : 1)`);
  if (find === replace) errors.push(`${id} : le remplacement est identique au texte cherché`);
}
for (const id of Object.keys(EQUIVALENTS)) if (!ids.has(id)) errors.push(`${id} : équivalent sans mutant`);
console.log(errors.length ? errors.join('\n') : `${MUTANTS.length} mutants valides`);
process.exit(errors.length ? 1 : 0);
