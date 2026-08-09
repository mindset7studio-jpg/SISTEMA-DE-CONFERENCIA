const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_COLLECTIONS = ['conferencias', 'alfaEntregas', 'config'];

function readTextIfExists(filePath) {
  try {
    if(fs.existsSync(filePath)) return fs.readFileSync(filePath, 'utf8');
  } catch {}
  return '';
}

function loadFirebaseConfig() {
  const files = [
    path.join(ROOT, 'public', 'js', 'firebase-keys.local.js'),
    path.join(ROOT, 'public', 'js', 'firebase-keys.web.js')
  ];
  const text = files.map(readTextIfExists).join('\n');
  const pick = name => {
    const re = new RegExp(`window\\.__FB_${name}__\\s*=\\s*["']([^"']+)["']`);
    const match = text.match(re);
    return match ? match[1] : '';
  };
  const cfg = {
    apiKey: process.env.FB_API_KEY || pick('API_KEY'),
    projectId: process.env.FB_PROJECT_ID || pick('PROJECT_ID'),
    authDomain: process.env.FB_AUTH_DOMAIN || pick('AUTH_DOMAIN'),
    storageBucket: process.env.FB_STORAGE_BUCKET || pick('STORAGE_BUCKET'),
    messagingSenderId: process.env.FB_MESSAGING_SENDER_ID || pick('MESSAGING_SENDER_ID'),
    appId: process.env.FB_APP_ID || pick('APP_ID')
  };
  if(!cfg.apiKey || !cfg.projectId) {
    throw new Error('Firebase config nao encontrada. Configure public/js/firebase-keys.local.js ou variaveis FB_API_KEY/FB_PROJECT_ID.');
  }
  return cfg;
}

async function requestJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let body = null;
  if(text) {
    try { body = JSON.parse(text); } catch { body = text; }
  }
  if(!res.ok) {
    const detail = body && body.error ? `${body.error.status || res.status}: ${body.error.message}` : `${res.status} ${res.statusText}`;
    throw new Error(detail);
  }
  return body;
}

async function getAnonymousToken(apiKey) {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(apiKey)}`;
  const body = await requestJson(url, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({returnSecureToken: true})
  });
  if(!body || !body.idToken) throw new Error('Firebase Auth anonimo nao retornou idToken.');
  return body.idToken;
}

function makeClient(config, token) {
  const baseName = `projects/${config.projectId}/databases/(default)/documents`;
  const base = `https://firestore.googleapis.com/v1/${baseName}`;
  const authHeaders = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  function encodePath(value) {
    return value.split('/').filter(Boolean).map(encodeURIComponent).join('/');
  }

  function documentName(docPath) {
    return `${baseName}/${encodePath(docPath)}`;
  }

  async function listCollection(collectionPath) {
    const result = {};
    let pageToken = '';
    do {
      const url = `${base}/${encodePath(collectionPath)}?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
      const body = await requestJson(url, {headers: authHeaders});
      (body.documents || []).forEach(doc => {
        const id = doc.name.split('/').pop();
        result[id] = fromFirestoreFields(doc.fields || {});
      });
      pageToken = body.nextPageToken || '';
    } while(pageToken);
    return result;
  }

  async function commit(writes) {
    if(!writes.length) return {writeResults: []};
    const url = `${base}:commit`;
    return requestJson(url, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({writes})
    });
  }

  async function setDocuments(docs, batchSize = 400) {
    let written = 0;
    for(let i = 0; i < docs.length; i += batchSize) {
      const batch = docs.slice(i, i + batchSize).map(doc => ({
        update: {name: documentName(doc.path), fields: toFirestoreFields(doc.data)}
      }));
      await commit(batch);
      written += batch.length;
    }
    return written;
  }

  return {listCollection, setDocuments};
}

async function createClient() {
  const config = loadFirebaseConfig();
  const token = await getAnonymousToken(config.apiKey);
  return makeClient(config, token);
}

function fromFirestoreValue(value) {
  if(Object.prototype.hasOwnProperty.call(value, 'nullValue')) return null;
  if(Object.prototype.hasOwnProperty.call(value, 'booleanValue')) return value.booleanValue;
  if(Object.prototype.hasOwnProperty.call(value, 'integerValue')) return Number(value.integerValue);
  if(Object.prototype.hasOwnProperty.call(value, 'doubleValue')) return Number(value.doubleValue);
  if(Object.prototype.hasOwnProperty.call(value, 'timestampValue')) return value.timestampValue;
  if(Object.prototype.hasOwnProperty.call(value, 'stringValue')) return value.stringValue;
  if(value.arrayValue) return (value.arrayValue.values || []).map(fromFirestoreValue);
  if(value.mapValue) return fromFirestoreFields(value.mapValue.fields || {});
  return null;
}

function fromFirestoreFields(fields) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, fromFirestoreValue(value)]));
}

function toFirestoreValue(value) {
  if(value === null || value === undefined) return {nullValue: null};
  if(typeof value === 'boolean') return {booleanValue: value};
  if(typeof value === 'number') {
    if(Number.isInteger(value)) return {integerValue: String(value)};
    return {doubleValue: value};
  }
  if(typeof value === 'string') return {stringValue: value};
  if(Array.isArray(value)) return {arrayValue: {values: value.map(toFirestoreValue)}};
  if(typeof value === 'object') return {mapValue: {fields: toFirestoreFields(value)}};
  return {stringValue: String(value)};
}

function toFirestoreFields(data) {
  return Object.fromEntries(Object.entries(data || {}).map(([key, value]) => [key, toFirestoreValue(value)]));
}

async function loadCollections(collections = DEFAULT_COLLECTIONS) {
  const client = await createClient();
  const output = {};
  for(const name of collections) {
    output[name] = await client.listCollection(name);
  }
  return output;
}

function getArgValue(args, name) {
  const idx = args.indexOf(name);
  if(idx === -1) return '';
  return args[idx + 1] || '';
}

function hasFlag(args, name) {
  return args.includes(name);
}

module.exports = {
  ROOT,
  DEFAULT_COLLECTIONS,
  createClient,
  loadCollections,
  getArgValue,
  hasFlag
};
