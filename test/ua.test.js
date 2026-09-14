'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { stripElectronTokens } = require('../src/lib/ua');

const RAW =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'chatgpt-desktop-companion/2.0.0 Chrome/128.0.6613.186 Electron/42.0.0 Safari/537.36';

test('removes the electron token', () => {
  const out = stripElectronTokens(RAW);
  assert.doesNotMatch(out, /Electron\//);
});

test('removes the app name token', () => {
  const out = stripElectronTokens(RAW, 'chatgpt-desktop-companion');
  assert.doesNotMatch(out, /chatgpt-desktop-companion\//);
});

test('preserves the chrome token and structure', () => {
  const out = stripElectronTokens(RAW, 'chatgpt-desktop-companion');
  assert.match(out, /Chrome\/128\.0\.6613\.186/);
  assert.match(out, /^Mozilla\/5\.0 \(X11; Linux x86_64\)/);
  assert.match(out, /Safari\/537\.36$/);
  assert.doesNotMatch(out, /\s{2}/);
});

test('already clean strings pass through unchanged', () => {
  const clean = 'Mozilla/5.0 (X11) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36';
  assert.equal(stripElectronTokens(clean, 'chatgpt-desktop-companion'), clean);
});

test('handles null and missing app names', () => {
  assert.equal(stripElectronTokens(null), '');
  assert.doesNotMatch(stripElectronTokens(RAW, null), /Electron\//);
});
