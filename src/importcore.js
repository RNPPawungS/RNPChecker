// Saves checked rows (parse.js buildRow) as one import: packings + uploads + upload_rows, in one transaction.
// Used by the web upload (imports.js) and the Google Sheet connector (sheet.js). The caller holds the import lock (lock.js).
const { dmy } = require('./dates');

/**
 * opts.dupes: 'error' (a file: a second row with the same Waybill No. is an error)
 *             'last'  (the Google Sheet: the lowest row wins, rows above it are kept as "unchanged" and marked done)
 * Returns { uploadId, counts } or { uploadId, failed: message } (nothing saved, a failed upload row is written).
 */
async function saveImport(db, { rows, userId, filename, size = null, started = Date.now(), dupes = 'error' }) {
  if (dupes === 'last') {
    const last = new Map();
    for (const r of rows) if (r.waybill && !r.errors.length) last.set(r.waybill, r.line);
    for (const r of rows) {
      if (!r.waybill || r.errors.length) continue;
      const keep = last.get(r.waybill);
      if (keep !== r.line) { r.status = 'unchanged'; r.superseded = true; r.message = `Waybill No. ซ้ำกับแถวที่ ${keep} ใน Sheet (ใช้ข้อมูลแถวล่าง)`; }
    }
  } else {
    const seen = new Map();
    for (const r of rows) {
      if (!r.waybill || r.errors.length) continue;
      if (seen.has(r.waybill)) r.errors.push(`Waybill No. ซ้ำกับแถวที่ ${seen.get(r.waybill)} ในไฟล์เดียวกัน`);
      else seen.set(r.waybill, r.line);
    }
  }

  const conn = await db.getConnection();
  let uploadId;
  try {
    await conn.beginTransaction();
    const [up] = await conn.query(`INSERT INTO uploads (user_id, filename, file_size, total_rows, status) VALUES (?,?,?,?, 'processing')`,
      [userId, filename, size, rows.length]);
    uploadId = up.insertId;

    const good = rows.filter((r) => !r.errors.length && !r.superseded);
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
          ON DUPLICATE KEY UPDATE box_no=VALUES(box_no), operation_date=VALUES(operation_date), upload_id=VALUES(upload_id), updated_by=${Number(userId)}`,
          [changed.map((x) => [x.box, x.waybill, x.date, uploadId, userId])]);
      }
    }
    for (const r of rows) if (r.errors.length) { r.status = 'error'; r.message = r.errors.join(', '); }

    for (let i = 0; i < rows.length; i += 1000) {
      await conn.query(`INSERT INTO upload_rows (upload_id, line_no, box_no, waybill_no, operation_date, raw_date, status, message, old_box_no, old_operation_date) VALUES ?`,
        [rows.slice(i, i + 1000).map((r) => [uploadId, r.line, r.box.slice(0, 64), r.waybill.slice(0, 64), r.date, (r.raw || '').slice(0, 64),
          r.status, r.message ? r.message.slice(0, 500) : null, r.oldBox ?? null, r.oldDate ?? null])]);
    }
    const n = (s) => rows.filter((r) => r.status === s).length;
    const counts = { n: rows.length, inserted: n('inserted'), updated: n('updated'), unchanged: n('unchanged'), error: n('error') };
    await conn.query(`UPDATE uploads SET inserted_rows=?, updated_rows=?, unchanged_rows=?, error_rows=?, status='done', duration_ms=? WHERE id=?`,
      [counts.inserted, counts.updated, counts.unchanged, counts.error, Date.now() - started, uploadId]);
    await conn.commit();
    conn.release();
    return { uploadId, counts };
  } catch (e) {
    await conn.rollback().catch(() => {});
    conn.release();
    const failed = ('บันทึกไม่สำเร็จ ไม่มีข้อมูลใดถูกบันทึก: ' + e.message).slice(0, 500);
    const [r] = await db.query(`INSERT INTO uploads (user_id, filename, file_size, total_rows, status, message, duration_ms) VALUES (?,?,?,?,?,?,?)`,
      [userId, filename, size, rows.length, 'failed', failed, Date.now() - started]);
    return { uploadId: r.insertId, failed };
  }
}

module.exports = { saveImport };
