const {createClient} = require('./firestore-rest.cjs');

async function main() {
  const client = await createClient();
  console.log('Validando modelo v2 no Firestore...');

  const dias = await client.listCollection('operacaoDias');
  const motoristas = await client.listCollection('motoristas');
  const retidos = await client.listCollection('retidos');
  const alfaDias = await client.listCollection('integracoes/alfa/dias');

  let motoristasDia = 0;
  let ctesDia = 0;
  for(const dayId of Object.keys(dias)) {
    const dayDrivers = await client.listCollection(`operacaoDias/${dayId}/motoristas`);
    const dayCtes = await client.listCollection(`operacaoDias/${dayId}/ctes`);
    motoristasDia += Object.keys(dayDrivers).length;
    ctesDia += Object.keys(dayCtes).length;
  }

  console.log('- operacaoDias:', Object.keys(dias).length);
  console.log('- operacaoDias/*/motoristas:', motoristasDia);
  console.log('- operacaoDias/*/ctes:', ctesDia);
  console.log('- motoristas:', Object.keys(motoristas).length);
  console.log('- retidos:', Object.keys(retidos).length);
  console.log('- integracoes/alfa/dias:', Object.keys(alfaDias).length);

  if(!Object.keys(dias).length) throw new Error('Nenhum dia operacional encontrado.');
  if(!motoristasDia) throw new Error('Nenhum motorista por dia encontrado.');

  console.log('Modelo v2 validado com sucesso.');
}

main().catch(err => {
  console.error(`Erro na validacao v2: ${err.message}`);
  process.exit(1);
});
