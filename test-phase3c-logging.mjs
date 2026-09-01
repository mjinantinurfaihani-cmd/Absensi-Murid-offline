#!/usr/bin/env node

import http from 'http';
import fs from 'fs';

const BASE_URL = 'http://localhost:4174';

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const defaultHeaders = {
      'Content-Type': 'application/json',
      ...headers
    };

    const options = {
      hostname: 'localhost',
      port: 4174,
      path: path,
      method: method,
      headers: defaultHeaders
    };

    if (body && !headers['Content-Type']) {
      options.headers['Content-Length'] = Buffer.byteLength(body);
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          body: data,
          headers: res.headers
        });
      });
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function runTests() {
  console.log('\n========================================');
  console.log('Phase 3C: Logging & Metrics Testing');
  console.log('========================================\n');

  const results = [];

  // Step 1: Clear logs and metrics
  console.log('[Setup] Clearing logs and metrics...');
  await request('DELETE', '/api/logs/sync');
  await request('DELETE', '/api/metrics/sync');
  console.log('✓ Cleared\n');

  // Test 1: Valid sync request (should be logged)
  console.log('[Test 1] Valid Sync Request with Logging');
  let body = JSON.stringify([{
    id: 'student-log-test-1',
    nisn: '88888',
    namaLengkap: 'Logging Test Student',
    updatedAt: '2025-01-09T10:00:00.000Z',
    deleted: 0
  }]);
  let r = await request('POST', '/api/sync/students', body, { 'X-Device-Id': 'device-1' });
  const pass1 = r.statusCode === 200 && JSON.parse(r.body).ok === true;
  console.log(`Status: ${r.statusCode}, ok: ${JSON.parse(r.body).ok} ${pass1 ? '✅ PASS' : '❌ FAIL'}`);
  results.push({ test: 'Test 1: Valid Sync with Logging', pass: pass1 });

  // Test 2: Invalid Content-Type (should be logged as validation failure)
  console.log('\n[Test 2] Content-Type Validation Logging');
  r = await request('POST', '/api/sync/students', '[{"id":"test"}]', { 'Content-Type': 'text/plain' });
  const pass2 = r.statusCode === 400;
  console.log(`Status: ${r.statusCode} ${pass2 ? '✅ PASS' : '❌ FAIL'}`);
  results.push({ test: 'Test 2: Content-Type Logging', pass: pass2 });

  // Test 3: Invalid table name (should be logged)
  console.log('\n[Test 3] Invalid Table Name Logging');
  r = await request('POST', '/api/sync/malicious', '[{"id":"test"}]');
  const pass3 = r.statusCode === 400;
  console.log(`Status: ${r.statusCode} ${pass3 ? '✅ PASS' : '❌ FAIL'}`);
  results.push({ test: 'Test 3: Invalid Table Logging', pass: pass3 });

  // Test 4: Missing required field (should be logged)
  console.log('\n[Test 4] Record Validation Logging');
  r = await request('POST', '/api/sync/attendance', '[{"id":"att1","tanggal":"2025-01-09","status":"hadir"}]');
  const pass4 = r.statusCode === 400;
  console.log(`Missing studentId: Status ${r.statusCode} ${pass4 ? '✅ PASS' : '❌ FAIL'}`);
  results.push({ test: 'Test 4: Record Validation Logging', pass: pass4 });

  // Test 5: Another valid sync (for metrics aggregation)
  console.log('\n[Test 5] Multiple Syncs for Metrics');
  body = JSON.stringify([
    {
      id: 'student-log-test-2',
      nisn: '77777',
      namaLengkap: 'Another Student',
      updatedAt: '2025-01-09T11:00:00.000Z',
      deleted: 0
    },
    {
      id: 'student-log-test-3',
      nisn: '66666',
      namaLengkap: 'Third Student',
      updatedAt: '2025-01-09T12:00:00.000Z',
      deleted: 0
    }
  ]);
  r = await request('POST', '/api/sync/students', body, { 'X-Device-Id': 'device-2' });
  const pass5 = r.statusCode === 200;
  console.log(`Status: ${r.statusCode} ${pass5 ? '✅ PASS' : '❌ FAIL'}`);
  results.push({ test: 'Test 5: Multiple Syncs', pass: pass5 });

  // Wait a moment for logs to be written
  await new Promise(resolve => setTimeout(resolve, 500));

  // Test 6: Retrieve logs
  console.log('\n[Test 6] Retrieve Sync Logs Endpoint');
  r = await request('GET', '/api/logs/sync');
  let logs = [];
  let pass6 = false;
  try {
    logs = JSON.parse(r.body);
    pass6 = r.statusCode === 200 && Array.isArray(logs) && logs.length > 0;
    console.log(`Status: ${r.statusCode}, Log count: ${logs.length} ${pass6 ? '✅ PASS' : '❌ FAIL'}`);
    if (logs.length > 0) {
      console.log(`  Sample log: ${JSON.stringify(logs[0], null, 2)}`);
    }
  } catch (e) {
    console.log(`❌ FAIL: ${e.message}`);
  }
  results.push({ test: 'Test 6: Retrieve Logs', pass: pass6 });

  // Test 7: Retrieve metrics
  console.log('\n[Test 7] Retrieve Sync Metrics Endpoint');
  r = await request('GET', '/api/metrics/sync');
  let metrics = {};
  let pass7 = false;
  try {
    metrics = JSON.parse(r.body);
    pass7 = r.statusCode === 200 && metrics.successful_syncs > 0;
    console.log(`Status: ${r.statusCode}, Successful syncs: ${metrics.successful_syncs} ${pass7 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`  Metrics summary:`);
    console.log(`    - Successful syncs: ${metrics.successful_syncs}`);
    console.log(`    - Failed syncs: ${metrics.failed_syncs}`);
    console.log(`    - Validation failures: ${metrics.validation_failures}`);
    console.log(`    - Total records synced: ${metrics.total_records_synced}`);
    console.log(`    - Syncs by table: ${JSON.stringify(metrics.syncs_by_table)}`);
    console.log(`    - Avg sync duration: ${Math.round(metrics.avg_sync_duration_ms)}ms`);
    console.log(`    - Rate limit hits: ${metrics.rate_limit_hits}`);
    console.log(`    - Conflicts detected: ${metrics.total_conflicts_detected}`);
  } catch (e) {
    console.log(`❌ FAIL: ${e.message}`);
  }
  results.push({ test: 'Test 7: Retrieve Metrics', pass: pass7 });

  // Test 8: Verify log content
  console.log('\n[Test 8] Verify Log Content Quality');
  let pass8 = false;
  try {
    const infoLogs = logs.filter(log => log.type === 'info');
    const warnLogs = logs.filter(log => log.type === 'warn');
    pass8 = infoLogs.length > 0 && warnLogs.length > 0;
    console.log(`Info logs: ${infoLogs.length}, Warn logs: ${warnLogs.length} ${pass8 ? '✅ PASS' : '❌ FAIL'}`);
    
    if (infoLogs.length > 0) {
      console.log(`  Info log sample: ${infoLogs[0].message}`);
    }
    if (warnLogs.length > 0) {
      console.log(`  Warn log sample: ${warnLogs[0].message}`);
    }
  } catch (e) {
    console.log(`❌ FAIL: ${e.message}`);
  }
  results.push({ test: 'Test 8: Log Content Quality', pass: pass8 });

  // Test 9: Verify metrics aggregation
  console.log('\n[Test 9] Verify Metrics Aggregation');
  let pass9 = false;
  try {
    // Breakdown:
    // Test 1: Valid sync students → successful_syncs++, syncs_by_table[students]++, records += 1
    // Test 2: Invalid content-type students → failed_syncs++, validation_failures++, syncs_by_table[students]++
    // Test 3: Invalid table malicious → validation_failures++, NOT recorded in sync metrics
    // Test 4: Missing field attendance → failed_syncs++, validation_failures++, syncs_by_table[attendance]++
    // Test 5: Valid sync students (2 records) → successful_syncs++, syncs_by_table[students]++, records += 2
    pass9 = metrics.successful_syncs === 2 && // Tests 1 and 5
            metrics.failed_syncs === 2 && // Tests 2 and 4
            metrics.validation_failures === 3 && // Tests 2, 3, 4
            metrics.syncs_by_table.students === 3 && // Tests 1, 2, 5 all hit students endpoint
            metrics.syncs_by_table.attendance === 1 && // Test 4
            metrics.total_records_synced === 3; // 1 + 2 from successful syncs
    console.log(`Successful: ${metrics.successful_syncs}/2 ✓, Failed: ${metrics.failed_syncs}/2 ✓, Validations: ${metrics.validation_failures}/3 ✓, Students: ${metrics.syncs_by_table.students}/3 ✓, Records: ${metrics.total_records_synced}/3 ✓`);
    console.log(`${pass9 ? '✅ PASS' : '❌ FAIL'}`);
  } catch (e) {
    console.log(`❌ FAIL: ${e.message}`);
  }
  results.push({ test: 'Test 9: Metrics Aggregation', pass: pass9 });

  // Test 10: Clear logs and verify
  console.log('\n[Test 10] Clear Logs Endpoint');
  r = await request('DELETE', '/api/logs/sync');
  let pass10 = r.statusCode === 200;
  console.log(`Status: ${r.statusCode} ${pass10 ? '✅ PASS' : '❌ FAIL'}`);
  
  if (pass10) {
    // Verify logs are mostly cleared (will have 1 entry from the clear operation itself)
    r = await request('GET', '/api/logs/sync');
    const clearedLogs = JSON.parse(r.body);
    // Accept 0-1 logs (the clear operation logs itself)
    pass10 = Array.isArray(clearedLogs) && clearedLogs.length <= 1;
    console.log(`Logs after clear: ${clearedLogs.length} (expect 0-1 with clear action logged) ${pass10 ? '✅ PASS' : '❌ FAIL'}`);
  }
  results.push({ test: 'Test 10: Clear Logs', pass: pass10 });

  // Test 11: Clear metrics and verify
  console.log('\n[Test 11] Clear Metrics Endpoint');
  r = await request('DELETE', '/api/metrics/sync');
  let pass11 = r.statusCode === 200;
  console.log(`Status: ${r.statusCode} ${pass11 ? '✅ PASS' : '❌ FAIL'}`);
  
  if (pass11) {
    // Verify metrics are actually cleared
    r = await request('GET', '/api/metrics/sync');
    const clearedMetrics = JSON.parse(r.body);
    pass11 = clearedMetrics.successful_syncs === 0 && clearedMetrics.failed_syncs === 0;
    console.log(`Cleared metrics - Successful: ${clearedMetrics.successful_syncs}, Failed: ${clearedMetrics.failed_syncs} ${pass11 ? '✅ PASS' : '❌ FAIL'}`);
  }
  results.push({ test: 'Test 11: Clear Metrics', pass: pass11 });

  // Summary
  console.log('\n========================================');
  console.log('TEST SUMMARY - Phase 3C: Logging');
  console.log('========================================\n');

  let passCount = 0;
  results.forEach(r => {
    const icon = r.pass ? '✅' : '❌';
    console.log(`${icon} ${r.test}`);
    if (r.pass) passCount++;
  });

  console.log(`\nTotal: ${passCount} / ${results.length} tests passed`);
  if (passCount === results.length) {
    console.log('🎉 All logging tests PASSED!\n');
    console.log('✅ Phase 3C: Logging & Monitoring infrastructure is fully functional');
  } else {
    console.log('⚠️  Some tests failed. Review output above.\n');
  }

  process.exit(passCount === results.length ? 0 : 1);
}

runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
