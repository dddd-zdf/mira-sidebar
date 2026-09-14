'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { resolveAction } = require('../src/lib/keymap');

function down(key, mods = {}) {
  return { type: 'keyDown', key, control: false, meta: false, shift: false, alt: false, ...mods };
}

test('primary modifier is control on windows and linux, command on mac', () => {
  for (const platform of ['win32', 'linux']) {
    assert.equal(resolveAction(down('1', { control: true }), platform, 3), 'switch:1');
    assert.equal(resolveAction(down('1', { meta: true }), platform, 3), 'noop');
  }
  assert.equal(resolveAction(down('1', { meta: true }), 'darwin', 3), 'switch:1');
  assert.equal(resolveAction(down('1', { control: true }), 'darwin', 3), 'noop');
});

test('digit chords resolve to switch actions within the enabled count', () => {
  assert.equal(resolveAction(down('3', { control: true }), 'linux', 3), 'switch:3');
  assert.equal(resolveAction(down('9', { control: true }), 'linux', 9), 'switch:9');
});

test('digit chords match by physical position on shifted digit layouts', () => {
  const azerty = down('&', { control: true, code: 'Digit1' });
  assert.equal(resolveAction(azerty, 'win32', 3), 'switch:1');
  const czech = down('+', { control: true, code: 'Digit1' });
  assert.equal(resolveAction(czech, 'linux', 3), 'switch:1');
  const outOfRange = down('"', { control: true, code: 'Digit4' });
  assert.equal(resolveAction(outOfRange, 'win32', 3), 'noop');
});

test('a digit past the enabled count is a noop', () => {
  assert.equal(resolveAction(down('5', { control: true }), 'win32', 3), 'noop');
  assert.equal(resolveAction(down('2', { meta: true }), 'darwin', 1), 'noop');
});

test('ctrl tab cycles on every platform, shift reverses', () => {
  for (const platform of ['win32', 'linux', 'darwin']) {
    assert.equal(resolveAction(down('Tab', { control: true }), platform, 2), 'cycle:next');
    assert.equal(resolveAction(down('Tab', { control: true, shift: true }), platform, 2), 'cycle:prev');
  }
});

test('zoom and reload chords', () => {
  assert.equal(resolveAction(down('=', { control: true }), 'linux', 2), 'zoom:in');
  assert.equal(resolveAction(down('+', { control: true, shift: true }), 'linux', 2), 'zoom:in');
  assert.equal(resolveAction(down('-', { control: true }), 'linux', 2), 'zoom:out');
  assert.equal(resolveAction(down('0', { control: true }), 'linux', 2), 'zoom:reset');
  assert.equal(resolveAction(down('r', { control: true }), 'linux', 2), 'reload');
  assert.equal(resolveAction(down('r', { meta: true }), 'darwin', 2), 'reload');
});

test('unowned keys pass through untouched', () => {
  const noops = [
    down('a', { control: true }),
    down('1'),
    down('Tab'),
    down('Tab', { alt: true, control: true }),
    down('1', { control: true, alt: true }),
    down('r', { control: true, shift: true }),
    down('F5'),
    { type: 'keyUp', key: '1', control: true },
    null,
  ];
  for (const input of noops) {
    assert.equal(resolveAction(input, 'linux', 5), 'noop', JSON.stringify(input));
  }
});
