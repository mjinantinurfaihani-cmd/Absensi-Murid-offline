import type { Attendance, Student, UserSession } from './types';

export type InfobipDeliveryResult = {
  sent: boolean;
  skipped?: boolean;
  messageId?: string;
  error?: string;
};

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

export async function sendAttendanceInfobip(student: Student, record: Attendance, event: 'hadir' | 'pulang', user: UserSession): Promise<InfobipDeliveryResult> {
  const phone = normalizePhone(student.kontak.trim());
  if (!phone || !/^62\d{8,15}$/.test(phone)) {
    return { sent: false, error: 'Nomor kontak tidak valid atau belum diisi' };
  }

  try {
    const response = await fetch('/api/infobip/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, text: messageFor(student, record, event, user), event, studentName: student.nama, className: student.kelas, time: formatTime(event === 'hadir' ? record.jamMasuk : record.jamPulang) })
    });
    const result = await response.json() as { result?: { messageId?: string }; messageId?: string; error?: string; skipped?: boolean };
    if (result?.skipped) return { sent: false, skipped: true, error: result.error || 'Notifikasi WhatsApp dilewati karena Infobip belum dikonfigurasi.' };
    if (!response.ok) return { sent: false, error: result.error || 'Infobip menolak pesan' };
    return { sent: true, messageId: result.messageId || result.result?.messageId };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : 'Infobip tidak dapat dihubungi' };
  }
}
