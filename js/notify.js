// ── Browser notifications ────────────────────────────────────
// Best effort: fires only while the site is open, so the board and
// the ICS export stay the primary reminder channels. Each credential
// notifies once per threshold per expiry date (renewing re-arms it).

import { daysUntil } from './utils.js';
import { markNotified, wasNotified } from './state.js';

const DEFAULT_REMIND = [14, 3];

export function notifySupported() {
  return 'Notification' in window;
}

export function notifyEnabled() {
  return notifySupported() && Notification.permission === 'granted';
}

export async function requestNotifyPermission() {
  if (!notifySupported()) return 'unsupported';
  return Notification.requestPermission();
}

/** Check every credential and fire one summary notification for news. */
export function checkReminders(s) {
  if (!notifyEnabled()) return;
  const due = [];

  for (const c of s.credentials) {
    if (c.status === 'revoked' || c.status === 'retired') continue;
    const days = daysUntil(c.expires);
    if (days === null) continue;

    let bucket = null;
    if (days < 0) bucket = 'expired';
    else {
      const remind = c.remind_days?.length ? c.remind_days : DEFAULT_REMIND;
      const crossed = remind.filter((t) => days <= t);
      if (crossed.length) bucket = `d${Math.min(...crossed)}`;
    }
    if (!bucket) continue;

    const key = `${c.id}|${c.expires}|${bucket}`;
    if (wasNotified(key)) continue;
    due.push({ c, days, key });
  }

  if (!due.length) return;
  const lines = due.slice(0, 5).map(({ c, days }) => (days < 0
    ? `${c.name}: expired ${-days} day${days === -1 ? '' : 's'} ago`
    : `${c.name}: ${days} day${days === 1 ? '' : 's'} left`));
  if (due.length > 5) lines.push(`and ${due.length - 5} more`);

  try {
    const n = new Notification('Echeance: credentials need attention', {
      body: lines.join('\n'),
      tag: 'echeance-reminders',
    });
    n.onclick = () => window.focus();
    due.forEach(({ key }) => markNotified(key));
  } catch { /* notification constructor can throw on some platforms */ }
}
