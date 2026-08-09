function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function safeId(value, fallback) {
  return normalizeText(value) || fallback;
}

function onlyDigits(value) {
  return String(value || '').replace(/\D+/g, '');
}

function dayId(date, unidade = '231') {
  return `${date}_${unidade || '231'}`;
}

function parseDateFromKey(key, data) {
  return String((data && data.date) || key || '').split('__')[0].split('_')[0];
}

function pendingCount(row) {
  const ctes = Number(row.ctes || row.qtd_ctes || 0);
  const realizadas = Number(row.realizadas || row.qtd_realizadas || 0);
  return Math.max(0, ctes - realizadas);
}

function isRetido(delivery) {
  const haystack = [
    delivery.status,
    delivery.recebedor,
    delivery.documento,
    delivery.obs,
    delivery.observacao
  ].map(v => String(v || '').toLowerCase()).join(' ');
  return haystack.includes('retido');
}

function normalizeDriver(row, date, unidade, source) {
  const nome = String(row.nome || row.motorista || '').trim();
  const placa = String(row.placa || '').trim();
  const id = safeId(`${placa}-${nome}`, safeId(nome, `motorista-${Date.now()}`));
  const ctes = Number(row.ctes || row.qtd_ctes || 0);
  const realizadas = Number(row.realizadas || row.qtd_realizadas || 0);
  const auditadas = Number(row.auditadas || row.qtd_auditada_veiculo || 0);
  return {
    id,
    nome,
    placa,
    data: date,
    unidade,
    ctes,
    realizadas,
    auditadas,
    pendentes: Math.max(0, ctes - realizadas),
    statusPrestacao: row.statusPrestacao || row.status || '',
    occCodes: Array.isArray(row.occCodes) ? row.occCodes : [],
    obs: row.obs || '',
    source
  };
}

function normalizeCte(delivery, date, unidade, driver) {
  const cte = String(delivery.cte || delivery.numeroCte || '').trim();
  if(!cte) return null;
  const id = safeId(cte, onlyDigits(cte) || `cte-${Date.now()}`);
  return {
    id,
    cte,
    data,
    unidade,
    motorista: delivery.motorista || (driver && driver.nome) || '',
    placa: delivery.placa || (driver && driver.placa) || '',
    destinatario: delivery.destinatario || delivery.cliente || '',
    status: delivery.status || '',
    dataHora: delivery.data_hora || delivery.dataHora || delivery.data_hora_iso || '',
    documento: delivery.documento || '',
    recebedor: delivery.recebedor || '',
    acr: delivery.acr || null,
    bo: delivery.bo || null,
    caixa: delivery.caixa || '',
    comprovanteUrl: delivery.comprovanteUrl || delivery.url_comprovante || '',
    localizacaoUrl: delivery.localizacaoUrl || delivery.url_localizacao || '',
    source: 'alfa'
  };
}

function buildMigrationPlan(collections) {
  const now = new Date().toISOString();
  const docs = [];
  let stats = {
    dias: 0,
    motoristasDia: 0,
    motoristasGlobais: 0,
    ctes: 0,
    retidos: 0,
    snapshotsAlfa: 0,
    config: 0
  };
  const globalDrivers = new Map();
  const daySummaries = new Map();

  function touchDay(id, date, unidade) {
    if(!daySummaries.has(id)) {
      daySummaries.set(id, {
        data: date,
        unidade,
        totalMotoristas: 0,
        totalCtes: 0,
        totalRealizadas: 0,
        totalPendentes: 0,
        totalAuditadas: 0,
        totalRetidos: 0,
        sources: [],
        migratedAt: now,
        schemaVersion: 2
      });
    }
    return daySummaries.get(id);
  }

  Object.entries(collections.conferencias || {}).forEach(([key, rec]) => {
    const date = parseDateFromKey(key, rec);
    if(!date) return;
    const unidade = rec.unidade || '231';
    const opId = dayId(date, unidade);
    const summary = touchDay(opId, date, unidade);
    if(!summary.sources.includes('conferencias')) summary.sources.push('conferencias');
    const rows = Array.isArray(rec.rows) ? rec.rows : [];
    rows.forEach(row => {
      const driver = normalizeDriver(row, date, unidade, 'conferencias');
      if(!driver.nome) return;
      docs.push({path: `operacaoDias/${opId}/motoristas/${driver.id}`, data: driver});
      globalDrivers.set(driver.id, {
        id: driver.id,
        nome: driver.nome,
        placaAtual: driver.placa,
        whatsapp: row.whatsapp || row.celular || '',
        ativo: true,
        updatedAt: now,
        source: 'migration'
      });
      summary.totalMotoristas += 1;
      summary.totalCtes += driver.ctes;
      summary.totalRealizadas += driver.realizadas;
      summary.totalPendentes += pendingCount(driver);
      summary.totalAuditadas += driver.auditadas;
      stats.motoristasDia += 1;
    });
  });

  Object.entries(collections.alfaEntregas || {}).forEach(([key, snap]) => {
    const date = snap.data || key.split('_')[0];
    const unidade = snap.unidade || key.split('_')[1] || '231';
    const opId = dayId(date, unidade);
    const summary = touchDay(opId, date, unidade);
    if(!summary.sources.includes('alfaEntregas')) summary.sources.push('alfaEntregas');
    docs.push({path: `integracoes/alfa/dias/${opId}`, data: {...snap, migratedAt: now, schemaVersion: 2}});
    stats.snapshotsAlfa += 1;

    const driversByPlate = new Map();
    (Array.isArray(snap.motoristas) ? snap.motoristas : []).forEach(row => {
      const driver = normalizeDriver(row, date, unidade, 'alfa');
      if(!driver.nome) return;
      driversByPlate.set(driver.placa, driver);
      docs.push({path: `operacaoDias/${opId}/motoristas/${driver.id}`, data: driver});
      globalDrivers.set(driver.id, {
        id: driver.id,
        nome: driver.nome,
        placaAtual: driver.placa,
        whatsapp: '',
        ativo: true,
        updatedAt: now,
        source: 'alfa'
      });
      stats.motoristasDia += 1;
    });

    (Array.isArray(snap.entregas) ? snap.entregas : []).forEach(delivery => {
      const driver = driversByPlate.get(delivery.placa || '') || null;
      const cte = normalizeCte(delivery, date, unidade, driver);
      if(!cte) return;
      docs.push({path: `operacaoDias/${opId}/ctes/${cte.id}`, data: cte});
      stats.ctes += 1;
      if(isRetido(cte)) {
        docs.push({
          path: `retidos/${cte.id}`,
          data: {
            cte: cte.cte,
            destinatario: cte.destinatario,
            retidoDesde: cte.dataHora || date,
            motorista: cte.motorista,
            placa: cte.placa,
            local: cte.caixa || '',
            status: 'pendente',
            origem: 'alfa',
            operacaoDiaId: opId,
            migratedAt: now
          }
        });
        summary.totalRetidos += 1;
        stats.retidos += 1;
      }
    });
  });

  Object.entries(collections.config || {}).forEach(([key, data]) => {
    docs.push({path: `config/${key}`, data: {...data, schemaVersion: data.schemaVersion || 2}});
    stats.config += 1;
  });

  daySummaries.forEach((summary, id) => {
    docs.push({path: `operacaoDias/${id}`, data: summary});
    stats.dias += 1;
  });

  globalDrivers.forEach(driver => {
    docs.push({path: `motoristas/${driver.id}`, data: driver});
    stats.motoristasGlobais += 1;
  });

  const deduped = new Map();
  docs.forEach(doc => deduped.set(doc.path, doc));
  const uniqueDocs = Array.from(deduped.values());
  stats = {
    dias: uniqueDocs.filter(doc => /^operacaoDias\/[^/]+$/.test(doc.path)).length,
    motoristasDia: uniqueDocs.filter(doc => /^operacaoDias\/[^/]+\/motoristas\/[^/]+$/.test(doc.path)).length,
    motoristasGlobais: uniqueDocs.filter(doc => /^motoristas\/[^/]+$/.test(doc.path)).length,
    ctes: uniqueDocs.filter(doc => /^operacaoDias\/[^/]+\/ctes\/[^/]+$/.test(doc.path)).length,
    retidos: uniqueDocs.filter(doc => /^retidos\/[^/]+$/.test(doc.path)).length,
    snapshotsAlfa: uniqueDocs.filter(doc => /^integracoes\/alfa\/dias\/[^/]+$/.test(doc.path)).length,
    config: uniqueDocs.filter(doc => /^config\/[^/]+$/.test(doc.path)).length
  };

  return {docs: uniqueDocs, stats};
}

function summarizeCollections(collections) {
  const conferencias = Object.entries(collections.conferencias || {});
  const alfa = Object.entries(collections.alfaEntregas || {});
  const config = Object.keys(collections.config || {}).length;
  let rows = 0;
  let ctesDeclarados = 0;
  let alfaDrivers = 0;
  let alfaDeliveries = 0;
  let retidos = 0;

  conferencias.forEach(([, rec]) => {
    (Array.isArray(rec.rows) ? rec.rows : []).forEach(row => {
      rows += 1;
      ctesDeclarados += Number(row.ctes || 0);
    });
  });
  alfa.forEach(([, snap]) => {
    alfaDrivers += Array.isArray(snap.motoristas) ? snap.motoristas.length : 0;
    const entregas = Array.isArray(snap.entregas) ? snap.entregas : [];
    alfaDeliveries += entregas.length;
    retidos += entregas.filter(isRetido).length;
  });

  return {
    conferencias: conferencias.length,
    alfaSnapshots: alfa.length,
    configDocs: config,
    rowsMotoristasEmConferencias: rows,
    ctesDeclaradosEmConferencias: ctesDeclarados,
    motoristasEmSnapshotsAlfa: alfaDrivers,
    ctesDetalhadosEmSnapshotsAlfa: alfaDeliveries,
    retidosDetectados: retidos
  };
}

module.exports = {
  buildMigrationPlan,
  summarizeCollections
};
