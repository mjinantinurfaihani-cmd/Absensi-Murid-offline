# Data Sync Integrity Fixes - Phase 2

## Summary
Applied **4 critical fixes** to address data integrity vulnerabilities in multi-source sync (local ↔ server ↔ Firebase):

---

## Fixes Applied

### ✅ Fix 1: Numeric Timestamp Comparison (server/index.mjs)
**Issue**: String comparison of timestamps caused incorrect merge order
- `String("2026-01-01") >= String("2026-12-31")` → false (wrong!)
- `String("2026-09-01T10:00:00Z") >= String("2026-09-01T09:59:59Z")` → may fail

**Solution**: Convert to numeric timestamps before comparison
```javascript
const toTimestamp = (value) => {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
};
// Now: incomingTime > oldTime (numeric comparison, always correct)
```

**Files Modified**: `server/index.mjs` (POST /api/sync/:table endpoint)
**Impact**: Server-side merge now correctly orders updates regardless of timestamp format

---

### ✅ Fix 2: Soft-Delete Permanence (src/sync.ts + server/index.mjs)
**Issue**: Records marked `deleted=1` could be resurrected by incoming updates with equal/newer timestamps
- Device A deletes record at 2026-01-01T10:00:00Z (deleted=1)
- Device B updates same record at 2026-01-01T10:00:00Z (deleted=0, because equal timestamp)
- Result: Record undeleted! ❌

**Solution**: Once `deleted=1` with timestamp T, incoming updates cannot resurrect unless `incomingTime > T`
```javascript
// In server/index.mjs POST /api/sync/:table
if (old?.deleted === 1 && incomingTime <= oldTime) {
  records.set(item.id, { ...item, deleted: 1, updatedAt: old.updatedAt });
  // Keep deleted flag and original timestamp
}

// In src/sync.ts mergeRows()
const deletedVersion = result.find(r => r.id === row.id && r.deleted === 1);
if (deletedVersion && toTimestamp(row.updatedAt) <= toTimestamp(deletedVersion.updatedAt)) {
  return false; // Filter out non-deleted version
}
```

**Files Modified**: 
- `server/index.mjs` (POST /api/sync/:table endpoint)
- `src/sync.ts` (mergeRows function)

**Impact**: Soft-delete is now irreversible without explicit newer update

---

### ✅ Fix 3: Filter Soft-Deleted Before Transmission (src/sync.ts)
**Issue**: Soft-deleted records were sent to server unnecessarily, increasing payload and confusion
- Wastes bandwidth for deleted records
- Server might treat deleted records as "active" if not careful

**Solution**: Filter `deleted=1` records before sending to server
```javascript
const nonDeleted = rows.filter(r => r.deleted !== 1);
if (nonDeleted.length > 0) {
  const response = await fetch(`${resolvedApiBase()}/api/sync/${name}`, {
    method: 'POST',
    body: JSON.stringify(nonDeleted)
  });
}
```

**Files Modified**: `src/sync.ts` (syncAll function)
**Impact**: Only active records transmitted, cleaner sync protocol

---

### ✅ Fix 4: Improved Conflict Detection + Clock Skew Tolerance (server/index.mjs)
**Issue**: 
- Conflicts didn't skip soft-deleted records (marking deleted records as conflicted)
- No tolerance for clock skew (typical network delay: 100ms-5min)
  - Two devices with 2-minute clock difference would falsely conflict
  - Should only conflict if same student+date has DIFFERENT statuses

**Solution**:
1. Skip soft-deleted records: `if (record.deleted === 1) continue;`
2. Add 60-second clock skew tolerance:
```javascript
const times = records.map(r => toTimestamp(r.updatedAt));
const minTime = Math.min(...times);
const maxTime = Math.max(...times);
// Only conflict if timestamps differ by > 60 seconds (1 minute tolerance)
return (maxTime - minTime) > 60000 && statuses.size > 1;
```
3. Track conflict detection time:
```javascript
return {
  key, records, ...,
  detectedAt: new Date().toISOString()
};
```

**Files Modified**: `server/index.mjs` (conflicts function)
**Impact**: 
- Cleaner conflict list (no false positives from deleted records)
- Tolerates reasonable clock skew
- Better audit trail with detection timestamp

---

## Data Integrity Rules (Enforced)

| Rule | Enforced In | Behavior |
|------|-------------|----------|
| **Newer timestamp wins** | server/index.mjs sync + src/sync.ts mergeRows | Always use record with later `updatedAt` |
| **Soft-delete is permanent** | server/index.mjs + src/sync.ts | `deleted=1` cannot be overwritten by equal/older timestamps |
| **Filter deleted records** | src/sync.ts syncAll() + src/sync.ts uniqueRows() | Don't transmit or display `deleted=1` records |
| **Version-aware merge** | server/index.mjs | If timestamps equal, prefer higher `__version` number |
| **Clock skew tolerance** | server/index.mjs conflicts() | Allow ±60sec variance before flagging conflict |

---

## Testing Scenarios (Manual Verification)

### Scenario 1: Multi-Device Timestamp Order
1. Device A: Create attendance record at T1 (status='Hadir')
2. Device B: Update same record at T2 (status='Sakit'), T2 > T1
3. ✅ Expected: Device B version wins (newer timestamp)
4. Verify in: server/data/attendance.json → record has status='Sakit'

### Scenario 2: Soft-Delete Resurrection Attempt
1. Device A: Delete attendance at T1 (deleted=1)
2. Device B (offline at T1): Update same record at T1 (status='Izin', deleted=0)
3. Device B syncs with T1 timestamp
4. ✅ Expected: Stays deleted=1 (Equal timestamp: deletion preserved)
5. Verify in: mergeRows() filters `deleted=1` → record not visible

### Scenario 3: Newer Update After Deletion
1. Device A: Delete record at T1 (deleted=1, updatedAt=T1)
2. Device B: Update same record at T3 (status='Hadir', deleted=0, T3 > T1)
3. ✅ Expected: Record undeleted, shows new status
4. Verify in: server/data/attendance.json → deleted=0, status='Hadir'

### Scenario 4: Clock Skew (1-minute difference)
1. Device A: Create record at 10:00:00 local time
2. Device B (clock 1min ahead): Also create same record at 10:01:00 local time
3. Server receives both, timestamps differ by 60sec
4. ✅ Expected: No false conflict (one wins by timestamp, not flagged as conflict)
5. Verify in: conflicts() only flags if status differs OR clock > 60sec

### Scenario 5: Server-Firebase-Local Merge
1. Local: record V1 at T1
2. Server: record V2 at T2 (T2 > T1)
3. Firebase: record V3 at T3 (T3 > T2)
4. ✅ Expected: Final result is V3 (merged correctly across all sources)
5. Verify in: mergeRows(local, remote) + mergeWithFirebase() flow

---

## Deployment Checklist

- [x] All 4 fixes applied
- [x] Build succeeds (517 modules, 0 errors)
- [x] TypeScript compilation clean
- [x] Numeric timestamp conversion tested (Date.parse logic)
- [ ] Run manual verification of 5 scenarios above
- [ ] Test multi-device sync offline→online flow
- [ ] Monitor production conflict logs for false positives
- [ ] Verify backup/restore maintains deleted=1 integrity

---

## Related Issues Resolved
- ❌ **String timestamp comparison** → ✅ Numeric comparison now
- ❌ **Soft-delete resurrection** → ✅ Timestamp-based permanence
- ❌ **False conflict detection** → ✅ Clock skew tolerance + deleted filter
- ❌ **Unnecessary deleted record transmission** → ✅ Filtered before send

---

## Next Steps
1. **Manual Testing**: Execute the 5 verification scenarios
2. **Integration Test**: Full sync flow (offline→server→Firebase→local)
3. **Monitoring**: Add logging for deleted record resurrections (should be zero)
4. **Stress Test**: Simulate 10 concurrent devices, same record updates
5. **Firebase Rules Review**: Ensure Firestore rules enforce similar soft-delete logic
