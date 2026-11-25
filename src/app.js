require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const multer = require('multer');
const ExcelJS = require('exceljs');
const db = require('./db');
const appAuth = require('./appauth');
const { readRows, buildTemplate, toDate } = require('./parse');

const app = express();
app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.locals.icon = require('./icons');
app.use('/static', express.static(path.join(__dirname, '..', 'public')));
app.use('/vendor/font', express.static(path.join(__dirname, '..', 'node_modules', '@fontsource', 'ibm-plex-sans-thai'), { maxAge: '30d' }));
app.use('/vendor/flatpickr', express.static(path.join(path.dirname(require.resolve('flatpickr')), '..', 'dist')));
app.use(express.urlencoded({ extended: false }));

const secure = (process.env.BASE_URL || '').startsWith('https');
app.use(session({
  store: new MySQLStore({}, db),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure, maxAge: 7 * 24 * 3600 * 1000 },
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(appAuth.bearer(db)); // Android Checker app (Authorization: Bearer)

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const REQUIRE_APPROVAL = process.env.REQUIRE_APPROVAL !== 'false';

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: `${process.env.BASE_URL}/auth/google/callback`,
}, async (_a, _r, profile, done) => {
  try {
    const email = (profile.emails?.[0]?.value || '').toLowerCase();
    const picture = profile.photos?.[0]?.value || null;
    const [[existing]] = await db.query('SELECT * FROM users WHERE google_id=?', [profile.id]);
    if (existing) {
      await db.query('UPDATE users SET email=?, name=?, picture=?, last_login_at=NOW() WHERE id=?', [email, profile.displayName, picture, existing.id]);
      return done(null, existing.id);
    }
    const [[{ n }]] = await db.query('SELECT COUNT(*) n FROM users');
    const isAdmin = n === 0 || ADMIN_EMAILS.includes(email);
    const status = isAdmin || !REQUIRE_APPROVAL ? 'active' : 'pending';
    const [r] = await db.query('INSERT INTO users (google_id,email,name,picture,role,status,last_login_at) VALUES (?,?,?,?,?,?,NOW())',
      [profile.id, email, profile.displayName, picture, isAdmin ? 'admin' : 'user', status]);
    done(null, r.insertId);
  } catch (e) { done(e); }
}));
passport.serializeUser((id, done) => done(null, id));
passport.deserializeUser(async (id, done) => {
  try {
    const [[u]] = await db.query('SELECT * FROM users WHERE id=?', [id]);
    done(null, u || false);
  } catch (e) { done(e); }
});

// flash + locals
app.use((req, res, next) => {
  res.locals.user = req.user;
  res.locals.path = req.path;
  res.locals.dmy = dmy;
  res.locals.flash = req.session?.flash;
  if (req.session) delete req.session.flash;
  next();
});
const back = (req, res) => {
  const ref = req.get('Referrer') || '';
  const u = ref.startsWith(process.env.BASE_URL || '') ? ref.slice((process.env.BASE_URL || '').length) : '';
  res.redirect(u.startsWith('/data') ? u : '/data');
};
function dmy(v) {
  if (!v) return '';
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})(.*)$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}${m[4]}` : String(v);
}
const flash = (req, type, msg) => { req.session.flash = { type, msg }; };

const auth = (req, res, next) => {
  if (!req.user) return res.redirect('/login');
  if (req.user.status !== 'active') return res.render('pending');
  next();
};
const admin = (req, res, next) => (req.user?.role === 'admin' ? next() : res.status(403).send('Forbidden'));

// ---------- auth ----------
app.get('/login', (req, res) => (req.user ? res.redirect('/') : res.render('login')));
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'], prompt: 'select_account' }));
app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/login', keepSessionInfo: true }), (req, res) => {
  const to = req.session.returnTo === '/app/login' ? '/app/login' : '/';
  delete req.session.returnTo;
  res.redirect(to);
});
app.post('/logout', (req, res, next) => req.logout((e) => (e ? next(e) : res.redirect('/login'))));

// ---------- home / menu ----------
app.get('/', auth, async (req, res) => {
  const [[s]] = await db.query(`SELECT COUNT(*) total, COUNT(DISTINCT box_no) boxes,
    SUM(operation_date=CURDATE()) today, MAX(operation_date) last_date FROM packings`);
  res.render('home', { s });
});

// ---------- data ----------
function filters(q) {
  const where = []; const args = [];
  if (q.q) { where.push('(box_no LIKE ? OR waybill_no LIKE ?)'); args.push(`%${q.q}%`, `%${q.q}%`); }
  const from = toDate(q.from); const to = toDate(q.to);
  if (from) { where.push('operation_date >= ?'); args.push(from); }
  if (to) { where.push('operation_date <= ?'); args.push(to); }
  return { sql: where.length ? 'WHERE ' + where.join(' AND ') : '', args };
}

app.get('/data', auth, async (req, res) => {
  const per = 50;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const f = filters(req.query);
  const [[{ total }]] = await db.query(`SELECT COUNT(*) total FROM packings ${f.sql}`, f.args);
  const [rows] = await db.query(`SELECT p.*, u.email updated_email FROM packings p LEFT JOIN users u ON u.id=COALESCE(p.updated_by,p.created_by)
    ${f.sql.replace(/(box_no|waybill_no|operation_date)/g, 'p.$1')} ORDER BY p.operation_date DESC, p.box_no, p.waybill_no LIMIT ? OFFSET ?`,
    [...f.args, per, (page - 1) * per]);
  res.render('data', { rows, total, page, pages: Math.max(1, Math.ceil(total / per)), q: req.query });
});

app.get('/data/export', auth, async (req, res) => {
  const f = filters(req.query);
  const [rows] = await db.query(`SELECT box_no, waybill_no, operation_date FROM packings ${f.sql} ORDER BY operation_date DESC, box_no, waybill_no`, f.args);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Packing');
  ws.columns = [{ header: 'Box No.', key: 'box_no', width: 20 }, { header: 'Waybill No.', key: 'waybill_no', width: 25 }, { header: 'Operation Date', key: 'operation_date', width: 18, style: { numFmt: 'dd/mm/yyyy' } }];
  ws.getRow(1).font = { bold: true };
  ws.addRows(rows.map((r) => ({ ...r, operation_date: new Date(r.operation_date + 'T00:00:00Z') })));
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="packing-export.xlsx"`);
  await wb.xlsx.write(res); res.end();
});

app.post('/data', auth, async (req, res) => {
  const box = (req.body.box_no || '').trim(); const wb = (req.body.waybill_no || '').trim(); const d = toDate(req.body.operation_date);
  if (!box || !wb || !d) { flash(req, 'error', 'กรอกข้อมูลให้ครบและถูกต้อง'); return back(req, res); }
  try {
    if (req.body.id) {
      await db.query('UPDATE packings SET box_no=?, waybill_no=?, operation_date=?, updated_by=? WHERE id=?', [box, wb, d, req.user.id, req.body.id]);
      flash(req, 'ok', `แก้ไข ${wb} แล้ว`);
    } else {
      await db.query('INSERT INTO packings (box_no,waybill_no,operation_date,created_by) VALUES (?,?,?,?)', [box, wb, d, req.user.id]);
      flash(req, 'ok', `เพิ่ม ${wb} แล้ว`);
    }
  } catch (e) {
    flash(req, 'error', e.code === 'ER_DUP_ENTRY' ? `Waybill No. ${wb} มีอยู่แล้ว` : e.message);
  }
  back(req, res);
});

app.post('/data/delete', auth, async (req, res) => {
  const ids = [].concat(req.body.id || []).map(Number).filter(Boolean);
  if (ids.length) {
    const [r] = await db.query('DELETE FROM packings WHERE id IN (?)', [ids]);
    flash(req, 'ok', `ลบ ${r.affectedRows} รายการแล้ว`);
  }
  back(req, res);
});

// ---------- upload ----------
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_r, f, cb) => cb(null, /\.(xlsx|csv)$/i.test(f.originalname)) });

app.get('/upload/template', auth, async (req, res) => {
  const buf = await buildTemplate();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="packing-template.xlsx"');
  res.send(Buffer.from(buf));
});

require('./imports')(app, { db, auth, upload });
require('./checker')(app, { db, auth });
appAuth.routes(app, { db, auth });

// ---------- users (admin) ----------
app.get('/users', auth, admin, async (req, res) => {
  const [users] = await db.query('SELECT * FROM users ORDER BY status=\'pending\' DESC, id');
  res.render('users', { users });
});
app.post('/users/:id', auth, admin, async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) { flash(req, 'error', 'แก้ไขสิทธิ์ตัวเองไม่ได้'); return res.redirect('/users'); }
  const { status, role } = req.body;
  if (['pending', 'active', 'disabled'].includes(status)) await db.query('UPDATE users SET status=? WHERE id=?', [status, id]);
  if (['admin', 'user'].includes(role)) await db.query('UPDATE users SET role=? WHERE id=?', [role, id]);
  flash(req, 'ok', 'บันทึกแล้ว');
  res.redirect('/users');
});

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).send('เกิดข้อผิดพลาด: ' + (err.message || err));
});

const port = Number(process.env.PORT || 3000);
app.listen(port, '127.0.0.1', () => console.log(`packing listening on 127.0.0.1:${port}`));
