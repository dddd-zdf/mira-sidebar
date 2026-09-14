'use strict';

function buildTemplate(state) {
  const items = [{ label: 'Show / Hide Mira', action: 'toggle-window' }];
  if (state.arrangementMode != null) items.push({
    label: 'Window Arrangement',
    submenu: [['normal', 'Normal window'], ['adaptive', 'Adaptive'], ['always-reserve', 'Always reserve']].map(([mode, label]) => ({
      label, type: 'radio', checked: state.arrangementMode === mode, action: `arrangement:${mode}`,
    })),
  });
  items.push({ label: 'Always on Top', type: 'checkbox', checked: !!state.alwaysOnTop, action: 'toggle-always-on-top' });
  items.push({ label: 'Settings...', action: 'settings' });
  if (state.hotkey && !state.hotkey.registered) {
    items.push({ label: `Hotkey unavailable: ${state.hotkey.accelerator}`, enabled: false });
  }
  items.push({ type: 'separator' }, { label: 'Quit', action: 'quit' });
  return items;
}

module.exports = { buildTemplate };