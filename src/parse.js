const ExcelJS = require('exceljs');
const { Readable } = require('stream');

const HEADERS = ['Box No.', 'Waybill No.', 'Operation Date'];
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z]/g, '');
const KEYS = { boxno: 'box', waybillno: 'waybill', operationdate: 'date' };

function pad(n) { return String(n).padStart(2, '0'); }

// Accepts Date, Excel serial, "YYYY-MM-DD", "DD/MM/YYYY" (Buddhist year auto-converted)
function toDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v)) return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  if (typeof v === 'number') {
    const d = new Date(Math.round((v - 25569) * 86400000));
    return toDate(d);
  }
  if (typeof v === 'object' && v.result) return toDate(v.result);
  const s = String(v).trim();
  let y, m, d, mt;
  if ((mt = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) [, y, m, d] = mt;
  else if ((mt = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/))) [, d, m, y] = mt;
  else return null;
  y = Number(y); m = Number(m); d = Number(d);
  if (y > 2400) y -= 543;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

function cellText(v) {
  if (v == null) return '';
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map((r) => r.text).join('');
    if (v.text) return String(v.text);
    if (v.result != null) return String(v.result);
  }
  return String(v).trim();
}

async function readRows(buffer, filename) {
  const wb = new ExcelJS.Workbook();
  if (/\.csv$/i.test(filename)) {
    let text = buffer.toString('utf8').replace(/^﻿/, '');
    await wb.csv.read(Readable.from([text]), { parserOptions: { delimiter: text.includes('\t') && !text.includes(',') ? '\t' : ',' } });
  } else {
    await wb.xlsx.load(buffer);
  }
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('ไม่พบ sheet ในไฟล์');
  const colMap = {};
  ws.getRow(1).eachCell((cell, col) => {
    const k = KEYS[norm(cellText(cell.value))];
    if (k) colMap[k] = col;
  });
  if (!colMap.box || !colMap.waybill || !colMap.date) {
    throw new Error('หัวคอลัมน์ไม่ถูกต้อง ต้องมี: ' + HEADERS.join(', '));
  }
  const rows = [];
  ws.eachRow((row, idx) => {
    if (idx === 1) return;
    const box = cellText(row.getCell(colMap.box).value);
    const waybill = cellText(row.getCell(colMap.waybill).value);
    const rawDate = row.getCell(colMap.date).value;
    if (!box && !waybill && (rawDate == null || rawDate === '')) return;
    const date = toDate(rawDate);
    const errors = [];
    if (!box) errors.push('ไม่มี Box No.');
    if (!waybill) errors.push('ไม่มี Waybill No.');
    const raw = rawDate instanceof Date ? (date || '') : cellText(rawDate).slice(0, 64);
    if (rawDate == null || rawDate === '') errors.push('ไม่มี Operation Date');
    else if (!date) errors.push(`Operation Date "${raw}" ไม่ถูกต้อง (ต้องเป็น dd/mm/yyyy)`);
    if (box.length > 64) errors.push('Box No. ยาวเกิน 64 ตัวอักษร');
    if (waybill.length > 64) errors.push('Waybill No. ยาวเกิน 64 ตัวอักษร');
    rows.push({ line: idx, box, waybill, date, raw, errors });
  });
  return rows;
}

async function buildTemplate(t = (s) => s.split('|')[0]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Packing');
  ws.columns = [
    { header: HEADERS[0], key: 'box', width: 20 },
    { header: HEADERS[1], key: 'waybill', width: 25 },
    { header: HEADERS[2], key: 'date', width: 18, style: { numFmt: 'dd/mm/yyyy' } },
  ];
  ws.getRow(1).font = { bold: true };
  ws.getColumn(1).numFmt = '@';
  ws.getColumn(2).numFmt = '@';
  ws.addRow({ box: 'BOX0001', waybill: 'RNP000000001', date: new Date(Date.UTC(2026, 10, 23)) });
  const info = wb.addWorksheet(t('คำอธิบาย|sheet'));
  info.addRows([
    [t('คอลัมน์'), t('คำอธิบาย')],
    ['Box No.', t('เลขกล่อง (จำเป็น)')],
    ['Waybill No.', t('เลขพัสดุ (จำเป็น, ห้ามซ้ำ ถ้าซ้ำกับข้อมูลเดิมจะอัปเดตทับ)')],
    ['Operation Date', t('วันที่รอบเอกสาร รูปแบบ DD/MM/YYYY (เช่น 23/11/2026) หรือเป็นวันที่ของ Excel')],
    ['', t('ลบแถวตัวอย่างก่อนอัปโหลด')],
  ]);
  info.getColumn(1).width = 18; info.getColumn(2).width = 60;
  info.getRow(1).font = { bold: true };
  return wb.xlsx.writeBuffer();
}

module.exports = { readRows, buildTemplate, toDate, HEADERS };
