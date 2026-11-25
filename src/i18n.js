// Two languages: Thai (default, the source text) and English.
// Views write the Thai text and wrap it: <%= t('ค้นหา') %>. With English selected, t() looks the text up in EN.
// "{name}" placeholders are filled from the second argument: t('สวัสดี {name}', { name }).
// "text|context" keys separate identical Thai words that need different English (the part after | is never shown).
// Messages built elsewhere and stored in the database (import errors, check results) are translated by FRAG rules,
// so old rows and the Android app (always Thai) keep working.
// An English entry can be a function of the values, for singular/plural.
const many = (one, other) => (v) => (Number(String(v.n).replace(/,/g, '')) === 1 ? one : other);
const EN = {
  // header / common
  'หน้าหลัก': 'Home',
  'จัดการข้อมูล': 'Manage Data',
  'อัปโหลด': 'Upload',
  'ผู้ใช้งาน': 'Users',
  'ออกจากระบบ': 'Sign out',
  'ภาษา': 'Language',
  'ค้นหา': 'Search',
  'ล้าง': 'Clear',
  'บันทึก': 'Save',
  'ยกเลิก': 'Cancel',
  'แก้ไข': 'Edit',
  'สถานะ': 'Status',
  'เวลา': 'Time',
  'ไฟล์': 'File',
  'ผู้อัปโหลด': 'Uploaded by',
  'รายละเอียด': 'Details',
  'ทั้งหมด': 'Total',
  'ค้นหา Box No. / Waybill No.': 'Search Box No. / Waybill No.',
  '‹ ก่อนหน้า': '‹ Previous',
  'ถัดไป ›': 'Next ›',
  'หน้า {page} / {pages}': 'Page {page} / {pages}',
  'เกิดข้อผิดพลาด: ': 'Error: ',

  // home
  'สวัสดี {name}': 'Hello, {name}',
  'ระบบจัดการและตรวจสอบข้อมูลกล่องพัสดุ': 'Parcel box data management and verification',
  'จำนวนพัสดุทั้งหมด': 'Total parcels',
  'จำนวนกล่อง': 'Boxes',
  'รอบเอกสารวันนี้': 'Parcels today',
  'รอบเอกสารล่าสุด': 'Latest Operation Date',
  'เมนู': 'Menu',
  'ดู ค้นหา แก้ไข ลบ Box No. / Waybill No. / Operation Date': 'View, search, edit and delete Box No. / Waybill No. / Operation Date',
  'Ref Check หาเลขอ้างอิง และ Cross Ref Check ตรวจคู่ Waybill / Box': 'Ref Check looks up a number, Cross Ref Check verifies a Waybill / Box pair',
  'แอป Android (Checker)': 'Android app (Checker)',
  'ดาวน์โหลดแอปสำหรับเครื่อง handheld และสแกน QR เพื่อเข้าสู่ระบบ': 'Download the handheld app and scan a QR code to sign in',
  'อัปโหลดเอกสาร': 'Upload Data',
  'อัปโหลดข้อมูล': 'Upload data',
  'อัปโหลดไฟล์ Excel / CSV': 'Upload an Excel / CSV file',
  'ดาวน์โหลด template และอัปโหลดไฟล์ Excel / CSV': 'Download the template and upload Excel / CSV files',
  'อนุมัติและกำหนดสิทธิ์ผู้ใช้': 'Approve users and set their roles',

  // login / pending / app login
  'ระบบจัดการข้อมูลกล่องพัสดุ': 'Parcel box data management',
  'เข้าสู่ระบบด้วย Google': 'Sign in with Google',
  'ผู้ใช้ใหม่ต้องรอผู้ดูแลระบบอนุมัติก่อนใช้งาน': 'New users need administrator approval first',
  'รอการอนุมัติ': 'Waiting for approval',
  'บัญชี <b>{email}</b> ถูกระงับการใช้งาน': 'The account <b>{email}</b> has been disabled',
  'บัญชี <b>{email}</b> กำลังรอผู้ดูแลระบบอนุมัติ': 'The account <b>{email}</b> is waiting for administrator approval',
  'เข้าสู่ระบบสำเร็จ': 'Signed in',
  'เปิดแอป RNP Checker': 'Open the RNP Checker app',
  'ถ้าแอปไม่เปิดเอง ให้กดปุ่มด้านบน': "If the app doesn't open by itself, tap the button above",

  // Android app pairing page
  'เข้าสู่ระบบในแอป': 'Sign in to the app',
  'เปิดแอป <b>RNP Checker</b> บนเครื่อง handheld แล้ว<b>ยิงบาร์โค้ด QR นี้</b><br>แอปจะเข้าสู่ระบบเป็น <b>{email}</b>':
    'Open <b>RNP Checker</b> on the handheld and <b>scan this QR code</b><br>The app will sign in as <b>{email}</b>',
  'QR ใช้ได้': 'QR valid for',
  'นาที': 'min',
  'สร้าง QR ใหม่': 'New QR code',
  'แสดงรหัส (กรณีพิมพ์เอง)': 'Show the code (to type it in)',
  'ติดตั้งแอป': 'Install the app',
  'สแกน QR นี้ด้วยกล้อง/เบราว์เซอร์ของเครื่อง หรือเปิดลิงก์': "Scan this QR code with the device's camera or browser, or open the link",
  'ดาวน์โหลด rnp-checker.apk': 'Download rnp-checker.apk',
  'ยังไม่มีไฟล์ APK บนเซิร์ฟเวอร์ (วางไฟล์ไว้ที่ public/app/rnp-checker.apk)': 'There is no APK file on the server yet (put it at public/app/rnp-checker.apk)',
  'ยังไม่มีไฟล์ APK บนเซิร์ฟเวอร์': 'There is no APK file on the server yet',
  'ตอนติดตั้งให้อนุญาต "ติดตั้งแอปที่ไม่รู้จัก" ให้กับเบราว์เซอร์ / ตัวจัดการไฟล์ · ถ้าเบราว์เซอร์เตือนเรื่องใบรับรอง ให้กด "ขั้นสูง" แล้ว "ไปต่อ"':
    'When installing, allow "Install unknown apps" for the browser / file manager · If the browser warns about the certificate, tap "Advanced" and then "Proceed"',

  // users
  'อีเมล': 'Email',
  'ชื่อ': 'Name',
  'สิทธิ์': 'Role',
  'เข้าใช้ล่าสุด': 'Last sign-in',
  'ผู้ดูแล': 'Admin',
  'ผู้ใช้': 'User',
  'รออนุมัติ': 'Pending',
  'ใช้งาน': 'Active',
  'ระงับ|status': 'Disabled',
  'อนุมัติ': 'Approve',
  'ระงับ': 'Disable',
  'ถอดผู้ดูแล': 'Remove admin',
  'ตั้งเป็นผู้ดูแล': 'Make admin',
  'กรอกข้อมูลให้ครบและถูกต้อง': 'Please fill in every field correctly',
  'แก้ไขสิทธิ์ตัวเองไม่ได้': "You can't change your own account",
  'เพิ่มผู้ใช้': 'Add user',
  'email ของบัญชี Google': 'Google account email',
  'ผู้ใช้ที่เพิ่มไว้เข้าสู่ระบบด้วยบัญชี Google ของ email นี้ได้ทันที ไม่ต้องรออนุมัติ': 'The person can sign in right away with the Google account of this email, no approval needed',
  'ทั้งหมด <b>{n}</b> คน': many('<b>{n}</b> user', '<b>{n}</b> users'),
  'ยังไม่เคยเข้าสู่ระบบ': 'Not signed in yet',
  'ลบ': 'Delete',
  'ลบผู้ใช้': 'Delete user',
  'ลบผู้ใช้ {email} ?\nผู้ใช้นี้จะเข้าสู่ระบบเว็บและแอปไม่ได้อีก ส่วนประวัติการอัปโหลดและการตรวจยังอยู่ครบ':
    'Delete user {email}?\nThey will no longer be able to sign in to the website or the app. Their upload and check history is kept.',
  'กรุณากรอก email ให้ถูกต้อง': 'Please enter a valid email',
  'มีผู้ใช้ {email} อยู่แล้ว': '{email} is already a user',
  'เพิ่ม {email} แล้ว เข้าสู่ระบบด้วย Google ได้ทันที': 'Added {email}. They can sign in with Google now',
  'ลบ {email} แล้ว': 'Deleted {email}',
  'ลบบัญชีตัวเองไม่ได้': "You can't delete your own account",
  'ไม่พบผู้ใช้นี้': 'User not found',
  'บันทึกแล้ว': 'Saved',

  // data
  'วันที่|from': 'From',
  'ถึง': 'To',
  'ส่งออก Excel': 'Export Excel',
  'เพิ่มรายการ': 'Add a record',
  'ยืนยันการลบรายการที่เลือก?': 'Delete the selected records?',
  'ทั้งหมด <b>{n}</b> รายการ': many('<b>{n}</b> record', '<b>{n}</b> records'),
  'ลบที่เลือก': 'Delete selected',
  'แก้ไขล่าสุด': 'Last modified',
  'ไม่พบข้อมูล': 'No data found',
  'แก้ไขรายการ': 'Edit record',
  'แก้ไข {wb} แล้ว': 'Updated {wb}',
  'เพิ่ม {wb} แล้ว': 'Added {wb}',
  'Waybill No. {wb} มีอยู่แล้ว': 'Waybill No. {wb} already exists',
  'ลบ {n} รายการแล้ว': many('Deleted {n} record', 'Deleted {n} records'),

  // upload
  'ดาวน์โหลด template': 'Download the template',
  'ไฟล์ Excel มีคอลัมน์ <b>Box No.</b>, <b>Waybill No.</b>, <b>Operation Date</b> (dd/mm/yyyy)':
    'Excel file with the columns <b>Box No.</b>, <b>Waybill No.</b>, <b>Operation Date</b> (dd/mm/yyyy)',
  'ดาวน์โหลด template (.xlsx)': 'Download template (.xlsx)',
  'อัปโหลดไฟล์': 'Upload a file',
  'รองรับ .xlsx และ .csv · ถ้า Waybill No. มีอยู่แล้ว ระบบจะอัปเดตทับข้อมูลเดิม · หลังอัปโหลดจะแสดงผลรายละเอียดทีละแถว':
    'Supports .xlsx and .csv · An existing Waybill No. is updated with the new data · The result of every row is shown after the upload',
  'กำลังส่งไฟล์...': 'Sending file...',
  'กำลังตรวจสอบและบันทึกข้อมูล...': 'Checking and saving the data...',
  'ส่งไฟล์ไม่สำเร็จ กรุณาลองใหม่': 'The file could not be sent, please try again',
  'ประวัติการอัปโหลด': 'Upload history',
  'เพิ่มใหม่': 'New',
  'อัปเดต': 'Updated',
  'ไม่เปลี่ยน': 'Unchanged',
  'ไม่เปลี่ยนแปลง': 'Unchanged',
  'ผิดพลาด': 'Error',
  'ล้มเหลว': 'Failed',
  'กำลังประมวลผล': 'Processing',
  'สำเร็จบางส่วน': 'Partly done',
  'สำเร็จ': 'Done',
  'สำเร็จทั้งหมด': 'All done',
  'ดูรายละเอียด': 'Details',
  'ยังไม่มีการอัปโหลด': 'No uploads yet',
  'กรุณาเลือกไฟล์ .xlsx หรือ .csv': 'Please choose an .xlsx or .csv file',
  'ไม่พบข้อมูลในไฟล์ (มีแต่หัวคอลัมน์)': 'The file has no data (only the header row)',
  'ไม่พบรายการอัปโหลดนี้': 'Upload not found',

  // upload detail
  '‹ กลับไปหน้าอัปโหลด': '‹ Back to Upload',
  'ผลการ import #{id}': 'Import result #{id}',
  'ขนาดไฟล์': 'File size',
  'ใช้เวลา': 'Duration',
  '{s} วินาที': '{s} s',
  'แถว|unit': 'rows',
  '{n} แถว': many('{n} row', '{n} rows'),
  'สาเหตุที่ผิดพลาด': 'Error reasons',
  'ดาวน์โหลดผลเป็น Excel': 'Download the result as Excel',
  'แสดง {n} แถว': many('Showing {n} row', 'Showing {n} rows'),
  'แถวที่ผิดพลาดแสดงก่อน': 'rows with errors first',
  'แถว': 'Row',
  'ไม่มีรายการ': 'No rows',
  'ผลการ import': 'Import result',
  'แถวในไฟล์': 'Row in file',
  'Box No. เดิม': 'Previous Box No.',
  'Operation Date เดิม': 'Previous Operation Date',

  // template sheet
  'คำอธิบาย|sheet': 'Instructions',
  'คอลัมน์': 'Column',
  'คำอธิบาย': 'Description',
  'เลขกล่อง (จำเป็น)': 'Box number (required)',
  'เลขพัสดุ (จำเป็น, ห้ามซ้ำ ถ้าซ้ำกับข้อมูลเดิมจะอัปเดตทับ)': 'Parcel number (required, must be unique; an existing one is updated)',
  'วันที่รอบเอกสาร รูปแบบ DD/MM/YYYY (เช่น 23/11/2026) หรือเป็นวันที่ของ Excel': 'Operation date as DD/MM/YYYY (e.g. 23/11/2026) or an Excel date',
  'ลบแถวตัวอย่างก่อนอัปโหลด': 'Delete the sample row before uploading',

  // checker page
  'เสียงแจ้งผล': 'Sound',
  'วันนี้': 'Today',
  'ค้นหาเฉพาะ Operation Date ที่เลือก · ยิงหรือพิมพ์เลข แล้วกด Enter · ใส่ Waybill No. จะได้ Box No. · ใส่ Box No. จะได้รายการ Waybill No. ในกล่อง':
    'Searches only the selected Operation Date · Scan or type a number and press Enter · A Waybill No. gives its Box No. · A Box No. lists the Waybill Nos. in the box',
  'Waybill No. หรือ Box No.': 'Waybill No. or Box No.',
  'ตรวจอัตโนมัติ': 'Auto detect',
  'เป็น Waybill No.': 'Waybill No.',
  'เป็น Box No.': 'Box No.',
  'ลำดับการกรอก:': 'Scan order:',
  'ตรวจ': 'Check',
  'ตรง (วันนี้)': 'Match (today)',
  'ไม่ตรง': 'Mismatch',
  'ไม่พบในระบบ': 'Not found',
  'ประวัติการตรวจวันนี้': "Today's checks",
  'แสดงของทุกคน': 'Show everyone',
  'ผู้ตรวจ': 'Checked by',
  'ประเภท': 'Type',
  'เลขที่กรอก': 'Number',
  'ผล': 'Result',
  'ครั้งที่ #': 'Scan #',
  'เมื่อสักครู่': 'just now',
  '{n} วินาทีที่แล้ว': '{n} s ago',
  '{n} นาทีที่แล้ว': '{n} min ago',
  '● ผลล่าสุด': '● Latest result',
  'ผลก่อนหน้า · ยิงเลขใหม่เพื่อตรวจ': 'Previous result · scan a new number to check',
  'ก่อนหน้า:': 'Previous:',
  'กำลังตรวจ...': 'Checking...',
  'เลขที่ยิง': 'Scanned',
  'ไม่พบ': 'Not found',
  'พบ': 'Found',
  'ตรง': 'Match',
  'Waybill No. (ที่ยิง)': 'Waybill No. (scanned)',
  'Box No. (ที่ยิง)': 'Box No. (scanned)',
  'ในกล่องนี้': 'In this box',
  '{n} รายการ': many('{n} item', '{n} items'),
  '1 รายการ': '1 item',
  'จำนวน Waybill': 'Waybills',
  'Waybill No. ในกล่อง {box}': 'Waybill No. in box {box}',
  'กล่องที่ถูกต้อง': 'Correct box',
  'ตรง ถูกต้อง': 'Match',
  'ไม่ตรง!': 'Mismatch!',
  'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้': 'Cannot reach the server',
  'ลองยิงใหม่อีกครั้ง': 'Please scan again',
  'ยังไม่มีการตรวจวันนี้': 'No checks yet today',
  'ยิง {what}': 'Scan {what}',
  'กรุณากรอกเลข': 'Please enter a number',
  'กรุณากรอกให้ครบทั้ง 2 ช่อง': 'Please fill in both fields',
};

// Messages composed in code or stored in the database: translated piece by piece (applied in order, all matches).
const FRAG = [
  // checker (also kept in check_logs.detail)
  [/ \(Waybill นี้อยู่ในวันที่ ([\d/]+)\)/g, ' (this Waybill is on $1)'],
  [/ \(Box นี้อยู่ในวันที่ ([\d/]+)\)/g, ' (this Box is on $1)'],
  [/ไม่พบทั้ง Waybill No\. และ Box No\./g, 'Neither the Waybill No. nor the Box No. was found'],
  [/ไม่พบ Waybill No\. นี้/g, 'Waybill No. not found'],
  [/ไม่พบ Box No\. นี้/g, 'Box No. not found'],
  [/ไม่พบ Waybill No\. (.+?)( ในวันที่ [\d/]+| ในระบบ)/g, (_m, wb, where) => `Waybill No. ${wb} not found${where === ' ในระบบ' ? '' : where}`],
  [/ และไม่พบ Box No\. (.+?)(?= \(|$)/g, ', Box No. $1 not found either'],
  [/ ในวันที่ ([\d/]+)/g, ' on $1'],
  [/^Waybill (.+) อยู่ในกล่อง (.+) ถูกต้อง$/, 'Correct: Waybill $1 is in box $2'],
  [/^ไม่ตรง: Waybill (.+) อยู่ในกล่อง (.+) ไม่ใช่ (.+)$/, 'Mismatch: Waybill $1 is in box $2, not $3'],
  // import rows / uploads
  [/ข้อมูลตรงกับที่มีอยู่แล้ว/g, 'Same as the existing data'],
  [/ไม่มี (Box No\.|Waybill No\.|Operation Date)/g, 'Missing $1'],
  [/Operation Date "(.*?)" ไม่ถูกต้อง \(ต้องเป็น dd\/mm\/yyyy\)/g, 'Invalid Operation Date "$1" (must be dd/mm/yyyy)'],
  [/(Box No\.|Waybill No\.) ยาวเกิน 64 ตัวอักษร/g, '$1 is longer than 64 characters'],
  [/Waybill No\. ซ้ำกับแถวที่ (\d+) ในไฟล์เดียวกัน/g, 'Waybill No. duplicates row $1 of the same file'],
  [/^อ่านไฟล์ไม่ได้: /, 'Cannot read the file: '],
  [/ไม่พบ sheet ในไฟล์/g, 'No worksheet in the file'],
  [/หัวคอลัมน์ไม่ถูกต้อง ต้องมี: /g, 'Wrong column headers, required: '],
  [/^บันทึกไม่สำเร็จ ไม่มีข้อมูลใดถูกบันทึก: /, 'Saving failed, nothing was saved: '],
];

const LANGS = ['th', 'en'];
const has = (k) => Object.prototype.hasOwnProperty.call(EN, k);
const THAI = /[฀-๿]/;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function frag(s) {
  if (!THAI.test(s)) return s;
  for (const [re, rep] of FRAG) { re.lastIndex = 0; s = s.replace(re, rep); }
  return s;
}

function make(lang) {
  const en = lang === 'en';
  const text = (s, vars) => {
    s = String(s);
    if (!has(s)) return en ? frag(s) : s;
    if (!en) return s.split('|')[0];
    return typeof EN[s] === 'function' ? EN[s](vars || {}) : EN[s];
  };
  const fill = (s, vars, enc) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? enc(vars[k]) : m)) : s);
  /** plain text (escape it with <%= %>) */
  const t = (s, vars) => (s == null ? '' : fill(text(s, vars), vars, String));
  /** HTML: the dictionary text may hold markup, the values are escaped (print it with <%- %>) */
  t.h = (s, vars) => fill(text(s, vars), vars, esc);
  /** a JavaScript string literal for inline scripts */
  t.js = (s, vars) => JSON.stringify(t(s, vars)).replace(/</g, '\\u003c');
  t.lang = en ? 'en' : 'th';
  return t;
}
const T = { th: make('th'), en: make('en') };

/** Language from the "lang" cookie (Thai when missing). Sets req.t, res.locals.t and res.locals.lang. */
function middleware(req, res, next) {
  const m = /(?:^|;\s*)lang=(th|en)\b/.exec(req.headers.cookie || '');
  const t = T[m ? m[1] : 'th'];
  req.t = t; res.locals.t = t; res.locals.lang = t.lang;
  next();
}

/** GET /lang/th|en: remember the choice for a year and go back to the page it was clicked on. */
function route(app) {
  app.get('/lang/:code(th|en)', (req, res) => {
    res.setHeader('Set-Cookie', `lang=${req.params.code}; Path=/; Max-Age=31536000; SameSite=Lax`);
    let to = '/';
    try {
      const ref = new URL(req.get('Referrer') || '');
      if (ref.host === req.get('host') && !ref.pathname.startsWith('/lang/')) to = ref.pathname + ref.search;
    } catch (e) { /* no or bad referrer */ }
    res.redirect(to);
  });
}

// Flags used as the language switch (3:2, cropped to the same size)
const FLAG = {
  th: '<svg viewBox="0 0 9 6" aria-hidden="true"><rect width="9" height="6" fill="#A51931"/><rect y="1" width="9" height="4" fill="#F4F5F8"/><rect y="2" width="9" height="2" fill="#2D2A4A"/></svg>',
  en: '<svg viewBox="0 0 60 30" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><clipPath id="ukT"><path d="M30,15h30v15zv15h-30zh-30v-15zv-15h30z"/></clipPath>'
    + '<rect width="60" height="30" fill="#012169"/><path d="M0,0 60,30M60,0 0,30" stroke="#fff" stroke-width="6"/>'
    + '<path d="M0,0 60,30M60,0 0,30" clip-path="url(#ukT)" stroke="#C8102E" stroke-width="4"/>'
    + '<path d="M30,0v30M0,15h60" stroke="#fff" stroke-width="10"/><path d="M30,0v30M0,15h60" stroke="#C8102E" stroke-width="6"/></svg>',
};

module.exports = { EN, FRAG, LANGS, make, T, middleware, route, FLAG };
