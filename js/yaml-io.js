// ── YAML in, YAML out ────────────────────────────────────────
// Parse, validate and serialize the inventory document.
// Uses js-yaml (window.jsyaml, loaded from cdnjs in index.html).
//
// CORE_SCHEMA keeps unquoted dates as plain strings; the default
// schema would turn `2026-05-28` into a JS Date and break round-trips.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const KINDS = ['api-key', 'oauth-session', 'ssh-key', 'ip-whitelist', 'secret', 'cert', 'other'];
const STATUSES = ['active', 'expired', 'revoked', 'retired'];

// Canonical key order for serialization, so exports stay diff-friendly.
const KEY_ORDER = [
  'id', 'name', 'service', 'kind', 'account', 'domain', 'created', 'expires',
  'lifetime_days', 'scope', 'permissions', 'objective', 'status',
  'renewal_url', 'tutorial', 'remind_days', 'notes',
];

/**
 * Parse an inventory YAML document into normalized credential entries.
 * Throws an Error whose `.details` array lists every problem found.
 */
export function parseInventory(text) {
  let doc;
  try {
    doc = window.jsyaml.load(text, { schema: window.jsyaml.CORE_SCHEMA });
  } catch (e) {
    const err = new Error('YAML does not parse');
    err.details = [e.message.split('\n')[0]];
    throw err;
  }

  const problems = [];
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    problems.push('top level must be a mapping with a `credentials` list');
  } else if (!Array.isArray(doc.credentials)) {
    problems.push('`credentials` must be a list (it can be empty)');
  }
  if (problems.length) {
    const err = new Error('Invalid inventory');
    err.details = problems;
    throw err;
  }

  const seen = new Set();
  const creds = doc.credentials.map((raw, i) => {
    const at = `credentials[${i}]`;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      problems.push(`${at}: each entry must be a mapping`);
      return null;
    }
    const c = { ...raw };
    c.id = str(c.id);
    c.name = str(c.name);
    if (!c.id) problems.push(`${at}: missing \`id\``);
    else if (seen.has(c.id)) problems.push(`${at}: duplicate id "${c.id}"`);
    else seen.add(c.id);
    if (!c.name) problems.push(`${at}: missing \`name\``);

    for (const f of ['service', 'kind', 'account', 'domain', 'scope', 'objective', 'renewal_url', 'tutorial', 'notes']) {
      if (c[f] !== undefined) c[f] = str(c[f]);
    }
    if (c.kind && !KINDS.includes(c.kind)) {
      problems.push(`${at}: kind "${c.kind}" is not one of ${KINDS.join(', ')}`);
    }
    for (const f of ['created', 'expires']) {
      if (c[f] === undefined || c[f] === null) { delete c[f]; continue; }
      c[f] = str(c[f]);
      if (f === 'expires' && c[f] === 'never') continue;
      if (!isRealDate(c[f])) problems.push(`${at}: ${f} must be a real YYYY-MM-DD date${f === 'expires' ? ' or "never"' : ''}`);
    }
    if (c.lifetime_days !== undefined) {
      c.lifetime_days = Number(c.lifetime_days);
      if (!Number.isInteger(c.lifetime_days) || c.lifetime_days <= 0) {
        problems.push(`${at}: lifetime_days must be a positive integer`);
      }
    }
    c.permissions = strList(c.permissions);
    c.remind_days = (Array.isArray(c.remind_days) ? c.remind_days : [])
      .map(Number).filter((n) => Number.isInteger(n) && n > 0);
    if (c.status !== undefined) {
      c.status = str(c.status);
      if (!STATUSES.includes(c.status)) {
        problems.push(`${at}: status "${c.status}" is not one of ${STATUSES.join(', ')}`);
      }
    }
    return c;
  });

  if (problems.length) {
    const err = new Error('Invalid inventory');
    err.details = problems;
    throw err;
  }
  return creds;
}

/** Serialize credentials back to a YAML document with stable key order. */
export function serializeInventory(credentials) {
  const ordered = credentials.map((c) => {
    const out = {};
    for (const k of KEY_ORDER) {
      if (c[k] === undefined || c[k] === null) continue;
      if (Array.isArray(c[k]) && c[k].length === 0) continue;
      out[k] = c[k];
    }
    for (const k of Object.keys(c)) if (!(k in out) && c[k] !== undefined) out[k] = c[k];
    return out;
  });
  return window.jsyaml.dump(
    { version: 1, credentials: ordered },
    { schema: window.jsyaml.CORE_SCHEMA, lineWidth: 100, noRefs: true },
  );
}

/** True for a YYYY-MM-DD string naming a date that exists (no rollover). */
function isRealDate(v) {
  if (!DATE_RE.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

function str(v) {
  return v === undefined || v === null ? '' : String(v).trim();
}

function strList(v) {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x).trim()).filter(Boolean);
}
