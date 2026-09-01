#!/usr/bin/env node

import fs from 'node:fs';

const BASE_URL = 'http://localhost:4174';
const results = [];

function getHeaders(overrides = {}) {
  return {
    'Content-Type': 'application/json',
    ...overrides
  };
}

async function request(method, path, body = null, headers = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: getHeaders(headers),
    body: body !== null ? body : undefined
  });

  return {
    statusCode: response.status,
    body: await response.text(),
    headers: Object.fromEntries(response.headers.entries())
  };
}

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function writeStudents(data) {
  fs.writeFileSync('server/data/students.json', JSON.stringify(data, null, 2));
}

async function runTests() {
  console.log('\n========================================');
  console.log('Phase 3B: Comprehensive Testing');
  console.log('========================================\n');

  console.log('PHASE 2: Data Sync Integrity Tests');
  console.log('-----------------------------------\n');

  console.log('[Scenario 1] Multi-Device Timestamp Ordering');
  console.log('Test: Latest timestamp should win (numeric comparison, not string)');
  writeStudents([]);

  const body1 = JSON.stringify([
    { id: 's1', nisn: '12345', namaLengkap: 'Alice', updatedAt: '2025-01-09T10:00:00.000Z', deleted: 0, synced: 1 }
  ]);

  try {
    const r1 = await request('POST', '/api/sync/students', body1, { 'X-Device-Id': 'scenario-1-device-a' });
    console.log(`Device A (T1=10:00:00) → Status ${r1.statusCode}: ${r1.body}`);
  } catch (error) {
    console.log(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
  }

  await delay(100);

  const body2 = JSON.stringify([
    { id: 's1', nisn: '12345', namaLengkap: 'Alice Updated', updatedAt: '2025-01-09T10:00:05.000Z', deleted: 0, synced: 1 }
  ]);

  try {
    const r2 = await request('POST', '/api/sync/students', body2, { 'X-Device-Id': 'scenario-1-device-b' });
    console.log(`Device B (T2=10:00:05) → Status ${r2.statusCode}: ${r2.body}`);
  } catch (error) {
    console.log(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
  }

  await delay(100);

  const body3 = JSON.stringify([
    { id: 's1', nisn: '12345', namaLengkap: 'Alice Old', updatedAt: '2025-01-09T09:59:55.000Z', deleted: 0, synced: 1 }
  ]);

  try {
    const r3 = await request('POST', '/api/sync/students', body3, { 'X-Device-Id': 'scenario-1-device-c' });
    console.log(`Device C (T3=09:59:55) → Status ${r3.statusCode}: ${r3.body}`);
  } catch (error) {
    console.log(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
  }

  const students = JSON.parse(fs.readFileSync('server/data/students.json', 'utf8'));
  if (Array.isArray(students) && students.length > 0) {
    const result = students[0];
    const pass = result.namaLengkap === 'Alice Updated';
    const status = pass ? '✅ PASS' : '❌ FAIL';
    console.log(`Expected namaLengkap: 'Alice Updated', Got: '${result.namaLengkap}' ${status}`);
    console.log(`Timestamp: ${result.updatedAt}`);
    results.push({ test: 'Scenario 1: Numeric Timestamps', pass, expected: 'Alice Updated', actual: result.namaLengkap });
  } else {
    console.log('❌ FAIL: No records in students.json');
    results.push({ test: 'Scenario 1: Numeric Timestamps', pass: false, expected: 'Alice Updated', actual: 'No records' });
  }

  console.log('\n[Scenario 2] Soft-Delete Permanence');
  console.log('Test: Deleted record cannot be un-deleted by equal/older timestamps');
  writeStudents([
    { id: 's2', nisn: '54321', namaLengkap: 'Bob', deleted: 0, updatedAt: '2025-01-09T10:00:00.000Z', synced: 1 }
  ]);

  const body4 = JSON.stringify([
    { id: 's2', nisn: '54321', deleted: 1, updatedAt: '2025-01-09T10:00:00.000Z', synced: 0 }
  ]);

  try {
    const r4 = await request('POST', '/api/sync/students', body4, { 'X-Device-Id': 'scenario-2-device-a' });
    console.log(`Device A Delete (T1) → Status ${r4.statusCode}`);
  } catch (error) {
    console.log(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
  }

  await delay(100);

  const body5 = JSON.stringify([
    { id: 's2', nisn: '54321', namaLengkap: 'Bob', deleted: 0, updatedAt: '2025-01-09T10:00:00.000Z', synced: 1 }
  ]);

  try {
    const r5 = await request('POST', '/api/sync/students', body5, { 'X-Device-Id': 'scenario-2-device-b' });
    console.log(`Device B Resurrect (T1) → Status ${r5.statusCode} - Should be ignored`);
  } catch (error) {
    console.log(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
  }

  await delay(100);

  const body6 = JSON.stringify([
    { id: 's2', nisn: '54321', namaLengkap: 'Bob', deleted: 0, updatedAt: '2025-01-09T09:59:59.999Z', synced: 1 }
  ]);

  try {
    const r6 = await request('POST', '/api/sync/students', body6, { 'X-Device-Id': 'scenario-2-device-c' });
    console.log(`Device C Resurrect (older) → Status ${r6.statusCode} - Should be ignored`);
  } catch (error) {
    console.log(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
  }

  const studentsAfterDelete = JSON.parse(fs.readFileSync('server/data/students.json', 'utf8'));
  if (Array.isArray(studentsAfterDelete) && studentsAfterDelete.length > 0) {
    const result = studentsAfterDelete[0];
    const pass = result.deleted === 1 && result.updatedAt === '2025-01-09T10:00:00.000Z';
    const status = pass ? '✅ PASS' : '❌ FAIL';
    console.log(`Expected deleted=1, Got deleted=${result.deleted} ${status}`);
    results.push({ test: 'Scenario 2: Soft-Delete Permanence', pass, expected: 'deleted=1', actual: `deleted=${result.deleted}` });
  } else {
    console.log('❌ FAIL: No records');
    results.push({ test: 'Scenario 2: Soft-Delete Permanence', pass: false, expected: 'deleted=1', actual: 'No records' });
  }

  console.log('\n[Scenario 3] Newer Delete Override');
  console.log('Test: Newer delete timestamp overrides old data');
  writeStudents([
    { id: 's3', nisn: '99999', namaLengkap: 'Charlie', deleted: 0, updatedAt: '2025-01-09T10:00:00.000Z', synced: 1 }
  ]);

  const body7 = JSON.stringify([
    { id: 's3', nisn: '99999', namaLengkap: 'Charlie', deleted: 0, updatedAt: '2025-01-09T10:00:00.000Z', synced: 1 }
  ]);

  try {
    const r7 = await request('POST', '/api/sync/students', body7, { 'X-Device-Id': 'scenario-3-device-a' });
    console.log(`Device A Update (T1) → Status ${r7.statusCode}`);
  } catch (error) {
    console.log(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
  }

  await delay(100);

  const body8 = JSON.stringify([
    { id: 's3', deleted: 1, updatedAt: '2025-01-09T10:00:05.000Z', synced: 0 }
  ]);

  try {
    const r8 = await request('POST', '/api/sync/students', body8, { 'X-Device-Id': 'scenario-3-device-b' });
    console.log(`Device B Delete (T2, newer) → Status ${r8.statusCode}`);
  } catch (error) {
    console.log(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
  }

  await delay(100);

  const body9 = JSON.stringify([
    { id: 's3', nisn: '99999', namaLengkap: 'Charlie', deleted: 0, updatedAt: '2025-01-09T10:00:00.000Z', synced: 1 }
  ]);

  try {
    const r9 = await request('POST', '/api/sync/students', body9, { 'X-Device-Id': 'scenario-3-device-c' });
    console.log(`Device C Update (T1, old) → Status ${r9.statusCode} - Should be rejected`);
  } catch (error) {
    console.log(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
  }

  const studentsAfterOverride = JSON.parse(fs.readFileSync('server/data/students.json', 'utf8'));
  if (Array.isArray(studentsAfterOverride) && studentsAfterOverride.length > 0) {
    const result = studentsAfterOverride[0];
    const pass = result.deleted === 1 && result.updatedAt === '2025-01-09T10:00:05.000Z';
    const status = pass ? '✅ PASS' : '❌ FAIL';
    console.log(`Expected deleted=1 with T2, Got deleted=${result.deleted} at ${result.updatedAt} ${status}`);
    results.push({ test: 'Scenario 3: Newer Delete Override', pass, expected: 'deleted=1, T2', actual: `deleted=${result.deleted}, ${result.updatedAt}` });
  } else {
    console.log('❌ FAIL: No records');
    results.push({ test: 'Scenario 3: Newer Delete Override', pass: false, expected: 'deleted=1, T2', actual: 'No records' });
  }

  console.log('\n[Scenario 4] Frontend Delete Must Remove Record From Shared Store');
  console.log('Test: deleting a teacher/student from the frontend should remove it from the synced cloud/local store');
  writeStudents([
    { id: 's4', nisn: '44444', namaLengkap: 'Delete Me', deleted: 0, updatedAt: '2025-01-09T10:00:00.000Z', synced: 1 }
  ]);

  const deleteBody = JSON.stringify([
    { id: 's4', nisn: '44444', namaLengkap: 'Delete Me', deleted: 1, updatedAt: '2025-01-09T10:00:06.000Z', synced: 0 }
  ]);

  try {
    const rDelete = await request('POST', '/api/sync/students', deleteBody, { 'X-Device-Id': 'scenario-4-device-delete' });
    console.log(`Delete sync request → Status ${rDelete.statusCode}: ${rDelete.body}`);
  } catch (error) {
    console.log(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
  }

  const syncedAfterDelete = JSON.parse(fs.readFileSync('server/data/students.json', 'utf8'));
  const recordStillExists = Array.isArray(syncedAfterDelete) && syncedAfterDelete.some(item => item.id === 's4');
  const pass = !recordStillExists;
  const status = pass ? '✅ PASS' : '❌ FAIL';
  console.log(`Expected record removed, Got exists=${recordStillExists} ${status}`);
  results.push({ test: 'Scenario 4: Delete Propagation', pass, expected: 'record removed', actual: String(recordStillExists) });

  console.log('\n========================================');
  console.log('PHASE 3A: Request Validation Tests');
  console.log('========================================');

  console.log('\n[Test 1] Content-Type Validation');
  console.log('Expected: 400 Bad Request for non-JSON');
  try {
    const r = await request('POST', '/api/sync/students', '[{"id":"test1"}]', { 'Content-Type': 'text/plain', 'X-Device-Id': 'test-content-type' });
    console.log(`Status: ${r.statusCode}`);
    const pass = r.statusCode === 400;
    const status = pass ? '✅ PASS' : '❌ FAIL';
    console.log(`Expected 400, Got ${r.statusCode} ${status}`);
    results.push({ test: 'Test 1: Content-Type', pass, expected: '400', actual: String(r.statusCode) });
  } catch (error) {
    console.log(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    results.push({ test: 'Test 1: Content-Type', pass: false, expected: '400', actual: 'Error' });
  }

  console.log('\n[Test 2] Payload Size Validation');
  console.log('Expected: 413 Payload Too Large for >10MB');
  const largeBody = JSON.stringify([{ id: 'x', nisn: 'x'.repeat(12 * 1024 * 1024) }]);
  try {
    const r = await request('POST', '/api/sync/students', largeBody, { 'X-Device-Id': 'test-payload-size' });
    console.log(`Payload size: ${largeBody.length} bytes`);
    console.log(`Status: ${r.statusCode}`);
    const pass = r.statusCode === 413;
    const status = pass ? '✅ PASS' : '❌ FAIL';
    console.log(`Expected 413, Got ${r.statusCode} ${status}`);
    results.push({ test: 'Test 2: Payload Size', pass, expected: '413', actual: String(r.statusCode) });
  } catch (error) {
    console.log(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    results.push({ test: 'Test 2: Payload Size', pass: false, expected: '413', actual: 'Error' });
  }

  console.log('\n[Test 3] Table Name Validation');
  console.log('Expected: 400 Bad Request for invalid table');
  try {
    const r = await request('POST', '/api/sync/malicious', '[{"id":"test"}]', { 'X-Device-Id': 'test-table-name' });
    console.log(`Status: ${r.statusCode}`);
    const pass = r.statusCode === 400;
    const status = pass ? '✅ PASS' : '❌ FAIL';
    console.log(`Expected 400, Got ${r.statusCode} ${status}`);
    results.push({ test: 'Test 3: Table Name', pass, expected: '400', actual: String(r.statusCode) });
  } catch (error) {
    console.log(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    results.push({ test: 'Test 3: Table Name', pass: false, expected: '400', actual: 'Error' });
  }

  console.log('\n[Test 4] Rate Limiting');
  console.log('Expected: 429 Too Many Requests on request 51+ (limit 50/min)');
  let rateLimitPassed = true;
  const testBody = '[{"id":"test-rate","nisn":"123"}]';

  for (let i = 1; i <= 51; i++) {
    try {
      const r = await request('POST', '/api/sync/students', testBody, { 'X-Device-Id': 'rate-limit-device' });
      const status = r.statusCode;

      if (i <= 50) {
        if (status !== 200) {
          console.log(`Request ${i} failed with ${status} (expected 200)`);
          rateLimitPassed = false;
          break;
        }
      } else if (status !== 429) {
        console.log(`Request ${i} got ${status} (expected 429 after 50 requests)`);
        rateLimitPassed = false;
      }
    } catch (error) {
      const status = error?.response?.statusCode ?? 0;
      if (i <= 50 && status !== 200) {
        console.log(`Request ${i} error: ${status} (expected 200)`);
        rateLimitPassed = false;
        break;
      }
      if (i === 51 && status !== 429) {
        console.log(`Request ${i} error: ${status} (expected 429)`);
        rateLimitPassed = false;
      }
    }

    if (i === 50 || i === 51) {
      try {
        const probe = await request('POST', '/api/sync/students', testBody, { 'X-Device-Id': 'rate-limit-device' });
        console.log(`Request ${i}: ${probe.statusCode}`);
      } catch (error) {
        console.log(`Request ${i}: ${error?.response?.statusCode ?? 0}`);
      }
    }
  }

  const rateStatusText = rateLimitPassed ? '✅ PASS' : '❌ FAIL';
  console.log(`Rate limiting test ${rateStatusText}`);
  results.push({ test: 'Test 4: Rate Limiting', pass: rateLimitPassed, expected: '50 OK then 429', actual: rateLimitPassed ? 'Correct' : 'Failed' });

  console.log('\n[Test 5] Required Field Validation (Attendance)');
  console.log('Expected: 400 Bad Request for missing required fields');

  let pass1 = false;
  let pass2 = false;
  let pass3 = false;

  let r = await request('POST', '/api/sync/attendance', '[{"id":"att1","tanggal":"2025-01-09","status":"hadir"}]', { 'X-Device-Id': 'test-attendance-missing-student' });
  console.log(`Missing studentId: Status ${r.statusCode}`);
  pass1 = r.statusCode === 400;
  const status1 = pass1 ? '✅ PASS' : '❌ FAIL';
  console.log(`Expected 400 ${status1}`);

  r = await request('POST', '/api/sync/attendance', '[{"id":"att1","studentId":"s1","status":"hadir"}]', { 'X-Device-Id': 'test-attendance-missing-date' });
  console.log(`Missing tanggal: Status ${r.statusCode}`);
  pass2 = r.statusCode === 400;
  const status2 = pass2 ? '✅ PASS' : '❌ FAIL';
  console.log(`Expected 400 ${status2}`);

  r = await request('POST', '/api/sync/attendance', '[{"id":"att1","studentId":"s1","tanggal":"2025-01-09"}]', { 'X-Device-Id': 'test-attendance-missing-status' });
  console.log(`Missing status: Status ${r.statusCode}`);
  pass3 = r.statusCode === 400;
  const status3 = pass3 ? '✅ PASS' : '❌ FAIL';
  console.log(`Expected 400 ${status3}`);

  const overallPass = pass1 && pass2 && pass3;
  results.push({ test: 'Test 5: Required Fields', pass: overallPass, expected: '3x 400', actual: overallPass ? 'All correct' : 'Some failed' });

  console.log('\n[Test 6] Valid Request Success');
  console.log('Expected: 200 OK with proper response');
  try {
    const validBody = JSON.stringify([
      { id: 'student-valid', nisn: '99999', namaLengkap: 'Valid Student', updatedAt: '2025-01-09T10:00:00.000Z' }
    ]);
    const response = await request('POST', '/api/sync/students', validBody, { 'X-Device-Id': 'test-valid-request' });
    const parsed = JSON.parse(response.body || '{}');
    const pass = response.statusCode === 200 && parsed.ok === true && parsed.count === 1 && parsed.synced > 0;
    console.log(`Status: ${response.statusCode}`);
    const status = pass ? '✅ PASS' : '❌ FAIL';
    console.log(`Expected 200 with ok=true ${status}`);
    results.push({ test: 'Test 6: Valid Request', pass, expected: '200 ok=true', actual: pass ? 'Correct' : 'Failed' });
  } catch (error) {
    console.log(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    results.push({ test: 'Test 6: Valid Request', pass: false, expected: '200 ok=true', actual: 'Failed' });
  }

  console.log('\n========================================');
  console.log('TEST SUMMARY');
  console.log('========================================');

  const passCount = results.filter((entry) => entry.pass).length;
  const totalCount = results.length;

  console.log('\nResults:');
  for (const entry of results) {
    const icon = entry.pass ? '✅' : '❌';
    console.log(`${icon} ${entry.test} - ${entry.actual}`);
  }

  console.log(`\nTotal: ${passCount} / ${totalCount} tests passed`);

  if (passCount === totalCount) {
    console.log('🎉 All tests PASSED!');
    process.exit(0);
  }

  console.log('⚠️  Some tests failed. Review output above.');
  process.exit(1);
}

runTests().catch((error) => {
  console.error('Test error:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
