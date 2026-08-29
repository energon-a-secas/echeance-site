// ── Tutorials view ───────────────────────────────────────────
// Renewal tutorials from data/tutorials.yaml: filter bar, list, detail.
// The same file feeds llms.txt (built by scripts/build-llms.py),
// so what agents read and what people read cannot drift apart.

import { $, escHtml } from './utils.js';
import { brandBadge } from './brand.js';

export function renderTutorials(s, openId) {
  const list = $('tutorialList');
  const detail = $('tutorialDetail');
  const bar = $('tutFilterBar');

  if (openId) {
    const t = s.tutorials.find((x) => x.id === openId);
    if (t) {
      bar.hidden = true;
      list.hidden = true;
      detail.hidden = false;
      detail.innerHTML = tutorialDetail(t, s);
      return;
    }
  }
  bar.hidden = false;
  list.hidden = false;
  detail.hidden = true;
  detail.innerHTML = '';

  renderFilterBar(s);

  if (!s.tutorials.length) {
    list.innerHTML = '<div class="card empty-note">No tutorials loaded.</div>';
    return;
  }
  const shown = filtered(s);
  if (!shown.length) {
    list.innerHTML = '<div class="card empty-note">No tutorial matches the filter.</div>';
    return;
  }
  list.innerHTML = shown.map((t) => `
    <button class="card card--flat tut-card" data-open-tutorial="${escHtml(t.id)}">
      <span class="tut-card__head">${brandBadge(t.service, null, 'md')}<span
        class="tut-card__title">${escHtml(t.title)}</span></span>
      <span class="tut-card__meta">${escHtml([t.service, t.applies_to].filter(Boolean).join(' · '))}</span>
      ${t.signals?.length ? `<span class="tut-card__signal">${escHtml(t.signals[0])}</span>` : ''}
    </button>`).join('');
}

function filtered(s) {
  const q = s.tutFilter.toLowerCase();
  return s.tutorials.filter((t) => {
    if (s.tutService && (t.service || '') !== s.tutService) return false;
    if (!q) return true;
    const hay = [
      t.title, t.service, t.applies_to,
      ...(t.signals || []), ...(t.steps || []), ...(t.insights || []),
    ].join(' ').toLowerCase();
    return hay.includes(q);
  });
}

/** Text input state lives in the DOM; chips rebuild from the loaded set. */
function renderFilterBar(s) {
  const services = [...new Set(s.tutorials.map((t) => t.service).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  $('tutChips').innerHTML = services.map((svc) => `
    <button class="chip${s.tutService === svc ? ' chip--on' : ''}"
      data-tutservice="${escHtml(svc)}">${brandBadge(svc, null, 'xs')}${escHtml(svc)}</button>`).join('');
  const input = $('tutSearch');
  if (document.activeElement !== input) input.value = s.tutFilter;
}

function tutorialDetail(t, s) {
  const used = s.credentials.filter((c) => c.tutorial === t.id);
  const parts = [`
    <div class="tut-head">
      <button class="btn btn--ghost btn--sm" id="tutBackBtn">&#8592; All tutorials</button>
    </div>
    <h3 class="tut-title">${brandBadge(t.service, null, 'md')}${escHtml(t.title)}</h3>
    <p class="tut-meta">${escHtml([t.service, t.applies_to].filter(Boolean).join(' · '))}</p>`];

  if (t.signals?.length) {
    parts.push(section('You are here because', `<ul class="tut-list">${
      t.signals.map((x) => `<li>${escHtml(x)}</li>`).join('')}</ul>`));
  }
  if (t.steps?.length) {
    parts.push(section('Steps', `<ol class="tut-list tut-list--steps">${
      t.steps.map((x) => `<li>${inlineCode(x)}</li>`).join('')}</ol>`));
  }
  if (t.verify) parts.push(section('Verify', `<p>${inlineCode(t.verify)}</p>`));
  if (t.revoke) parts.push(section('Revoke or rotate', `<p>${inlineCode(t.revoke)}</p>`));
  if (t.insights?.length) {
    parts.push(section('Hard-won insights', `<ul class="tut-list">${
      t.insights.map((x) => `<li>${inlineCode(x)}</li>`).join('')}</ul>`));
  }
  if (t.links?.length) {
    parts.push(section('Links', `<ul class="tut-list">${t.links.map((l) => `
      <li><a class="link" href="${escHtml(l.url)}" target="_blank" rel="noopener noreferrer">${escHtml(l.label || l.url)}</a></li>`).join('')}</ul>`));
  }
  if (used.length) {
    parts.push(section('Tracked credentials using this', `<ul class="tut-list">${
      used.map((c) => `<li><button class="link link--btn" data-cred="${escHtml(c.id)}">${escHtml(c.name)}</button></li>`).join('')}</ul>`));
  }
  return `<article class="tut-detail card">${parts.join('')}</article>`;
}

function section(title, body) {
  return `<h4 class="tut-section">${title}</h4>${body}`;
}

/** Escape, then re-emit `backtick` spans as <code>. */
function inlineCode(text) {
  return escHtml(text).replace(/`([^`]+)`/g, '<code>$1</code>');
}
