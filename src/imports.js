// Import (upload) processing with per-row result tracking.
const ExcelJS = require('exceljs');
const { readRows } = require('./parse');
const { saveImport } = require('./importcore');
const lock = require('./lock');
const { dmy } = require('./dates');

const STATUS = {
  inserted: 'เพิ่มใหม่',
  updated: 'อัปเดต',
  unchanged: 'ไม่เปลี่ยนแปลง',
  error: 'ผิดพลาด',
};
const PER_PAGE = 200;

module.exports = function registerImports(app, { db, auth, upload, log, flash, sheet }) {
  const history = async () => {
    const [rows] = await db.query(`SELECT up.*, u.email FROM uploads up JOIN users u ON u.id=up.user_id ORDER BY up.id DESC LIMIT 50`);
    return rows;
  };

  app.get('/upload', auth, async (req, res) => {
    res.render('upload', { history: await history(), sheet: sheet && sheet.status() });
  });

  // Import from the data page ("Import ข้อมูล"). The page sends the file with XMLHttpRequest (progress bar) and gets JSON back;
  // a plain form post gets a redirect instead.
  const single = upload.single('file');
  app.post('/upload', auth, (req, res, next) => single(req, res, (e) => {
    if (!e) return next();
    req.uploadError = e.code === 'LIMIT_FILE_SIZE' ? 'ไฟล์ใหญ่เกิน 20 MB' : 'อ่านไฟล์ไม่ได้: ' + e.message;
    next();
  }), async (req, res) => {
    const xhr = req.get('X-Requested-With') === 'XMLHttpRequest';
    const go = (url) => (xhr ? res.json({ redirect: url }) : res.redirect(url));
    const fail = (msg) => {
      if (xhr) return res.status(400).json({ error: req.t(msg) });
      flash(req, 'error', req.t(msg)); res.redirect('/data');
    };
    if (req.uploadError) return fail(req.uploadError);
    if (!req.file) return fail('กรุณาเลือกไฟล์ .xlsx หรือ .csv');
    const started = Date.now();
    const filename = Buffer.from(req.file.originalname, 'latin1').toString('utf8');

    let rows;
    try { rows = await readRows(req.file.buffer, filename); } catch (e) {
      const [r] = await db.query(`INSERT INTO uploads (user_id, filename, file_size, status, message, duration_ms) VALUES (?,?,?,?,?,?)`,
        [req.user.id, filename, req.file.size, 'failed', ('อ่านไฟล์ไม่ได้: ' + e.message).slice(0, 500), Date.now() - started]);
      log(req, 'import', { file: filename, failed: 1, msg: ('อ่านไฟล์ไม่ได้: ' + e.message).slice(0, 200) }, `/upload/${r.insertId}`);
      return go(`/upload/${r.insertId}`);
    }
    if (!rows.length) {
      log(req, 'import', { file: filename, failed: 1, msg: 'ไม่พบข้อมูลในไฟล์ (มีแต่หัวคอลัมน์)' });
      return fail('ไม่พบข้อมูลในไฟล์ (มีแต่หัวคอลัมน์)');
    }

    // One import at a time (lock.js). While the Google Sheet connector (sheet.js) or another upload is running, this request waits
    // in line: the page shows a waiting screen (it asks GET /import/status), and a space is sent every 10 s so the connection
    // (Nginx proxy_read_timeout, browser) stays open. JSON.parse ignores the leading spaces.
    let keep = null;
    if (xhr && lock.state().busy) {
      res.status(200).set('Content-Type', 'application/json; charset=utf-8');
      res.write(' ');
      keep = setInterval(() => res.write(' '), 10000);
    }
    let r;
    try {
      r = await lock.withLock('web', req.user.email, () => saveImport(db, { rows, userId: req.user.id, filename, size: req.file.size }));
    } finally { clearInterval(keep); }
    if (r.failed) log(req, 'import', { file: filename, failed: 1, msg: r.failed.slice(0, 200) }, `/upload/${r.uploadId}`);
    else log(req, 'import', { file: filename, ...r.counts }, `/upload/${r.uploadId}`);
    if (keep) res.end(JSON.stringify({ redirect: `/upload/${r.uploadId}` }));
    else go(`/upload/${r.uploadId}`);
  });

  // Is an import running? The data page asks this while its upload waits, to show who it waits for.
  app.get('/import/status', auth, (req, res) => {
    const s = lock.state();
    res.json({ busy: s.busy && { who: s.busy.who, seconds: s.busy.seconds, own: s.busy.who === 'web' && s.busy.email === req.user.email }, waiting: s.waiting });
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
    if (!up) return res.status(404).send(req.t('ไม่พบรายการอัปโหลดนี้'));
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
    if (!up) return res.status(404).send(req.t('ไม่พบรายการอัปโหลดนี้'));
    const f = filterSql(req.query);
    const [rows] = await db.query(`SELECT * FROM upload_rows WHERE ${f.sql} ORDER BY line_no`, [id, ...f.args]);
    const wb = new ExcelJS.Workbook();
    const t = req.t;
    const ws = wb.addWorksheet(t('ผลการ import'));
    ws.columns = [
      { header: t('แถวในไฟล์'), key: 'line_no', width: 10 },
      { header: 'Box No.', key: 'box_no', width: 18 },
      { header: 'Waybill No.', key: 'waybill_no', width: 22 },
      { header: 'Operation Date', key: 'date', width: 16 },
      { header: t('สถานะ'), key: 'status', width: 16 },
      { header: t('รายละเอียด'), key: 'message', width: 60 },
      { header: t('Box No. เดิม'), key: 'old_box_no', width: 18 },
      { header: t('Operation Date เดิม'), key: 'old_date', width: 18 },
    ];
    ws.getRow(1).font = { bold: true };
    ws.addRows(rows.map((r) => ({
      line_no: r.line_no, box_no: r.box_no, waybill_no: r.waybill_no,
      date: r.operation_date ? dmy(r.operation_date) : r.raw_date,
      status: t(STATUS[r.status]), message: r.message && t(r.message), old_box_no: r.old_box_no, old_date: dmy(r.old_operation_date),
    })));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="import-result-${id}.xlsx"`);
    await wb.xlsx.write(res); res.end();
  });
};
