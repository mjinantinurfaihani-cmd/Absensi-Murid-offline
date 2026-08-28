# Integrasi kartu QR PDF

1. Instal dependensi:

```bash
npm install jspdf qrcode
npm install -D @types/qrcode
```

2. Salin `src/services/studentCardPdf.ts`, `src/components/QrCardsPanel.tsx`, dan `src/styles/qrCards.css` ke proyek.
3. Pada `src/main.tsx`, import CSS:

```ts
import './styles/qrCards.css';
```

4. Pada `App.tsx`, ganti fungsi/komponen `QRCards` lama dengan:

```tsx
import QrCardsPanel from './components/QrCardsPanel';
```

Lalu render:

```tsx
{page === 'qr' && <QrCardsPanel showToast={showToast} />}
```

5. Hapus import lama `downloadQR`, `downloadZip`, dan komponen `QRCards` lama bila tidak digunakan.

Hasil:
- PDF satu siswa: satu halaman kartu 85,6 x 53,98 mm lanskap.
- PDF semua siswa: F4 portrait 215,9 x 330 mm, 2 kolom x 5 baris atau 10 kartu per halaman.
- Preview memakai Blob URL sehingga tetap offline.
- QR dibuat lokal dengan `qrcode`; PDF dibuat lokal dengan `jsPDF`.
