// One import at a time: an upload from the web page and an import from the Google Sheet connector (sheet.js) never write
// packings together. Whoever comes second waits in line (first come, first served) and then runs.
// The app runs as one Node process (packing.service), so an in-memory queue is enough.
let tail = Promise.resolve();
let holder = null; // { who: 'web' | 'sheet', email, since }
let waiting = 0;

/** Runs fn() when the lock is free. who / email say who holds it while it runs (shown on the waiting screen). */
async function withLock(who, email, fn) {
  const prev = tail;
  let release;
  tail = new Promise((r) => { release = r; });
  waiting++;
  try { await prev; } finally { waiting--; }
  holder = { who, email: email || null, since: Date.now() };
  try { return await fn(); } finally { holder = null; release(); }
}

/** Who runs an import now (null = free), and how many wait for it. */
const state = () => ({ busy: holder ? { ...holder, seconds: Math.round((Date.now() - holder.since) / 1000) } : null, waiting });

module.exports = { withLock, state };
