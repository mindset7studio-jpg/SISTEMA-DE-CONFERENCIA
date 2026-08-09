const fs = require('fs');
const path = require('path');
const {ROOT, getArgValue, loadCollections} = require('./firestore-rest.cjs');
const {buildMigrationPlan, summarizeCollections} = require('./model-v2.cjs');

async function readCollections(args) {
  const from = getArgValue(args, '--from');
  if(from) {
    const filePath = path.resolve(ROOT, from);
    const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return payload.collections || payload;
  }
  return loadCollections();
}

function printObject(obj) {
  Object.entries(obj).forEach(([key, value]) => {
    console.log(`- ${key}: ${value}`);
  });
}

async function main() {
  const args = process.argv.slice(2);
  console.log('Diagnosticando modelo atual...');
  const collections = await readCollections(args);
  const current = summarizeCollections(collections);
  const plan = buildMigrationPlan(collections);

  console.log('\nModelo atual');
  printObject(current);

  console.log('\nModelo v2 planejado');
  printObject(plan.stats);

  console.log('\nDiagnostico');
  if(current.rowsMotoristasEmConferencias > 0) {
    console.log('- Conferencias ainda usam arrays grandes em rows; isso dificulta filtro por CTE, retidos e relatorios.');
  }
  if(current.ctesDetalhadosEmSnapshotsAlfa > 0) {
    console.log('- Snapshots Alfa ja possuem CTEs detalhados e podem alimentar subcolecoes por dia.');
  }
  if(current.retidosDetectados > 0) {
    console.log('- Ha CTEs retidos detectaveis automaticamente nos snapshots Alfa.');
  }
  console.log('- Recomendacao: migrar para operacaoDias/{data_unidade}/motoristas e /ctes sem apagar as colecoes antigas.');
}

main().catch(err => {
  console.error(`Erro no diagnostico: ${err.message}`);
  process.exit(1);
});
