import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import express from 'express';
import selfsigned from 'selfsigned';

const PORT = Number(process.env.PORT || 9005);
const HOST = process.env.HOST || '127.0.0.1';
const root = path.resolve('.');
const dist = path.join(root, 'dist');
const dataDir = path.join(root, 'server', 'data');
const certDir = path.join(root, 'server', 'certs');
const indexFile = path.join(dist, 'index.html');
const keyFile = path.join(certDir, 'localhost-key.pem');
const certFile = path.join(certDir, 'localhost-cert.pem');
const conflictFile = path.join(dataDir, 'attendance-conflicts.json');

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(certDir, { recursive: true });

if (!fs.existsSync(indexFile)) {
  console.error('Build aplikasi belum ditemukan.');
  console.error('Jalankan: npm run start:https');
  process.exit(1);
}

function getLanAddresses() {
  const addresses = [];
  for (const networkList of Object.values(os.networkInterfaces())) {
    for (const network of networkList || []) {
      if (network.family === 'IPv4' && !network.internal) {
        addresses.push(network.address);
      }
    }
  }
  return [...new Set(addresses)];
}

function certificateFilesAreValid() {
  try {
    if (!fs.existsSync(keyFile) || !fs.existsSync(certFile)) return false;
    const key = fs.readFileSync(keyFile, 'utf8');
    const cert = fs.readFileSync(certFile, 'utf8');
    return key.includes('BEGIN PRIVATE KEY') && cert.includes('BEGIN CERTIFICATE');
  } catch {
    return false;
  }
}

async function ensureCertificate() {
  if (certificateFilesAreValid()) return;

  fs.rmSync(keyFile, { force: true });
  fs.rmSync(certFile, { force: true });
  console.log('Membuat sertifikat HTTPS lokal...');

  const altNames = [
    { type: 2, value: 'localhost' },
    { type: 7, ip: '127.0.0.1' },
    ...getLanAddresses().map((address) => ({ type: 7, ip: address }))
  ];

  const pems = await selfsigned.generate(
    [
      { name: 'commonName', value: 'localhost' },
      { name: 'organizationName', value: 'Absensi Siswa Offline' }
    ],
    {
      days: 825,
      keySize: 2048,
      algorithm: 'sha256',
      extensions: [
        { name: 'basicConstraints', cA: true },
        {
          name: 'keyUsage',
          keyCertSign: true,
          digitalSignature: true,
          keyEncipherment: true,
          dataEncipherment: true
        },
        {
          name: 'extKeyUsage',
          serverAuth: true,
          clientAuth: true
        },
        { name: 'subjectAltName', altNames }
      ]
    }
  );

  if (!pems || typeof pems.private !== 'string' || typeof pems.cert !== 'string') {
    throw new Error('Package selfsigned tidak menghasilkan sertifikat yang valid.');
  }

  fs.writeFileSync(keyFile, pems.private, { encoding: 'utf8', mode: 0o600 });
  fs.writeFileSync(certFile, pems.cert, 'utf8');
  console.log('Sertifikat lokal berhasil dibuat di server/certs.');
}

try {
  await ensureCertificate();
} catch (error) {
  console.error('Gagal menyiapkan sertifikat HTTPS.');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const key = fs.readFileSync(keyFile, 'utf8');
const cert = fs.readFileSync(certFile, 'utf8');
const app = express();

// Capture raw body for webhook signature verification while still parsing JSON
app.use(express.json({ limit: '10mb', verify: (req, _res, buf) => { try { req.rawBody = buf.toString(); } catch (e) { req.rawBody = ''; } } }));
app.use((request, response, next) => {
  response.setHeader('Permissions-Policy', 'camera=(self)');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'same-origin');
  next();
});

function readData(name) {
  try {
    const file = path.join(dataDir, `${name}.json`);
    if (!fs.existsSync(file)) return [];
    const content = fs.readFileSync(file, 'utf8');
    if (!content.trim()) return [];
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error(`Gagal membaca ${name}.json:`, error instanceof Error ? error.message : error);
    return [];
  }
}

function writeData(name, value) {
  const file = path.join(dataDir, `${name}.json`);
  const temporaryFile = `${file}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(temporaryFile, file);
}

// Helper: fetch with retry & exponential backoff for transient errors (5xx, network errors, 429)
// metrics helpers (persisted into server/data/infobip-metrics.json)
function readMetrics() {
  try {
    const file = path.join(dataDir, 'infobip-metrics.json');
    if (!fs.existsSync(file)) return { successful_requests: 0, retry_attempts: 0, failed_requests: 0, token_fetch_failures: 0 };
    const raw = fs.readFileSync(file, 'utf8');
    return raw ? JSON.parse(raw) : { successful_requests: 0, retry_attempts: 0, failed_requests: 0, token_fetch_failures: 0 };
  } catch (e) { return { successful_requests: 0, retry_attempts: 0, failed_requests: 0, token_fetch_failures: 0 }; }
}
function writeMetrics(metrics) {
  try {
    const file = path.join(dataDir, 'infobip-metrics.json');
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
      if (res.ok) {
        // successful request
        try { const m = readMetrics(); m.successful_requests = (m.successful_requests || 0) + 1; writeMetrics(m); } catch (e) {}
        return res;
      }
      if (res.status >= 500 || res.status === 429) {
        // record retry attempt
        try { const m = readMetrics(); m.retry_attempts = (m.retry_attempts || 0) + 1; writeMetrics(m); } catch (e) {}
        const retryAfter = res.headers && res.headers.get ? res.headers.get('Retry-After') : null;
        let wait = baseDelay * Math.pow(2, attempt);
        if (retryAfter) {
          const ra = Number(retryAfter);
          if (!Number.isNaN(ra)) wait = Math.max(wait, ra * 1000);
        }
        wait = wait + Math.floor(Math.random() * 100);
        await new Promise(r => setTimeout(r, wait));
        lastError = new Error(`HTTP ${res.status}`);
        continue;
      }
      return res;
    } catch (err) {
      if (timeoutId) clearTimeout(timeoutId);
      lastError = err;
      // on network errors we'll retry (unless last attempt)
      if (attempt < retries) {
        try { const m = readMetrics(); m.retry_attempts = (m.retry_attempts || 0) + 1; writeMetrics(m); } catch (e) {}
      }
      if (attempt === retries) break;
      const wait = baseDelay * Math.pow(2, attempt) + Math.floor(Math.random() * 100);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
  }
  // record final failure
  try { const m = readMetrics(); m.failed_requests = (m.failed_requests || 0) + 1; writeMetrics(m); } catch (e) {}
  throw lastError || new Error('fetchWithRetry: unknown error');
}

// OAuth2 client-credentials token fetch + in-memory cache
const _infobipTokenCache = { token: null, expiresAt: 0 };
async function getInfobipAccessToken() {
  const now = Date.now();
  if (_infobipTokenCache.token && now < _infobipTokenCache.expiresAt - 5000) return _infobipTokenCache.token;
  const clientId = process.env.INFOBIP_CLIENT_ID;
  const clientSecret = process.env.INFOBIP_CLIENT_SECRET;
  const tokenUrl = process.env.INFOBIP_OAUTH_TOKEN_URL; // set this to your Infobip token endpoint
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

function readConflicts() {
  try { return JSON.parse(fs.readFileSync(conflictFile, 'utf8')); } catch { return {}; }
}

function attendanceConflicts() {
  const grouped = new Map();
  for (const record of readData('attendance')) {
    const key = `${record.studentId}|${record.tanggal}`;
    const list = grouped.get(key) || [];
    list.push(record);
    grouped.set(key, list);
  }
  const confirmations = readConflicts();
  return [...grouped.entries()]
    .filter(([, records]) => new Set(records.map(record => `${record.jamMasuk}|${record.jamPulang}|${record.status}`)).size > 1)
    .map(([key, records]) => {
      const participants = [...new Set(records.map(record => record.deviceId || record.id))];
      const confirmation = confirmations[key] || {};
      const confirmedBy = Array.isArray(confirmation.confirmedBy) ? confirmation.confirmedBy : confirmation.confirmedBy ? [confirmation.confirmedBy] : [];
      return { key, studentId: records[0].studentId, tanggal: records[0].tanggal, records, participants, confirmedBy, resolved: participants.every(deviceId => confirmedBy.includes(deviceId)), ...(confirmation.confirmedAt ? { confirmedAt: confirmation.confirmedAt } : {}) };
    });
}

app.get('/api/health', (request, response) => {
  response.json({ ok: true, https: true, infobipConfigured: Boolean(process.env.INFOBIP_API_KEY && process.env.INFOBIP_WHATSAPP_FROM), time: new Date().toISOString() });
});

app.post('/api/telegram/attendance', async (request, response) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = String(request.body?.chatId || '').trim();
  const text = String(request.body?.text || '').trim();
  if (!token) return response.status(503).json({ ok: false, error: 'TELEGRAM_BOT_TOKEN belum dikonfigurasi di server' });
  if (!chatId || !text) return response.status(400).json({ ok: false, error: 'chatId dan text wajib diisi' });
  if (!/^-?\d+$/.test(chatId)) return response.status(400).json({ ok: false, error: 'Kontak siswa harus berupa chat_id Telegram numerik, bukan nomor telepon' });
  try {
    const telegramResponse = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text })
    });
    const result = await telegramResponse.json();
    if (!telegramResponse.ok || !result.ok) return response.status(502).json({ ok: false, error: result.description || 'Telegram menolak pesan' });
    return response.json({ ok: true });
  } catch (error) {
    return response.status(502).json({ ok: false, error: error instanceof Error ? error.message : 'Telegram tidak dapat dihubungi' });
  }
});

app.post('/api/qontak/attendance', async (request, response) => {
  const token = process.env.QONTAK_ACCESS_TOKEN;
  const channelIntegrationId = process.env.QONTAK_CHANNEL_INTEGRATION_ID;
  const apiUrl = process.env.QONTAK_API_URL || 'https://chat.qontak.com/api/open/v1/messages/whatsapp';
  const phone = String(request.body?.phone || '').trim();
  const text = String(request.body?.text || '').trim();
  if (!token || !channelIntegrationId) return response.status(503).json({ ok: false, error: 'QONTAK_ACCESS_TOKEN dan QONTAK_CHANNEL_INTEGRATION_ID belum dikonfigurasi' });
  if (!phone || !text) return response.status(400).json({ ok: false, error: 'phone dan text wajib diisi' });
  try {
    const qontakResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ to_number: phone, channel_integration_id: channelIntegrationId, message: { type: 'text', text } })
    });
    const result = await qontakResponse.json();
    if (!qontakResponse.ok) return response.status(502).json({ ok: false, error: result.message || result.error || 'Qontak menolak pesan' });
    return response.json({ ok: true, result });
  } catch (error) {
    return response.status(502).json({ ok: false, error: error instanceof Error ? error.message : 'Qontak tidak dapat dihubungi' });
  }
});

app.post('/api/infobip/attendance', async (request, response) => {
  const apiKey = process.env.INFOBIP_API_KEY;
  const baseUrl = String(process.env.INFOBIP_BASE_URL || '8vyr2e.api.infobip.com').replace(/\/$/, '').replace(/^https?:\/\//, '');
  const sender = process.env.INFOBIP_WHATSAPP_FROM;
  const clientId = process.env.INFOBIP_CLIENT_ID;
  const clientSecret = process.env.INFOBIP_CLIENT_SECRET;
  const tokenUrl = process.env.INFOBIP_OAUTH_TOKEN_URL;
  const notifyUrl = process.env.INFOBIP_NOTIFY_URL;
  const event = request.body?.event === 'pulang' ? 'pulang' : 'hadir';
  const templateName = event === 'hadir' ? process.env.INFOBIP_TEMPLATE_HADIR : process.env.INFOBIP_TEMPLATE_PULANG;
  const templateLanguage = process.env.INFOBIP_TEMPLATE_LANGUAGE || 'id';
  const templatePlaceholders = [String(request.body?.studentName || ''), String(request.body?.className || ''), String(request.body?.time || '')];
  const phone = String(request.body?.phone || '').trim();
  const text = String(request.body?.text || '').trim();
  if (!(apiKey || (clientId && clientSecret && tokenUrl)) || !sender) {
    console.warn('INFOBIP tidak dikonfigurasi; notifikasi WhatsApp dilewati. Set INFOBIP_API_KEY or INFOBIP_CLIENT_ID/INFOBIP_CLIENT_SECRET and INFOBIP_WHATSAPP_FROM untuk mengaktifkan pengiriman.');
    return response.status(200).json({ ok: false, skipped: true, error: 'INFOBIP belum dikonfigurasi; notifikasi WhatsApp dilewati.' });
  }
  if (!phone || !text) return response.status(400).json({ ok: false, error: 'phone dan text wajib diisi' });
  try {
    const endpoint = templateName ? 'template' : 'text';
    const content = templateName
      ? { templateName, templateData: { body: { type: 'POSITIONAL_PARAMETERS', placeholders: templatePlaceholders } }, language: templateLanguage }
      : { text };
    const url = `https://${baseUrl}/whatsapp/1/message/${endpoint}`;
    let authHeader = null;
    if (apiKey) {
      authHeader = `App ${apiKey}`;
    } else {
      try {
        const token = await getInfobipAccessToken();
        authHeader = `Bearer ${token}`;
      } catch (err) {
        console.error('Failed to obtain Infobip access token', err && err.message ? err.message : err);
        return response.status(502).json({ ok: false, error: 'Infobip token error' });
      }
    }
    let infobipResponse;
    try {
      infobipResponse = await fetchWithRetry(url, {
        method: 'POST',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ from: sender, to: phone, content, ...(notifyUrl ? { notifyUrl } : {}) })
      }, 3, 500);
    } catch (err) {
      console.error('Infobip fetch failed after retries', err && err.message ? err.message : err);
      return response.status(502).json({ ok: false, error: err && err.message ? err.message : 'Infobip tidak dapat dihubungi' });
    }
    const result = await infobipResponse.json();
    if (!infobipResponse.ok) return response.status(502).json({ ok: false, error: result.requestError?.serviceException?.text || result.message || 'Infobip menolak pesan', details: result.requestError?.serviceException?.validationErrors });
    return response.json({ ok: true, messageId: result.messageId || result.messages?.[0]?.messageId, result });
  } catch (error) {
    return response.status(502).json({ ok: false, error: error instanceof Error ? error.message : 'Infobip tidak dapat dihubungi' });
  }
});

app.post('/api/infobip/delivery-reports', async (request, response) => {
  const webhookSecret = process.env.INFOBIP_WEBHOOK_SECRET;
  const headerName = process.env.INFOBIP_WEBHOOK_HEADER || 'X-Infobip-Signature';
  if (webhookSecret) {
    try {
      const sig = String(request.get(headerName) || '');
      const crypto = await import('node:crypto');
      const hmacBase64 = crypto.createHmac('sha256', webhookSecret).update(request.rawBody || '').digest('base64');
      const hmacHex = crypto.createHmac('sha256', webhookSecret).update(request.rawBody || '').digest('hex');
      if (!sig || (sig !== hmacBase64 && sig !== hmacHex)) return response.status(403).json({ ok: false, error: 'Invalid webhook signature' });
    } catch (err) { return response.status(500).json({ ok: false, error: 'Webhook verification error' }); }
  }
  const reports = Array.isArray(request.body?.results) ? request.body.results : [];
  const stored = readData('infobip-delivery-reports');
  const byMessageId = new Map(stored.map((report) => [report.messageId, report]));
  for (const report of reports) {
    if (report?.messageId) byMessageId.set(report.messageId, { ...report, receivedAt: new Date().toISOString() });
  }
  writeData('infobip-delivery-reports', [...byMessageId.values()].slice(-5000));
  return response.status(200).json({ ok: true, count: reports.length });
});

// Expose Infobip metrics for local monitoring
app.get('/api/infobip/metrics', (request, response) => {
  try {
    const metrics = readMetrics();
    return response.json(metrics);
  } catch (err) {
    return response.status(500).json({ ok: false, error: 'Failed to read metrics' });
  }
});

// Backup endpoints: save/read/delete backup file server/data/backup.json
app.post('/api/db/backup', (request, response) => {
  try {
    const payload = request.body || {};
    const file = path.join(dataDir, 'backup.json');
    fs.writeFileSync(file + '.tmp', JSON.stringify(payload, null, 2), 'utf8');
    fs.renameSync(file + '.tmp', file);
    return response.json({ ok: true, savedAt: new Date().toISOString() });
  } catch (err) {
    console.error('Failed to write backup', err);
    return response.status(500).json({ ok: false, error: 'Failed to write backup' });
  }
});

app.get('/api/db/backup', (request, response) => {
  try {
    const file = path.join(dataDir, 'backup.json');
    if (!fs.existsSync(file)) return response.status(404).json({ ok: false, error: 'No backup found' });
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = raw ? JSON.parse(raw) : {};
    return response.json(parsed);
  } catch (err) {
    console.error('Failed to read backup', err);
    return response.status(500).json({ ok: false, error: 'Failed to read backup' });
  }
});

app.delete('/api/db/backup', (request, response) => {
  try {
    const file = path.join(dataDir, 'backup.json');
    if (fs.existsSync(file)) fs.unlinkSync(file);
    return response.json({ ok: true, deletedAt: new Date().toISOString() });
  } catch (err) {
    console.error('Failed to delete backup', err);
    return response.status(500).json({ ok: false, error: 'Failed to delete backup' });
  }
});

app.get('/api/infobip/delivery-status/:messageId', (request, response) => {
  const report = readData('infobip-delivery-reports').find((item) => item.messageId === request.params.messageId);
  if (!report) return response.status(404).json({ ok: false, error: 'Delivery report belum diterima' });
  return response.json({ ok: true, report });
});

app.get('/api/attendance-conflicts', (request, response) => {
  response.json(attendanceConflicts());
});

app.post('/api/attendance-conflicts/:key/confirm', (request, response) => {
  const key = decodeURIComponent(request.params.key);
  const confirmations = readConflicts();
  const deviceId = request.body?.deviceId || 'unknown';
  const previous = confirmations[key] || {};
  const confirmedBy = Array.isArray(previous.confirmedBy) ? previous.confirmedBy : previous.confirmedBy ? [previous.confirmedBy] : [];
  if (!confirmedBy.includes(deviceId)) confirmedBy.push(deviceId);
  confirmations[key] = { confirmedBy, confirmedAt: new Date().toISOString() };
  writeData('attendance-conflicts', confirmations);
  const conflict = attendanceConflicts().find(item => item.key === key) || { key, confirmedBy, confirmedAt: confirmations[key].confirmedAt, resolved: true };
  response.json(conflict);
});

app.post('/api/sync/:name', (request, response) => {
  const allowed = [
    'students',
    'teachers',
    'attendance'
  ];

  const name = request.params.name;
  if (!allowed.includes(name)) {
    return response.status(404).json({
      ok: false
    });
  }

  const incoming = Array.isArray(request.body) ? request.body : [];
  const records = new Map(readData(name).map((item) => [item.id, item]));

  for (const item of incoming) {
    if (!item || !item.id) continue;
    const old = records.get(item.id);
    if (!old || String(item.updatedAt || '') >= String(old.updatedAt || '')) {
      records.set(item.id, item);
    }
  }

  writeData(name, [...records.values()]);
  return response.json({ ok: true, count: incoming.length });
});

app.get('/api/data/:name', (request, response) => {
  const allowed = [
    'students',
    'teachers',
    'attendance'
  ];

  if (!allowed.includes(request.params.name)) {
    return response.status(404).json({
      ok: false
    });
  }

  return response.json(readData(request.params.name));
});

app.use(
  express.static(dist, {
    setHeaders(response, file) {
      if (file.endsWith('sw.js')) {
        response.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      }
      if (file.endsWith('index.html')) {
        response.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      }
    }
  })
);

app.use((request, response, next) => {
  if (request.path.startsWith('/api/')) return next();
  const isPagePath = !path.extname(request.path) || request.path.endsWith('.html');
  if (request.method === 'GET' && isPagePath && request.accepts('html')) return response.sendFile(indexFile);
  return response.status(404).end();
});

app.use('/api', (request, response) => {
  response.status(404).json({ ok: false, message: 'Endpoint API tidak ditemukan.' });
});

const server = https.createServer({ key, cert }, app);

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} sedang digunakan. Tutup server lama atau gunakan port lain.`);
  } else {
    console.error('Server HTTPS gagal:', error);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('Server HTTPS berhasil dijalankan.');
  console.log(`HTTPS lokal: https://${HOST}:${PORT}`);
  for (const address of getLanAddresses()) {
    console.log(`HTTPS LAN: https://${address}:${PORT}`);
  }
  console.log(`Health check: https://${HOST}:${PORT}/api/health`);
  console.log('Pada akses pertama, browser mungkin meminta persetujuan sertifikat lokal.');
});
