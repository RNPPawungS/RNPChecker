// Login for the Android Checker app.
// The app never sees Google: a logged-in web user shows a pairing QR (/app/pair), the handheld scans it,
// and the app swaps the short-lived pair code for a long-lived app token sent as "Authorization: Bearer".
// Codes are stateless HMACs over SESSION_SECRET (changing the secret logs out every app).
// Pair codes use only [a-z0-9.] so they survive a scanner typing through a Thai keyboard layout.
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const express = require('express');
const QRCode = require('qrcode');

const PAIR_TTL = 10 * 60; // seconds
const APP_TTL = 180 * 24 * 3600;
const APK = path.join(__dirname, '..', 'public', 'app', 'rnp-checker.apk');
// handhelds cannot resolve the domain name, so the download link/QR points at the server's IP
const APP_URL = (process.env.APP_SERVER_URL || 'https://10.80.0.9').replace(/\/+$/, '');

const hmac = (s) => crypto.createHmac('sha256', String(process.env.SESSION_SECRET)).update(s).digest('hex').slice(0, 40);
const now = () => Math.floor(Date.now() / 1000);
function sign(type, uid, ttl) {
  const body = `${type}.${Number(uid).toString(36)}.${(now() + ttl).toString(36)}`;
  return `${body}.${hmac(body)}`;
}
function verify(token, type) {
  const m = /^([a-z]+)\.([0-9a-z]+)\.([0-9a-z]+)\.([0-9a-f]{40})$/.exec(String(token || '').trim().toLowerCase());
  if (!m || m[1] !== type) return null;
  const want = Buffer.from(hmac(`${m[1]}.${m[2]}.${m[3]}`)); const got = Buffer.from(m[4]);
  if (!crypto.timingSafeEqual(want, got)) return null;
  if (parseInt(m[3], 36) < now()) return null;
  return { uid: parseInt(m[2], 36) };
}

// "Authorization: Bearer <app token>" -> req.user. Mount after passport.session().
function bearer(db) {
  return async (req, res, next) => {
    const h = req.headers.authorization || '';
    if (!h.startsWith('Bearer ')) return next();
    try {
      const p = verify(h.slice(7), 'a');
      const [[u]] = p ? await db.query('SELECT * FROM users WHERE id=? AND deleted_at IS NULL', [p.uid]) : [[null]];
      if (!u) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบใหม่ (สแกน QR จากหน้าเว็บ)', code: 'auth' });
      if (u.status !== 'active') return res.status(403).json({ error: u.status === 'disabled' ? 'บัญชีถูกระงับการใช้งาน' : 'บัญชีกำลังรอผู้ดูแลระบบอนุมัติ', code: 'status' });
      req.user = u;
      next();
    } catch (e) { next(e); }
  };
}

// Which device used which pairing QR. In memory only (lost on restart, which is fine: a QR lives 10 minutes).
// The pairing page asks about its own code only, so it shows just the device that scanned the QR on screen.
const paired = new Map(); // pair code -> { uid, at, device, ip }
function rememberPair(code, uid, req) {
  const t = Date.now();
  for (const [k, v] of paired) if (t - v.at > PAIR_TTL * 1000) paired.delete(k);
  const ua = String(req.get('user-agent') || '');
  const app = /RNPChecker-Android\/([\w.-]+)/.exec(ua);
  const model = String(req.body.device || '').replace(/[^\w .()+-]/g, '').slice(0, 60).trim();
  const device = [model, app ? `RNP Checker v${app[1]}` : ua.slice(0, 60)].filter(Boolean).join(' · ');
  paired.set(code, { uid, at: t, device, ip: req.ip });
}

function routes(app, { db, auth, log }) {
  const json = express.json({ limit: '2kb' });

  // page with the pairing QR (scan it with the handheld) + APK download
  app.get('/app/pair', auth, async (req, res) => {
    const code = sign('p', req.user.id, PAIR_TTL);
    const qr = await QRCode.toString(code, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
    const dl = `${APP_URL}/app/download`;
    const dlQr = await QRCode.toString(dl, { type: 'svg', margin: 1 });
    res.render('app_pair', { qr, code, dl, dlQr, hasApk: fs.existsSync(APK), ttlMin: PAIR_TTL / 60 });
  });

  // status of the device that scanned the QR shown on /app/pair (polled by that page)
  app.get('/app/pair/status', auth, (req, res) => {
    const code = String(req.query.code || '').trim().toLowerCase();
    const p = verify(code, 'p');
    res.set('Cache-Control', 'no-store');
    if (!p || p.uid !== req.user.id) return res.json({ state: 'expired' });
    const d = paired.get(code);
    if (!d) return res.json({ state: 'waiting' });
    res.json({ state: 'paired', device: d.device, ip: d.ip, at: new Date(d.at).toISOString() });
  });

  // login from the browser on the handheld itself: after Google login, hand the code back to the app
  app.get('/app/login', (req, res, next) => {
    if (!req.user) { req.session.returnTo = '/app/login'; return res.redirect('/login'); }
    next();
  }, auth, (req, res) => {
    res.render('app_login', { link: `rnpchecker://auth?code=${sign('p', req.user.id, PAIR_TTL)}` });
  });

  app.get('/app/download', (req, res) => {
    if (!fs.existsSync(APK)) return res.status(404).send(req.t ? req.t('ยังไม่มีไฟล์ APK บนเซิร์ฟเวอร์') : 'ยังไม่มีไฟล์ APK บนเซิร์ฟเวอร์');
    res.download(APK, 'rnp-checker.apk', { headers: { 'Content-Type': 'application/vnd.android.package-archive' } });
  });

  // pair code -> app token
  app.post('/api/app/token', json, async (req, res) => {
    const p = verify(req.body.code, 'p');
    if (!p) return res.status(400).json({ error: 'QR หมดอายุหรือไม่ถูกต้อง กรุณาเปิดหน้า "เชื่อมแอป Android" ใหม่', code: 'pair' });
    const [[u]] = await db.query('SELECT id, email, name, role, status FROM users WHERE id=? AND deleted_at IS NULL', [p.uid]);
    if (!u || u.status !== 'active') return res.status(403).json({ error: 'บัญชีนี้ยังใช้งานไม่ได้', code: 'status' });
    rememberPair(String(req.body.code).trim().toLowerCase(), u.id, req);
    if (log) log(req, 'app_login', null, null, u);
    res.json({ token: sign('a', u.id, APP_TTL), email: u.email, name: u.name, role: u.role });
  });

  app.get('/api/app/me', auth, (req, res) => res.json({ email: req.user.email, name: req.user.name, role: req.user.role }));
}

module.exports = { bearer, routes, sign, verify };
