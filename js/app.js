// ── Entry point ──────────────────────────────────────────────
// Load data, bind events, render the view named by the URL hash.

import { state, loadInventory, loadTutorials, loadPrefs } from './state.js';
import { bindEvents, applyHash, updateNotifyBtn } from './events.js';
import { checkReminders } from './notify.js';
import { $ } from './utils.js';

async function init() {
  loadPrefs(state);
  await Promise.all([loadInventory(state), loadTutorials(state)]);
  bindEvents(state);
  $('yamlEditor').value = state.yamlText;
  applyHash();
  updateNotifyBtn();
  checkReminders(state);
}

init();
