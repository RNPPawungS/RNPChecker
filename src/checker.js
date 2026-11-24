// Checker: Ref Check (lookup) and Cross Ref Check (verify a waybill/box pair).
const express = require('express');

// Barcode scanners type through the active keyboard layout. If Windows is set to Thai (Kedmanee),
// the scanned code arrives as Thai characters; map them back to the English keys.
const TH = {
  'ๅ': '1', '/': '2', '-': '3', 'ภ': '4', 'ถ': '5', 'ุ': '6', 'ึ': '7', 'ค': '8', 'ต': '9', 'จ': '0',
  '+': '!', '๑': '@', '๒': '#', '๓': '$', '๔': '%', 'ู': '^', '฿': '&', '๕': '*', '๖': '(', '๗': ')', '๘': '_', '๙': '+',
  'ๆ': 'q', 'ไ': 'w', 'ำ': 'e', 'พ': 'r', 'ะ': 't', 'ั': 'y', 'ี': 'u', 'ร': 'i', 'น': 'o', 'ย': 'p',
  'ฟ': 'a', 'ห': 's', 'ก': 'd', 'ด': 'f', 'เ': 'g', '้': 'h', '่': 'j', 'า': 'k', 'ส': 'l', 'ว': ';', 'ง': "'",
  'ผ': 'z', 'ป': 'x', 'แ': 'c', 'อ': 'v', 'ิ': 'b', 'ื': 'n', 'ท': 'm', 'ม': ',', 'ใ': '.', 'ฝ': '/',
  '๐': 'Q', '"': 'W', 'ฎ': 'E', 'ฑ': 'R', 'ธ': 'T', 'ํ': 'Y', '๊': 'U', 'ณ': 'I', 'ฯ': 'O', 'ญ': 'P',
  'ฤ': 'A', 'ฆ': 'S', 'ฏ': 'D', 'โ': 'F', 'ฌ': 'G', '็': 'H', '๋': 'J', 'ษ': 'K', 'ศ': 'L',
  '(': 'Z', ')': 'X', 'ฉ': 'C', 'ฮ': 'V', 'ฺ': 'B', '์': 'N', '?': 'M',
};
const fixLayout = (s) => (/[\u0E00-\u0E7F]/.test(s) ? [...s].map((c) => TH[c] ?? c).join('') : s);
// "*" is removed (Code 39 barcodes carry * start/stop characters)
const clean = (v) => fixLayout(String(v ?? '').trim()).replace(/\*/g, '').trim().slice(0, 64);

function dmy(v) {
  const m = String(v ?? '').match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}:\d{2}))?/);
  return m ? `${m[3]}/${m[2]}/${m[1]}${m[4] ? ' ' + m[4] : ''}` : (v ?? '');
}

module.exports = function registerChecker(app, { db, auth }) {
  const json = express.json({ limit: '10kb' });

  const log = (userId, mode, order, in1, in2, result, detail) =>
    db.query('INSERT INTO check_logs (user_id, mode, check_order, input1, input2, result, detail) VALUES (?,?,?,?,?,?,?)',
      [userId, mode, order, in1, in2, result, detail ? String(detail).slice(0, 500) : null]).catch((e) => console.error('check log', e.message));

  const byWaybill = async (wb) => {
    const [[r]] = await db.query('SELECT box_no, waybill_no, operation_date FROM packings WHERE waybill_no=?', [wb]);
    return r || null;
  };
  const byBox = async (box) => {
    const [rows] = await db.query('SELECT box_no, waybill_no, operation_date FROM packings WHERE box_no=? ORDER BY waybill_no LIMIT 2000', [box]);
    return rows;
  };

  // remembers the last tab in a cookie so a refresh / revisit opens the same check type
  app.get('/checker', auth, async (req, res) => {
    const saved = /(?:^|;\s*)ck_tab=(ref|cross)/.exec(req.headers.cookie || '');
    const tab = req.query.tab === 'cross' || req.query.tab === 'ref' ? req.query.tab : (saved ? saved[1] : 'ref');
    res.setHeader('Set-Cookie', `ck_tab=${tab}; Path=/checker; Max-Age=31536000; SameSite=Lax`);
    res.render('checker', { tab });
  });

  // Ref Check: type = auto | waybill | box
  app.post('/api/checker/ref', auth, json, async (req, res) => {
    const q = clean(req.body.q); const type = req.body.type || 'auto';
    if (!q) return res.status(400).json({ error: 'กรุณากรอกเลข' });
    let wb = null; let box = [];
    if (type !== 'box') wb = await byWaybill(q);
    if (!wb && type !== 'waybill') box = await byBox(q);
    let out;
    if (wb) {
      out = { result: 'found', kind: 'waybill', input: q, box_no: wb.box_no, waybill_no: wb.waybill_no, operation_date: dmy(wb.operation_date) };
      const [[{ n }]] = await db.query('SELECT COUNT(*) n FROM packings WHERE box_no=?', [wb.box_no]);
      out.box_count = n;
    } else if (box.length) {
      const dates = [...new Set(box.map((r) => dmy(r.operation_date)))];
      out = { result: 'found', kind: 'box', input: q, box_no: box[0].box_no, count: box.length, dates,
        waybills: box.map((r) => ({ waybill_no: r.waybill_no, operation_date: dmy(r.operation_date) })) };
    } else {
      out = { result: 'not_found', input: q,
        message: type === 'waybill' ? 'ไม่พบ Waybill No. นี้' : type === 'box' ? 'ไม่พบ Box No. นี้' : 'ไม่พบทั้ง Waybill No. และ Box No.' };
    }
    log(req.user.id, 'ref', null, q, null, out.result,
      out.result === 'not_found' ? out.message : out.kind === 'waybill' ? `Waybill → Box ${out.box_no}` : `Box → ${out.count} Waybill`);
    res.json(out);
  });

  // Cross Ref Check: order wb = Waybill then Box, bw = Box then Waybill
  app.post('/api/checker/cross', auth, json, async (req, res) => {
    const order = req.body.order === 'bw' ? 'bw' : 'wb';
    const first = clean(req.body.first); const second = clean(req.body.second);
    if (!first || !second) return res.status(400).json({ error: 'กรุณากรอกให้ครบทั้ง 2 ช่อง' });
    const waybill = order === 'wb' ? first : second;
    const boxIn = order === 'wb' ? second : first;
    const wb = await byWaybill(waybill);
    let out;
    if (!wb) {
      const [[{ n }]] = await db.query('SELECT COUNT(*) n FROM packings WHERE box_no=?', [boxIn]);
      out = { result: 'not_found', message: `ไม่พบ Waybill No. ${waybill} ในระบบ` + (n ? '' : ` และไม่พบ Box No. ${boxIn}`) };
    } else if (wb.box_no.toLowerCase() === boxIn.toLowerCase()) {
      out = { result: 'match', message: `Waybill ${wb.waybill_no} อยู่ในกล่อง ${wb.box_no} ถูกต้อง` };
    } else {
      out = { result: 'mismatch', message: `ไม่ตรง: Waybill ${wb.waybill_no} อยู่ในกล่อง ${wb.box_no} ไม่ใช่ ${boxIn}`, expected_box: wb.box_no };
    }
    Object.assign(out, { order, waybill_no: waybill, box_no: boxIn, operation_date: wb ? dmy(wb.operation_date) : null });
    if (order === 'bw') {
      const [[{ n }]] = await db.query('SELECT COUNT(*) n FROM packings WHERE box_no=?', [boxIn]);
      out.box_count = n;
    }
    log(req.user.id, 'cross', order, first, second, out.result, out.message);
    res.json(out);
  });

  app.get('/api/checker/logs', auth, async (req, res) => {
    const mine = req.query.all !== '1';
    const [rows] = await db.query(`SELECT l.*, u.email FROM check_logs l JOIN users u ON u.id=l.user_id
      WHERE l.created_at >= CURDATE() ${mine ? 'AND l.user_id=?' : ''} ORDER BY l.id DESC LIMIT 100`, mine ? [req.user.id] : []);
    const [[s]] = await db.query(`SELECT SUM(result='match') ok, SUM(result='mismatch') bad, SUM(result='not_found') nf
      FROM check_logs WHERE mode='cross' AND created_at >= CURDATE() ${mine ? 'AND user_id=?' : ''}`, mine ? [req.user.id] : []);
    res.json({ rows: rows.map((r) => ({ ...r, created_at: dmy(r.created_at) })), summary: { match: Number(s.ok || 0), mismatch: Number(s.bad || 0), not_found: Number(s.nf || 0) } });
  });
};
