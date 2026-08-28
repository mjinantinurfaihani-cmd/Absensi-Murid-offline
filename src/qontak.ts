import type { Attendance, Student, UserSession } from './types';

function formatTime(value: string) {
  return value.slice(0, 5);
}

function normalizePhone(value: string) {
  const digits = value.replace(/[^\d+]/g, '');
  if (digits.startsWith('+62')) return digits.slice(1);
  if (digits.startsWith('62')) return digits;
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  return digits;
}

function messageFor(student: Student, record: Attendance, event: 'hadir' | 'pulang', user: UserSession) {
  if (event === 'hadir') {
    return `Assalamu'alaikum Bapak/Ibu.\n\nKami informasikan bahwa ananda ${student.nama} dari kelas ${student.kelas} telah hadir di SDN 268 Panyileukan pada pukul ${formatTime(record.jamMasuk)}.\nStatus kehadiran: ${record.status === 'TERLAMBAT' ? 'terlambat' : 'hadir'}.\n\nTerima kasih.\n${user.nama}\nGuru SDN 268 Panyileukan`;
  }
  return `Assalamu'alaikum Bapak/Ibu.\n\nAnanda ${student.nama} dari kelas ${student.kelas} telah tercatat pulang dari SDN 268 Panyileukan pada pukul ${formatTime(record.jamPulang)}.\n\nTerima kasih.\n${user.nama}\nGuru SDN 268 Panyileukan`;
}

export async function sendAttendanceQontak(student: Student, record: Attendance, event: 'hadir' | 'pulang', user: UserSession) {
  const phone = normalizePhone(student.kontak.trim());
  if (!phone || !/^62\d{8,15}$/.test(phone)) {
    console.warn(`Kontak Qontak untuk ${student.nama} bukan nomor Indonesia yang valid.`);
    return;
  }

  try {
    const response = await fetch('/api/qontak/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, text: messageFor(student, record, event, user) })
    });
    if (!response.ok) console.warn('Notifikasi Qontak tidak terkirim:', await response.text());
  } catch (error) {
    console.warn('Notifikasi Qontak gagal:', error);
  }
}
