import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve('server/data');
fs.mkdirSync(dir, { recursive: true });
const read = (name) => { try { return JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), 'utf8')); } catch { return []; } };
const write = (name, value) => fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(value, null, 2));
function sendJson(response, status, value) { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(value)); }
function body(request, response, callback) { let raw = ''; request.on('data', chunk => raw += chunk); request.on('end', () => { try { const parsed = JSON.parse(raw || '{}'); callback(parsed, raw); } catch { sendJson(response, 400, { ok: false, error: 'JSON tidak valid' }); } }); }
function conflicts() {
  const groups = new Map();
  for (const record of read('attendance')) { const key = `${record.studentId}|${record.tanggal}`; groups.set(key, [...(groups.get(key) || []), record]); }
  const saved = read('attendance-conflicts');
  return [...groups.entries()].filter(([, records]) => new Set(records.map(record => record.status)).size > 1).map(([key, records]) => {
    const participants = [...new Set(records.map(record => record.ownerId || record.deviceId || record.id))];
    const confirmedBy = saved[key]?.confirmedBy || [];
    return { key, studentId: records[0].studentId, tanggal: records[0].tanggal, records, participants, confirmedBy, resolved: participants.every(id => confirmedBy.includes(id)) };
  });
}

// Helper: fetch with retry & exponential backoff for transient errors (5xx, network errors, 429)
// metrics helpers (persisted into server/data/infobip-metrics.json)
function readMetrics() {
  try {
    const file = path.join(dir, 'infobip-metrics.json');
    if (!fs.existsSync(file)) return { successful_requests: 0, retry_attempts: 0, failed_requests: 0, token_fetch_failures: 0 };
    const raw = fs.readFileSync(file, 'utf8');
    return raw ? JSON.parse(raw) : { successful_requests: 0, retry_attempts: 0, failed_requests: 0, token_fetch_failures: 0 };
  } catch (e) { return { successful_requests: 0, retry_attempts: 0, failed_requests: 0, token_fetch_failures: 0 }; }
}
function writeMetrics(metrics) {
  try {
    const file = path.join(dir, 'infobip-metrics.json');
    fs.writeFileSync(file + '.tmp', JSON.stringify(metrics, null, 2), 'utf8');
    fs.renameSync(file + '.tmp', file);
  } catch (e) { console.error('Failed to write metrics', e instanceof Error ? e.message : e); }
}

async function fetchWithRetry(url, options = {}, retries = 3, baseDelay = 300) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    let controller = undefined;
    let timeoutId = undefined;
    try {
      if (typeof AbortController !== 'undefined') {
        controller = new AbortController();
        options.signal = controller.signal;
        timeoutId = setTimeout(() => controller.abort(), 15000);
      }
      const res = await fetch(url, options);
      if (timeoutId) clearTimeout(timeoutId);
      // If success, record metric and return
      if (res.ok) {
        try { const m = readMetrics(); m.successful_requests = (m.successful_requests || 0) + 1; writeMetrics(m); } catch (e) {}
        return res;
      }
      // For 429 (rate limit) or 5xx, consider retry and record
      if (res.status >= 500 || res.status === 429) {
        try { const m = readMetrics(); m.retry_attempts = (m.retry_attempts || 0) + 1; writeMetrics(m); } catch (e) {}
        const retryAfter = res.headers && res.headers.get ? res.headers.get('Retry-After') : null;
        let wait = baseDelay * Math.pow(2, attempt);
        if (retryAfter) {
          const ra = Number(retryAfter);
          if (!Number.isNaN(ra)) wait = Math.max(wait, ra * 1000);
        }
        // jitter
        wait = wait + Math.floor(Math.random() * 100);
        await new Promise(r => setTimeout(r, wait));
        lastError = new Error(`HTTP ${res.status}`);
        continue;
      }
      // For 4xx other than 429, do not retry
      return res;
    } catch (err) {
      if (timeoutId) clearTimeout(timeoutId);
      lastError = err;
      // AbortError or network error -> retry
      // if not last attempt, record retry
      if (attempt < retries) {
        try { const m = readMetrics(); m.retry_attempts = (m.retry_attempts || 0) + 1; writeMetrics(m); } catch (e) {}
      }
      // if last attempt, break
      if (attempt === retries) break;
      const wait = baseDelay * Math.pow(2, attempt) + Math.floor(Math.random() * 100);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
  }
  // If we get here, all retries failed, record failure
  try { const m = readMetrics(); m.failed_requests = (m.failed_requests || 0) + 1; writeMetrics(m); } catch (e) {}
  throw lastError || new Error('fetchWithRetry: unknown error');
}

// OAuth2 client-credentials token fetch + in-memory cache for Infobip (used if no API key provided)
const _infobipTokenCache = { token: null, expiresAt: 0 };
async function getInfobipAccessToken() {
  const now = Date.now();
  if (_infobipTokenCache.token && now < _infobipTokenCache.expiresAt - 5000) return _infobipTokenCache.token;
  const clientId = process.env.INFOBIP_CLIENT_ID;
  const clientSecret = process.env.INFOBIP_CLIENT_SECRET;
  const tokenUrl = process.env.INFOBIP_OAUTH_TOKEN_URL;
  if (!clientId || !clientSecret || !tokenUrl) throw new Error('Infobip OAuth credentials or token URL not configured');
  const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }).toString();
  let res;
  try {
    res = await fetchWithRetry(tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }, 3, 500);
  } catch (err) {
    try { const m = readMetrics(); m.token_fetch_failures = (m.token_fetch_failures || 0) + 1; writeMetrics(m); } catch (e) {}
    throw err;
  }
  const data = await res.json();
  if (!res.ok) {
    try { const m = readMetrics(); m.token_fetch_failures = (m.token_fetch_failures || 0) + 1; writeMetrics(m); } catch (e) {}
    throw new Error(data.error || data.error_description || 'Failed to obtain Infobip access token');
  }
  const token = data.access_token || data.token;
  const expiresIn = Number(data.expires_in || data.expires || 3600);
  _infobipTokenCache.token = token;
  _infobipTokenCache.expiresAt = Date.now() + (Number.isFinite(expiresIn) ? expiresIn * 1000 : 3600 * 1000);
  return token;
}

const server = http.createServer((request, response) => {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (request.method === 'OPTIONS') return response.writeHead(204).end();
  if (request.method === 'GET' && request.url === '/api/health') return sendJson(response, 200, { ok: true, infobipConfigured: Boolean(process.env.INFOBIP_API_KEY && process.env.INFOBIP_WHATSAPP_FROM) });
  if (request.method === 'GET' && request.url === '/api/attendance-conflicts') return sendJson(response, 200, conflicts().filter(item => !item.resolved));
  if (request.method === 'POST' && request.url?.match(/^\/api\/attendance-conflicts\/(.+)\/confirm$/)) return body(request, response, input => {
    const key = decodeURIComponent(request.url.match(/^\/api\/attendance-conflicts\/(.+)\/confirm$/)[1]);
    const saved = read('attendance-conflicts');
    const previous = saved[key] || {};
    const confirmedBy = Array.isArray(previous.confirmedBy) ? previous.confirmedBy : [];
    if (input.deviceId && !confirmedBy.includes(input.deviceId)) confirmedBy.push(input.deviceId);
    saved[key] = { confirmedBy, confirmedAt: new Date().toISOString() };
    write('attendance-conflicts', saved);
    sendJson(response, 200, conflicts().find(item => item.key === key) || { key, confirmedBy, resolved: true });
  });
  if (request.method === 'POST' && request.url === '/api/infobip/attendance') return body(request, response, async (input, raw) => {
    const apiKey = process.env.INFOBIP_API_KEY;
    const baseUrl = String(process.env.INFOBIP_BASE_URL || '8vyr2e.api.infobip.com').replace(/\/$/, '').replace(/^https?:\/\//, '');
    const sender = process.env.INFOBIP_WHATSAPP_FROM;
    const clientId = process.env.INFOBIP_CLIENT_ID;
    const clientSecret = process.env.INFOBIP_CLIENT_SECRET;
    const tokenUrl = process.env.INFOBIP_OAUTH_TOKEN_URL;
    const phone = String(input.phone || '').trim();
    const text = String(input.text || '').trim();
    if (!(apiKey || (clientId && clientSecret && tokenUrl)) || !sender) {
      console.warn('INFOBIP tidak dikonfigurasi; notifikasi WhatsApp dilewati. Set INFOBIP_API_KEY or INFOBIP_CLIENT_ID/INFOBIP_CLIENT_SECRET and INFOBIP_WHATSAPP_FROM untuk mengaktifkan pengiriman.');
      return sendJson(response, 200, { ok: false, skipped: true, error: 'INFOBIP belum dikonfigurasi; notifikasi WhatsApp dilewati.' });
    }
    if (!/^62\d{8,15}$/.test(phone) || !text) return sendJson(response, 400, { ok: false, error: 'Nomor kontak atau pesan tidak valid' });
    try {
      const templateName = input.event === 'pulang' ? process.env.INFOBIP_TEMPLATE_PULANG : process.env.INFOBIP_TEMPLATE_HADIR;
      const content = templateName ? { templateName, templateData: { body: { type: 'POSITIONAL_PARAMETERS', placeholders: [String(input.studentName || ''), String(input.className || ''), String(input.time || '')] } }, language: process.env.INFOBIP_TEMPLATE_LANGUAGE || 'id' } : { text };
      const url = `https://${baseUrl}/whatsapp/1/message/${templateName ? 'template' : 'text'}`;
      let authHeader = null;
      if (apiKey) {
        authHeader = `App ${apiKey}`;
      } else {
        try {
          const token = await getInfobipAccessToken();
          authHeader = `Bearer ${token}`;
        } catch (err) {
          console.error('Failed to obtain Infobip access token', err && err.message ? err.message : err);
          return sendJson(response, 502, { ok: false, error: 'Infobip token error' });
        }
      }
      let upstream;
      try {
        upstream = await fetchWithRetry(url, { method: 'POST', headers: { Authorization: authHeader, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ from: sender, to: phone, content }) }, 3, 500);
      } catch (err) {
        console.error('Infobip fetch failed after retries', err && err.message ? err.message : err);
        return sendJson(response, 502, { ok: false, error: err && err.message ? err.message : 'Infobip tidak dapat dihubungi' });
      }
      const result = await upstream.json();
      if (!upstream.ok) return sendJson(response, 502, { ok: false, error: result.requestError?.serviceException?.text || result.message || 'Infobip menolak pesan' });
      return sendJson(response, 200, { ok: true, messageId: result.messageId || result.messages?.[0]?.messageId, result });
    } catch (error) { return sendJson(response, 502, { ok: false, error: error instanceof Error ? error.message : 'Infobip tidak dapat dihubungi' }); }
  });
  if (request.method === 'POST' && request.url === '/api/infobip/delivery-reports') return body(request, response, (input, raw) => {
    const webhookSecret = process.env.INFOBIP_WEBHOOK_SECRET;
    const headerName = (process.env.INFOBIP_WEBHOOK_HEADER || 'X-Infobip-Signature').toLowerCase();
    if (webhookSecret) {
      try {
        import('node:crypto').then((crypto) => {
          const sig = String(request.headers[headerName] || '');
          const hmacBase64 = crypto.createHmac('sha256', webhookSecret).update(raw || '').digest('base64');
          const hmacHex = crypto.createHmac('sha256', webhookSecret).update(raw || '').digest('hex');
          if (!sig || (sig !== hmacBase64 && sig !== hmacHex)) return sendJson(response, 403, { ok: false, error: 'Invalid webhook signature' });
          // continue processing after verification
          const reports = Array.isArray(input.results) ? input.results : [];
          const stored = read('infobip-delivery-reports');
          const byId = new Map(stored.map(report => [report.messageId, report]));
          for (const report of reports) if (report?.messageId) byId.set(report.messageId, { ...report, receivedAt: new Date().toISOString() });
          write('infobip-delivery-reports', [...byId.values()].slice(-5000));
          sendJson(response, 200, { ok: true, count: reports.length });
        }).catch(() => sendJson(response, 500, { ok: false, error: 'Webhook verification error' }));
        return;
      } catch (err) { return sendJson(response, 500, { ok: false, error: 'Webhook verification error' }); }
    }
    const reports = Array.isArray(input.results) ? input.results : [];
    const stored = read('infobip-delivery-reports');
    const byId = new Map(stored.map(report => [report.messageId, report]));
    for (const report of reports) if (report?.messageId) byId.set(report.messageId, { ...report, receivedAt: new Date().toISOString() });
    write('infobip-delivery-reports', [...byId.values()].slice(-5000));
    sendJson(response, 200, { ok: true, count: reports.length });
  });

  // Expose Infobip metrics for local monitoring
  if (request.method === 'GET' && request.url === '/api/infobip/metrics') return sendJson(response, 200, readMetrics());

  // Backup endpoints: save/read/delete backup file server/data/backup.json
  if (request.method === 'POST' && request.url === '/api/db/backup') return body(request, response, (input) => {
    try {
      const file = path.join(dir, 'backup.json');
      fs.writeFileSync(file + '.tmp', JSON.stringify(input, null, 2), 'utf8');
      fs.renameSync(file + '.tmp', file);
      return sendJson(response, 200, { ok: true, savedAt: new Date().toISOString() });
    } catch (err) {
      console.error('Failed to write backup', err);
      return sendJson(response, 500, { ok: false, error: 'Failed to write backup' });
    }
  });

  if (request.method === 'GET' && request.url === '/api/db/backup') {
    try {
      const file = path.join(dir, 'backup.json');
      if (!fs.existsSync(file)) return sendJson(response, 404, { ok: false, error: 'No backup found' });
      const raw = fs.readFileSync(file, 'utf8');
      const parsed = raw ? JSON.parse(raw) : {};
      return sendJson(response, 200, parsed);
    } catch (err) {
      console.error('Failed to read backup', err);
      return sendJson(response, 500, { ok: false, error: 'Failed to read backup' });
    }
  }

  if (request.method === 'DELETE' && request.url === '/api/db/backup') {
    try {
      const file = path.join(dir, 'backup.json');
      if (fs.existsSync(file)) fs.unlinkSync(file);
      return sendJson(response, 200, { ok: true, deletedAt: new Date().toISOString() });
    } catch (err) {
      console.error('Failed to delete backup', err);
      return sendJson(response, 500, { ok: false, error: 'Failed to delete backup' });
    }
  }

  const data = request.url?.match(/^\/api\/data\/(teachers|students|attendance)$/);
  if (request.method === 'GET' && data) return sendJson(response, 200, read(data[1]));
  const sync = request.url?.match(/^\/api\/sync\/(teachers|students|attendance)$/);
  if (request.method === 'POST' && sync) return body(request, response, input => { const incoming = Array.isArray(input) ? input : []; const records = new Map(read(sync[1]).map(item => [item.id, item])); for (const item of incoming) { const old = records.get(item.id); if (!old || String(item.updatedAt || '') >= String(old.updatedAt || '')) records.set(item.id, item); } write(sync[1], [...records.values()]); sendJson(response, 200, { ok: true, count: incoming.length }); });
  response.writeHead(404); response.end('Not found');
});
server.listen(Number(process.env.PORT || 4174));
