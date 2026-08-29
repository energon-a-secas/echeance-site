// ── Event handlers ───────────────────────────────────────────
// All listeners and user interactions. The URL hash is the single
// source of truth for navigation: clicks only set location.hash,
// and the hashchange handler renders.

import {
  state, applyYaml, save, clearSaved, fetchBundled,
  loadInventory, syncYamlFromCredentials, savePrefs,
} from './state.js';
import { remoteIconsEnabled, setRemoteIcons } from './brand.js';
import { render, renderCredModal, renderYamlError } from './render.js';
import { moveCalendar } from './calendar.js';
import { buildIcs, countIcsEvents } from './ics.js';
import {
  requestNotifyPermission, notifySupported, notifyEnabled, checkReminders,
} from './notify.js';
import { $, showToast, debounce, downloadFile, todayISO } from './utils.js';

const VIEWS = ['board', 'table', 'calendar', 'tutorials', 'yaml'];

// ── Navigation ───────────────────────────────────────────────

/** Read location.hash into state and render. */
export function applyHash() {
  const hash = location.hash.replace(/^#/, '');
  const tut = hash.match(/^tutorial\/(.+)$/);
  if (tut) {
    state.view = 'tutorials';
    state.tutorialOpen = decodeURIComponent(tut[1]);
  } else {
    state.view = VIEWS.includes(hash) ? hash : 'board';
    state.tutorialOpen = null;
  }
  render(state);
}

// ── Modal machinery ──────────────────────────────────────────

/** @param {HTMLElement} root */
function getFocusable(root) {
  const sel = [
    'a[href]', 'button:not([disabled])', 'input:not([disabled])',
    'select:not([disabled])', 'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');
  return Array.from(root.querySelectorAll(sel)).filter((el) => {
    if (el.hasAttribute('disabled') || el.getAttribute('aria-hidden') === 'true') return false;
    return el.getClientRects().length > 0;
  });
}

let _modalLastFocus = null;

export function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  _modalLastFocus = /** @type {HTMLElement} */ (document.activeElement);
  modal.removeAttribute('hidden');
  document.body.classList.add('modal-open');
  const dialog = modal.querySelector('.modal__dialog');
  const list = dialog ? getFocusable(dialog) : [];
  const closeBtn = modal.querySelector('.modal__header [data-modal-close]');
  const toFocus = closeBtn && list.includes(closeBtn) ? closeBtn : list[0];
  if (toFocus) toFocus.focus();
}

export function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.setAttribute('hidden', '');
  document.body.classList.remove('modal-open');
  if (_modalLastFocus && typeof _modalLastFocus.focus === 'function') {
    _modalLastFocus.focus();
  }
  _modalLastFocus = null;
}

function getOpenModal() {
  return document.querySelector('.modal:not([hidden])');
}

function onDocumentKeydown(e) {
  const modal = getOpenModal();
  if (modal && modal.id) {
    if (e.key === 'Escape') { e.preventDefault(); closeModal(modal.id); return; }
    if (e.key !== 'Tab') return;
    const dialog = modal.querySelector('.modal__dialog');
    const list = dialog ? getFocusable(dialog) : [];
    if (list.length === 0) return;
    const first = list[0];
    const last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
}

// ── Actions ──────────────────────────────────────────────────

function openCred(id) {
  if (renderCredModal(state, id)) openModal('credModal');
}

function markRenewed(id) {
  const c = state.credentials.find((x) => x.id === id);
  if (!c) return;
  c.created = todayISO();
  if (c.lifetime_days) {
    const d = new Date();
    d.setDate(d.getDate() + c.lifetime_days);
    c.expires = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  if (c.status === 'expired') delete c.status;
  syncYamlFromCredentials(state);
  save(state);
  closeModal('credModal');
  render(state);
  showToast(c.lifetime_days
    ? `Renewed: expires ${c.expires}. YAML rewritten.`
    : 'Renewed: created set to today. YAML rewritten.');
}

function onDocClick(e) {
  if (!(e.target instanceof Element)) return;
  const t = e.target;

  const rail = t.closest('.rail__link');
  if (rail) { location.hash = `#${rail.dataset.view}`; return; }

  const seg = t.closest('[data-groupby]');
  if (seg) {
    state.boardGroupBy = seg.dataset.groupby;
    savePrefs(state);
    render(state);
    return;
  }

  const chip = t.closest('[data-tutservice]');
  if (chip) {
    const svc = chip.dataset.tutservice;
    state.tutService = state.tutService === svc ? null : svc;
    render(state);
    return;
  }

  const sort = t.closest('[data-sort]');
  if (sort) {
    const key = sort.dataset.sort;
    if (state.tableSort.key === key) state.tableSort.dir *= -1;
    else state.tableSort = { key, dir: 1 };
    render(state);
    return;
  }

  const tut = t.closest('[data-tutorial]');
  if (tut) {
    if (getOpenModal()) closeModal(getOpenModal().id);
    location.hash = `#tutorial/${encodeURIComponent(tut.dataset.tutorial)}`;
    return;
  }
  const openTut = t.closest('[data-open-tutorial]');
  if (openTut) {
    location.hash = `#tutorial/${encodeURIComponent(openTut.dataset.openTutorial)}`;
    return;
  }
  if (t.closest('#tutBackBtn')) { location.hash = '#tutorials'; return; }

  const renewed = t.closest('[data-renewed]');
  if (renewed) { markRenewed(renewed.dataset.renewed); return; }

  if (t.closest('a[href]')) return; // plain links behave as links

  const cred = t.closest('[data-cred]');
  if (cred && !t.closest('[data-stop]')) openCred(cred.dataset.cred);
}

// ── YAML view ────────────────────────────────────────────────

function yamlApply() {
  try {
    applyYaml(state, $('yamlEditor').value);
    save(state);
    renderYamlError(null);
    render(state);
    checkReminders(state);
    showToast(`Applied: ${state.credentials.length} credentials`);
  } catch (err) {
    renderYamlError(err.details || [err.message]);
  }
}

async function loadDocument(name, source, { forgetSaved } = {}) {
  try {
    const text = await fetchBundled(name);
    applyYaml(state, text, source);
    if (forgetSaved) clearSaved(state);
    $('yamlEditor').value = text;
    renderYamlError(null);
    render(state);
    showToast(`Loaded ${name}`);
  } catch (err) {
    if (err.details) renderYamlError(err.details);
    else showToast(`${name} is not available here`);
  }
}

// ── Notifications ────────────────────────────────────────────

export function updateNotifyBtn() {
  const btn = $('notifyBtn');
  if (!notifySupported()) { btn.textContent = 'No notification support'; btn.disabled = true; return; }
  if (notifyEnabled()) { btn.textContent = 'Reminders on'; btn.disabled = true; return; }
  if (Notification.permission === 'denied') {
    btn.textContent = 'Notifications blocked'; btn.disabled = true; return;
  }
  btn.textContent = 'Enable reminders';
  btn.disabled = false;
}

async function onNotifyClick() {
  const result = await requestNotifyPermission();
  updateNotifyBtn();
  if (result === 'granted') {
    showToast('Reminders on while the site is open. Export .ics for the rest.');
    checkReminders(state);
  }
}

// ── Bind ─────────────────────────────────────────────────────

export function bindEvents(s) {
  document.addEventListener('keydown', onDocumentKeydown);
  document.addEventListener('click', (e) => {
    const el = /** @type {HTMLElement} */ (e.target);
    if (el.closest && el.closest('[data-modal-close]')) {
      const modal = el.closest('.modal');
      if (modal && !modal.hasAttribute('hidden')) { closeModal(modal.id); return; }
    }
    onDocClick(e);
  });
  window.addEventListener('hashchange', applyHash);

  $('exportIcsBtn').addEventListener('click', () => {
    if (!countIcsEvents(s.credentials)) { showToast('No dated credentials to export'); return; }
    downloadFile('echeance.ics', buildIcs(s.credentials), 'text/calendar');
  });
  $('exportYamlBtn').addEventListener('click', () => {
    downloadFile('echeance-inventory.yaml', s.yamlText, 'text/yaml');
  });

  $('notifyBtn').addEventListener('click', onNotifyClick);

  $('calPrev').addEventListener('click', () => { moveCalendar(s, -1); render(s); });
  $('calToday').addEventListener('click', () => { moveCalendar(s, 0); render(s); });
  $('calNext').addEventListener('click', () => { moveCalendar(s, 1); render(s); });

  $('tableSearch').addEventListener('input', debounce(() => {
    s.tableFilter = $('tableSearch').value.trim();
    render(s);
  }, 150));

  $('tutSearch').addEventListener('input', debounce(() => {
    s.tutFilter = $('tutSearch').value.trim();
    render(s);
  }, 150));

  $('remoteIconsBtn').addEventListener('click', () => {
    setRemoteIcons(!remoteIconsEnabled());
    render(s);
    showToast(remoteIconsEnabled()
      ? 'Unknown services now fetch favicons from Google'
      : 'Remote icon lookups off');
  });

  $('yamlApplyBtn').addEventListener('click', yamlApply);
  $('yamlImportBtn').addEventListener('click', () => $('yamlFileInput').click());
  $('yamlFileInput').addEventListener('change', async () => {
    const file = $('yamlFileInput').files[0];
    if (!file) return;
    $('yamlEditor').value = await file.text();
    $('yamlFileInput').value = '';
    yamlApply();
  });
  $('yamlDownloadBtn').addEventListener('click', () => {
    downloadFile('echeance-inventory.yaml', s.yamlText, 'text/yaml');
  });
  $('yamlCopyBtn').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(s.yamlText); showToast('Copied'); }
    catch { showToast('Clipboard unavailable'); }
  });
  $('loadLocalBtn').addEventListener('click', () => {
    loadDocument('inventory.local.yaml', 'local file', { forgetSaved: true });
  });
  $('loadSampleBtn').addEventListener('click', () => loadDocument('data/sample.yaml', 'sample'));
  $('clearBtn').addEventListener('click', async () => {
    clearSaved(s);
    await loadInventory(s);
    $('yamlEditor').value = s.yamlText;
    renderYamlError(null);
    render(s);
    showToast('Browser copy cleared');
  });
}
