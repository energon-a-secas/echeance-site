// ── Shared utilities ─────────────────────────────────────────
// Small, pure helper functions used across multiple modules.

/** Cached element lookup by ID. */
const _els = {};
export function $(id) {
  return _els[id] || (_els[id] = document.getElementById(id));
}

/** Escape HTML special characters. */
export function escHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Show a temporary toast notification. */
let _toastTimer = null;
export function showToast(msg) {
  let el = document.getElementById('app-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'app-toast';
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('visible');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('visible'), 2000);
}

/** Simple debounce. */
export function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/** Trigger a client-side file download. */
export function downloadFile(name, text, mime) {
  const blob = new Blob([text], { type: mime || 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Dates ────────────────────────────────────────────────────
// All inventory dates are date-only strings (YYYY-MM-DD), compared as
// local dates so a credential expiring "today" reads as 0 days left.

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Parse YYYY-MM-DD into a local-midnight Date, or null. */
export function parseDate(str) {
  if (typeof str !== 'string') return null;
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Whole days from today until the given YYYY-MM-DD (negative = past). */
export function daysUntil(str) {
  const target = parseDate(str);
  if (!target) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / 86400000);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-08-26" -> "Aug 26, 2026" (falls back to the raw value). */
export function fmtDate(str) {
  const d = parseDate(str);
  if (!d) return str || '';
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

// ── Severity ─────────────────────────────────────────────────

export const SEVERITY_ORDER = ['expired', 'critical', 'warning', 'ok', 'unknown', 'never', 'retired'];

export const SEVERITY_LABEL = {
  expired: 'Expired',
  critical: 'Next 7 days',
  warning: 'Next 30 days',
  ok: 'Later',
  unknown: 'Unknown expiry',
  never: 'No expiry',
  retired: 'Retired',
};

/** Classify one normalized credential entry. */
export function severity(cred) {
  if (cred.status === 'revoked' || cred.status === 'retired') return 'retired';
  if (cred.status === 'expired' && daysUntil(cred.expires) === null) return 'expired';
  if (cred.expires === 'never') return 'never';
  const days = daysUntil(cred.expires);
  if (days === null) return 'unknown';
  if (days < 0) return 'expired';
  if (days <= 7) return 'critical';
  if (days <= 30) return 'warning';
  return 'ok';
}

/** Human badge text for a credential's time left. */
export function daysLabel(cred) {
  const days = daysUntil(cred.expires);
  if (days === null && cred.status === 'expired') return 'expired';
  if (cred.expires === 'never') return 'no expiry';
  if (days === null) return 'unknown';
  if (days < -1) return `${-days} days ago`;
  if (days === -1) return 'yesterday';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `${days} days`;
}
