// Activity history (admin menu "ประวัติการใช้งาน"): who did what and when.
// Web actions are written to activity_logs by log(); Checker checks are already in check_logs and are shown with them.
const { toDate } = require('./parse');

// action -> [group, label]. Labels are Thai source text for t().
const ACTIONS = {
  login: ['auth', 'เข้าสู่ระบบ'],
  logout: ['auth', 'ออกจากระบบ'],
  app_login: ['auth', 'เข้าสู่ระบบแอป Android'],
  data_add: ['data', 'เพิ่มรายการ'],
  data_edit: ['data', 'แก้ไขรายการ'],
  data_delete: ['data', 'ลบรายการ'],
  import: ['file', 'Import ข้อมูล'],
  import_sheet: ['file', 'Import ผ่าน Google Sheet (Connector)'],
  export: ['file', 'ส่งออก Excel'],
  template: ['file', 'ดาวน์โหลด Template'],
  user_add: ['users', 'เพิ่มผู้ใช้'],
  user_update: ['users', 'แก้ไขผู้ใช้'],
  user_delete: ['users', 'ลบผู้ใช้'],
  check_ref: ['check', 'Ref Check'],
  check_cross: ['check', 'Cross Ref Check'],
};
const GROUPS = { auth: 'เข้าสู่ระบบ / ออกจากระบบ', data: 'เพิ่ม / แก้ไข / ลบข้อมูล', file: 'Import / Export', users: 'จัดการผู้ใช้', check: 'Checker' };
const ROLE = { admin: 'ผู้ดูแล', user: 'ผู้ใช้' };
const STATUS = { pending: 'รออนุมัติ', active: 'ใช้งาน', disabled: 'ระงับ|status' };
const RESULT = { found: 'พบ', match: 'ตรง', mismatch: 'ไม่ตรง', not_found: 'ไม่พบ' };
const PER_PAGE = 100; // newest first, 100 rows a page

module.exports = function activity(app, { db, auth, admin, dmy }) {
  /** Records an action. user defaults to req.user (pass it when there is no session yet, e.g. the app token). Never throws. */
  const log = (req, action, meta, ref, user = req.user) =>
    db.query('INSERT INTO activity_logs (user_id, email, action, meta, ref, ip) VALUES (?,?,?,?,?,?)',
      [user?.id ?? null, user?.email ?? null, action, meta ? JSON.stringify(meta) : null, ref || null, String(req.ip || '').slice(0, 45) || null])
      .catch((e) => console.error('activity log', action, e.message));

  /** One line of detail for a row, in the page language. */
  function describe(r, t) {
    let m = {};
    try { m = r.meta ? JSON.parse(r.meta) : {}; } catch (e) { m = {}; }
    const n = (v) => Number(v || 0).toLocaleString();
    switch (r.action) {
      case 'data_add': return `Box No. ${m.box} · Waybill No. ${m.wb} · ${m.date}`;
      case 'data_edit': return `Waybill No. ${m.wb}` + (m.changes?.length ? ': ' + m.changes.join(', ') : ` (${t('ไม่มีการเปลี่ยนแปลง')})`);
      case 'data_delete': return t('{n} รายการ', { n: n(m.n) }) + (m.wbs?.length ? ': ' + m.wbs.join(', ') + (m.n > m.wbs.length ? ' …' : '') : '');
      case 'export': {
        const scope = [];
        if (m.q) scope.push(t('ค้นหา "{q}"', { q: m.q }));
        if (m.from || m.to) scope.push(`${m.from || '…'} – ${m.to || '…'}`);
        return t('{n} รายการ', { n: n(m.n) }) + ' · ' + (scope.length ? scope.join(' · ') : t('ไม่ได้เลือกขอบเขตข้อมูล (ทั้งหมด)'));
      }
      case 'import':
        if (m.failed) return `${m.file || ''} · ${t('ล้มเหลว')}` + (m.msg ? `: ${t(m.msg)}` : '');
        return `${m.file} · ` + t('ทั้งหมด {n} · เพิ่มใหม่ {a} · อัปเดต {u} · ไม่เปลี่ยน {s} · ผิดพลาด {e}',
          { n: n(m.n), a: n(m.inserted), u: n(m.updated), s: n(m.unchanged), e: n(m.error) });
      case 'import_sheet': {
        const src = `Google Sheet "${m.sheet || ''}"` + (m.by ? ` · ${t('สั่งโดย {email}', { email: m.by })}` : '');
        if (m.failed) return `${src} · ${t('ล้มเหลว')}` + (m.msg ? `: ${t(m.msg)}` : '');
        return `${src} · ` + t('ทั้งหมด {n} · เพิ่มใหม่ {a} · อัปเดต {u} · ไม่เปลี่ยน {s} · ผิดพลาด {e}',
          { n: n(m.n), a: n(m.inserted), u: n(m.updated), s: n(m.unchanged), e: n(m.error) })
          + ' · ' + t('เขียน flag_upload {f} แถว', { f: n(m.flagged) }) + (m.flag_error ? ` (${t('เขียน flag_upload ไม่สำเร็จ: ')}${t(m.flag_error)})` : '');
      }
      case 'user_add': return `${m.email} (${t(ROLE[m.role] || m.role)})`;
      case 'user_update': return `${m.email}: ` + [m.status && `${t('สถานะ')} → ${t(STATUS[m.status] || m.status)}`,
        m.role && `${t('สิทธิ์')} → ${t(ROLE[m.role] || m.role)}`].filter(Boolean).join(', ');
      case 'user_delete': return m.email || '';
      case 'check_ref': return `${r.in1} · ${t(RESULT[r.result] || r.result)}` + (r.detail ? ` · ${t(r.detail)}` : '');
      case 'check_cross': return `${r.corder === 'bw' ? 'Box → Waybill' : 'Waybill → Box'}: ${r.in1} / ${r.in2} · ${t(RESULT[r.result] || r.result)}`;
      default: return '';
    }
  }

  // Filters sit in the column headers (like a Google Sheets filter): time = from/to, user = user ids, action = action keys,
  // details = text. Several values of user / action may be chosen; none means no filter.
  app.get('/activity', auth, admin, async (req, res) => {
    const q = req.query;
    let page = Math.max(1, parseInt(q.page, 10) || 1);
    const many = (v) => [...new Set([].concat(v ?? []).map(String))];
    const userIds = many(q.user).map(Number).filter((n) => Number.isInteger(n) && n > 0);
    const acts = many(q.action).filter((a) => ACTIONS[a]);
    const from = toDate(q.from); const to = toDate(q.to);
    const text = String(q.q || '').trim().slice(0, 100);
    const webActs = acts.filter((a) => !a.startsWith('check_'));
    const modes = acts.filter((a) => a.startsWith('check_')).map((a) => a.slice(6));

    // the same filters on both tables
    const part = (alias, isCheck) => {
      const w = []; const a = [];
      if (userIds.length) { w.push(`${alias}.user_id IN (?)`); a.push(userIds); }
      if (from) { w.push(`${alias}.created_at >= ?`); a.push(from); }
      if (to) { w.push(`${alias}.created_at < DATE_ADD(?, INTERVAL 1 DAY)`); a.push(to); }
      if (!isCheck && webActs.length) { w.push(`${alias}.action IN (?)`); a.push(webActs); }
      if (isCheck && modes.length) { w.push(`${alias}.mode IN (?)`); a.push(modes); }
      if (text) {
        const like = `%${text}%`;
        if (isCheck) { w.push('(c.input1 LIKE ? OR c.input2 LIKE ? OR u.email LIKE ? OR u.name LIKE ?)'); a.push(like, like, like, like); }
        else { w.push('(a.meta LIKE ? OR a.email LIKE ? OR u.email LIKE ? OR u.name LIKE ? OR a.ip LIKE ?)'); a.push(like, like, like, like, like); }
      }
      return { sql: w.length ? 'WHERE ' + w.join(' AND ') : '', args: a };
    };
    const useA = !acts.length || webActs.length > 0; const useC = !acts.length || modes.length > 0;
    const pa = part('a', false); const pc = part('c', true);
    // users is joined only when the text filter needs its email / name
    const fromA = 'FROM activity_logs a' + (text ? ' LEFT JOIN users u ON u.id=a.user_id' : '');
    const fromC = 'FROM check_logs c' + (text ? ' LEFT JOIN users u ON u.id=c.user_id' : '');

    let total = 0;
    if (useA) { const [[{ n }]] = await db.query(`SELECT COUNT(*) n ${fromA} ${pa.sql}`, pa.args); total += n; }
    if (useC) { const [[{ n }]] = await db.query(`SELECT COUNT(*) n ${fromC} ${pc.sql}`, pc.args); total += n; }
    const pages = Math.max(1, Math.ceil(total / PER_PAGE));
    page = Math.min(page, pages);

    // Newest first across both tables, in 2 light steps:
    // 1. only (table, id, time) of the rows up to this page from each table (read from the created_at indexes), merged, cut to this page
    //    (pages in the older half are counted from the oldest end, so the last pages are as quick as the first)
    // 2. the full rows for just those ids (at most 100)
    const skip = (page - 1) * PER_PAGE; const take = Math.min(PER_PAGE, total - skip);
    const back = skip > total / 2; const dir = back ? 'ASC' : 'DESC';
    const off = back ? total - skip - take : skip; const upto = off + take;
    const parts = []; const args = [];
    if (useA) { parts.push(`(SELECT 'a' src, a.id, a.created_at ${fromA} ${pa.sql} ORDER BY a.created_at ${dir}, a.id ${dir} LIMIT ?)`); args.push(...pa.args, upto); }
    if (useC) { parts.push(`(SELECT 'c' src, c.id, c.created_at ${fromC} ${pc.sql} ORDER BY c.created_at ${dir}, c.id ${dir} LIMIT ?)`); args.push(...pc.args, upto); }
    let [ids] = take > 0 ? await db.query(`SELECT src, id FROM (${parts.join(' UNION ALL ')}) x
      ORDER BY created_at ${dir}, src ${back ? 'DESC' : 'ASC'}, id ${dir} LIMIT ? OFFSET ?`, [...args, take, off]) : [[]];
    if (back) ids = ids.reverse();
    const idsOf = (src) => ids.filter((r) => r.src === src).map((r) => r.id);
    const full = new Map();
    if (idsOf('a').length) {
      const [r] = await db.query(`SELECT 'a' src, a.id, a.user_id, COALESCE(u.email, a.email) email, u.name, a.action, a.meta, a.ref, a.ip, a.created_at
        FROM activity_logs a LEFT JOIN users u ON u.id=a.user_id WHERE a.id IN (?)`, [idsOf('a')]);
      r.forEach((x) => full.set('a' + x.id, x));
    }
    if (idsOf('c').length) {
      const [r] = await db.query(`SELECT 'c' src, c.id, c.user_id, u.email, u.name, CONCAT('check_', c.mode) action, c.created_at,
        c.input1 in1, c.input2 in2, c.result, c.detail, c.check_order corder FROM check_logs c LEFT JOIN users u ON u.id=c.user_id WHERE c.id IN (?)`, [idsOf('c')]);
      r.forEach((x) => full.set('c' + x.id, x));
    }
    const rows = ids.map((x) => full.get(x.src + x.id)).filter(Boolean);
    const [users] = await db.query('SELECT id, email, name, deleted_at FROM users ORDER BY deleted_at IS NOT NULL, email');

    // what the header filters show, and a chip for each active filter (its x link drops just that filter)
    const t = req.t;
    const sel = { users: userIds, actions: acts, from: from ? q.from : '', to: to ? q.to : '', q: text };
    const url = (drop) => {
      const u = new URLSearchParams();
      if (drop !== 'time') { if (sel.from) u.append('from', sel.from); if (sel.to) u.append('to', sel.to); }
      if (drop !== 'user') sel.users.forEach((v) => u.append('user', v));
      if (drop !== 'action') sel.actions.forEach((v) => u.append('action', v));
      if (drop !== 'q' && sel.q) u.append('q', sel.q);
      const s = u.toString(); return '/activity' + (s ? '?' + s : '');
    };
    const chips = [];
    if (sel.from || sel.to) chips.push({ text: t('เวลา: {v}', { v: `${sel.from || '…'} – ${sel.to || '…'}` }), href: url('time') });
    if (userIds.length) {
      const one = users.find((u) => u.id === userIds[0]);
      chips.push({ text: t('ผู้ใช้: {v}', { v: userIds.length === 1 ? (one ? one.email : '#' + userIds[0]) : t('{n} คน', { n: userIds.length }) }), href: url('user') });
    }
    if (acts.length) chips.push({ text: t('การกระทำ: {v}', { v: acts.length === 1 ? t(ACTIONS[acts[0]][1]) : t('{n} แบบ', { n: acts.length }) }), href: url('action') });
    if (text) chips.push({ text: t('ข้อความ: "{v}"', { v: text }), href: url('q') });
    const groups = Object.entries(GROUPS).map(([g, label]) => ({ label, actions: Object.keys(ACTIONS).filter((k) => ACTIONS[k][0] === g).map((k) => ({ key: k, label: ACTIONS[k][1] })) }));

    res.render('activity', {
      sel, chips, groups, total, page, pages, perPage: PER_PAGE, users,
      pageUrl: (n) => { const base = url(null); return n === 1 ? base : base + (base.includes('?') ? '&' : '?') + 'page=' + n; },
      rows: rows.map((r) => ({ ...r, when: dmy(r.created_at), group: (ACTIONS[r.action] || ['other'])[0], label: (ACTIONS[r.action] || [, r.action])[1], text: describe(r, req.t) })),
    });
  });

  return { log };
};

module.exports.ACTIONS = ACTIONS;
