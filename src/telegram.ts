import type { Attendance, Student, UserSession } from './types';

function formatTime(value: string) {
  return value.slice(0, 5);
}

function messageFor(student: Student, record: Attendance, event: 'hadir' | 'pulang', user: UserSession) {
  if (event === 'hadir') {
    return `Assalamu'alaikum.\n\nBapak/Ibu, kami informasikan bahwa ${student.nama} dari kelas ${student.kelas} telah hadir di sekolah pada pukul ${formatTime(record.jamMasuk)}.\nStatus: ${record.status === 'TERLAMBAT' ? 'terlambat' : 'hadir'}.\n\nTerima kasih.\n${user.nama}`;
  }
  return `Assalamu'alaikum.\n\nBapak/Ibu, ${student.nama} dari kelas ${student.kelas} telah dicatat pulang pada pukul ${formatTime(record.jamPulang)}.\n\nTerima kasih.\n${user.nama}`;
}

export async function sendAttendanceTelegram(student: Student, record: Attendance, event: 'hadir' | 'pulang', user: UserSession) {
  const chatId = student.kontak.trim();
  if (!chatId) return;
  if (!/^-?\d+$/.test(chatId)) {
    console.warn(`Kontak Telegram untuk ${student.nama} bukan chat_id numerik.`);
    return;
  }

  try {
    const response = await fetch('/api/telegram/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, text: messageFor(student, record, event, user) })
    });
    if (!response.ok) console.warn('Notifikasi Telegram tidak terkirim:', await response.text());
  } catch (error) {
    console.warn('Notifikasi Telegram gagal:', error);
  }
}
