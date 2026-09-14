'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { buildTemplate } = require('../src/lib/tray-template');

function baseState(overrides = {}) {
  return {
    providers: [
      { id: 'chatgpt', name: 'ChatGPT', enabled: true, active: true },
      { id: 'claude', name: 'Claude', enabled: true, active: false },
      { id: 'gemini', name: 'Gemini', enabled: false, active: false },
    ],
    alwaysOnTop: false,
    startAtLogin: null,
    hotkey: null,
    ...overrides,
  };
}

function flatten(items) {
  return items.flatMap((item) => (item.submenu ? [item, ...flatten(item.submenu)] : [item]));
}

function findByLabel(items, label) {
  return flatten(items).find((i) => i.label === label);
}

test('exactly one radio is checked and it matches the active provider', () => {
  const items = buildTemplate(baseState());
  const radios = flatten(items).filter((i) => i.type === 'radio');
  assert.equal(radios.length, 2, 'only enabled providers appear as radios');
  const checked = radios.filter((i) => i.checked);
  assert.equal(checked.length, 1);
  assert.equal(checked[0].action, 'switch-provider:chatgpt');
});

test('enable checkboxes reflect provider state and cover all providers', () => {
  const items = buildTemplate(baseState());
  const boxes = flatten(items).filter((i) => typeof i.action === 'string' && i.action.startsWith('toggle-provider:'));
  assert.equal(boxes.length, 3);
  assert.equal(boxes.find((b) => b.action.endsWith('gemini')).checked, false);
  assert.equal(boxes.find((b) => b.action.endsWith('claude')).checked, true);
});

test('the last enabled provider cannot be unchecked', () => {
  const items = buildTemplate(
    baseState({
      providers: [
        { id: 'chatgpt', name: 'ChatGPT', enabled: true, active: true },
        { id: 'claude', name: 'Claude', enabled: false, active: false },
      ],
    }),
  );
  const boxes = flatten(items).filter((i) => typeof i.action === 'string' && i.action.startsWith('toggle-provider:'));
  assert.equal(boxes.find((b) => b.action.endsWith('chatgpt')).enabled, false);
  assert.equal(boxes.find((b) => b.action.endsWith('claude')).enabled, true);
});

test('always on top and start at login reflect state', () => {
  const items = buildTemplate(baseState({ alwaysOnTop: true, startAtLogin: true }));
  assert.equal(findByLabel(items, 'Always on Top').checked, true);
  assert.equal(findByLabel(items, 'Start at Login').checked, true);
});

test('start at login is hidden when unsupported', () => {
  const items = buildTemplate(baseState({ startAtLogin: null }));
  assert.equal(findByLabel(items, 'Start at Login'), undefined);
});

test('a failed hotkey registration surfaces a disabled explanatory item', () => {
  const items = buildTemplate(baseState({ hotkey: { accelerator: 'Ctrl+Shift+Space', registered: false } }));
  const info = flatten(items).find((i) => typeof i.label === 'string' && i.label.startsWith('Hotkey unavailable'));
  assert.ok(info);
  assert.equal(info.enabled, false);
  assert.match(info.label, /Ctrl\+Shift\+Space/);

  const ok = buildTemplate(baseState({ hotkey: { accelerator: 'Ctrl+Shift+Space', registered: true } }));
  assert.equal(
    flatten(ok).find((i) => typeof i.label === 'string' && i.label.startsWith('Hotkey unavailable')),
    undefined,
  );
});

test('all core actions are present exactly once', () => {
  const items = buildTemplate(baseState());
  const actions = flatten(items).map((i) => i.action).filter(Boolean);
  for (const action of [
    'toggle-window',
    'dock:left',
    'dock:right',
    'toggle-always-on-top',
    'reload-page',
    'open-in-browser',
    'edit-config',
    'reload-config',
    'quit',
  ]) {
    assert.equal(actions.filter((a) => a === action).length, 1, action);
  }
});

test('template items carry no functions so the template stays pure data', () => {
  const items = buildTemplate(baseState());
  for (const item of flatten(items)) {
    for (const value of Object.values(item)) {
      assert.notEqual(typeof value, 'function');
    }
  }
});
