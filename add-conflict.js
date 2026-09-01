import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filePath = path.join(__dirname, 'server', 'data', 'attendance.json');

// Read current data
let data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

// Create 2 conflict records
const record1 = {
    id: "conflict-test-001",
    studentId: "s-001",
    tanggal: "2026-09-01",
    jamMasuk: "07:00",
    jamPulang: "14:00",
    status: "HADIR",
    ownerId: "guru-001",
    ownerRole: "guru",
    deviceId: "browser-device",
    deleted: 0,
    updatedAt: "2026-09-01T07:00:00.000Z",
    synced: 0
};

const record2 = {
    id: "conflict-test-002",
    studentId: "s-001",
    tanggal: "2026-09-01",
    jamMasuk: "07:00",
    jamPulang: "14:00",
    status: "ALPA",
    ownerId: "b52d5373-e7c3-4ca8-834b-695f045a1e49",
    ownerRole: "guru bidang",
    deviceId: "browser-device",
    deleted: 0,
    updatedAt: "2026-09-01T07:02:00.000Z",
    synced: 0
};

// Ensure it's an array
if (!Array.isArray(data)) {
    data = [];
}

// Add records
data.push(record1);
data.push(record2);

// Write back
fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

console.log('Added 2 conflict records. Total records:', data.length);

// Verify
const conflictRecords = data.filter(r => r.studentId === 's-001' && r.tanggal === '2026-09-01');
console.log('Conflict records for s-001:', conflictRecords.length);
conflictRecords.forEach(r => {
    console.log(`  - ${r.status} (${r.ownerRole})`);
});
