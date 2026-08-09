/*
   WHATSAPP OPERACIONAL
   Gera mensagens prontas para motoristas sem usar API oficial.
*/
(function() {
  const WHATSAPP_ALERT_HOUR = 18;
  const WHATSAPP_PENDING_LIMIT = 5;
  const WHATSAPP_ALERT_KEY = 'conf_whatsapp_alert_seen_v1';

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

  function formatPhone(value) {
    const phone = normalizeWhatsApp(value);
    if(!phone) return '';
    if(phone.length === 13) return `+${phone.slice(0,2)} (${phone.slice(2,4)}) ${phone.slice(4,9)}-${phone.slice(9)}`;
    if(phone.length === 12) return `+${phone.slice(0,2)} (${phone.slice(2,4)}) ${phone.slice(4,8)}-${phone.slice(8)}`;
    return `+${phone}`;
  }

  function findDriverContact(name) {
    const db = typeof loadCadDB === 'function' ? loadCadDB() : [];
    const wanted = normName(name);
    return db.find(d => normName(d.nome) === wanted) ||
      db.find(d => normName(d.nome).includes(wanted) || wanted.includes(normName(d.nome)));
  }

  function pendingCount(row) {
    const real = typeof getRowRealizadas === 'function'
      ? getRowRealizadas(row)
      : (row.realizadas || 0);
    return Math.max(0, (row.ctes || 0) - real);
  }

  function buildMessage(row, pendentes) {
    const firstName = (row.nome || '').split(' ')[0] || 'motorista';
    return `Boa noite, ${firstName}. Consta em nosso acompanhamento ${pendentes} conhecimento(s) sem baixa. Preciso que a baixa dos conhecimentos seja realizada o quanto antes, desde ja agradeco.`;
  }

  function buildWhatsAppUrl(phone, message) {
    return `https://wa.me/${normalizeWhatsApp(phone)}?text=${encodeURIComponent(message)}`;
  }

  function getWhatsAppCandidates(limit = WHATSAPP_PENDING_LIMIT) {
    if(!Array.isArray(rows) || !rows.length) return [];
    return rows.map(row => {
      const pendentes = pendingCount(row);
      const contact = findDriverContact(row.nome);
      const phone = contact ? normalizeWhatsApp(contact.celular || contact.whatsapp || contact.phone) : '';
      return {
        row,
        nome: row.nome,
        placa: row.placa || '',
        pendentes,
        contact,
        phone,
        message: buildMessage(row, pendentes)
      };
    }).filter(item => item.pendentes > limit)
      .sort((a, b) => b.pendentes - a.pendentes);
  }

  function renderWhatsAppAlerts() {
    const box = document.getElementById('whatsappAlertsBox');
    const body = document.getElementById('whatsappAlertsBody');
    const summary = document.getElementById('whatsappAlertsSummary');
    if(!box || !body || !summary) return;

    const items = getWhatsAppCandidates();
    summary.textContent = items.length
      ? `${items.length} motorista(s) acima de ${WHATSAPP_PENDING_LIMIT} pendencias`
      : 'Nenhum alerta WhatsApp no momento';

    if(!items.length) {
      body.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:28px;color:var(--green);font-weight:700">Todos abaixo do limite de alerta.</td></tr>`;
      return;
    }

    body.innerHTML = items.map(item => {
      const phoneLabel = item.phone ? formatPhone(item.phone) : 'Contato nao cadastrado';
      const action = item.phone
        ? `<a class="btn btn-green btn-sm" target="_blank" rel="noopener" href="${buildWhatsAppUrl(item.phone, item.message)}">Abrir WhatsApp</a>`
        : `<button class="btn btn-outline btn-sm" onclick="showPage('cadmotoristas');setTimeout(()=>prefillCadMotorista('${escJs(item.nome)}','${escJs(item.placa)}'),50)">Cadastrar contato</button>`;
      return `<tr>
        <td><span class="driver-name">${escHtml(item.nome)}</span></td>
        <td><span class="plate">${escHtml(item.placa || '-')}</span></td>
        <td><span style="font-weight:800;color:var(--red)">${item.pendentes}</span></td>
        <td>${escHtml(phoneLabel)}</td>
        <td style="font-size:12px;color:var(--text2)">${escHtml(item.message)}</td>
        <td>${action}</td>
      </tr>`;
    }).join('');
  }

  function prefillCadMotorista(nome, placa) {
    const nameEl = document.getElementById('cadNome');
    const plateEl = document.getElementById('cadPlaca');
    const phoneEl = document.getElementById('cadCelular');
    if(nameEl && !nameEl.value) nameEl.value = nome || '';
    if(plateEl && !plateEl.value) plateEl.value = placa || '';
    if(phoneEl) phoneEl.focus();
  }

  function maybeShowScheduledWhatsAppAlert() {
    const now = new Date();
    if(now.getHours() < WHATSAPP_ALERT_HOUR) return;
    const key = `${todayKey()}_${WHATSAPP_ALERT_HOUR}`;
    if(localStorage.getItem(WHATSAPP_ALERT_KEY) === key) return;
    const items = getWhatsAppCandidates();
    if(!items.length) return;
    localStorage.setItem(WHATSAPP_ALERT_KEY, key);
    if(typeof toast === 'function') {
      toast(`${items.length} motorista(s) precisam de alerta WhatsApp.`, 't-amber');
    }
  }

  function openWhatsAppAlerts() {
    renderWhatsAppAlerts();
    showPage('pendentes');
  }

  function escJs(value) {
    return (value || '').toString().replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  window.normalizeWhatsApp = normalizeWhatsApp;
  window.formatPhone = formatPhone;
  window.findDriverContact = findDriverContact;
  window.renderWhatsAppAlerts = renderWhatsAppAlerts;
  window.openWhatsAppAlerts = openWhatsAppAlerts;
  window.prefillCadMotorista = prefillCadMotorista;
  window.maybeShowScheduledWhatsAppAlert = maybeShowScheduledWhatsAppAlert;

  window.addEventListener('DOMContentLoaded', () => {
    setInterval(maybeShowScheduledWhatsAppAlert, 60 * 1000);
  });
})();
