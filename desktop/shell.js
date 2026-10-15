'use strict';
const $ = id => document.getElementById(id);
let lastScreen;
function render(state) {
  $('status').textContent = state.loading ? 'Loading…' : state.message || '';
  $('panel').hidden = state.screen === 'browser';
  for (const id of ['welcome', 'recovery', 'error', 'locked', 'setup']) $(id).hidden = (id === 'welcome' ? 'home' : id) !== state.screen;
  $('failure').textContent = state.message;
  if (state.screen !== lastScreen) $('feedback').textContent = '';
  if (state.screen === 'setup' && state.screen !== lastScreen) {
    const c = state.config;
    $('setup-title').textContent = c ? 'Application settings' : 'Welcome to HLM Browser';
    $('website').value = c?.website ?? '';
    $('origins').value = c?.origins.join('\n') ?? '';
    $('allowHttp').checked = c?.allowHttp ?? false;
    $('fullscreen').checked = c?.fullscreen ?? false;
    $('autoOpen').checked = c?.autoOpen ?? true;
    for (const name of ['camera', 'microphone', 'popups']) $(name).checked = c?.capabilities?.[name] ?? false;
    $('new-admin-label').hidden = !!c;
    $('new-admin').required = !c;
  }
  lastScreen = state.screen;
}
document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => window.hlm.action(button.dataset.action)));
$('unlock').addEventListener('submit', async event => {
  event.preventDefault(); const password = $('password').value; $('password').value = '';
  const result = await window.hlm.unlock(password); $('feedback').textContent = result.error ?? '';
});
$('configuration').addEventListener('submit', async event => {
  event.preventDefault(); $('save').disabled = true;
  try {
    const result = await window.hlm.save({ website: $('website').value, origins: $('origins').value.split(/\r?\n/).map(v => v.trim()).filter(Boolean),
      allowHttp: $('allowHttp').checked, fullscreen: $('fullscreen').checked, autoOpen: $('autoOpen').checked,
      capabilities: Object.fromEntries(['camera', 'microphone', 'popups'].map(name => [name, $(name).checked])) }, $('new-admin').value);
    $('feedback').textContent = result.error ?? ''; if (result.ok) $('new-admin').value = '';
  } catch { $('feedback').textContent = 'Settings could not be saved.'; } finally { $('save').disabled = false; }
});
window.hlm.onState(render);
window.hlm.state().then(render);
