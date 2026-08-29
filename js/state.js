// ── State management ─────────────────────────────────────────
// Shared mutable state. The inventory itself is stored as YAML text
// (the user's document is the source of truth, comments included);
// `state.credentials` is the parsed, normalized view of it.

import { parseInventory, serializeInventory } from './yaml-io.js';

const STORAGE_KEY = 'echeance-yaml';
const NOTIFIED_KEY = 'echeance-notified';
const PREFS_KEY = 'echeance-prefs';

export const state = {
  yamlText: '',        // the raw document as last applied
  credentials: [],     // normalized entries derived from yamlText
  tutorials: [],       // loaded from data/tutorials.yaml
  source: 'none',      // 'browser' | 'local file' | 'sample'
  view: 'board',
  tutorialOpen: null,  // tutorial id when the URL is #tutorial/<id>
  calCursor: null,     // {year, month} for the calendar view
  tableSort: { key: 'days', dir: 1 },
  tableFilter: '',
  boardGroupBy: 'urgency', // 'urgency' | 'service' | 'kind' (persisted)
  tutFilter: '',       // tutorials free-text filter
  tutService: null,    // tutorials service chip filter
};

/** Load persisted view preferences (board grouping). */
export function loadPrefs(s) {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    if (['urgency', 'service', 'kind'].includes(p.boardGroupBy)) s.boardGroupBy = p.boardGroupBy;
  } catch { /* corrupted or unavailable */ }
}

export function savePrefs(s) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ boardGroupBy: s.boardGroupBy }));
  } catch { /* unavailable */ }
}

/** Apply a YAML document to state. Throws on parse/validation errors. */
export function applyYaml(s, text, source) {
  const creds = parseInventory(text);
  s.yamlText = text;
  s.credentials = creds;
  if (source) s.source = source;
}

/** Persist the current YAML document to localStorage. */
export function save(s) {
  try {
    localStorage.setItem(STORAGE_KEY, s.yamlText);
    s.source = 'browser';
  } catch { /* quota exceeded or private browsing */ }
}

export function clearSaved(s) {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* unavailable */ }
}

async function fetchText(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.text();
}

/**
 * Load the inventory, first hit wins:
 * 1. localStorage (the user applied or imported something here before)
 * 2. inventory.local.yaml (gitignored; present on the owner's machine only)
 * 3. data/sample.yaml (dummy entries so the public site demonstrates itself)
 */
export async function loadInventory(s) {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) { applyYaml(s, saved, 'browser'); return; }
  } catch { /* unavailable */ }
  try {
    applyYaml(s, await fetchText('inventory.local.yaml'), 'local file');
    return;
  } catch { /* not present: the normal case in production */ }
  try {
    applyYaml(s, await fetchText('data/sample.yaml'), 'sample');
  } catch {
    s.yamlText = 'credentials: []\n';
    s.credentials = [];
    s.source = 'none';
  }
}

/** Fetch a bundled document (sample or local file) on demand. */
export function fetchBundled(name) {
  return fetchText(name);
}

/** Load renewal tutorials; the site works without them. */
export async function loadTutorials(s) {
  try {
    const text = await fetchText('data/tutorials.yaml');
    const doc = window.jsyaml.load(text);
    s.tutorials = Array.isArray(doc?.tutorials) ? doc.tutorials : [];
  } catch {
    s.tutorials = [];
  }
}

/** Regenerate state.yamlText from state.credentials (after in-app edits). */
export function syncYamlFromCredentials(s) {
  s.yamlText = serializeInventory(s.credentials);
}

/** Remember that a reminder bucket fired, so reloads do not re-notify. */
export function markNotified(key) {
  try {
    const seen = JSON.parse(localStorage.getItem(NOTIFIED_KEY) || '{}');
    seen[key] = Date.now();
    // keep the map small: drop marks older than 60 days
    const cutoff = Date.now() - 60 * 86400000;
    for (const k of Object.keys(seen)) if (seen[k] < cutoff) delete seen[k];
    localStorage.setItem(NOTIFIED_KEY, JSON.stringify(seen));
  } catch { /* unavailable */ }
}

export function wasNotified(key) {
  try {
    return key in JSON.parse(localStorage.getItem(NOTIFIED_KEY) || '{}');
  } catch { return false; }
}
