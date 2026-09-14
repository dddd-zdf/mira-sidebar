'use strict';

// Builds the tray menu as plain data: items carry an action string instead of
// a click handler, so the whole menu is testable without Electron. The tray
// wrapper in src/app attaches click handlers that dispatch the action.
//
// state = {
//   providers: [{ id, name, enabled, active }],
//   alwaysOnTop: boolean,
//   startAtLogin: boolean | null,        null hides the item (Linux)
//   hotkey: { accelerator, registered } | null,   null hides hotkey info
// }
function buildTemplate(state) {
  const providers = state.providers ?? [];
  const enabled = providers.filter((p) => p.enabled);
  const items = [];

  items.push({ label: 'Show / Hide Window', action: 'toggle-window' });
  items.push({ label: 'Mira Settings...', action: 'settings' });
  items.push({ label: 'New Chat (Ctrl+T)', action: 'chat:new' });
  items.push({ label: 'Temporary Chat (Ctrl+Shift+N)', action: 'chat:temporary' });
  items.push({ label: 'Delete Current Chat... (Ctrl+W)', action: 'chat:delete' });
  items.push({ type: 'separator' });

  if (enabled.length > 0) {
    items.push({
      label: 'Provider',
      submenu: enabled.map((p) => ({
        label: p.name,
        type: 'radio',
        checked: !!p.active,
        action: `switch-provider:${p.id}`,
      })),
    });
  }
  items.push({
    label: 'Enabled Providers',
    submenu: providers.map((p) => ({
      label: p.name,
      type: 'checkbox',
      checked: !!p.enabled,
      // Never allow unchecking the last enabled provider.
      enabled: !(p.enabled && enabled.length === 1),
      action: `toggle-provider:${p.id}`,
    })),
  });
  items.push({ type: 'separator' });

  items.push({ label: 'Dock Left', action: 'dock:left' });
  items.push({ label: 'Dock Right', action: 'dock:right' });
  if (state.reserveSpace != null) items.push({ label: 'Pin Beside Other Windows', type: 'checkbox', checked: !!state.reserveSpace, action: 'toggle-reserve-space' });
  items.push({ label: 'Hide on Focus Loss', type: 'checkbox', checked: !!state.hideOnBlur, action: 'toggle-hide-on-blur' });
  items.push({ label: 'Start Hidden in Tray', type: 'checkbox', checked: !!state.startMinimized, action: 'toggle-start-minimized' });
  items.push({
    label: 'Always on Top',
    type: 'checkbox',
    checked: !!state.alwaysOnTop,
    action: 'toggle-always-on-top',
  });
  if (state.startAtLogin !== null && state.startAtLogin !== undefined) {
    items.push({
      label: 'Start at Login',
      type: 'checkbox',
      checked: !!state.startAtLogin,
      action: 'toggle-start-at-login',
    });
  }
  if (state.hotkey && !state.hotkey.registered) {
    items.push({ label: `Hotkey unavailable: ${state.hotkey.accelerator}`, enabled: false });
  }
  if (state.hotkey?.registered) items.push({ label: `Shortcut: ${state.hotkey.accelerator}`, enabled: false });
  items.push({ type: 'separator' });

  items.push({ label: 'Reload Page', action: 'reload-page' });
  items.push({ label: 'Open in Browser', action: 'open-in-browser' });
  items.push({ type: 'separator' });

  items.push({ label: 'Edit Config', action: 'edit-config' });
  items.push({ label: 'Reload Config', action: 'reload-config' });
  items.push({ type: 'separator' });

  items.push({ label: 'Quit', action: 'quit' });
  return items;
}

module.exports = { buildTemplate };
