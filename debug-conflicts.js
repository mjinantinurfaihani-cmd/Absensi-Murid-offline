const fs = require('fs');
const data = JSON.parse(fs.readFileSync('./server/data/attendance.json', 'utf8'));

// Simulate conflict detection
const grouped = new Map();
data.forEach(record => {
  const key = `${record.studentId}|${record.tanggal}`;
  if (!grouped.has(key)) grouped.set(key, []);
  grouped.get(key).push(record);
});

// Check s-001/2026-09-01
const s001Key = 's-001|2026-09-01';
const records = grouped.get(s001Key) || [];

console.log('Records for s-001/2026-09-01:', records.length);
records.forEach(r => {
  console.log('  - Status:', r.status, 'Role:', r.ownerRole, 'Updated:', r.updatedAt);
});

// Check for conflict (different statuses)
const statuses = new Set(records.map(r => r.status));
const timestamps = records.map(r => new Date(r.updatedAt).getTime());

console.log('Unique statuses:', Array.from(statuses));
console.log('Has status conflict:', statuses.size > 1);

if (timestamps.length > 1) {
  const timeDiff = Math.abs(timestamps[0] - timestamps[1]);
  console.log('Time difference (ms):', timeDiff);
  console.log('Has time conflict (>60000ms):', timeDiff > 60000);
}

// Now check what the API actually returns
console.log('\n--- API /api/attendance-conflicts ---');
const conflicts = grouped.entries();
const conflictArray = [];

for (let [key, records] of conflicts) {
  const statuses = new Set(records.map(r => r.status));
  const timestamps = records.map(r => new Date(r.updatedAt).getTime());
  
  let isConflict = false;
  if (statuses.size > 1) {
    isConflict = true;
  } else if (timestamps.length > 1) {
    const maxTimeDiff = Math.max(...timestamps) - Math.min(...timestamps);
    if (maxTimeDiff > 60000) {
      isConflict = true;
    }
  }
  
  if (isConflict) {
    conflictArray.push({ key, hasConflict: true });
  }
}

const s001Conflicts = conflictArray.filter(c => c.key.startsWith('s-001'));
console.log('s-001 conflicts detected:', s001Conflicts);
