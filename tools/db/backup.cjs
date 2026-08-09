const fs = require('fs');
const path = require('path');
const {ROOT, DEFAULT_COLLECTIONS, getArgValue, loadCollections} = require('./firestore-rest.cjs');

async function main() {
  const args = process.argv.slice(2);
  const outArg = getArgValue(args, '--out');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.join(ROOT, 'backups');
  const outFile = outArg ? path.resolve(ROOT, outArg) : path.join(outDir, `firestore-backup-${stamp}.json`);

  fs.mkdirSync(path.dirname(outFile), {recursive: true});
  console.log('Lendo Firestore atual...');
  const collections = await loadCollections(DEFAULT_COLLECTIONS);
  const payload = {
    createdAt: new Date().toISOString(),
    schemaSource: 'firestore-v1',
    collections
  };
  fs.writeFileSync(outFile, JSON.stringify(payload, null, 2));
  console.log(`Backup criado: ${path.relative(ROOT, outFile)}`);
}

main().catch(err => {
  console.error(`Erro no backup: ${err.message}`);
  process.exit(1);
});
