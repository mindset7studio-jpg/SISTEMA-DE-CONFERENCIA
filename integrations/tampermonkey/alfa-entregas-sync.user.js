// ==UserScript==
// @name         Portal Conferencia - Alfa Entregas Sync
// @namespace    https://github.com/mindset7studio-jpg/SISTEMA-DE-CONFERENCIA
// @version      0.1.0
// @description  Coleta placas e entregas do acompanhamento Alfa e envia snapshots para o Firestore.
// @match        https://arearestrita.alfatransportes.com.br/acompanhamento/placas-entregas/*
// @require      https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js
// @require      https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js
// @require      https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js
// @grant        none
// ==/UserScript==

(function() {
  'use strict';

  const CONFIG = {
    unidade: '231',
    tipo: 'entregas',
    autoSync: true,
    intervalMs: 5 * 60 * 1000,
    collection: 'alfaEntregas',
    firebase: {
      apiKey: 'COLE_SUA_API_KEY_AQUI',
      authDomain: 'SEU_PROJETO.firebaseapp.com',
      projectId: 'SEU_PROJECT_ID',
      storageBucket: 'SEU_PROJETO.appspot.com',
      messagingSenderId: 'SEU_MESSAGING_SENDER_ID',
      appId: 'SEU_APP_ID'
    }
  };

  let isSyncing = false;
  let panel;

  function todayFromPage() {
    const input = document.querySelector('#data');
    if(input && input.value) return input.value;
    const text = document.body.innerText.match(/Data:\s*(\d{2})\/(\d{2})\/(\d{4})/i);
    if(text) return `${text[3]}-${text[2]}-${text[1]}`;
    return new Date().toISOString().slice(0, 10);
  }

  function txt(el) {
    return (el ? el.textContent : '').replace(/\s+/g, ' ').trim();
  }

  function cleanNumber(value) {
    return parseInt((value || '').toString().replace(/\D+/g, ''), 10) || 0;
  }

  function parsePtDateTime(value) {
    const raw = (value || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const match = raw.match(/(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})(?:\s+as\s+(\d{1,2}):(\d{2}))?/i);
    if(!match) return null;
    const months = {
      janeiro: '01', fevereiro: '02', marco: '03', abril: '04', maio: '05', junho: '06',
      julho: '07', agosto: '08', setembro: '09', outubro: '10', novembro: '11', dezembro: '12'
    };
    const day = match[1].padStart(2, '0');
    const month = months[match[2].toLowerCase()];
    if(!month) return null;
    const hour = (match[4] || '00').padStart(2, '0');
    const minute = (match[5] || '00').padStart(2, '0');
    return `${match[3]}-${month}-${day}T${hour}:${minute}:00`;
  }

  function parsePtDate(value) {
    const dt = parsePtDateTime(value);
    return dt ? dt.slice(0, 10) : null;
  }

  function makeAbsoluteUrl(href) {
    return new URL(href, location.origin).toString();
  }

  async function setAllRowsVisible(root = document) {
    const selector = root.querySelector('.datatable-selector');
    if(!selector) return;
    if([...selector.options].some(opt => opt.value === '0')) {
      selector.value = '0';
      selector.dispatchEvent(new Event('change', {bubbles: true}));
      await new Promise(resolve => setTimeout(resolve, 350));
    }
  }

  function parseDrivers(root = document) {
    const rows = [...root.querySelectorAll('#id_tabela tbody tr')];
    return rows.map(row => {
      const cells = [...row.children];
      const link = row.querySelector('a[href*="/acompanhamento/entregas/"]');
      return {
        placa: txt(row.querySelector('.placa-mercosul .alfanumerico') || cells[0]),
        motorista: txt(cells[1]),
        qtd_ctes: cleanNumber(txt(cells[2])),
        qtd_realizadas: cleanNumber(txt(cells[3])),
        qtd_auditada_veiculo: cleanNumber(txt(cells[4])),
        url_entregas: link ? makeAbsoluteUrl(link.getAttribute('href')) : ''
      };
    }).filter(item => item.placa && item.motorista && item.url_entregas);
  }

  function parseDeliveries(html, fallbackDriver) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const rows = [...doc.querySelectorAll('#id_tabela tbody tr')];
    return rows.map(row => {
      const cells = [...row.children];
      const status = txt(cells[3]);
      const acr = txt(cells[7]).replace(/\s+/g, ' ') || null;
      const bo = txt(cells[8]) || null;
      const caixaText = txt(cells[9]);
      const auditInput = cells[0] ? cells[0].querySelector('input.auditoria') : null;
      const comprovante = row.querySelector('a[title*="comprovante" i]');
      const relatorio = row.querySelector('a[title*="relat" i]');
      const mapa = row.querySelector('a[href*="google.com/maps"]');

      return {
        cte: txt(cells[1]),
        motorista: fallbackDriver.motorista,
        placa: fallbackDriver.placa,
        destinatario: txt(cells[2]),
        status,
        data_hora: parsePtDateTime(txt(cells[4])),
        data_hora_texto: txt(cells[4]),
        documento: txt(cells[5]) || null,
        recebedor: txt(cells[6]) || null,
        acr,
        bo,
        caixa: parsePtDate(caixaText),
        caixa_texto: caixaText,
        pago_a_vista: txt(cells[10]) || null,
        auditada: !!(auditInput && auditInput.checked),
        auditoria_id: auditInput ? auditInput.id : null,
        links: {
          comprovante: comprovante ? makeAbsoluteUrl(comprovante.getAttribute('href')) : null,
          relatorio: relatorio ? makeAbsoluteUrl(relatorio.getAttribute('href')) : null,
          mapa: mapa ? mapa.href : null
        }
      };
    }).filter(item => item.cte);
  }

  async function fetchDeliveries(driver) {
    const response = await fetch(driver.url_entregas, {credentials: 'include'});
    if(!response.ok) throw new Error(`Falha ao buscar ${driver.placa}: HTTP ${response.status}`);
    return parseDeliveries(await response.text(), driver);
  }

  async function ensureFirebase() {
    if(CONFIG.firebase.apiKey.includes('COLE_') || CONFIG.firebase.projectId.includes('SEU_')) {
      throw new Error('Configure os dados do Firebase no script Tampermonkey.');
    }
    if(!firebase.apps.length) firebase.initializeApp(CONFIG.firebase);
    if(!firebase.auth().currentUser) await firebase.auth().signInAnonymously();
    return firebase.firestore();
  }

  function docId(date, unidade) {
    return `${date}_${unidade}`;
  }

  async function syncAlfa() {
    if(isSyncing) return;
    isSyncing = true;
    setStatus('Sincronizando...');
    try {
      await setAllRowsVisible(document);
      const date = todayFromPage();
      const drivers = parseDrivers(document);
      if(!drivers.length) throw new Error('Nenhum motorista encontrado na tabela de placas.');

      const deliveries = [];
      for(const driver of drivers) {
        setStatus(`Lendo ${driver.placa}...`);
        const items = await fetchDeliveries(driver);
        deliveries.push(...items);
        driver.entregas_lidas = items.length;
      }

      const snapshot = {
        data: date,
        unidade: CONFIG.unidade,
        tipo: CONFIG.tipo,
        updatedAt: new Date().toISOString(),
        sourceUrl: location.href,
        motoristas: drivers,
        entregas: deliveries
      };

      const db = await ensureFirebase();
      await db.collection(CONFIG.collection).doc(docId(date, CONFIG.unidade)).set(snapshot);
      setStatus(`OK: ${drivers.length} motorista(s), ${deliveries.length} CTE(s).`);
    } catch(error) {
      console.error('[Alfa Sync]', error);
      setStatus(`Erro: ${error.message}`);
    } finally {
      isSyncing = false;
    }
  }

  function setStatus(message) {
    if(!panel) return;
    panel.querySelector('[data-alfa-status]').textContent = message;
  }

  function createPanel() {
    panel = document.createElement('div');
    panel.style.cssText = [
      'position:fixed',
      'right:16px',
      'bottom:16px',
      'z-index:99999',
      'width:290px',
      'padding:12px',
      'border-radius:10px',
      'background:#111827',
      'color:#fff',
      'font:13px Arial,sans-serif',
      'box-shadow:0 10px 30px rgba(0,0,0,.25)'
    ].join(';');
    panel.innerHTML = `
      <div style="font-weight:700;margin-bottom:8px">Portal Conferencia - Alfa Sync</div>
      <div data-alfa-status style="font-size:12px;color:#d1d5db;margin-bottom:10px">Pronto para sincronizar.</div>
      <button data-alfa-sync style="width:100%;border:0;border-radius:8px;background:#16a34a;color:#fff;font-weight:700;padding:8px;cursor:pointer">Sincronizar agora</button>
    `;
    panel.querySelector('[data-alfa-sync]').addEventListener('click', syncAlfa);
    document.body.appendChild(panel);
  }

  window.addEventListener('load', () => {
    createPanel();
    if(CONFIG.autoSync) {
      setTimeout(syncAlfa, 1200);
      setInterval(syncAlfa, CONFIG.intervalMs);
    }
  });
})();
