'use strict';
const fields = ['hotkey', 'arrangementMode', 'alwaysOnTop', 'hideOnBlur', 'startMinimized', 'startAtLogin'];
window.miraSettings.read().then(state => {
  for (const field of fields) {
    const element = document.getElementById(field);
    if (field === 'hotkey' || field === 'arrangementMode') element.value = state[field];
    else element.checked = state[field];
  }
  document.getElementById('startAtLogin').disabled = !state.packaged;
  document.getElementById('arrangementMode').disabled = !state.supportsArrangement;
  document.getElementById('login-note').textContent = state.packaged ? '' : 'Install the packaged app to enable launch at login.';
  document.getElementById('result').textContent = `Active shortcut: ${state.activeHotkey ?? 'none; use the tray icon'}`;
});
document.getElementById('settings').addEventListener('submit', async event => {
  event.preventDefault();
  const settings = {};
  for (const field of fields) {
    const element = document.getElementById(field);
    settings[field] = field === 'hotkey' || field === 'arrangementMode' ? element.value.trim() : element.checked;
  }
  try {
    const result = await window.miraSettings.save(settings);
    document.getElementById('result').textContent = result.message;
  }
  catch { document.getElementById('result').textContent = 'Settings could not be saved. Please try again.'; }
});
