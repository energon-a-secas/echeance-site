// ── ICS export ───────────────────────────────────────────────
// One all-day VEVENT per dated credential, with VALARMs at each
// remind_days lead time. Import the file into any calendar app to
// get reminders that fire without this site being open.

import { parseDate } from './utils.js';

const DEFAULT_REMIND = [14, 3];

/** Build a VCALENDAR document for every credential with a real expiry date. */
export function buildIcs(credentials) {
  const now = new Date();
  const dtstamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const events = [];

  for (const c of credentials) {
    const d = parseDate(c.expires);
    if (!d || c.status === 'revoked' || c.status === 'retired') continue;
    const start = basicDate(d);
    const end = basicDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1));
    const remind = c.remind_days?.length ? c.remind_days : DEFAULT_REMIND;
    const descParts = [
      c.scope && `Scope: ${c.scope}`,
      c.renewal_url && `Renew: ${c.renewal_url}`,
      c.tutorial && `Tutorial: https://echeance.neorgon.com/#tutorial/${c.tutorial}`,
      c.notes,
    ].filter(Boolean);

    const lines = [
      'BEGIN:VEVENT',
      `UID:${escText(c.id)}@echeance.neorgon.com`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${end}`,
      `SUMMARY:${escText(`Renew ${c.name}`)}`,
    ];
    if (descParts.length) lines.push(`DESCRIPTION:${escText(descParts.join('\n'))}`);
    if (c.renewal_url) lines.push(`URL:${escText(c.renewal_url)}`);
    for (const days of remind) {
      lines.push(
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:${escText(`${c.name} expires in ${days} days`)}`,
        `TRIGGER:-P${days}D`,
        'END:VALARM',
      );
    }
    lines.push('END:VEVENT');
    events.push(lines);
  }

  const doc = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Neorgon//Echeance//EN',
    'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:Credential expiries',
    ...events.flat(),
    'END:VCALENDAR',
  ];
  return doc.map(fold).join('\r\n') + '\r\n';
}

export function countIcsEvents(credentials) {
  return credentials.filter((c) => parseDate(c.expires)
    && c.status !== 'revoked' && c.status !== 'retired').length;
}

function basicDate(d) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

/** RFC 5545 text escaping. */
function escText(v) {
  return String(v)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Fold content lines longer than 74 chars (continuation = CRLF + space). */
function fold(line) {
  if (line.length <= 74) return line;
  const parts = [];
  let rest = line;
  while (rest.length > 74) {
    parts.push(rest.slice(0, 74));
    rest = ' ' + rest.slice(74);
  }
  parts.push(rest);
  return parts.join('\r\n');
}
