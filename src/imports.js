// Import (upload) processing with per-row result tracking.
const ExcelJS = require('exceljs');
const { readRows } = require('./parse');

const STATUS = {
  inserted: 'เพิ่มใหม่',
  updated: 'อัปเดต',
  unchanged: 'ไม่เปลี่ยนแปลง',
  error: 'ผิดพลาด',
};
const PER_PAGE = 200;

function dmy(v) {
  const m = String(v ?? '').match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}:\d{2}))?/);
  return m ? `${m[3]}/${m[2]}/${m[1]}${m[4] ? ' ' + m[4] : ''}` : (v ?? '');
}

module.exports = function registerImports(app, { db, auth, upload }) {
  const history = async () => {
    const [rows] = await db.query(`SELECT up.*, u.email FROM uploads up JOIN users u ON u.id=up.user_id ORDER BY up.id DESC LIMIT 50`);
    return rows;
  };

  app.get('/upload', auth, async (req, res) => {
    res.render('upload', { history: await history() });
  });

  app.post('/upload', auth, upload.single('file'), async (req, res) => {
    const fail = async (msg) => { res.locals.flash = { type: 'error', msg }; res.render('upload', { history: await history() }); };
    if (!req.file) return fail('กรุณาเลือกไฟล์ .xlsx หรือ .csv');
    const started = Date.now();
    const filename = Buffer.from(req.file.originalname, 'latin1').toString('utf8');

    let rows;
    try { rows = await readRows(req.file.buffer, filename); } catch (e) {
      const [r] = await db.query(`INSERT INTO uploads (user_id, filename, file_size, status, message, duration_ms) VALUES (?,?,?,?,?,?)`,
        [req.user.id, filename, req.file.size, 'failed', ('อ่านไฟล์ไม่ได้: ' + e.message).slice(0, 500), Date.now() - started]);
      return res.redirect(`/upload/${r.insertId}`);
    }
    if (!rows.length) return fail('ไม่พบข้อมูลในไฟล์ (มีแต่หัวคอลัมน์)');

    // duplicates inside the same file
    const seen = new Map();
    for (const r of rows) {
      if (!r.waybill || r.errors.length) continue;
      if (seen.has(r.waybill)) r.errors.push(`Waybill No. ซ้ำกับแถวที่ ${seen.get(r.waybill)} ในไฟล์เดียวกัน`);
      else seen.set(r.waybill, r.line);
    }

    const conn = await db.getConnection();
    let uploadId;
    try {
      await conn.beginTransaction();
      const [up] = await conn.query(`INSERT INTO uploads (user_id, filename, file_size, total_rows, status) VALUES (?,?,?,?, 'processing')`,
        [req.user.id, filename, req.file.size, rows.length]);
      uploadId = up.insertId;

      const good = rows.filter((r) => !r.errors.length);
      for (let i = 0; i < good.length; i += 500) {
        const chunk = good.slice(i, i + 500);
        const [existing] = await conn.query('SELECT waybill_no, box_no, operation_date FROM packings WHERE waybill_no IN (?)', [chunk.map((x) => x.waybill)]);
        const old = new Map(existing.map((e) => [e.waybill_no, e]));
        for (const r of chunk) {
          const o = old.get(r.waybill);
          if (!o) { r.status = 'inserted'; continue; }
          r.oldBox = o.box_no; r.oldDate = o.operation_date;
          if (o.box_no === r.box && o.operation_date === r.date) { r.status = 'unchanged'; r.message = 'ข้อมูลตรงกับที่มีอยู่แล้ว'; continue; }
          r.status = 'updated';
          const ch = [];
          if (o.box_no !== r.box) ch.push(`Box No. ${o.box_no} → ${r.box}`);
          if (o.operation_date !== r.date) ch.push(`Operation Date ${dmy(o.operation_date)} → ${dmy(r.date)}`);
          r.message = ch.join(', ');
        }
        const changed = chunk.filter((r) => r.status !== 'unchanged');
        if (changed.length) {
          await conn.query(`INSERT INTO packings (box_no, waybill_no, operation_date, upload_id, created_by) VALUES ?
            ON DUPLICATE KEY UPDATE box_no=VALUES(box_no), operation_date=VALUES(operation_date), upload_id=VALUES(upload_id), updated_by=${Number(req.user.id)}`,
            [changed.map((x) => [x.box, x.waybill, x.date, uploadId, req.user.id])]);
        }
      }
      for (const r of rows) if (r.errors.length) { r.status = 'error'; r.message = r.errors.join(', '); }

      for (let i = 0; i < rows.length; i += 1000) {
        await conn.query(`INSERT INTO upload_rows (upload_id, line_no, box_no, waybill_no, operation_date, raw_date, status, message, old_box_no, old_operation_date) VALUES ?`,
          [rows.slice(i, i + 1000).map((r) => [uploadId, r.line, r.box.slice(0, 64), r.waybill.slice(0, 64), r.date, (r.raw || '').slice(0, 64),
            r.status, r.message ? r.message.slice(0, 500) : null, r.oldBox ?? null, r.oldDate ?? null])]);
      }
      const n = (s) => rows.filter((r) => r.status === s).length;
      await conn.query(`UPDATE uploads SET inserted_rows=?, updated_rows=?, unchanged_rows=?, error_rows=?, status='done', duration_ms=? WHERE id=?`,
        [n('inserted'), n('updated'), n('unchanged'), n('error'), Date.now() - started, uploadId]);
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      conn.release();
      const [r] = await db.query(`INSERT INTO uploads (user_id, filename, file_size, total_rows, status, message, duration_ms) VALUES (?,?,?,?,?,?,?)`,
        [req.user.id, filename, req.file.size, rows.length, 'failed', ('บันทึกไม่สำเร็จ ไม่มีข้อมูลใดถูกบันทึก: ' + e.message).slice(0, 500), Date.now() - started]);
      return res.redirect(`/upload/${r.insertId}`);
    }
    conn.release();
    res.redirect(`/upload/${uploadId}`);
  });

  const filterSql = (q) => {
    const where = ['upload_id=?']; const args = [];
    if (STATUS[q.status]) { where.push('status=?'); args.push(q.status); }
    if (q.q) { where.push('(box_no LIKE ? OR waybill_no LIKE ?)'); args.push(`%${q.q}%`, `%${q.q}%`); }
    return { sql: where.join(' AND '), args };
  };

  app.get('/upload/:id(\\d+)', auth, async (req, res) => {
    const id = Number(req.params.id);
    const [[up]] = await db.query('SELECT up.*, u.email, u.name FROM uploads up JOIN users u ON u.id=up.user_id WHERE up.id=?', [id]);
    if (!up) return res.status(404).send('ไม่พบรายการอัปโหลดนี้');
    const f = filterSql(req.query);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const [[{ total }]] = await db.query(`SELECT COUNT(*) total FROM upload_rows WHERE ${f.sql}`, [id, ...f.args]);
    const [rows] = await db.query(`SELECT * FROM upload_rows WHERE ${f.sql} ORDER BY status='error' DESC, line_no LIMIT ? OFFSET ?`,
      [id, ...f.args, PER_PAGE, (page - 1) * PER_PAGE]);
    const [counts] = await db.query('SELECT status, COUNT(*) n FROM upload_rows WHERE upload_id=? GROUP BY status', [id]);
    const c = Object.fromEntries(counts.map((x) => [x.status, x.n]));
    const [errors] = await db.query(`SELECT message, COUNT(*) n FROM upload_rows WHERE upload_id=? AND status='error' GROUP BY message ORDER BY n DESC LIMIT 10`, [id]);
    res.render('upload_detail', {
      up, rows, total, page, pages: Math.max(1, Math.ceil(total / PER_PAGE)), q: req.query, c, errors, STATUS,
    });
  });

  app.get('/upload/:id(\\d+)/export', auth, async (req, res) => {
    const id = Number(req.params.id);
    const [[up]] = await db.query('SELECT filename FROM uploads WHERE id=?', [id]);
    if (!up) return res.status(404).send('ไม่พบรายการอัปโหลดนี้');
    const f = filterSql(req.query);
    const [rows] = await db.query(`SELECT * FROM upload_rows WHERE ${f.sql} ORDER BY line_no`, [id, ...f.args]);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('ผลการ import');
    ws.columns = [
      { header: 'แถวในไฟล์', key: 'line_no', width: 10 },
      { header: 'Box No.', key: 'box_no', width: 18 },
      { header: 'Waybill No.', key: 'waybill_no', width: 22 },
      { header: 'Operation Date', key: 'date', width: 16 },
      { header: 'สถานะ', key: 'status', width: 16 },
      { header: 'รายละเอียด', key: 'message', width: 60 },
      { header: 'Box No. เดิม', key: 'old_box_no', width: 18 },
      { header: 'Operation Date เดิม', key: 'old_date', width: 18 },
    ];
    ws.getRow(1).font = { bold: true };
    ws.addRows(rows.map((r) => ({
      line_no: r.line_no, box_no: r.box_no, waybill_no: r.waybill_no,
      date: r.operation_date ? dmy(r.operation_date) : r.raw_date,
      status: STATUS[r.status], message: r.message, old_box_no: r.old_box_no, old_date: dmy(r.old_operation_date),
    })));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="import-result-${id}.xlsx"`);
    await wb.xlsx.write(res); res.end();
  });
};
