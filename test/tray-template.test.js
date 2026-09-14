'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildTemplate } = require('../src/lib/tray-template');

test('compact menu exposes essential controls and moves other preferences to Settings', () => {
  const menu = buildTemplate({ arrangementMode: 'adaptive', alwaysOnTop: true });
  assert.deepEqual(menu.filter(item => item.label).map(item => item.label),
    ['Show / Hide Mira', 'Window Arrangement', 'Always on Top', 'Settings...', 'Quit']);
  assert.equal(menu.find(item => item.action === 'toggle-always-on-top').checked, true);
});

test('arrangement choices reflect the selected mode', () => {
  for (const mode of ['normal', 'adaptive', 'always-reserve']) {
    const options = buildTemplate({ arrangementMode: mode }).find(item => item.submenu).submenu;
    assert.equal(options.length, 3);
    assert.deepEqual(options.filter(item => item.checked).map(item => item.action), [`arrangement:${mode}`]);
  }
  assert.equal(buildTemplate({ arrangementMode: null }).some(item => item.submenu), false);
});

test('a failed global shortcut remains visible in the compact menu', () => {
  const menu = buildTemplate({ hotkey: { accelerator: 'Control+Space', registered: false } });
  const error = menu.find(item => item.label?.startsWith('Hotkey unavailable'));
  assert.ok(error);
  assert.equal(error.enabled, false);
  assert.match(error.label, /Control\+Space/);
});