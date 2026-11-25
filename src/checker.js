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
// Codabar barcodes start and stop with A, B, C or D. Scanners set to send them give D3867497060D for 3867497060.
const codabar = (s) => { const m = /^[A-D](\d+)[A-D]$/i.exec(s); return m ? m[1] : null; };
// what to look up for one scan: the number without the Codabar letters first, then as scanned
// (so a real code that happens to look like A123B still matches itself)
const forms = (v) => { const s = clean(v); const c = codabar(s); return c ? [c, s] : [s]; };

function dmy(v) {
  const m = String(v ?? '').match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}:\d{2}))?/);
  return m ? `${m[3]}/${m[2]}/${m[1]}${m[4] ? ' ' + m[4] : ''}` : (v ?? '');
}

module.exports = registerChecker;
module.exports.clean = clean;
module.exports.codabar = codabar;
function registerChecker(app, { db, auth }) {
  const json = express.json({ limit: '10kb' });

  const log = (userId, mode, order, in1, in2, result, detail) =>
    db.query('INSERT INTO check_logs (user_id, mode, check_order, input1, input2, result, detail) VALUES (?,?,?,?,?,?,?)',
      [userId, mode, order, in1, in2, result, detail ? String(detail).slice(0, 500) : null]).catch((e) => console.error('check log', e.message));

  // day = 'YYYY-MM-DD' limits every lookup to that operation date (null = all dates)
  const dayOf = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
  const onDay = (day) => (day ? ' AND operation_date=?' : '');
  const args = (v, day) => (day ? [v, day] : [v]);
  // each lookup takes the forms of one scan (see forms()) and uses the first that exists
  const byWaybill = async (fs, day) => {
    for (const wb of fs) {
      const [[r]] = await db.query(`SELECT box_no, waybill_no, operation_date FROM packings WHERE waybill_no=?${onDay(day)}`, args(wb, day));
      if (r) return r;
    }
    return null;
  };
  const byBox = async (fs, day) => {
    for (const box of fs) {
      const [rows] = await db.query(`SELECT box_no, waybill_no, operation_date FROM packings WHERE box_no=?${onDay(day)} ORDER BY waybill_no LIMIT 2000`, args(box, day));
      if (rows.length) return rows;
    }
    return [];
  };
  const boxCount = async (fs, day) => {
    for (const box of fs) {
      const [[{ n }]] = await db.query(`SELECT COUNT(*) n FROM packings WHERE box_no=?${onDay(day)}`, args(box, day));
      if (n) return { n, box };
    }
    return { n: 0, box: fs[0] };
  };
  // only on "not found" with a date: tell the user if the number exists on another date
  const otherDate = async (wbs, boxes, day) => {
    if (!day) return '';
    const [[w]] = wbs ? await db.query('SELECT operation_date FROM packings WHERE waybill_no IN (?) LIMIT 1', [wbs]) : [[null]];
    if (w) return ` (Waybill นี้อยู่ในวันที่ ${dmy(w.operation_date)})`;
    const [[b]] = boxes ? await db.query('SELECT operation_date FROM packings WHERE box_no IN (?) ORDER BY operation_date DESC LIMIT 1', [boxes]) : [[null]];
    return b ? ` (Box นี้อยู่ในวันที่ ${dmy(b.operation_date)})` : '';
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
    const qs = forms(req.body.q); const q = qs[0]; const type = req.body.type || 'auto'; const day = dayOf(req.body.date);
    if (!q) return res.status(400).json({ error: req.t('กรุณากรอกเลข') });
    let wb = null; let box = [];
    if (type !== 'box') wb = await byWaybill(qs, day);
    if (!wb && type !== 'waybill') box = await byBox(qs, day);
    const on = day ? ` ในวันที่ ${dmy(day)}` : '';
    let out;
    if (wb) {
      out = { result: 'found', kind: 'waybill', input: wb.waybill_no, box_no: wb.box_no, waybill_no: wb.waybill_no, operation_date: dmy(wb.operation_date) };
      out.box_count = (await boxCount([wb.box_no], day)).n;
    } else if (box.length) {
      const dates = [...new Set(box.map((r) => dmy(r.operation_date)))];
      out = { result: 'found', kind: 'box', input: box[0].box_no, box_no: box[0].box_no, count: box.length, dates,
        waybills: box.map((r) => ({ waybill_no: r.waybill_no, operation_date: dmy(r.operation_date) })) };
    } else {
      out = { result: 'not_found', input: q,
        message: (type === 'waybill' ? 'ไม่พบ Waybill No. นี้' : type === 'box' ? 'ไม่พบ Box No. นี้' : 'ไม่พบทั้ง Waybill No. และ Box No.') + on
          + await otherDate(type !== 'box' ? qs : null, type !== 'waybill' ? qs : null, day) };
    }
    out.date = day ? dmy(day) : null;
    log(req.user.id, 'ref', null, out.input, null, out.result,
      (out.result === 'not_found' ? out.message : out.kind === 'waybill' ? `Waybill → Box ${out.box_no}` : `Box → ${out.count} Waybill`) + (day && out.result !== 'not_found' ? ` · ${dmy(day)}` : ''));
    if (out.message) out.message = req.t(out.message); // the log keeps Thai, the page gets its language
    res.json(out);
  });

  // Cross Ref Check: order wb = Waybill then Box, bw = Box then Waybill
  app.post('/api/checker/cross', auth, json, async (req, res) => {
    const order = req.body.order === 'bw' ? 'bw' : 'wb';
    const day = dayOf(req.body.date); const on = day ? ` ในวันที่ ${dmy(day)}` : '';
    const f1 = forms(req.body.first); const f2 = forms(req.body.second);
    if (!f1[0] || !f2[0]) return res.status(400).json({ error: req.t('กรุณากรอกให้ครบทั้ง 2 ช่อง') });
    const wbs = order === 'wb' ? f1 : f2;
    const boxes = order === 'wb' ? f2 : f1;
    const wb = await byWaybill(wbs, day);
    let waybill = wb ? wb.waybill_no : wbs[0];
    let boxIn = boxes[0];
    let out;
    if (!wb) {
      const c = await boxCount(boxes, day);
      boxIn = c.box;
      out = { result: 'not_found', message: `ไม่พบ Waybill No. ${waybill}${on || ' ในระบบ'}` + (c.n ? '' : ` และไม่พบ Box No. ${boxIn}`) + await otherDate(wbs, null, day) };
    } else if (boxes.some((b) => b.toLowerCase() === wb.box_no.toLowerCase())) {
      boxIn = wb.box_no;
      out = { result: 'match', message: `Waybill ${wb.waybill_no} อยู่ในกล่อง ${wb.box_no} ถูกต้อง` };
    } else {
      out = { result: 'mismatch', message: `ไม่ตรง: Waybill ${wb.waybill_no} อยู่ในกล่อง ${wb.box_no} ไม่ใช่ ${boxIn}`, expected_box: wb.box_no };
    }
    Object.assign(out, { order, waybill_no: waybill, box_no: boxIn, operation_date: wb ? dmy(wb.operation_date) : null });
    if (order === 'bw') out.box_count = (await boxCount([boxIn], day)).n;
    out.date = day ? dmy(day) : null;
    log(req.user.id, 'cross', order, order === 'wb' ? waybill : boxIn, order === 'wb' ? boxIn : waybill, out.result, out.message);
    out.message = req.t(out.message);
    res.json(out);
  });

  app.get('/api/checker/logs', auth, async (req, res) => {
    const mine = req.query.all !== '1';
    const [rows] = await db.query(`SELECT l.*, u.email FROM check_logs l JOIN users u ON u.id=l.user_id
      WHERE l.created_at >= CURDATE() ${mine ? 'AND l.user_id=?' : ''} ORDER BY l.id DESC LIMIT 100`, mine ? [req.user.id] : []);
    const [[s]] = await db.query(`SELECT SUM(result='match') ok, SUM(result='mismatch') bad, SUM(result='not_found') nf
      FROM check_logs WHERE mode='cross' AND created_at >= CURDATE() ${mine ? 'AND user_id=?' : ''}`, mine ? [req.user.id] : []);
    res.json({ rows: rows.map((r) => ({ ...r, created_at: dmy(r.created_at), detail: r.detail && req.t(r.detail) })), summary: { match: Number(s.ok || 0), mismatch: Number(s.bad || 0), not_found: Number(s.nf || 0) } });
  });
};
