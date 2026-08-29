import { db } from "../db";

function resolvedApiBase() {
  const configured = (localStorage.getItem("serverUrl") || "").trim();
  return configured ? configured.replace(/\/$/, "") : "";
}

const API_URL = resolvedApiBase();

async function checkServerHealth() {
  const api = resolvedApiBase();
  if (!navigator.onLine || !api) return false;
  try {
    const response = await fetch(`${api}/health`, { signal: AbortSignal.timeout(5000) });
    return response.ok;
  } catch {
    return false;
  }
}

export async function serverHealthStatus() {
  return checkServerHealth();
}

export async function serverHealth() {
  return checkServerHealth();
}

async function pushStudents() {
  if (!(await checkServerHealth())) return 0;
  const data = await db.students.toArray();
  await fetch(`${API_URL}/api/sync/students`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  return data.length;
}

async function pullStudents() {
  if (!(await checkServerHealth())) return 0;
  const response = await fetch(`${API_URL}/api/data/students`);
  const data = await response.json();

  const byNisn = new Map<string, any>();
  for (const item of data) {
    const nisn = item?.nisn;
    if (!nisn) continue;
    const existing = byNisn.get(nisn);
    if (!existing) byNisn.set(nisn, item);
    else {
      const existingAt = existing.updatedAt ?? '';
      const itemAt = item.updatedAt ?? '';
      if (itemAt > existingAt) byNisn.set(nisn, item);
    }
  }
  for (const item of data) {
    if (!item?.nisn) {
      byNisn.set(item.id ?? crypto.randomUUID(), item);
    }
  }

  const deduped = Array.from(byNisn.values());

  try {
    await db.students.bulkPut(deduped);
  } catch (err: any) {
    console.error('students.bulkPut failed', err);
    if (err && err.name === 'BulkError' && Array.isArray(err.failuresByPos)) {
      const failuresByPos: boolean[] = err.failuresByPos;
      const successful = deduped.filter((_, i) => !failuresByPos[i]);
      if (successful.length) {
        await db.students.bulkPut(successful);
      }
    } else {
      throw err;
    }
  }
  return deduped.length;
}

async function pushTeachers() {
  if (!(await checkServerHealth())) return 0;
  const data = await db.teachers.toArray();
  await fetch(`${API_URL}/api/sync/teachers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  return data.length;
}

async function pushAttendance() {
  if (!(await checkServerHealth())) return 0;
  const data = await db.attendance.toArray();
  await fetch(`${API_URL}/api/sync/attendance`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  return data.length;
}

async function pullTeachers() {
  if (!(await checkServerHealth())) return 0;
  const response = await fetch(`${API_URL}/api/data/teachers`);
  const data = await response.json();

  const byNik = new Map<string, any>();
  for (const item of data) {
    const nik = item?.nik;
    if (!nik) continue;
    const existing = byNik.get(nik);
    if (!existing) byNik.set(nik, item);
    else {
      const existingAt = existing.updatedAt ?? '';
      const itemAt = item.updatedAt ?? '';
      if (itemAt > existingAt) byNik.set(nik, item);
    }
  }
  for (const item of data) {
    if (!item?.nik) {
      byNik.set(item.id ?? crypto.randomUUID(), item);
    }
  }

  const deduped = Array.from(byNik.values());

  try {
    await db.teachers.bulkPut(deduped);
  } catch (err: any) {
    console.error('teachers.bulkPut failed', err);
    if (err && err.name === 'BulkError' && Array.isArray(err.failuresByPos)) {
      const failuresByPos: boolean[] = err.failuresByPos;
      const successful = deduped.filter((_, i) => !failuresByPos[i]);
      if (successful.length) {
        await db.teachers.bulkPut(successful);
      }
    } else {
      throw err;
    }
  }
  return deduped.length;
}

async function pullAttendance() {
  if (!(await checkServerHealth())) return 0;
  const response = await fetch(`${API_URL}/api/data/attendance`);
  const data = await response.json();

  const byId = new Map<string, any>();
  for (const item of data) {
    const id = item?.id ?? crypto.randomUUID();
    const existing = byId.get(id);
    if (!existing) byId.set(id, item);
    else {
      const existingAt = existing.updatedAt ?? '';
      const itemAt = item.updatedAt ?? '';
      if (itemAt > existingAt) byId.set(id, item);
    }
  }

  const deduped = Array.from(byId.values());

  try {
    await db.attendance.bulkPut(deduped);
  } catch (err: any) {
    console.error('attendance.bulkPut failed', err);
    if (err && err.name === 'BulkError' && Array.isArray(err.failuresByPos)) {
      const failuresByPos: boolean[] = err.failuresByPos;
      const successful = deduped.filter((_, i) => !failuresByPos[i]);
      if (successful.length) {
        await db.attendance.bulkPut(successful);
      }
    } else {
      throw err;
    }
  }
  return deduped.length;
}

export async function syncAll() {
  if (!resolvedApiBase() || !navigator.onLine || !(await checkServerHealth())) {
    return { sent: 0 };
  }

  const students = await db.students.toArray();
  const teachers = await db.teachers.toArray();
  const attendance = await db.attendance.toArray();

  await pushStudents();
  await pushTeachers();
  await pushAttendance();

  await pullStudents();
  await pullTeachers();
  await pullAttendance();

  localStorage.setItem("lastSync", new Date().toISOString());
  window.dispatchEvent(new CustomEvent("public-data-updated", { detail: "sync" }));

  return {
    sent: students.length + teachers.length + attendance.length
  };
}

export async function syncNow() {
  await syncAll();
}