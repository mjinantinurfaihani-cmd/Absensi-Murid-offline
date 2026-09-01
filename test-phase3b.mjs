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
  console.log('Phase 3B: Comprehensive Testing');
  console.log('========================================\n');

  const results = [];

  // Phase 2: Data Sync Integrity
  console.log('PHASE 2: Data Sync Integrity Tests');
  console.log('-----------------------------------\n');

  // Scenario 1: Multi-Device Timestamp Ordering
  console.log('[Scenario 1] Multi-Device Timestamp Ordering');
  fs.writeFileSync('server/data/students.json', '[]');

  let body1 = JSON.stringify([{
    id: 's1',
    nisn: '12345',
    namaLengkap: 'Alice',
    updatedAt: '2025-01-09T10:00:00.000Z',
    deleted: 0,
    synced: 1
  }]);

  let r1 = await request('POST', '/api/sync/students', body1);
  console.log(`Device A (T1=10:00:00) → Status ${r1.statusCode}`);

  await new Promise(resolve => setTimeout(resolve, 50));

  let body2 = JSON.stringify([{
    id: 's1',
    nisn: '12345',
    namaLengkap: 'Alice Updated',
    updatedAt: '2025-01-09T10:00:05.000Z',
    deleted: 0,
    synced: 1
  }]);

  let r2 = await request('POST', '/api/sync/students', body2);
  console.log(`Device B (T2=10:00:05) → Status ${r2.statusCode}`);

  await new Promise(resolve => setTimeout(resolve, 50));

  let body3 = JSON.stringify([{
    id: 's1',
    nisn: '12345',
    namaLengkap: 'Alice Old',
    updatedAt: '2025-01-09T09:59:55.000Z',
    deleted: 0,
    synced: 1
  }]);

  let r3 = await request('POST', '/api/sync/students', body3);
  console.log(`Device C (T3=09:59:55) → Status ${r3.statusCode}`);

  let students = JSON.parse(fs.readFileSync('server/data/students.json', 'utf-8'));
  if (students.length > 0) {
    const pass = students[0].namaLengkap === 'Alice Updated';
    console.log(`Expected: 'Alice Updated', Got: '${students[0].namaLengkap}' ${pass ? '✅ PASS' : '❌ FAIL'}`);
    results.push({ test: 'Scenario 1: Numeric Timestamps', pass });
  }

  // Scenario 2: Soft-Delete Permanence
  console.log('\n[Scenario 2] Soft-Delete Permanence');
  fs.writeFileSync('server/data/students.json', JSON.stringify([{
    id: 's2',
    nisn: '54321',
    namaLengkap: 'Bob',
    deleted: 0,
    updatedAt: '2025-01-09T10:00:00.000Z',
    synced: 1
  }]));

  let body4 = JSON.stringify([{
    id: 's2',
    nisn: '54321',
    deleted: 1,
    updatedAt: '2025-01-09T10:00:00.000Z',
    synced: 0
  }]);

  let r4 = await request('POST', '/api/sync/students', body4);
  console.log(`Device A Delete (T1) → Status ${r4.statusCode}`);

  await new Promise(resolve => setTimeout(resolve, 50));

  let body5 = JSON.stringify([{
    id: 's2',
    nisn: '54321',
    namaLengkap: 'Bob',
    deleted: 0,
    updatedAt: '2025-01-09T10:00:00.000Z',
    synced: 1
  }]);

  let r5 = await request('POST', '/api/sync/students', body5);
  console.log(`Device B Resurrect (T1) → Status ${r5.statusCode} (Should be ignored)`);

  students = JSON.parse(fs.readFileSync('server/data/students.json', 'utf-8'));
  if (students.length > 0) {
    const pass = students[0].deleted === 1;
    console.log(`Expected deleted=1, Got deleted=${students[0].deleted} ${pass ? '✅ PASS' : '❌ FAIL'}`);
    results.push({ test: 'Scenario 2: Soft-Delete Permanence', pass });
  }

  // Scenario 3: Newer Delete Override
  console.log('\n[Scenario 3] Newer Delete Override');
  fs.writeFileSync('server/data/students.json', JSON.stringify([{
    id: 's3',
    nisn: '99999',
    namaLengkap: 'Charlie',
    deleted: 0,
    updatedAt: '2025-01-09T10:00:00.000Z',
    synced: 1
  }]));

  let body6 = JSON.stringify([{
    id: 's3',
    deleted: 1,
    updatedAt: '2025-01-09T10:00:05.000Z',
    synced: 0
  }]);

  let r6 = await request('POST', '/api/sync/students', body6);
  console.log(`Device B Delete (T2=newer) → Status ${r6.statusCode}`);

  await new Promise(resolve => setTimeout(resolve, 50));

  let body7 = JSON.stringify([{
    id: 's3',
    nisn: '99999',
    namaLengkap: 'Charlie',
    deleted: 0,
    updatedAt: '2025-01-09T10:00:00.000Z',
    synced: 1
  }]);

  let r7 = await request('POST', '/api/sync/students', body7);
  console.log(`Device C Update (old T1) → Status ${r7.statusCode} (Should be rejected)`);

  students = JSON.parse(fs.readFileSync('server/data/students.json', 'utf-8'));
  if (students.length > 0) {
    const pass = students[0].deleted === 1 && students[0].updatedAt === '2025-01-09T10:00:05.000Z';
    console.log(`Expected deleted=1 with T2, Got deleted=${students[0].deleted} at ${students[0].updatedAt} ${pass ? '✅ PASS' : '❌ FAIL'}`);
    results.push({ test: 'Scenario 3: Newer Delete Override', pass });
  }

  // Phase 3A: Request Validation
  console.log('\n========================================');
  console.log('PHASE 3A: Request Validation Tests');
  console.log('========================================\n');

  // Test 1: Content-Type Validation
  console.log('[Test 1] Content-Type Validation');
  let r = await request('POST', '/api/sync/students', '[{"id":"test"}]', { 'Content-Type': 'text/plain' });
  const pass1 = r.statusCode === 400;
  console.log(`Status: ${r.statusCode} ${pass1 ? '✅ PASS' : '❌ FAIL'}`);
  results.push({ test: 'Test 1: Content-Type', pass: pass1 });

  // Test 2: Table Name Validation
  console.log('\n[Test 2] Table Name Validation');
  r = await request('POST', '/api/sync/malicious', '[{"id":"test"}]');
  const pass2 = r.statusCode === 400;
  console.log(`Status: ${r.statusCode} ${pass2 ? '✅ PASS' : '❌ FAIL'}`);
  results.push({ test: 'Test 2: Table Name', pass: pass2 });

  // Test 3: Required Field Validation
  console.log('\n[Test 3] Required Field Validation (Attendance)');
  r = await request('POST', '/api/sync/attendance', '[{"id":"att1","tanggal":"2025-01-09","status":"hadir"}]');
  const pass3 = r.statusCode === 400;
  console.log(`Missing studentId: Status ${r.statusCode} ${pass3 ? '✅ PASS' : '❌ FAIL'}`);
  results.push({ test: 'Test 3: Required Fields', pass: pass3 });

  // Test 4: Valid Request Success
  console.log('\n[Test 4] Valid Request Success');
  let body = JSON.stringify([{
    id: 'student-valid',
    nisn: '99999',
    namaLengkap: 'Valid Student',
    updatedAt: '2025-01-09T10:00:00.000Z'
  }]);
  r = await request('POST', '/api/sync/students', body);
  const pass4 = r.statusCode === 200 && JSON.parse(r.body).ok === true;
  console.log(`Status: ${r.statusCode}, ok: ${JSON.parse(r.body).ok} ${pass4 ? '✅ PASS' : '❌ FAIL'}`);
  results.push({ test: 'Test 4: Valid Request', pass: pass4 });

  // Summary
  console.log('\n========================================');
  console.log('TEST SUMMARY');
  console.log('========================================\n');

  let passCount = 0;
  results.forEach(r => {
    const icon = r.pass ? '✅' : '❌';
    console.log(`${icon} ${r.test}`);
    if (r.pass) passCount++;
  });

  console.log(`\nTotal: ${passCount} / ${results.length} tests passed`);
  if (passCount === results.length) {
    console.log('🎉 All tests PASSED!\n');
  } else {
    console.log('⚠️  Some tests failed. Review output above.\n');
  }

  process.exit(passCount === results.length ? 0 : 1);
}

runTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
