import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import type { Student } from '../types';

const CARD_W = 85.6;
const CARD_H = 53.98;
const F4_W = 215.9;
const F4_H = 330;
const COLS = 2;
const ROWS = 5;
const GAP_X = 9;
const GAP_Y = 5;
const MARGIN_X = (F4_W - COLS * CARD_W - GAP_X) / 2;
const MARGIN_Y = (F4_H - ROWS * CARD_H - (ROWS - 1) * GAP_Y) / 2;

export function studentQrPayload(student: Student) {
  return JSON.stringify({
    app: 'ABSENSI-SISWA',
    version: 1,
    id: student.id,
    nisn: student.nisn,
    kelas: student.kelas
  });
}

async function qrDataUrl(student: Student) {
  return QRCode.toDataURL(studentQrPayload(student), {
    width: 720,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#0b1f46', light: '#ffffff' }
  });
}

function safeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, '-').trim();
}

function fitText(doc: jsPDF, text: string, maxWidth: number, initialSize: number, minSize: number) {
  let size = initialSize;
  doc.setFontSize(size);
  while (size > minSize && doc.getTextWidth(text) > maxWidth) {
    size -= 0.5;
    doc.setFontSize(size);
  }
  return size;
}

function paintGradient(doc: jsPDF, x: number, y: number, w: number, h: number) {
  const steps = 48;
  for (let i = 0; i < steps; i += 1) {
    const t = i / (steps - 1);
    const r = Math.round(5 + (24 - 5) * t);
    const g = Math.round(48 + (118 - 48) * t);
    const b = Math.round(115 + (210 - 115) * t);
    doc.setFillColor(r, g, b);
    doc.rect(x + (w * i) / steps, y, w / steps + 0.2, h, 'F');
  }
}

async function drawCard(doc: jsPDF, student: Student, x: number, y: number) {
  paintGradient(doc, x, y, CARD_W, CARD_H);

  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.35);
  doc.roundedRect(x + 0.7, y + 0.7, CARD_W - 1.4, CARD_H - 1.4, 3, 3, 'S');

  doc.setFillColor(52, 139, 220);
  doc.circle(x + 9, y + 8, 18, 'F');

  doc.setFillColor(39, 128, 211);
  doc.circle(x + 48, y + 58, 28, 'F');

  doc.setTextColor(215, 235, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.2);
  doc.text('KARTU QR ABSENSI SISWA', x + 6, y + 8);

  doc.setDrawColor(130, 205, 255);
  doc.setLineWidth(0.5);
  doc.line(x + 6, y + 11, x + 48, y + 11);

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  fitText(doc, student.nama, 47, 12, 7.5);
  const nameLines = doc.splitTextToSize(student.nama, 47).slice(0, 2);
  doc.text(nameLines, x + 6, y + 22, { lineHeightFactor: 1.05 });

  const nameHeight = nameLines.length * 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.2);
  doc.setTextColor(200, 225, 255);
  doc.text('NISN', x + 6, y + 29 + nameHeight);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.6);
  doc.setTextColor(255, 255, 255);
  doc.text(student.nisn, x + 6, y + 35 + nameHeight);

  const qr = await qrDataUrl(student);
  const qrSize = 32;
  const qrX = x + CARD_W - qrSize - 5;
  const qrY = y + (CARD_H - qrSize) / 2;
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(qrX - 2, qrY - 2, qrSize + 4, qrSize + 4, 2, 2, 'F');
  doc.addImage(qr, 'PNG', qrX, qrY, qrSize, qrSize, undefined, 'FAST');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(4.2);
  doc.setTextColor(220, 240, 255);
  doc.text('Pindai QR untuk absensi', x + 6, y + CARD_H - 5);
}

export async function createSingleStudentCardPdf(student: Student) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [CARD_W, CARD_H], compress: true });
  await drawCard(doc, student, 0, 0);
  return doc.output('blob');
}

export async function downloadSingleStudentCardPdf(student: Student) {
  const blob = await createSingleStudentCardPdf(student);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Kartu_QR_${safeFileName(student.nisn)}_${safeFileName(student.nama)}.pdf`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function createAllStudentCardsPdf(students: Student[]) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [F4_W, F4_H], compress: true });
  for (let index = 0; index < students.length; index += 1) {
    if (index > 0 && index % (COLS * ROWS) === 0) {
      doc.addPage([F4_W, F4_H], 'portrait');
    }
    const position = index % (COLS * ROWS);
    const row = Math.floor(position / COLS);
    const col = position % COLS;
    const x = MARGIN_X + col * (CARD_W + GAP_X);
    const y = MARGIN_Y + row * (CARD_H + GAP_Y);
    await drawCard(doc, students[index], x, y);
    doc.setDrawColor(180, 190, 205);
    doc.setLineDashPattern([1, 1], 0);
    doc.rect(x - 1, y - 1, CARD_W + 2, CARD_H + 2, 'S');
    doc.setLineDashPattern([], 0);
  }
  return doc.output('blob');
}

export async function downloadAllStudentCardsPdf(students: Student[]) {
  const blob = await createAllStudentCardsPdf(students);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Semua_Kartu_QR_Siswa_${new Date().toLocaleDateString('en-CA')}.pdf`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
