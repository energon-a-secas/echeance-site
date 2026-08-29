// ── DOM rendering ────────────────────────────────────────────
// Board, table, credential detail, and view switching.
// Calendar and tutorials render in their own modules.

import {
  $, escHtml, fmtDate, daysLabel, severity,
  SEVERITY_ORDER, SEVERITY_LABEL, daysUntil,
} from './utils.js';
import { renderCalendar } from './calendar.js';
import { renderTutorials } from './tutorials.js';
import { brandBadge, remoteIconsEnabled } from './brand.js';

const VIEWS = ['board', 'table', 'calendar', 'tutorials', 'yaml'];

/** Main render function: shows the active view and rebuilds it from state. */
export function render(s) {
  for (const v of VIEWS) {
    const el = $(`view-${v}`);
    if (el) el.hidden = v !== s.view;
  }
  document.querySelectorAll('#rail .rail__link').forEach((btn) => {
    if (btn.dataset.view === s.view) btn.setAttribute('aria-current', 'true');
    else btn.removeAttribute('aria-current');
  });

  if (s.view === 'board') renderBoard(s);
  else if (s.view === 'table') renderTable(s);
  else if (s.view === 'calendar') renderCalendar(s);
  else if (s.view === 'tutorials') renderTutorials(s, s.tutorialOpen);
  else if (s.view === 'yaml') renderYamlView(s);
}

// ── Board ────────────────────────────────────────────────────

function renderBoard(s) {
  $('sourceBadge').textContent = s.source;

  const counts = { expired: 0, soon: 0 };
  for (const c of s.credentials) {
    const sev = severity(c);
    if (sev === 'expired') counts.expired += 1;
    else if (sev === 'critical' || sev === 'warning') counts.soon += 1;
  }
  $('statStrip').innerHTML = `
    <span class="stat ${counts.expired ? 'stat--bad' : ''}"><strong>${counts.expired}</strong> expired</span>
    <span class="stat ${counts.soon ? 'stat--warn' : ''}"><strong>${counts.soon}</strong> due in 30 days</span>
    <span class="stat"><strong>${s.credentials.length}</strong> tracked</span>`;

  document.querySelectorAll('[data-groupby]').forEach((b) => {
    b.classList.toggle('seg--on', b.dataset.groupby === s.boardGroupBy);
  });
  const remoteBtn = $('remoteIconsBtn');
  if (remoteBtn) remoteBtn.textContent = `Remote icons: ${remoteIconsEnabled() ? 'on' : 'off'}`;

  const html = s.boardGroupBy === 'urgency' ? urgencyGroups(s) : valueGroups(s, s.boardGroupBy);
  $('boardGroups').innerHTML = html
    || '<div class="card empty-note">Nothing tracked yet. Open the YAML view to add credentials or load the sample.</div>';
}

const byDaysLeft = (a, b) => (daysUntil(a.expires) ?? 1e9) - (daysUntil(b.expires) ?? 1e9);

function urgencyGroups(s) {
  const groups = new Map(SEVERITY_ORDER.map((k) => [k, []]));
  for (const c of s.credentials) groups.get(severity(c)).push(c);
  for (const list of groups.values()) list.sort(byDaysLeft);

  return SEVERITY_ORDER.filter((k) => groups.get(k).length).map((k) => `
    <div class="board-group board-group--${k}">
      <h3 class="board-group__title">${SEVERITY_LABEL[k]}
        <span class="board-group__count">${groups.get(k).length}</span></h3>
      <div class="board-grid">${groups.get(k).map((c) => credCard(c, k)).join('')}</div>
    </div>`).join('');
}

/** Group by a field's value: 'service' (with brand marks) or 'kind'. */
function valueGroups(s, field) {
  const map = new Map();
  for (const c of s.credentials) {
    const key = (c[field] || '').trim() || (field === 'service' ? 'Unlabelled' : 'other');
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(c);
  }
  return [...map.keys()].sort((a, b) => a.localeCompare(b)).map((k) => {
    const list = map.get(k).sort(byDaysLeft);
    const mark = field === 'service' ? brandBadge(k, list[0], 'sm') : '';
    return `
    <div class="board-group">
      <h3 class="board-group__title board-group__title--label">${mark}${escHtml(k)}
        <span class="board-group__count">${list.length}</span></h3>
      <div class="board-grid">${list.map((c) => credCard(c, severity(c))).join('')}</div>
    </div>`;
  }).join('');
}

function credCard(c, sev) {
  const links = [];
  if (safeUrl(c.renewal_url)) {
    links.push(`<a class="link" href="${escHtml(c.renewal_url)}" target="_blank"
      rel="noopener noreferrer" data-stop>Renewal page</a>`);
  }
  if (c.tutorial) {
    links.push(`<button class="link link--btn" data-tutorial="${escHtml(c.tutorial)}" data-stop>Tutorial</button>`);
  }
  return `
    <article class="card card--flat cred-card" data-cred="${escHtml(c.id)}">
      <div class="cred-card__top">
        <span class="cred-card__id">${brandBadge(c.service, c, 'md')}<button
          class="cred-card__name" data-cred="${escHtml(c.id)}"
          aria-label="Open ${escHtml(c.name)}">${escHtml(c.name)}</button></span>
        <span class="sev-badge sev-${sev}">${escHtml(daysLabel(c))}</span>
      </div>
      <div class="cred-card__meta">${escHtml([c.service, c.kind, c.account].filter(Boolean).join(' · '))}</div>
      ${c.expires && c.expires !== 'never' ? `<div class="cred-card__expiry">expires ${fmtDate(c.expires)}</div>` : ''}
      ${c.scope ? `<div class="cred-card__scope">${escHtml(c.scope)}</div>` : ''}
      ${links.length ? `<div class="cred-card__links">${links.join('')}</div>` : ''}
    </article>`;
}

// ── Table ────────────────────────────────────────────────────

const COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'service', label: 'Service' },
  { key: 'kind', label: 'Kind' },
  { key: 'expires', label: 'Expires' },
  { key: 'days', label: 'Left' },
  { key: 'scope', label: 'Scope' },
  { key: 'status', label: 'Status' },
];

function renderTable(s) {
  const q = s.tableFilter.toLowerCase();
  let rows = s.credentials.filter((c) => !q
    || [c.name, c.service, c.kind, c.account, c.scope, c.objective, c.notes]
      .some((f) => f && f.toLowerCase().includes(q)));

  const { key, dir } = s.tableSort;
  rows = [...rows].sort((a, b) => dir * compare(a, b, key));

  const head = COLUMNS.map((col) => {
    const active = col.key === key;
    const arrow = active ? (dir === 1 ? ' ↑' : ' ↓') : '';
    return `<th scope="col"><button class="th-sort${active ? ' th-sort--on' : ''}"
      data-sort="${col.key}">${col.label}${arrow}</button></th>`;
  }).join('');

  const body = rows.map((c) => {
    const sev = severity(c);
    return `
    <tr data-cred="${escHtml(c.id)}">
      <td class="td-name"><button class="row-open" data-cred="${escHtml(c.id)}"
        aria-label="Open ${escHtml(c.name)}">${escHtml(c.name)}</button></td>
      <td class="td-service">${brandBadge(c.service, c, 'sm')}${escHtml(c.service || '')}</td>
      <td>${escHtml(c.kind || '')}</td>
      <td>${c.expires === 'never' ? 'never' : escHtml(fmtDate(c.expires))}</td>
      <td><span class="sev-badge sev-${sev}">${escHtml(daysLabel(c))}</span></td>
      <td class="td-scope">${escHtml(c.scope || '')}</td>
      <td>${escHtml(effectiveStatus(c))}</td>
    </tr>`;
  }).join('');

  $('tableWrap').innerHTML = rows.length
    ? `<table class="inv-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
    : '<div class="card empty-note">No credentials match.</div>';
}

function compare(a, b, key) {
  if (key === 'days' || key === 'expires') {
    return (daysUntil(a.expires) ?? 1e9) - (daysUntil(b.expires) ?? 1e9);
  }
  if (key === 'status') return effectiveStatus(a).localeCompare(effectiveStatus(b));
  return String(a[key] || '').localeCompare(String(b[key] || ''));
}

function effectiveStatus(c) {
  if (c.status) return c.status;
  const days = daysUntil(c.expires);
  return days !== null && days < 0 ? 'expired' : 'active';
}

// ── Credential detail modal ──────────────────────────────────

const DETAIL_FIELDS = [
  ['service', 'Service'], ['kind', 'Kind'], ['account', 'Account'], ['domain', 'Domain'],
  ['created', 'Created'], ['expires', 'Expires'], ['lifetime_days', 'Lifetime'],
  ['scope', 'Scope'], ['permissions', 'Permissions'], ['objective', 'Objective'],
  ['status', 'Status'], ['remind_days', 'Remind'], ['notes', 'Notes'],
];

/** Fill the credential modal for the given id; returns false when absent. */
export function renderCredModal(s, id) {
  const c = s.credentials.find((x) => x.id === id);
  if (!c) return false;
  const sev = severity(c);

  $('credModalTitle').textContent = c.name;
  const rows = DETAIL_FIELDS.map(([f, label]) => {
    let v = c[f];
    if (v === undefined || v === '' || (Array.isArray(v) && !v.length)) return '';
    if (f === 'created') v = fmtDate(v);
    if (f === 'expires') v = v === 'never' ? 'never' : `${fmtDate(v)} (${daysLabel(c)})`;
    if (f === 'lifetime_days') v = `${v} days`;
    if (f === 'remind_days') v = `${v.join(', ')} days before`;
    if (Array.isArray(v)) v = v.join(', ');
    return `<div class="detail-row"><dt>${label}</dt><dd>${escHtml(String(v))}</dd></div>`;
  }).join('');

  $('credModalBody').innerHTML = `
    <div class="detail-head">${brandBadge(c.service, c, 'lg')}<span
      class="sev-badge sev-${sev}">${escHtml(daysLabel(c))}</span>
      <code class="detail-id">${escHtml(c.id)}</code></div>
    <dl class="detail-list">${rows}</dl>`;

  const actions = [];
  if (c.tutorial) {
    actions.push(`<button class="btn btn--ghost" data-tutorial="${escHtml(c.tutorial)}">Tutorial</button>`);
  }
  if (safeUrl(c.renewal_url)) {
    actions.push(`<a class="btn btn--secondary" href="${escHtml(c.renewal_url)}"
      target="_blank" rel="noopener noreferrer">Renewal page</a>`);
  }
  actions.push(`<button class="btn btn--primary" data-renewed="${escHtml(c.id)}"
    title="Set created to today${c.lifetime_days ? ` and expires to today + ${c.lifetime_days} days` : ''}">Renewed today</button>`);
  $('credModalFooter').innerHTML = actions.join('');
  return true;
}

function renderYamlView(s) {
  const editor = $('yamlEditor');
  if (document.activeElement !== editor) editor.value = s.yamlText;
}

/** Show or clear the YAML error box. */
export function renderYamlError(details) {
  const box = $('yamlError');
  if (!details || !details.length) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  box.innerHTML = `<strong>Not applied:</strong><ul>${details.map((d) => `<li>${escHtml(d)}</li>`).join('')}</ul>`;
}

function safeUrl(u) {
  return typeof u === 'string' && /^https?:\/\//.test(u);
}
