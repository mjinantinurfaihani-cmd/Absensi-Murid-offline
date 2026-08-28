import QRCode from 'qrcode';import JSZip from'jszip';import{saveAs}from'file-saver';import type{Student}from'./types';
export function payload(s:Student){return JSON.stringify({app:'ABSENSI-SISWA',version:1,id:s.id,nisn:s.nisn,kelas:s.kelas})}
export async function qrData(s:Student){return QRCode.toDataURL(payload(s),{width:512,margin:2,errorCorrectionLevel:'M'})}
export async function downloadQR(s:Student){saveAs(await(await fetch(await qrData(s))).blob(),`QR_${s.kelas}_${s.nisn}.png`)}
export async function downloadZip(students:Student[]){const z=new JSZip();for(const s of students){const d=(await qrData(s)).split(',')[1];z.file(`QR_${s.kelas}_${s.nisn}.png`,d,{base64:true})}saveAs(await z.generateAsync({type:'blob'}),'Kartu_QR_Siswa.zip')}
