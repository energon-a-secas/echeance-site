// ── Brand icons ──────────────────────────────────────────────
// Service marks for cards, rows, groups and tutorials. Three tiers:
//   1. Vendored SVGs in assets/brands/ (Simple Icons, CC0): no network.
//   2. Letter badge with a hue derived from the service name: no network.
//   3. Opt-in remote favicons (Google s2) for services with no local mark.
// Tier 3 is DEFAULT OFF because it discloses every service name in the
// visitor's inventory to a third party, and the footer promises otherwise.

import { escHtml } from './utils.js';

const REMOTE_KEY = 'echeance-remote-icons';

// Normalized service string -> vendored slug in assets/brands/<slug>.svg.
// Simple Icons carries no AWS, Slack or OpenAI mark (trademark removals);
// those fall through to the letter badge or the remote tier.
const SLUGS = {
  google: 'google',
  'google cloud': 'googlecloud',
  gcp: 'googlecloud',
  github: 'github',
  gitlab: 'gitlab',
  cloudflare: 'cloudflare',
  'cloudflare r2': 'cloudflare',
  stripe: 'stripe',
  postgresql: 'postgresql',
  postgres: 'postgresql',
  mysql: 'mysql',
  okta: 'okta',
  namecheap: 'namecheap',
  steam: 'steam',
  'valve steam': 'steam',
  valve: 'steam',
  docker: 'docker',
  notion: 'notion',
  vercel: 'vercel',
  netlify: 'netlify',
  anthropic: 'anthropic',
  claude: 'anthropic',
  npm: 'npm',
  convex: 'convex',
  digitalocean: 'digitalocean',
  supabase: 'supabase',
  firebase: 'firebase',
};

export function remoteIconsEnabled() {
  try { return localStorage.getItem(REMOTE_KEY) === 'on'; } catch { return false; }
}

export function setRemoteIcons(on) {
  try { localStorage.setItem(REMOTE_KEY, on ? 'on' : 'off'); } catch { /* unavailable */ }
}

function slugFor(service) {
  return SLUGS[String(service || '').trim().toLowerCase()] || null;
}

/** Best-effort domain for the remote tier: explicit field, else renewal URL host. */
function domainFor(cred) {
  if (cred?.domain) return cred.domain;
  try {
    if (cred?.renewal_url) return new URL(cred.renewal_url).hostname;
  } catch { /* malformed url */ }
  return null;
}

/** Deterministic hue so the same service always wears the same color. */
function hueFor(service) {
  let h = 0;
  for (const ch of String(service)) h = (h * 31 + ch.codePointAt(0)) % 360;
  return h;
}

/**
 * HTML for a service mark. `cred` is optional: pass it when a remote
 * favicon lookup should be possible for services with no vendored mark.
 */
export function brandBadge(service, cred, size = 'md') {
  const label = String(service || '?').trim() || '?';
  const slug = slugFor(label);
  if (slug) {
    return `<span class="brand-badge brand-badge--${size}"><img
      src="assets/brands/${slug}.svg" alt="" loading="lazy"></span>`;
  }
  const domain = remoteIconsEnabled() ? domainFor(cred) : null;
  if (domain) {
    return `<span class="brand-badge brand-badge--${size}"><img
      src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&amp;sz=64"
      alt="" loading="lazy"></span>`;
  }
  return `<span class="brand-badge brand-badge--${size} brand-badge--letter"
    style="--brand-hue:${hueFor(label)}">${escHtml(label[0].toUpperCase())}</span>`;
}
