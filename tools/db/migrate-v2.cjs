const fs = require('fs');
const path = require('path');
const {ROOT, createClient, getArgValue, hasFlag, loadCollections} = require('./firestore-rest.cjs');
const {buildMigrationPlan} = require('./model-v2.cjs');

async function readCollections(args) {
  const from = getArgValue(args, '--from');
  if(from) {
    const filePath = path.resolve(ROOT, from);
    const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return payload.collections || payload;
  }
  return loadCollections();
}

async function main() {
  const args = process.argv.slice(2);
  const write = hasFlag(args, '--write');
  const collections = await readCollections(args);
  const plan = buildMigrationPlan(collections);

  console.log(write ? 'Migracao v2 com escrita habilitada.' : 'Migracao v2 em modo simulacao.');
  console.log(`Documentos que seriam gravados: ${plan.docs.length}`);
  Object.entries(plan.stats).forEach(([key, value]) => console.log(`- ${key}: ${value}`));

  const sample = plan.docs.slice(0, 10).map(doc => doc.path);
  if(sample.length) {
    console.log('\nAmostra de destinos:');
    sample.forEach(item => console.log(`- ${item}`));
  }

  if(!write) {
    console.log('\nNenhuma escrita realizada. Use: npm run db:migrate:v2 -- --write');
    return;
  }

  const client = await createClient();
  const written = await client.setDocuments(plan.docs);
  console.log(`\nMigracao concluida. Documentos gravados/atualizados: ${written}`);
}

main().catch(err => {
  console.error(`Erro na migracao v2: ${err.message}`);
  process.exit(1);
});
