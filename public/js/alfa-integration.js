/*
   INTEGRACAO ALFA
   Le snapshots coletados do portal da Alfa no Firestore e carrega o dashboard.
*/
(function() {
  const COLLECTION = 'alfaEntregas';
  const DEFAULT_UNIDADE = '231';
  const LS_LAST_DELIVERIES = 'alfa_entregas_last_seen_v1';

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function docId(date, unidade) {
    return `${date}_${unidade}`;
  }

  function hasFirebaseConfig() {
    return !!(
      window.__FB_API_KEY__ &&
      window.__FB_PROJECT_ID__ &&
      window.firebase &&
      firebase.firestore
    );
  }

  async function ensureFirebaseReady() {
    if(!hasFirebaseConfig()) return null;
    if(!firebase.apps.length) {
      firebase.initializeApp({
        apiKey: window.__FB_API_KEY__,
        authDomain: window.__FB_AUTH_DOMAIN__,
        projectId: window.__FB_PROJECT_ID__,
        storageBucket: window.__FB_STORAGE_BUCKET__,
        messagingSenderId: window.__FB_MESSAGING_SENDER_ID__,
        appId: window.__FB_APP_ID__
      });
    }
    if(firebase.auth && !firebase.auth().currentUser) {
      try { await firebase.auth().signInAnonymously(); } catch(e) {}
    }
    return firebase.firestore();
  }

  function normalizeDriver(item, index) {
    const details = Array.isArray(item.entregas) ? item.entregas : [];
    return {
      id: index,
      nome: (item.motorista || item.nome || '').toString().trim(),
      placa: (item.placa || '').toString().trim(),
      ctes: parseInt(item.qtd_ctes ?? item.ctes ?? details.length, 10) || 0,
      realizadas: parseInt(item.qtd_realizadas ?? item.realizadas, 10) || 0,
      auditadas: parseInt(item.qtd_auditada_veiculo ?? item.auditadas, 10) || 0,
      status: item.statusPrestacao || item.status || '',
      occCodes: Array.isArray(item.occCodes) ? item.occCodes : [],
      obs: item.obs || '',
      alfaSync: {
        source: 'alfa',
        data: item.data || '',
        unidade: item.unidade || DEFAULT_UNIDADE,
        url_entregas: item.url_entregas || '',
        entregas: details
      }
    };
  }

  function mapSnapshotToRows(snapshot) {
    const drivers = Array.isArray(snapshot.motoristas) ? snapshot.motoristas : [];
    const deliveries = Array.isArray(snapshot.entregas) ? snapshot.entregas : [];
    const byPlate = new Map();

    deliveries.forEach(delivery => {
      const key = (delivery.placa || '').toString().trim();
      if(!key) return;
      if(!byPlate.has(key)) byPlate.set(key, []);
      byPlate.get(key).push(delivery);
    });

    return drivers.map((driver, index) => normalizeDriver({
      ...driver,
      data: snapshot.data,
      unidade: snapshot.unidade,
      entregas: byPlate.get((driver.placa || '').toString().trim()) || []
    }, index)).filter(r => r.nome);
  }

  function loadSeen() {
    try { return JSON.parse(localStorage.getItem(LS_LAST_DELIVERIES) || '{}'); }
    catch { return {}; }
  }

  function saveSeen(seen) {
    localStorage.setItem(LS_LAST_DELIVERIES, JSON.stringify(seen));
  }

  function normalizeText(value) {
    return (value || '').toString().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ').trim();
  }

  function notifyNewDeliveries(snapshot) {
    if(typeof toast !== 'function') return;
    const deliveries = Array.isArray(snapshot.entregas) ? snapshot.entregas : [];
    const seen = loadSeen();
    const keyPrefix = docId(snapshot.data || todayIso(), snapshot.unidade || DEFAULT_UNIDADE);
    let newDelivered = 0;

    deliveries.forEach(item => {
      const status = normalizeText(item.status);
      if(status !== 'entregue') return;
      const key = `${keyPrefix}_${item.placa || ''}_${item.cte || ''}`;
      if(seen[key]) return;
      seen[key] = item.updatedAt || snapshot.updatedAt || new Date().toISOString();
      newDelivered += 1;
    });

    if(newDelivered > 0) {
      toast(`${newDelivered} entrega(s) atualizada(s) pela Alfa.`, 't-green');
      saveSeen(seen);
    }
  }

  function applyAlfaSnapshot(snapshot, options = {}) {
    if(!snapshot) return false;
    const nextRows = mapSnapshotToRows(snapshot);
    if(!nextRows.length) return false;

    rows = nextRows;
    document.getElementById('importSection').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    renderDashboard();
    showPage('today');

    const dbLocal = typeof loadDB === 'function' ? loadDB() : {};
    const key = snapshot.data || todayIso();
    dbLocal[key] = {
      date: key,
      rows,
      saved: new Date().toISOString(),
      origem: 'alfa',
      alfaUpdatedAt: snapshot.updatedAt || ''
    };
    if(typeof saveDB === 'function') saveDB(dbLocal);
    localStorage.setItem(AS_KEY, JSON.stringify(dbLocal[key]));

    if(options.notify !== false) {
      notifyNewDeliveries(snapshot);
      if(typeof toast === 'function') {
        toast(`Dados Alfa carregados: ${rows.length} motorista(s).`, 't-green');
      }
    }
    return true;
  }

  async function loadAlfaSnapshot(date = todayIso(), unidade = DEFAULT_UNIDADE, options = {}) {
    const db = await ensureFirebaseReady();
    if(!db) {
      if(typeof toast === 'function') toast('Firebase nao configurado para integracao Alfa.', 't-amber');
      return null;
    }
    const snap = await db.collection(COLLECTION).doc(docId(date, unidade)).get();
    if(!snap.exists) {
      if(options.notify !== false && typeof toast === 'function') {
        toast('Nenhum snapshot Alfa encontrado para hoje.', 't-amber');
      }
      return null;
    }
    const data = snap.data();
    applyAlfaSnapshot(data, options);
    return data;
  }

  function listenAlfaSnapshot(date = todayIso(), unidade = DEFAULT_UNIDADE) {
    ensureFirebaseReady().then(db => {
      if(!db) return;
      db.collection(COLLECTION).doc(docId(date, unidade)).onSnapshot(snap => {
        if(!snap.exists) return;
        applyAlfaSnapshot(snap.data(), {notify: true});
      }, err => console.warn('Alfa sync listener error:', err));
    });
  }

  window.alfaLoadToday = () => loadAlfaSnapshot(todayIso(), DEFAULT_UNIDADE, {notify: true});
  window.alfaApplySnapshot = applyAlfaSnapshot;

  window.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => listenAlfaSnapshot(todayIso(), DEFAULT_UNIDADE), 2500);
  });
})();
