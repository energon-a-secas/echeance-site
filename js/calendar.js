// ── Calendar view ────────────────────────────────────────────
// A month grid with one chip per credential expiring that day.

import { $, escHtml, parseDate, severity } from './utils.js';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function renderCalendar(s) {
  if (!s.calCursor) {
    const now = new Date();
    s.calCursor = { year: now.getFullYear(), month: now.getMonth() };
  }
  const { year, month } = s.calCursor;
  $('calMonth').textContent = `${MONTH_NAMES[month]} ${year}`;

  // credentials by day-of-month for the visible month
  const byDay = new Map();
  for (const c of s.credentials) {
    const d = parseDate(c.expires);
    if (!d || d.getFullYear() !== year || d.getMonth() !== month) continue;
    const day = d.getDate();
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(c);
  }

  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7; // Monday-first offset
  const now = new Date();
  const isThisMonth = now.getFullYear() === year && now.getMonth() === month;

  let cells = DOW.map((d) => `<div class="cal-dow">${d}</div>`).join('');
  for (let i = 0; i < lead; i += 1) cells += '<div class="cal-cell cal-cell--pad"></div>';
  for (let day = 1; day <= daysInMonth; day += 1) {
    const creds = byDay.get(day) || [];
    const chips = creds.map((c) => `
      <button class="cal-chip sev-${severity(c)}" data-cred="${escHtml(c.id)}"
        title="${escHtml(c.name)}">${escHtml(c.name)}</button>`).join('');
    const today = isThisMonth && day === now.getDate() ? ' cal-cell--today' : '';
    cells += `<div class="cal-cell${today}"><span class="cal-day">${day}</span>${chips}</div>`;
  }
  $('calGrid').innerHTML = cells;
}

export function moveCalendar(s, delta) {
  if (!s.calCursor) return;
  if (delta === 0) {
    const now = new Date();
    s.calCursor = { year: now.getFullYear(), month: now.getMonth() };
    return;
  }
  let m = s.calCursor.month + delta;
  let y = s.calCursor.year;
  if (m < 0) { m = 11; y -= 1; }
  if (m > 11) { m = 0; y += 1; }
  s.calCursor = { year: y, month: m };
}
