// Cleans barcode numbers coming from scanners (Checker, data page) and from uploaded files.
//
// Depending on the symbology and the scanner settings, a scan can carry characters that are not part of the number:
//   Code 39 start/stop            *3867497060*        -> 3867497060
//   Codabar start/stop A B C D    D3867497060D        -> 3867497060   (also a-d and the T N E variant)
//   "^" prefix / suffix           ^3867497060^        -> 3867497060
//   AIM symbology identifier      ]C03867497060       -> 3867497060   (]C0 Code 128, ]A0 Code 39, ]F0 Codabar, ]E0 EAN, ]Q1 QR ...)
//   control characters            STX/ETX, GS (GS1 FNC1), CR/LF/TAB, zero-width spaces
// They can come together (^]F0D3867497060D^), and a scanner typing through a Thai (Kedmanee) keyboard layout
// sends Thai letters instead of the English keys (ฏ-คุึภตึจุจฏ = D3867497060D).
//
// The Codabar letters are the only ambiguous case (a real code could look like A123B), so lookups try the code as
// scanned first and then without the letters (see forms()). Everything else is always removed.

// Thai Kedmanee key -> English key
const TH = {
  'ๅ': '1', '/': '2', '-': '3', 'ภ': '4', 'ถ': '5', 'ุ': '6', 'ึ': '7', 'ค': '8', 'ต': '9', 'จ': '0',
  '+': '!', '๑': '@', '๒': '#', '๓': '$', '๔': '%', 'ู': '^', '฿': '&', '๕': '*', '๖': '(', '๗': ')', '๘': '_', '๙': '+',
  'ๆ': 'q', 'ไ': 'w', 'ำ': 'e', 'พ': 'r', 'ะ': 't', 'ั': 'y', 'ี': 'u', 'ร': 'i', 'น': 'o', 'ย': 'p', 'บ': '[', 'ล': ']', 'ฃ': '\\',
  'ฟ': 'a', 'ห': 's', 'ก': 'd', 'ด': 'f', 'เ': 'g', '้': 'h', '่': 'j', 'า': 'k', 'ส': 'l', 'ว': ';', 'ง': "'",
  'ผ': 'z', 'ป': 'x', 'แ': 'c', 'อ': 'v', 'ิ': 'b', 'ื': 'n', 'ท': 'm', 'ม': ',', 'ใ': '.', 'ฝ': '/',
  '๐': 'Q', '"': 'W', 'ฎ': 'E', 'ฑ': 'R', 'ธ': 'T', 'ํ': 'Y', '๊': 'U', 'ณ': 'I', 'ฯ': 'O', 'ญ': 'P', 'ฐ': '{', 'ฅ': '|',
  'ฤ': 'A', 'ฆ': 'S', 'ฏ': 'D', 'โ': 'F', 'ฌ': 'G', '็': 'H', '๋': 'J', 'ษ': 'K', 'ศ': 'L', 'ซ': ':',
  '(': 'Z', ')': 'X', 'ฉ': 'C', 'ฮ': 'V', 'ฺ': 'B', '์': 'N', '?': 'M', 'ฒ': '<', 'ฬ': '>', 'ฦ': '?',
};
const fixLayout = (s) => (/[\u0E00-\u0E7F]/.test(s) ? [...s].map((c) => TH[c] ?? c).join('') : s);

const CONTROL = /[\u0000-\u001F\u007F\u200B-\u200D\u2060\uFEFF]/g;
const AIM = /^\][A-Za-z][0-9A-Za-z]/;

/** Removes the characters that are never part of a number (everything except the Codabar letters). */
function strip(v) {
  let s = String(v ?? '').replace(CONTROL, '').trim();
  for (let prev = null; s !== prev;) {
    prev = s;
    s = s.replace(AIM, '').replace(/\*/g, '').replace(/^\^+|\^+$/g, '').trim();
  }
  return s;
}

/** A scan: Thai keyboard layout fixed, extra characters removed, at most 64 characters. */
const clean = (v) => strip(fixLayout(String(v ?? '').trim())).slice(0, 64);

/** The number inside Codabar start/stop letters, or null. */
const codabar = (s) => { const m = /^[A-DTNE](\d+)[A-DTNE]$/i.exec(String(s ?? '')); return m ? m[1] : null; };

/** What to look up for one scan: as scanned first, then without Codabar letters. The last one is the best to show. */
const forms = (v) => { const s = clean(v); const c = codabar(s); return c ? [s, c] : [s]; };
const best = (fs) => fs[fs.length - 1];

/** A waybill number to store or search (data page, uploads): extra characters and Codabar letters removed. */
const waybill = (v, { layout = true } = {}) => { const s = layout ? clean(v) : strip(v); return codabar(s) || s; };

module.exports = { TH, fixLayout, strip, clean, codabar, forms, best, waybill };
