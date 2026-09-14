'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { bindHotkey } = require('../src/lib/hotkey');
test('hotkey conflict keeps the existing working shortcut', () => {
  const registered = new Set(['Control+Space']);
  const api = { register: () => false, isRegistered: k => registered.has(k), unregister: k => registered.delete(k) };
  assert.deepEqual(bindHotkey(api, 'Alt+M', 'Control+Space', () => {}), { ok: false, active: 'Control+Space' });
  assert.ok(registered.has('Control+Space'));
});
test('successful change releases old shortcut only after acquiring new one', () => {
  const calls = [];
  const api = { register: k => { calls.push(['register',k]); return true; }, unregister: k => calls.push(['unregister',k]) };
  assert.equal(bindHotkey(api, 'Alt+M', 'Control+Space', () => {}).active, 'Alt+M');
  assert.deepEqual(calls, [['register','Alt+M'], ['unregister','Control+Space']]);
});
test('invalid accelerator never throws or releases old shortcut', () => {
  const api = { register: () => { throw Error('invalid'); }, unregister: () => assert.fail() };
  assert.equal(bindHotkey(api, 'Invalid+garbage', 'Control+Space', () => {}).active, 'Control+Space');
});
