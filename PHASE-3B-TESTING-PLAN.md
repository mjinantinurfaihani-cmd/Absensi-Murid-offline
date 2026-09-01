# Phase 3B: Comprehensive Testing Plan

**Phase 3B Status**: In Progress  
**Objective**: Verify Phase 2 (data sync integrity) + Phase 3A (request validation) work correctly end-to-end  
**Duration**: 2-3 hours for full manual verification  

## Part 1: Data Sync Integrity Tests (Phase 2 Verification)

These 5 scenarios verify the Phase 2 fixes work correctly with real data:

### Scenario 1: Multi-Device Timestamp Ordering (Fix #1)

**Objective**: Verify numeric timestamp comparison (not string-based)

**Setup**:
```bash
# Clear test data
rm server/data/students.json
echo '[]' > server/data/students.json
```

**Test Steps**:
1. Device A sends: `{ id: "s1", nisn: "12345", namaLengkap: "Alice", updatedAt: "2025-01-09T10:00:00.000Z", deleted: 0, synced: 1 }`
2. Device B sends (same ID, later timestamp): `{ id: "s1", nisn: "12345", namaLengkap: "Alice Updated", updatedAt: "2025-01-09T10:00:05.000Z", deleted: 0, synced: 1 }`
3. Device C sends (same ID, earlier timestamp): `{ id: "s1", nisn: "12345", namaLengkap: "Alice Old", updatedAt: "2025-01-09T09:59:55.000Z", deleted: 0, synced: 1 }`

**Expected Result**:
- After all 3 syncs, `server/data/students.json` should contain Device B's record (latest timestamp)
- namaLengkap should be "Alice Updated"
- If using string comparison, result would incorrectly be Device C or alphabetically ordered

**Verification**:
```bash
cat server/data/students.json | jq '.[0]'
# Check: namaLengkap === "Alice Updated" and updatedAt === "2025-01-09T10:00:05.000Z"
```

**Pass Criteria**: ✅ namaLengkap is "Alice Updated" (not "Alice Old" or other value)

---

### Scenario 2: Soft-Delete Permanence (Fix #2)

**Objective**: Verify deleted record cannot be un-deleted by equal/older timestamps

**Setup**:
```bash
echo '[{"id":"s2","nisn":"54321","namaLengkap":"Bob","deleted":0,"updatedAt":"2025-01-09T10:00:00.000Z","synced":1}]' > server/data/students.json
```

**Test Steps**:
1. Device A sends delete (set deleted=1 with timestamp T1): `{ id: "s2", ..., deleted: 1, updatedAt: "2025-01-09T10:00:00.000Z", synced: 0 }`
2. Device B attempts resurrection (same timestamp T1): `{ id: "s2", nisn: "54321", namaLengkap: "Bob", deleted: 0, updatedAt: "2025-01-09T10:00:00.000Z", synced: 1 }`
3. Device C attempts resurrection (earlier timestamp): `{ id: "s2", nisn: "54321", namaLengkap: "Bob", deleted: 0, updatedAt: "2025-01-09T09:59:59.999Z", synced: 1 }`

**Expected Result**:
- After all 3 syncs, record should still have `deleted: 1` and `updatedAt: "2025-01-09T10:00:00.000Z"` (original delete timestamp)
- Record stays deleted (cannot be un-deleted)
- older/equal updates are rejected

**Verification**:
```bash
cat server/data/students.json | jq '.[0]'
# Check: deleted === 1 and updatedAt === "2025-01-09T10:00:00.000Z"
```

**Pass Criteria**: ✅ deleted remains 1, namaLengkap unchanged (stays null/deleted)

---

### Scenario 3: Newer Delete vs Old Update (Fix #2 Variant)

**Objective**: Verify newer delete timestamp overrides old data

**Setup**:
```bash
echo '[{"id":"s3","nisn":"99999","namaLengkap":"Charlie","deleted":0,"updatedAt":"2025-01-09T10:00:00.000Z","synced":1}]' > server/data/students.json
```

**Test Steps**:
1. Device A sends update (old timestamp T1): `{ id: "s3", nisn: "99999", namaLengkap: "Charlie", deleted: 0, updatedAt: "2025-01-09T10:00:00.000Z", synced: 1 }`
2. Device B sends delete (newer timestamp T2 = T1 + 5sec): `{ id: "s3", deleted: 1, updatedAt: "2025-01-09T10:00:05.000Z", synced: 0 }`
3. Device C attempts old data resurrection (old timestamp T1): `{ id: "s3", nisn: "99999", namaLengkap: "Charlie", deleted: 0, updatedAt: "2025-01-09T10:00:00.000Z", synced: 1 }`

**Expected Result**:
- After all 3 syncs, record should have `deleted: 1` with newer timestamp from Device B
- Old data in Device C is rejected (older than delete)

**Verification**:
```bash
cat server/data/students.json | jq '.[0]'
# Check: deleted === 1 and updatedAt === "2025-01-09T10:00:05.000Z"
```

**Pass Criteria**: ✅ deleted is 1, timestamp is T2 (newer delete wins)

---

### Scenario 4: Clock Skew Tolerance (Fix #4)

**Objective**: Verify ±60 second tolerance doesn't trigger false conflicts

**Setup**:
```bash
echo '[]' > server/data/attendance.json
# Also clear conflicts
echo '{}' > server/data/attendance-conflicts.json
```

**Test Steps**:
1. Device A sends attendance record T1 (2025-01-09T10:00:00.000Z): `{ id: "att1", studentId: "s1", tanggal: "2025-01-09", status: "hadir", updatedAt: "2025-01-09T10:00:00.000Z", synced: 1 }`
2. Device B sends same record T2 = T1 + 30 seconds: `{ id: "att1", studentId: "s1", tanggal: "2025-01-09", status: "hadir", updatedAt: "2025-01-09T10:00:30.000Z", synced: 1 }`
3. Check conflicts endpoint: GET /api/attendance-conflicts

**Expected Result**:
- No conflict should be detected (30 sec < 60 sec tolerance)
- /api/attendance-conflicts should return empty array OR not contain this record

**Verification**:
```bash
curl http://localhost:4174/api/attendance-conflicts 2>/dev/null | jq '.[] | select(.key == "...")'
# Should return no matching conflict
```

**Pass Criteria**: ✅ No conflict detected for 30-second difference

---

### Scenario 4B: False Conflict Detection (Clock Skew Edge Case)

**Objective**: Verify conflict detected for differences > 60 seconds

**Test Steps**:
1. Device A sends attendance record T1: `{ id: "att2", studentId: "s2", tanggal: "2025-01-09", status: "hadir", updatedAt: "2025-01-09T10:00:00.000Z", synced: 1 }`
2. Device B sends same record with status change T2 = T1 + 90 seconds: `{ id: "att2", studentId: "s2", tanggal: "2025-01-09", status: "sakit", updatedAt: "2025-01-09T10:01:30.000Z", synced: 1 }`
3. Check conflicts: GET /api/attendance-conflicts

**Expected Result**:
- Conflict SHOULD be detected (90 sec > 60 sec tolerance AND status differs)
- /api/attendance-conflicts should list this conflict

**Verification**:
```bash
curl http://localhost:4174/api/attendance-conflicts 2>/dev/null | jq '.'
# Should include conflict with att2
```

**Pass Criteria**: ✅ Conflict detected for 90-second difference with status change

---

### Scenario 5: Server-Firebase-Local Merge Cascade

**Objective**: Verify multi-source sync chain works without data corruption

**Setup**:
```bash
# Clear all data
echo '[]' > server/data/students.json
echo '[]' > server/data/teachers.json  
echo '[]' > server/data/attendance.json
```

**Test Steps**:
1. Local (frontend) syncs to Server: `POST /api/sync/students` with new student record
2. Server receives and stores in server/data/students.json
3. Local then calls `GET /api/data/students` to fetch server state
4. Verify merged correctly locally
5. (Optional) Firebase sync would happen next but can verify server state is consistent

**Expected Result**:
- Server receives, stores, and returns consistent data
- No timestamp mutations
- Record IDs unchanged

**Verification**:
```bash
# Manual:
# 1. Check server/data/students.json has the record
# 2. Check timestamp matches what was sent
cat server/data/students.json | jq '.'
```

**Pass Criteria**: ✅ Data flows through server without corruption

---

## Part 2: Request Validation Tests (Phase 3A Verification)

### Test 1: Content-Type Validation

**Objective**: Reject non-JSON Content-Type

**Command**:
```bash
curl -X POST http://localhost:4174/api/sync/students \
  -H "Content-Type: text/plain" \
  -d '[{"id":"test1","nisn":"12345"}]' 2>/dev/null | jq '.'
```

**Expected**: 
```json
{
  "ok": false,
  "error": "Content-Type must be application/json"
}
```

**HTTP Status**: 400

**Pass Criteria**: ✅ Returns 400 with correct error message

---

### Test 2: Payload Size Validation

**Objective**: Reject payloads > 10MB

**Command**:
```bash
# Create 11MB test file
python3 << 'EOF'
data = [{"id": f"test-{i}", "nisn": "x" * 10000, "namaLengkap": "test"} for i in range(1200)]
import json
payload = json.dumps(data)
print(f"Payload size: {len(payload)} bytes")
with open('/tmp/large.json', 'w') as f:
    f.write(payload)
EOF

curl -X POST http://localhost:4174/api/sync/students \
  -H "Content-Type: application/json" \
  -d @/tmp/large.json 2>/dev/null | jq '.'
```

**Expected**:
```json
{
  "ok": false,
  "error": "Payload too large (max 10485760 bytes)"
}
```

**HTTP Status**: 413

**Pass Criteria**: ✅ Returns 413 for payload > 10MB

---

### Test 3: Table Name Validation

**Objective**: Reject invalid table names

**Command**:
```bash
curl -X POST http://localhost:4174/api/sync/malicious \
  -H "Content-Type: application/json" \
  -d '[{"id":"test"}]' 2>/dev/null | jq '.'
```

**Expected**:
```json
{
  "ok": false,
  "error": "Invalid table name: malicious"
}
```

**HTTP Status**: 400

**Pass Criteria**: ✅ Returns 400 for invalid table

---

### Test 4: Rate Limiting

**Objective**: Enforce 50 requests/minute per device

**Command**:
```bash
# Send 51 requests rapidly
for i in {1..51}; do
  curl -X POST http://localhost:4174/api/sync/students \
    -H "Content-Type: application/json" \
    -H "X-Device-ID: test-device-123" \
    -d '[{"id":"s'$i'","nisn":"12345"}]' 2>/dev/null | jq -r '.error // .ok'
done
```

**Expected Output**:
- Requests 1-50: `true` (ok: true)
- Request 51: Error message with rate limit

**Pass Criteria**: ✅ Requests 1-50 succeed, request 51 returns error

---

### Test 5: Required Field Validation (Attendance)

**Objective**: Reject records missing required fields

**Command A - Missing studentId**:
```bash
curl -X POST http://localhost:4174/api/sync/attendance \
  -H "Content-Type: application/json" \
  -d '[{"id":"att1","tanggal":"2025-01-09","status":"hadir"}]' 2>/dev/null | jq '.'
```

**Expected**:
```json
{
  "ok": false,
  "error": "Record 0: Invalid studentId: required and must be string"
}
```

**HTTP Status**: 400

**Command B - Missing tanggal**:
```bash
curl -X POST http://localhost:4174/api/sync/attendance \
  -H "Content-Type: application/json" \
  -d '[{"id":"att1","studentId":"s1","status":"hadir"}]' 2>/dev/null | jq '.'
```

**Expected**:
```json
{
  "ok": false,
  "error": "Record 0: Invalid tanggal: required and must be string"
}
```

**HTTP Status**: 400

**Command C - Missing status**:
```bash
curl -X POST http://localhost:4174/api/sync/attendance \
  -H "Content-Type: application/json" \
  -d '[{"id":"att1","studentId":"s1","tanggal":"2025-01-09"}]' 2>/dev/null | jq '.'
```

**Expected**:
```json
{
  "ok": false,
  "error": "Record 0: Invalid status: required and must be string"
}
```

**HTTP Status**: 400

**Pass Criteria**: ✅ All 3 variations correctly reject with specific field error

---

### Test 6: Valid Request Success

**Objective**: Ensure valid requests still succeed

**Command**:
```bash
curl -X POST http://localhost:4174/api/sync/students \
  -H "Content-Type: application/json" \
  -d '[{"id":"student-123","nisn":"12345","namaLengkap":"John Doe","updatedAt":"2025-01-09T10:00:00.000Z"}]' 2>/dev/null | jq '.'
```

**Expected**:
```json
{
  "ok": true,
  "count": 1,
  "synced": 5,
  "deviceId": "..."
}
```

**HTTP Status**: 200

**Pass Criteria**: ✅ Valid request succeeds with proper response structure

---

## Part 3: End-to-End Flow Test

**Objective**: Multi-device concurrent sync with conflict detection

**Scenario**: 3 devices sync attendance for same student same date

**Setup**:
```bash
# Start server
npm run server &  # or node server/https.mjs

# Clear test data
echo '[]' > server/data/attendance.json
echo '{}' > server/data/attendance-conflicts.json
```

**Test Steps**:
1. Device A: POST `/api/sync/attendance` with `status: "hadir"`, `updatedAt: T1`
2. Device B: POST `/api/sync/attendance` with `status: "sakit"`, `updatedAt: T2 = T1 + 2sec` (same student, same date)
3. Device C: POST `/api/sync/attendance` with `status: "izin"`, `updatedAt: T3 = T1 + 90sec` (much later)
4. Fetch `/api/attendance-conflicts` and check results

**Expected Result**:
- Device C's record (status: "izin", T3) should be final (newest)
- Conflict should be detected between A/B (status differs + within 60sec) OR between B/C (status differs, > 60sec)
- All records received with 200 status

**Verification**:
```bash
curl http://localhost:4174/api/attendance-conflicts 2>/dev/null | jq '.'
curl http://localhost:4174/api/data/attendance 2>/dev/null | jq '.'
```

**Pass Criteria**:
- ✅ No 4xx errors from valid submissions
- ✅ Conflict detected with status differences
- ✅ Latest record (Device C) appears in final data

---

## Test Execution Instructions

### Prerequisites
```bash
cd absensi-siswa-offline
npm install  # ensure dependencies
npm run build  # ensure latest build
```

### Run Tests Sequentially

**Phase 2 Tests (Data Sync Integrity)**:
```bash
# Start server
npm run server &
SERVER_PID=$!

# Run Scenarios 1-5 manually, checking output after each

# Stop server
kill $SERVER_PID
```

**Phase 3A Tests (Request Validation)**:
```bash
# Start server
npm run server &
SERVER_PID=$!

# Run Tests 1-6 via curl commands, verify HTTP status and error messages

# Stop server
kill $SERVER_PID
```

---

## Pass/Fail Criteria Summary

### Phase 2 Data Sync (5 Scenarios):
| Scenario | Pass Criteria | Status |
|----------|---------------|--------|
| 1. Numeric Timestamps | Latest timestamp wins | ⏳ Pending |
| 2. Soft-Delete Permanence | Deleted stays deleted | ⏳ Pending |
| 3. Newer Delete Override | Newer delete replaces old data | ⏳ Pending |
| 4. Clock Skew Tolerance | 30sec diff: no conflict | ⏳ Pending |
| 4B. Edge Case | 90sec diff: conflict detected | ⏳ Pending |

### Phase 3A Validation (6 Tests):
| Test | Pass Criteria | Status |
|------|---------------|--------|
| 1. Content-Type | 400 for non-JSON | ⏳ Pending |
| 2. Payload Size | 413 for >10MB | ⏳ Pending |
| 3. Table Name | 400 for invalid table | ⏳ Pending |
| 4. Rate Limit | 429 on request 51+ | ⏳ Pending |
| 5. Required Fields | 400 with field-specific error | ⏳ Pending |
| 6. Valid Request | 200 with correct response | ⏳ Pending |

---

## After All Tests Pass

1. Update todo list: Mark Phase 3B as completed
2. Create `PHASE-3B-TEST-RESULTS.md` with all pass/fail outcomes
3. Begin Phase 3C: Monitoring & Logging
4. Plan: Add logging for sync operations, conflicts, deleted resurrections
5. Ensure error metrics are tracked

---

**Status**: Ready to execute  
**Next Step**: Start with Phase 2 Scenario 1  
**Estimated Time**: 2-3 hours for full verification + documentation
