(function() {
  const WHATSAPP_PENDING_LIMIT = 5;
  const els = {};
  let db = null;
  let currentRecord = null;
  let contacts = [];
  let alerts = [];
  let activeFilter = 'all';
  let unsubscribeToday = null;

  function $(id) {
    return document.getElementById(id);
  }

  function initEls() {
    els.syncPill = $('syncPill');
    els.currentDate = $('currentDate');
    els.summaryGrid = $('summaryGrid');
    els.alertList = $('alertList');
    els.alertCount = $('alertCount');
    els.refreshBtn = $('refreshBtn');
    els.toast = $('toast');
  }

  function setSync(text, cls) {
    if(!els.syncPill) return;
    els.syncPill.textContent = text;
    els.syncPill.className = `sync-pill ${cls || ''}`.trim();
  }

  function toast(message) {
    if(!els.toast) return;
    els.toast.textContent = message;
    els.toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => els.toast.classList.remove('show'), 2600);
  }

  function todayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  function formatDate(key) {
    if(!key) return '--/--/----';
    const dateStr = key.split('__')[0];
    const d = new Date(`${dateStr}T12:00:00`);
    if(Number.isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function esc(value) {
    return (value || '').toString()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function normName(value) {
    return (value || '').toString().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function digits(value) {
    return (value || '').toString().replace(/\D/g, '');
  }

  function normalizeWhatsApp(value) {
    const onlyDigits = digits(value);
    if(!onlyDigits) return '';
    if(onlyDigits.startsWith('55')) return onlyDigits;
    if(onlyDigits.length === 10 || onlyDigits.length === 11) return `55${onlyDigits}`;
    return onlyDigits;
  }

  function buildWhatsAppUrl(phone, message) {
    return `https://wa.me/${normalizeWhatsApp(phone)}?text=${encodeURIComponent(message)}`;
  }

  function findContact(row) {
    const wantedName = normName(row.nome);
    const plate = (row.placa || '').toString().toUpperCase().trim();
    return contacts.find(c => plate && (c.placa || '').toString().toUpperCase().trim() === plate) ||
      contacts.find(c => normName(c.nome) === wantedName) ||
      contacts.find(c => {
        const name = normName(c.nome);
        return name && wantedName && (name.includes(wantedName) || wantedName.includes(name));
      });
  }

  function getRealizadas(row) {
    if((row.realizadas || 0) > 0) return row.realizadas || 0;
    const status = row.statusPrestacao || row.status || '';
    return status === 'Retornou' ? (row.ctes || 0) : 0;
  }

  function firstName(name) {
    return (name || '').split(' ')[0] || 'motorista';
  }

  function buildMessage(row, pendentes) {
    return `Boa noite, ${firstName(row.nome)}. Consta em nosso acompanhamento ${pendentes} conhecimento(s) sem baixa. Preciso que a baixa dos conhecimentos seja realizada o quanto antes, desde ja agradeco.`;
  }

  async function initFirebase() {
    try {
      const firebaseConfig = {
        apiKey: window.__FB_API_KEY__ || '',
        authDomain: window.__FB_AUTH_DOMAIN__ || '',
        projectId: window.__FB_PROJECT_ID__ || '',
        storageBucket: window.__FB_STORAGE_BUCKET__ || '',
        messagingSenderId: window.__FB_MESSAGING_SENDER_ID__ || '',
        appId: window.__FB_APP_ID__ || ''
      };
      if(!firebase.apps.length) firebase.initializeApp(firebaseConfig);
      await firebase.auth().signInAnonymously();
      db = firebase.firestore();
      setSync('Online', 'ok');
      await refreshAll();
      startTodayListener();
    } catch(err) {
      console.warn('Mobile Firebase error:', err);
      setSync('Offline', 'bad');
      renderError('Nao foi possivel conectar ao Firebase.');
    }
  }

  async function refreshAll() {
    if(!db) return;
    setSync('Atualizando...', 'warn');
    await Promise.all([loadContacts(), loadLatestConference()]);
    buildAlerts();
    renderAll();
    setSync('Online', 'ok');
  }

  async function loadContacts() {
    contacts = [];
    try {
      const snap = await db.collection('motoristas').get();
      snap.forEach(doc => contacts.push({ id: doc.id, ...doc.data() }));
    } catch(err) {
      console.warn('Contacts load error:', err);
    }
  }

  async function loadLatestConference() {
    currentRecord = null;
    const snap = await db.collection('conferencias').get();
    const records = [];
    snap.forEach(doc => {
      const data = doc.data();
      if(data && Array.isArray(data.rows)) records.push({ key: doc.id, ...data });
    });
    records.sort((a, b) => {
      const aTime = new Date(a.saved || a.date || a.key.split('__')[0]).getTime() || 0;
      const bTime = new Date(b.saved || b.date || b.key.split('__')[0]).getTime() || 0;
      return bTime - aTime;
    });
    currentRecord = records[0] || null;
  }

  function startTodayListener() {
    if(unsubscribeToday) unsubscribeToday();
    unsubscribeToday = db.collection('conferencias').doc(todayKey()).onSnapshot(snap => {
      if(!snap.exists) return;
      const data = snap.data();
      if(!data || !Array.isArray(data.rows)) return;
      currentRecord = { key: snap.id, ...data };
      buildAlerts();
      renderAll();
      setSync('Tempo real', 'ok');
    }, err => console.warn('Mobile listener error:', err));
  }

  function buildAlerts() {
    alerts = [];
    if(!currentRecord || !Array.isArray(currentRecord.rows)) return;

    currentRecord.rows.forEach(row => {
      const ctes = row.ctes || 0;
      const realizadas = getRealizadas(row);
      const pendentes = Math.max(0, ctes - realizadas);
      const status = row.statusPrestacao || row.status || '';
      const occCount = (row.occCodes || []).filter(Boolean).length;
      const contact = findContact(row);
      const phone = contact ? normalizeWhatsApp(contact.celular || contact.whatsapp || contact.phone) : '';

      if(pendentes > WHATSAPP_PENDING_LIMIT) {
        alerts.push({
          type: 'whatsapp',
          severity: 'critical',
          title: row.nome || 'Motorista',
          badge: 'WhatsApp',
          row,
          pendentes,
          message: `${pendentes} CTEs pendentes. Acima do limite operacional de ${WHATSAPP_PENDING_LIMIT}.`,
          action: phone ? { label: 'Abrir WhatsApp', url: buildWhatsAppUrl(phone, buildMessage(row, pendentes)) } : null
        });
      } else if(pendentes > 0) {
        alerts.push({
          type: 'status',
          severity: 'warning',
          title: row.nome || 'Motorista',
          badge: 'Pendente',
          row,
          pendentes,
          message: `${pendentes} CTEs ainda sem baixa.`
        });
      }

      if(occCount > 0) {
        alerts.push({
          type: 'occurrence',
          severity: 'warning',
          title: row.nome || 'Motorista',
          badge: 'Ocorrencia',
          row,
          pendentes,
          message: `${occCount} ocorrencia(s) registrada(s): ${(row.occCodes || []).join(', ')}.`
        });
      }

      if(!status) {
        alerts.push({
          type: 'status',
          severity: 'warning',
          title: row.nome || 'Motorista',
          badge: 'Sem status',
          row,
          pendentes,
          message: 'Prestacao de contas ainda nao marcada.'
        });
      } else if(status === 'Nao Retornou' || status === 'Não Retornou') {
        alerts.push({
          type: 'critical',
          severity: 'critical',
          title: row.nome || 'Motorista',
          badge: 'Nao retornou',
          row,
          pendentes,
          message: 'Motorista marcado como nao retornou.'
        });
      }
    });

    alerts.sort((a, b) => {
      const aScore = (a.severity === 'critical' ? 100 : 0) + (a.pendentes || 0);
      const bScore = (b.severity === 'critical' ? 100 : 0) + (b.pendentes || 0);
      return bScore - aScore;
    });
  }

  function summary() {
    const rows = currentRecord && Array.isArray(currentRecord.rows) ? currentRecord.rows : [];
    const totalCtes = rows.reduce((sum, r) => sum + (r.ctes || 0), 0);
    const totalReal = rows.reduce((sum, r) => sum + getRealizadas(r), 0);
    const pendentes = Math.max(0, totalCtes - totalReal);
    const critical = alerts.filter(a => a.severity === 'critical').length;
    const occ = rows.filter(r => (r.occCodes || []).length > 0).length;
    return { rows, totalCtes, totalReal, pendentes, critical, occ };
  }

  function renderAll() {
    renderSummary();
    renderAlerts();
  }

  function renderSummary() {
    const s = summary();
    if(els.currentDate) els.currentDate.textContent = formatDate((currentRecord && (currentRecord.date || currentRecord.key)) || '');
    els.summaryGrid.innerHTML = `
      <div class="summary-card red"><span>Criticos</span><strong>${s.critical}</strong><em>alertas urgentes</em></div>
      <div class="summary-card amber"><span>Pendentes</span><strong>${s.pendentes}</strong><em>CTEs sem baixa</em></div>
      <div class="summary-card blue"><span>Motoristas</span><strong>${s.rows.length}</strong><em>na conferencia</em></div>
      <div class="summary-card green"><span>Realizadas</span><strong>${s.totalReal}</strong><em>de ${s.totalCtes} CTEs</em></div>
    `;
  }

  function renderAlerts() {
    const filtered = activeFilter === 'all'
      ? alerts
      : activeFilter === 'critical'
        ? alerts.filter(a => a.severity === 'critical')
        : alerts.filter(a => a.type === activeFilter);

    els.alertCount.textContent = filtered.length;
    if(!currentRecord) {
      els.alertList.innerHTML = '<div class="empty-state">Nenhuma conferencia encontrada no Firebase.</div>';
      return;
    }
    if(!filtered.length) {
      els.alertList.innerHTML = '<div class="empty-state">Nenhum alerta para este filtro.</div>';
      return;
    }

    els.alertList.innerHTML = filtered.map(item => {
      const row = item.row || {};
      const action = item.action
        ? `<div class="alert-actions"><a href="${esc(item.action.url)}" target="_blank" rel="noopener">${esc(item.action.label)}</a></div>`
        : '';
      return `
        <article class="alert-card ${item.type === 'whatsapp' ? 'whatsapp' : item.type === 'occurrence' ? 'occurrence' : item.severity === 'critical' ? 'critical' : 'status'}">
          <div class="alert-body">
            <div class="alert-top">
              <div class="alert-title">${esc(item.title)}</div>
              <span class="alert-badge">${esc(item.badge)}</span>
            </div>
            <div class="alert-meta">
              <span>Placa ${esc(row.placa || '--')}</span>
              <span>${row.ctes || 0} CTEs</span>
              <span>${item.pendentes || 0} pend.</span>
            </div>
            <p class="alert-msg">${esc(item.message)}</p>
          </div>
          ${action}
        </article>
      `;
    }).join('');
  }

  function renderError(message) {
    els.summaryGrid.innerHTML = '';
    els.alertList.innerHTML = `<div class="empty-state">${esc(message)}</div>`;
    els.alertCount.textContent = '0';
  }

  function bindEvents() {
    els.refreshBtn.addEventListener('click', () => {
      refreshAll().then(() => toast('Alertas atualizados.'));
    });
    document.querySelectorAll('.alert-tabs button').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.alert-tabs button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeFilter = btn.dataset.filter || 'all';
        renderAlerts();
      });
    });
  }

  window.addEventListener('DOMContentLoaded', () => {
    initEls();
    bindEvents();
    initFirebase();
  });
})();
