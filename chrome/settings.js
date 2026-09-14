'use strict';
const fields = ['hotkey', 'alwaysOnTop', 'hideOnBlur', 'startMinimized', 'startAtLogin'];
window.miraSettings.read().then(state => {
  for (const field of fields) {
    const element = document.getElementById(field);
    if (field === 'hotkey') element.value = state.hotkey;
    else element.checked = state[field];
  }
  document.getElementById('startAtLogin').disabled = !state.packaged;
  document.getElementById('login-note').textContent = state.packaged ? '' : 'Install the packaged app to enable launch at login.';
  document.getElementById('result').textContent = `Active shortcut: ${state.activeHotkey ?? 'none; use the tray icon'}`;
});
document.getElementById('settings').addEventListener('submit', async event => {
  event.preventDefault();
  const settings = {};
  for (const field of fields) {
    const element = document.getElementById(field);
    settings[field] = field === 'hotkey' ? element.value.trim() : element.checked;
  }
  try { document.getElementById('result').textContent = (await window.miraSettings.save(settings)).message; }
  catch { document.getElementById('result').textContent = 'Settings could not be saved. Please try again.'; }
});
