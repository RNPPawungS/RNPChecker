// Google Sheet connector: imports new rows of the DATA tab of a Google Sheet into packings, like an uploaded file.
//
//   DATE       -> Operation Date   (date / date-time cell, or text dd/mm/yyyy; the time is dropped)
//   CTN NO.    -> Box No.          (cleaned like a scan: barcode.js)
//   AWB        -> Waybill No.      (cleaned like a scan: barcode.js)
//   flag_upload                    the connector writes "true" here once the row is saved, so the sheet shows what is done
//
// Every SHEET_POLL_SECONDS (default 60) the server reads the tab. Rows without flag_upload = true are new: when there are any,
// they are imported as one import (history: "Import ผ่าน Google Sheet", user "Google Sheet Connector"), then "true" is written
// to flag_upload of the rows that were saved. Rows with an error (no date, bad date...) are reported once and left unflagged;
// once fixed in the sheet they are imported on the next check. A row with an error must look the same on two checks in a row
// before it is reported, so a row still being typed is not reported half done.
// The same Waybill No. on several new rows: the lowest row wins (the rows above it are marked done too).
// Imports never overlap with uploads from the web page (lock.js).
//
// Access: a Google Cloud service account (JSON key file on the server), shared on the sheet as Editor. See README.
const crypto = require('crypto');
const fs = require('fs');
const { buildRow } = require('./parse');
const { saveImport } = require('./importcore');
const lock = require('./lock');
const barcode = require('./barcode');

const CONNECTOR_EMAIL = 'google-sheet@connector';
const CONNECTOR_NAME = 'Google Sheet Connector';
const COLS = { date: ['date', 'operationdate'], box: ['ctnno', 'boxno'], waybill: ['awb', 'waybillno'], flag: ['flagupload'] };
const HEADERS = 'DATE, CTN NO., AWB, flag_upload';
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z]/g, '');
const letter = (i) => { let s = ''; for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; };
const text = (v) => (v == null ? '' : String(v).trim());
const isTrue = (v) => v === true || text(v).toLowerCase() === 'true';
/** A built row (parse.js buildRow) by its content, the same as it is kept in upload_rows (to remember reported errors). */
const keyOf = (r) => crypto.createHash('sha1').update(JSON.stringify([(r.raw || '').slice(0, 64), r.box.slice(0, 64), r.waybill.slice(0, 64)])).digest('base64').slice(0, 16);

function config() {
  const e = process.env;
  return {
    id: (e.GOOGLE_SHEET_ID || '').trim(),
    tab: (e.GOOGLE_SHEET_TAB || 'DATA').trim(),
    keyFile: (e.GOOGLE_SERVICE_ACCOUNT_FILE || '').trim(),
    every: Math.max(15, Number(e.SHEET_POLL_SECONDS) || 60),
    startRow: Math.max(2, Number(e.SHEET_START_ROW) || 2),
  };
}

// ---------- Google API (service account, no extra package) ----------
let token = null;
async function accessToken(keyFile) {
  if (token && token.exp > Date.now() + 60000) return token.value;
  const key = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const body = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: key.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: key.token_uri || 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  })}`;
  const jwt = `${body}.${crypto.sign('RSA-SHA256', Buffer.from(body), key.private_key).toString('base64url')}`;
  const r = await fetch(key.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
    signal: AbortSignal.timeout(30000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Google login ไม่สำเร็จ: ${j.error_description || j.error || r.status}`);
  token = { value: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000, email: key.client_email };
  return token.value;
}

async function api(cfg, path, opts = {}) {
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(cfg.id)}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${await accessToken(cfg.keyFile)}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(60000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = j.error?.message || r.statusText;
    const e = new Error(r.status === 403 || r.status === 404
      ? `เข้าถึง Google Sheet ไม่ได้ (${r.status}): ${msg} (แชร์ Sheet ให้ ${token?.email || 'service account'} เป็น Editor หรือยัง?)`
      : `Google Sheet ตอบกลับผิดพลาด (${r.status}): ${msg}`);
    e.status = r.status;
    throw e;
  }
  return j;
}

const range = (cfg, a1) => `'${cfg.tab.replace(/'/g, "''")}'!${a1}`;

/** The data rows of the tab: { line, date, box, waybill, flagged }, and the flag_upload column letter. */
async function readSheet(cfg) {
  const j = await api(cfg, `/values/${encodeURIComponent(range(cfg, 'A:ZZ'))}?majorDimension=ROWS`
    + '&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER');
  const values = j.values || [];
  const head = (values[0] || []).map(norm);
  const col = {};
  for (const [k, names] of Object.entries(COLS)) col[k] = head.findIndex((h) => names.includes(h));
  if (Object.values(col).some((i) => i < 0)) {
    throw new Error(`หัวคอลัมน์ใน sheet "${cfg.tab}" ไม่ครบ ต้องมี: ${HEADERS}`);
  }
  const rows = [];
  for (let i = cfg.startRow - 1; i < values.length; i++) {
    const v = values[i] || [];
    const r = { line: i + 1, date: v[col.date], box: text(v[col.box]), waybill: text(v[col.waybill]), flagged: isTrue(v[col.flag]) };
    if (text(r.date) || r.box || r.waybill) rows.push(r);
  }
  return { rows, flagCol: letter(col.flag) };
}

/** Writes "true" to flag_upload of these lines (contiguous lines go in one range). */
async function writeFlags(cfg, flagCol, lines) {
  const sorted = [...new Set(lines)].sort((a, b) => a - b);
  const data = [];
  for (let i = 0; i < sorted.length;) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    data.push({ range: range(cfg, `${flagCol}${sorted[i]}:${flagCol}${sorted[j]}`), values: sorted.slice(i, j + 1).map(() => ['true']) });
    i = j + 1;
  }
  for (let i = 0; i < data.length; i += 500) {
    await api(cfg, '/values:batchUpdate', { method: 'POST', body: JSON.stringify({ valueInputOption: 'RAW', data: data.slice(i, i + 500) }) });
  }
  return sorted.length;
}

// ---------- connector ----------
module.exports = function sheetConnector({ db, log }) {
  const cfg = config();
  const enabled = Boolean(cfg.id && cfg.keyFile);
  const st = {
    enabled, tab: cfg.tab, every: cfg.every, running: false, lastCheckAt: null, rows: null, pending: 0, lastError: null, lastImport: null,
  };
  let user = null;               // the "Google Sheet Connector" user that imports are saved under
  const reported = new Set();    // error rows already reported (by content)
  let seenErrors = new Set();    // error rows of the previous check
  const done = new Map();        // rows saved by this process -> line, so a failed flag write is retried without importing again
  let lastLoggedError = null;
  let timer = null;

  // A user row for the connector: hidden like a deleted user (not in the users list, cannot sign in),
  // but uploads / history show its name.
  async function connectorUser() {
    if (user) return user;
    const [[u]] = await db.query('SELECT id, email FROM users WHERE email=? ORDER BY id LIMIT 1', [CONNECTOR_EMAIL]);
    if (u) { user = u; return u; }
    const [r] = await db.query("INSERT INTO users (email, name, role, status, deleted_at) VALUES (?, ?, 'user', 'disabled', NOW())", [CONNECTOR_EMAIL, CONNECTOR_NAME]);
    user = { id: r.insertId, email: CONNECTOR_EMAIL };
    return user;
  }
  // error rows reported by earlier imports (before a restart) are not reported again
  let seeded = false;
  async function seedReported() {
    if (seeded) return;
    const [rows] = await db.query(`SELECT r.raw_date raw, r.box_no box, r.waybill_no waybill FROM upload_rows r
      JOIN uploads up ON up.id=r.upload_id WHERE up.user_id=? AND r.status='error' ORDER BY r.id DESC LIMIT 20000`, [(await connectorUser()).id]);
    rows.forEach((r) => reported.add(keyOf({ raw: r.raw || '', box: r.box || '', waybill: r.waybill || '' })));
    seeded = true;
  }
  const logAs = async (meta, ref) => log({ ip: null }, 'import_sheet', meta, ref, await connectorUser());

  /** One check. manual = an admin pressed "ตรวจ Sheet ตอนนี้" (error rows are reported at once). */
  async function check({ manual = false, by = null } = {}) {
    if (!enabled) return { error: 'ยังไม่ได้ตั้งค่า Google Sheet connector' };
    if (st.running) return { busy: true };
    st.running = true;
    try {
      await seedReported();
      const sheet = await readSheet(cfg);
      st.lastCheckAt = new Date(); st.rows = sheet.rows.length; st.lastError = null; lastLoggedError = null;

      const open = sheet.rows.filter((r) => !r.flagged).map((r) => buildRow(r.line, r.box, r.waybill, r.date)).filter(Boolean);
      for (const r of open) r.key = keyOf(r);
      // saved before but the flag was not written (e.g. the sheet was shared as Viewer): only write the flag
      const reflag = open.filter((r) => done.has(r.key));
      const fresh = open.filter((r) => !done.has(r.key));
      const errs = new Set(fresh.filter((r) => r.errors.length).map((r) => r.key));
      const take = fresh.filter((r) => !r.errors.length || (!reported.has(r.key) && (manual || seenErrors.has(r.key))));
      seenErrors = errs;
      st.pending = fresh.filter((r) => !r.errors.length).length;

      let flagError = null;
      if (reflag.length) {
        try { await writeFlags(cfg, sheet.flagCol, reflag.map((r) => r.line)); } catch (e) { flagError = e.message; }
      }
      if (!take.length) { if (flagError) st.lastError = flagError; return { nothing: true }; }

      const res = await lock.withLock('sheet', CONNECTOR_EMAIL, async () => saveImport(db, {
        rows: take, userId: (await connectorUser()).id, filename: `Google Sheet: ${cfg.tab}`, dupes: 'last',
      }));
      if (res.failed) {
        st.lastError = res.failed;
        await logAs({ sheet: cfg.tab, failed: 1, msg: res.failed.slice(0, 200), by }, `/upload/${res.uploadId}`);
        return res;
      }
      for (const r of take) if (r.errors.length) reported.add(r.key);
      const saved = take.filter((r) => r.status !== 'error');
      for (const r of saved) done.set(r.key, r.line);
      if (done.size > 50000) [...done.keys()].slice(0, done.size - 50000).forEach((k) => done.delete(k));

      // flag only rows that still hold the same data (someone may have inserted / deleted rows meanwhile)
      let flagged = 0;
      if (saved.length) {
        try {
          const now = await readSheet(cfg);
          const at = new Map(now.rows.map((r) => [r.line, r]));
          const ok = saved.filter((r) => { const x = at.get(r.line); return x && barcode.waybill(x.waybill, { layout: false }) === r.waybill; });
          flagged = await writeFlags(cfg, now.flagCol, ok.map((r) => r.line));
        } catch (e) { flagError = e.message; }
      }
      if (flagError) st.lastError = flagError;
      st.pending = Math.max(0, st.pending - saved.length);
      st.lastImport = { at: new Date(), uploadId: res.uploadId, ...res.counts, flagged };
      await logAs({ sheet: cfg.tab, ...res.counts, flagged, flag_error: flagError ? flagError.slice(0, 200) : undefined, by }, `/upload/${res.uploadId}`);
      return { ...res, flagged, flagError };
    } catch (e) {
      st.lastError = e.message;
      console.error('google sheet', e.message);
      if (e.message !== lastLoggedError) { // the same problem is logged once, not every minute
        lastLoggedError = e.message;
        await logAs({ sheet: cfg.tab, failed: 1, msg: e.message.slice(0, 200), by });
      }
      return { error: e.message };
    } finally {
      st.running = false;
    }
  }

  function start() {
    if (!enabled) { console.log('google sheet connector: off (GOOGLE_SHEET_ID / GOOGLE_SERVICE_ACCOUNT_FILE not set)'); return; }
    console.log(`google sheet connector: tab "${cfg.tab}", every ${cfg.every}s`);
    const loop = async () => { await check().catch((e) => console.error('google sheet', e)); timer = setTimeout(loop, cfg.every * 1000); };
    timer = setTimeout(loop, 10000);
  }
  const stop = () => clearTimeout(timer);

  /** Status for the import history page. */
  const local = (d) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${d.toTimeString().slice(0, 8)}` : null);
  const status = () => ({
    ...st, lastCheckAt: local(st.lastCheckAt), lastImport: st.lastImport && { ...st.lastImport, at: local(st.lastImport.at) }, lock: lock.state().busy?.who || null,
  });

  /** Routes: admins can check the sheet now (button on the import history page). */
  function routes(app, { auth, admin, flash }) {
    app.post('/import/sheet', auth, admin, async (req, res) => {
      const r = await check({ manual: true, by: req.user.email });
      if (r.error) flash(req, 'error', req.t(r.error));
      else if (r.busy) flash(req, 'ok', req.t('กำลังตรวจ Google Sheet อยู่แล้ว'));
      else if (r.nothing) flash(req, 'ok', req.t('ไม่มีแถวใหม่ใน Google Sheet'));
      else if (r.failed) flash(req, 'error', req.t(r.failed));
      else flash(req, r.flagError ? 'error' : 'ok', req.t('Import จาก Google Sheet แล้ว {n} แถว', { n: r.counts.n })
        + (r.flagError ? ' · ' + req.t('เขียน flag_upload ไม่สำเร็จ: ') + req.t(r.flagError) : ''));
      res.redirect('/upload');
    });
  }

  return { check, start, stop, status, routes, CONNECTOR_EMAIL };
};

module.exports.CONNECTOR_EMAIL = CONNECTOR_EMAIL;
module.exports.writeFlags = writeFlags;
module.exports.readSheet = readSheet;
module.exports.letter = letter;
