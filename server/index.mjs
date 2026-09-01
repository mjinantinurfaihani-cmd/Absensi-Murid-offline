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
  for (const record of read('attendance')) {
    if (record.deleted === 1) continue; // Skip soft-deleted attendance records
    const key = `${record.studentId}|${record.tanggal}`;
    groups.set(key, [...(groups.get(key) || []), record]);
  }
  const saved = read('attendance-conflicts');
  const toTimestamp = (value) => {
    const parsed = Date.parse(String(value || ''));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  return [...groups.entries()]
    .filter(([, records]) => {
      // Conflict if: statuses differ OR timestamps differ by > 1 minute (clock skew tolerance)
      const statuses = new Set(records.map(record => record.status));
      if (statuses.size > 1) return true;
      const times = records.map(r => toTimestamp(r.updatedAt));
      const minTime = Math.min(...times);
      const maxTime = Math.max(...times);
      return (maxTime - minTime) > 60000; // 1 minute = 60000ms
    })
    .map(([key, records]) => {
      const participants = [...new Set(records.map(record => record.ownerId || record.deviceId || record.id))];
      const confirmedBy = saved[key]?.confirmedBy || [];
      return {
        key,
        studentId: records[0].studentId,
        tanggal: records[0].tanggal,
        records,
        participants,
        confirmedBy,
        resolved: participants.every(id => confirmedBy.includes(id)),
        detectedAt: new Date().toISOString()
      };
    });
}

// Validation helpers
const MAX_PAYLOAD_SIZE = 10 * 1024 * 1024; // 10MB
const VALID_TABLES = new Set(['teachers', 'students', 'attendance']);
const RATE_LIMIT_MAP = new Map(); // deviceId -> { count, resetTime }
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 50; // 50 requests per minute per device

function validateTableName(name) {
  return VALID_TABLES.has(name) ? null : `Invalid table name: ${name}`;
}

function validateRecord(record, tableName) {
  if (typeof record !== 'object' || record === null) return 'Record must be an object';
  if (typeof record.id !== 'string' || !record.id) return 'Missing or invalid id field';
  if (record.updatedAt && typeof record.updatedAt !== 'string') return 'Invalid updatedAt: must be ISO string';
  if (record.deleted !== undefined && typeof record.deleted !== 'number') return 'Invalid deleted: must be number (0 or 1)';
  if (record.synced !== undefined && typeof record.synced !== 'number') return 'Invalid synced: must be number (0 or 1)';
  
  // Table-specific validation
  if (tableName === 'students') {
    if (record.nisn && typeof record.nisn !== 'string') return 'Invalid nisn: must be string';
    if (record.namaLengkap && typeof record.namaLengkap !== 'string') return 'Invalid namaLengkap: must be string';
  } else if (tableName === 'teachers') {
    if (record.nik && typeof record.nik !== 'string') return 'Invalid nik: must be string';
    if (record.namaLengkap && typeof record.namaLengkap !== 'string') return 'Invalid namaLengkap: must be string';
  } else if (tableName === 'attendance') {
    if (!record.studentId || typeof record.studentId !== 'string') return 'Invalid studentId: required and must be string';
    if (!record.tanggal || typeof record.tanggal !== 'string') return 'Invalid tanggal: required and must be string';
    if (!record.status || typeof record.status !== 'string') return 'Invalid status: required and must be string';
  }
  
  return null; // Valid
}

function checkRateLimit(deviceId) {
  const now = Date.now();
  const entry = RATE_LIMIT_MAP.get(deviceId);
  
  if (!entry || now > entry.resetTime) {
    RATE_LIMIT_MAP.set(deviceId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return null; // OK
  }
  
  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) {
    return `Rate limit exceeded (${RATE_LIMIT_MAX}/${RATE_LIMIT_WINDOW}ms)`;
  }
  return null; // OK
}

// Logging infrastructure
function appendLog(logType, message, context = {}) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    type: logType,
    message,
    ...context
  };
  
  // Console output
  const prefix = `[${timestamp}] [${logType.toUpperCase()}]`;
  if (logType === 'error') {
    console.error(prefix, message, context);
  } else if (logType === 'warn') {
    console.warn(prefix, message, context);
  } else {
    console.log(prefix, message, context);
  }
  
  // File output
  try {
    const file = path.join(dir, 'sync-logs.json');
    let logs = [];
    if (fs.existsSync(file)) {
      try {
        logs = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (!Array.isArray(logs)) logs = [];
      } catch { logs = []; }
    }
    logs.push(logEntry);
    // Keep last 1000 logs
    if (logs.length > 1000) logs = logs.slice(-1000);
    fs.writeFileSync(file + '.tmp', JSON.stringify(logs, null, 2), 'utf8');
    fs.renameSync(file + '.tmp', file);
  } catch (e) {
    console.error('Failed to write sync log', e instanceof Error ? e.message : e);
  }
}

// Metrics tracking
function readSyncMetrics() {
  try {
    const file = path.join(dir, 'sync-metrics.json');
    if (!fs.existsSync(file)) {
      return {
        successful_syncs: 0,
        failed_syncs: 0,
        total_records_synced: 0,
        total_conflicts_detected: 0,
        rate_limit_hits: 0,
        validation_failures: 0,
        avg_sync_duration_ms: 0,
        max_payload_size_bytes: 0,
        syncs_by_table: { teachers: 0, students: 0, attendance: 0 },
        failure_reasons: {},
        last_updated: new Date().toISOString()
      };
    }
    const raw = fs.readFileSync(file, 'utf8');
    return raw ? JSON.parse(raw) : {
      successful_syncs: 0,
      failed_syncs: 0,
      total_records_synced: 0,
      total_conflicts_detected: 0,
      rate_limit_hits: 0,
      validation_failures: 0,
      avg_sync_duration_ms: 0,
      max_payload_size_bytes: 0,
      syncs_by_table: { teachers: 0, students: 0, attendance: 0 },
      failure_reasons: {},
      last_updated: new Date().toISOString()
    };
  } catch (e) {
    return {
      successful_syncs: 0,
      failed_syncs: 0,
      total_records_synced: 0,
      total_conflicts_detected: 0,
      rate_limit_hits: 0,
      validation_failures: 0,
      avg_sync_duration_ms: 0,
      max_payload_size_bytes: 0,
      syncs_by_table: { teachers: 0, students: 0, attendance: 0 },
      failure_reasons: {},
      last_updated: new Date().toISOString()
    };
  }
}

function writeSyncMetrics(metrics) {
  try {
    const file = path.join(dir, 'sync-metrics.json');
    metrics.last_updated = new Date().toISOString();
    fs.writeFileSync(file + '.tmp', JSON.stringify(metrics, null, 2), 'utf8');
    fs.renameSync(file + '.tmp', file);
  } catch (e) {
    console.error('Failed to write sync metrics', e instanceof Error ? e.message : e);
  }
}

function recordSyncMetric(table, recordCount, durationMs, payloadSize, success, failureReason = null) {
  try {
    const metrics = readSyncMetrics();
    
    if (success) {
      metrics.successful_syncs++;
      metrics.total_records_synced += recordCount;
      // Update average duration
      metrics.avg_sync_duration_ms = 
        (metrics.avg_sync_duration_ms * (metrics.successful_syncs - 1) + durationMs) / metrics.successful_syncs;
    } else {
      metrics.failed_syncs++;
      if (failureReason) {
        metrics.failure_reasons[failureReason] = (metrics.failure_reasons[failureReason] || 0) + 1;
      }
    }
    
    metrics.syncs_by_table[table] = (metrics.syncs_by_table[table] || 0) + 1;
    if (payloadSize > metrics.max_payload_size_bytes) {
      metrics.max_payload_size_bytes = payloadSize;
    }
    
    writeSyncMetrics(metrics);
  } catch (e) {
    console.error('Failed to record sync metric', e instanceof Error ? e.message : e);
  }
}

function recordRateLimitHit(deviceId) {
  try {
    const metrics = readSyncMetrics();
    metrics.rate_limit_hits++;
    writeSyncMetrics(metrics);
  } catch (e) {
    console.error('Failed to record rate limit hit', e instanceof Error ? e.message : e);
  }
}

function recordValidationFailure(table, reason) {
  try {
    const metrics = readSyncMetrics();
    metrics.validation_failures++;
    const reasonKey = `${table}:${reason}`;
    metrics.failure_reasons[reasonKey] = (metrics.failure_reasons[reasonKey] || 0) + 1;
    writeSyncMetrics(metrics);
  } catch (e) {
    console.error('Failed to record validation failure', e instanceof Error ? e.message : e);
  }
}

function recordConflictDetection(conflictCount) {
  try {
    const metrics = readSyncMetrics();
    metrics.total_conflicts_detected += conflictCount;
    writeSyncMetrics(metrics);
  } catch (e) {
    console.error('Failed to record conflict detection', e instanceof Error ? e.message : e);
  }
}

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
  if (request.method === 'POST' && sync) return body(request, response, (input, raw) => {
    const startTime = Date.now();
    const tableName = sync[1];
    const contentType = (request.headers['content-type'] || '').toLowerCase();
    const payloadSize = raw ? raw.length : 0;
    let deviceId = input.deviceId || request.headers['x-device-id'] || request.socket.remoteAddress || 'unknown';
    
    // Log incoming sync request
    appendLog('info', `Sync request received for table: ${tableName}`, {
      deviceId,
      payloadSize,
      contentType: contentType || '(not set)'
    });
    
    // Validation 1: Content-Type header
    if (!contentType.includes('application/json')) {
      appendLog('warn', `Content-Type validation failed for ${tableName}`, {
        deviceId,
        expected: 'application/json',
        received: contentType || '(not set)'
      });
      recordValidationFailure(tableName, 'invalid_content_type');
      const duration = Date.now() - startTime;
      recordSyncMetric(tableName, 0, duration, payloadSize, false, 'content_type_validation');
      return sendJson(response, 400, { ok: false, error: 'Content-Type must be application/json' });
    }
    
    // Validation 2: Payload size
    if (raw && raw.length > MAX_PAYLOAD_SIZE) {
      appendLog('warn', `Payload size validation failed for ${tableName}`, {
        deviceId,
        maxSize: MAX_PAYLOAD_SIZE,
        receivedSize: payloadSize
      });
      recordValidationFailure(tableName, 'payload_too_large');
      const duration = Date.now() - startTime;
      recordSyncMetric(tableName, 0, duration, payloadSize, false, 'payload_size_validation');
      return sendJson(response, 413, { ok: false, error: `Payload too large (max ${MAX_PAYLOAD_SIZE} bytes)` });
    }
    
    // Validation 3: Table name
    const tableError = validateTableName(tableName);
    if (tableError) {
      appendLog('warn', `Table name validation failed`, {
        deviceId,
        tableName,
        error: tableError
      });
      recordValidationFailure(tableName, 'invalid_table_name');
      const duration = Date.now() - startTime;
      recordSyncMetric(tableName, 0, duration, payloadSize, false, 'table_validation');
      return sendJson(response, 400, { ok: false, error: tableError });
    }
    
    // Validation 4: Rate limiting (per device ID or client IP)
    const rateLimitError = checkRateLimit(deviceId);
    if (rateLimitError) {
      appendLog('warn', `Rate limit exceeded for ${tableName}`, {
        deviceId,
        error: rateLimitError
      });
      recordRateLimitHit(deviceId);
      recordValidationFailure(tableName, 'rate_limit_exceeded');
      const duration = Date.now() - startTime;
      recordSyncMetric(tableName, 0, duration, payloadSize, false, 'rate_limit');
      return sendJson(response, 429, { ok: false, error: rateLimitError });
    }
    
    // Validation 5: Input structure and records
    const incoming = Array.isArray(input) ? input : [];
    if (!Array.isArray(input)) {
      appendLog('warn', `Invalid input structure for ${tableName}`, {
        deviceId,
        error: 'Payload must be an array of records'
      });
      recordValidationFailure(tableName, 'invalid_structure');
      const duration = Date.now() - startTime;
      recordSyncMetric(tableName, 0, duration, payloadSize, false, 'structure_validation');
      return sendJson(response, 400, { ok: false, error: 'Payload must be an array of records' });
    }
    
    // Validate each record
    for (let i = 0; i < incoming.length; i++) {
      const recordError = validateRecord(incoming[i], tableName);
      if (recordError) {
        appendLog('warn', `Record validation failed for ${tableName}`, {
          deviceId,
          recordIndex: i,
          error: recordError
        });
        recordValidationFailure(tableName, `record_validation_${i}`);
        const duration = Date.now() - startTime;
        recordSyncMetric(tableName, 0, duration, payloadSize, false, 'record_validation');
        return sendJson(response, 400, { ok: false, error: `Record ${i}: ${recordError}` });
      }
    }
    
    // All validations passed
    appendLog('info', `All validations passed for ${tableName}`, {
      deviceId,
      incomingRecordCount: incoming.length
    });
    
    // Merge logic (now with validated data)
    const stored = read(tableName);
    const records = new Map(stored.map(item => [item.id, item]));
    let mergedCount = 0;
    let rejectedCount = 0;
    const toTimestamp = (value) => {
      const parsed = Date.parse(String(value || ''));
      return Number.isFinite(parsed) ? parsed : 0;
    };
    
    for (const item of incoming) {
      const old = records.get(item.id);
      const incomingTime = toTimestamp(item.updatedAt);
      const oldTime = old ? toTimestamp(old.updatedAt) : 0;
      
      // If old record doesn't exist, always accept new record
      if (!old) {
        records.set(item.id, item);
        mergedCount++;
        continue;
      }
      
      // Soft-delete permanence: once deleted=1, can only change if incoming timestamp is STRICTLY newer
      if (old.deleted === 1 && incomingTime <= oldTime) {
        // Keep old deleted state, reject any resurrection attempt with equal/older timestamp
        records.set(item.id, { ...old });
        rejectedCount++;
        appendLog('debug', `Soft-delete permanence enforced for ${item.id}`, {
          deviceId,
          tableName,
          incomingTime,
          oldTime
        });
        continue;
      }
      
      // Newer timestamp always wins
      if (incomingTime > oldTime) {
        records.set(item.id, item);
        mergedCount++;
        continue;
      }
      
      // Equal timestamps: use version tie-breaker (or accept if versions also equal)
      if (incomingTime === oldTime) {
        const incomingVersion = item.__version || 1;
        const oldVersion = old.__version || 1;
        if (incomingVersion >= oldVersion) {
          records.set(item.id, item);
          mergedCount++;
        } else {
          rejectedCount++;
        }
        continue;
      }
      
      // Older timestamp: reject
      rejectedCount++;
    }
    
    write(tableName, [...records.values()]);
    
    // Log successful sync
    const duration = Date.now() - startTime;
    appendLog('info', `Sync completed successfully for ${tableName}`, {
      deviceId,
      incomingRecordCount: incoming.length,
      mergedCount,
      rejectedCount,
      totalRecordsStored: records.size,
      durationMs: duration,
      payloadSize
    });
    
    // Check for conflicts after merge
    const allConflicts = conflicts();
    const conflictCount = allConflicts.length;
    if (conflictCount > 0) {
      appendLog('warn', `Conflicts detected after sync to ${tableName}`, {
        deviceId,
        conflictCount
      });
      recordConflictDetection(conflictCount);
    }
    
    // Record metrics
    recordSyncMetric(tableName, incoming.length, duration, payloadSize, true);
    
    return sendJson(response, 200, { 
      ok: true, 
      count: incoming.length, 
      synced: [...records.keys()].length,
      deviceId, // Echo back for verification
      conflicts: conflictCount
    });
  });
  
  // Catch invalid table names in sync requests
  const invalidSync = request.url?.match(/^\/api\/sync\/(.+)$/);
  if (request.method === 'POST' && invalidSync) {
    const tableName = invalidSync[1];
    const deviceId = request.socket.remoteAddress || 'unknown';
    appendLog('warn', `Invalid sync table name requested`, {
      deviceId,
      tableName,
      error: 'Must be one of: teachers, students, attendance'
    });
    recordValidationFailure(tableName, 'invalid_table_name_in_request');
    return sendJson(response, 400, { ok: false, error: `Invalid table name: ${tableName} (must be teachers, students, or attendance)` });
  }
  
  // Logging and Monitoring endpoints
  if (request.method === 'GET' && request.url === '/api/logs/sync') {
    try {
      const file = path.join(dir, 'sync-logs.json');
      if (!fs.existsSync(file)) return sendJson(response, 200, []);
      const raw = fs.readFileSync(file, 'utf8');
      const logs = raw ? JSON.parse(raw) : [];
      return sendJson(response, 200, logs);
    } catch (e) {
      appendLog('error', 'Failed to read sync logs', { error: e instanceof Error ? e.message : e });
      return sendJson(response, 500, { ok: false, error: 'Failed to read logs' });
    }
  }
  
  if (request.method === 'GET' && request.url === '/api/metrics/sync') {
    try {
      const metrics = readSyncMetrics();
      return sendJson(response, 200, metrics);
    } catch (e) {
      appendLog('error', 'Failed to read sync metrics', { error: e instanceof Error ? e.message : e });
      return sendJson(response, 500, { ok: false, error: 'Failed to read metrics' });
    }
  }
  
  if (request.method === 'DELETE' && request.url === '/api/logs/sync') {
    try {
      const file = path.join(dir, 'sync-logs.json');
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
      appendLog('info', 'Sync logs cleared');
      return sendJson(response, 200, { ok: true, message: 'Logs cleared' });
    } catch (e) {
      appendLog('error', 'Failed to clear sync logs', { error: e instanceof Error ? e.message : e });
      return sendJson(response, 500, { ok: false, error: 'Failed to clear logs' });
    }
  }
  
  if (request.method === 'DELETE' && request.url === '/api/metrics/sync') {
    try {
      const metrics = {
        successful_syncs: 0,
        failed_syncs: 0,
        total_records_synced: 0,
        total_conflicts_detected: 0,
        rate_limit_hits: 0,
        validation_failures: 0,
        avg_sync_duration_ms: 0,
        max_payload_size_bytes: 0,
        syncs_by_table: { teachers: 0, students: 0, attendance: 0 },
        failure_reasons: {},
        last_updated: new Date().toISOString()
      };
      writeSyncMetrics(metrics);
      appendLog('info', 'Sync metrics reset');
      return sendJson(response, 200, { ok: true, message: 'Metrics reset' });
    } catch (e) {
      appendLog('error', 'Failed to reset sync metrics', { error: e instanceof Error ? e.message : e });
      return sendJson(response, 500, { ok: false, error: 'Failed to reset metrics' });
    }
  }
  
  response.writeHead(404); response.end('Not found');
});
server.listen(Number(process.env.PORT || 4174));
