'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  CATALOG,
  DEFAULT_ENABLED,
  allProviders,
  byId,
  partitionFor,
  validateCustomProvider,
} = require('../src/lib/providers');

test('catalog ids are unique', () => {
  const ids = CATALOG.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('catalog urls are all https', () => {
  for (const p of CATALOG) {
    assert.equal(new URL(p.url).protocol, 'https:', `${p.id} must be https`);
  }
});

test('default enabled providers exist in the catalog', () => {
  for (const id of DEFAULT_ENABLED) {
    assert.ok(CATALOG.some((p) => p.id === id), `${id} missing from catalog`);
  }
});

test('partition names are stable and prefixed', () => {
  assert.equal(partitionFor('chatgpt'), 'persist:provider-chatgpt');
  assert.equal(partitionFor('imported-v1'), 'persist:provider-imported-v1');
});

test('byId finds catalog and custom providers', () => {
  const custom = [{ id: 'kagi', name: 'Kagi', url: 'https://kagi.com/assistant' }];
  assert.equal(byId('claude').id, 'claude');
  assert.equal(byId('kagi', custom).name, 'Kagi');
  assert.equal(byId('nope', custom), null);
  assert.equal(allProviders(custom).length, CATALOG.length + 1);
});

test('custom provider validation accepts a clean https provider', () => {
  const result = validateCustomProvider({ name: 'Kagi Assistant', url: 'https://kagi.com/assistant' });
  assert.equal(result.ok, true);
  assert.equal(result.provider.id, 'kagi-assistant');
  assert.equal(result.provider.url, 'https://kagi.com/assistant');
});

test('custom provider validation rejects unsafe or malformed input', () => {
  const cases = [
    [null, /object/],
    [{ name: '', url: 'https://x.com' }, /name/],
    [{ name: '   ', url: 'https://x.com' }, /name/],
    [{ name: 'X', url: 'not a url' }, /valid URL/],
    [{ name: 'X', url: 'http://insecure.com' }, /https/],
    [{ name: 'X', url: 'javascript:alert(1)' }, /https/],
    [{ name: 'X', url: 'file:///etc/passwd' }, /https/],
    [{ name: 'X', url: 'data:text/html,hi' }, /https/],
  ];
  for (const [input, reasonRe] of cases) {
    const result = validateCustomProvider(input);
    assert.equal(result.ok, false, JSON.stringify(input));
    assert.match(result.reason, reasonRe);
  }
});

test('custom provider validation rejects id collisions with the catalog', () => {
  const result = validateCustomProvider({ id: 'chatgpt', name: 'Fake', url: 'https://evil.com' });
  assert.equal(result.ok, false);
  assert.match(result.reason, /taken/);
});

test('custom provider id falls back to a slug of the name', () => {
  const result = validateCustomProvider({ id: 'Not A Valid Id!', name: 'My AI', url: 'https://my.ai/' });
  assert.equal(result.ok, true);
  assert.equal(result.provider.id, 'my-ai');
});
