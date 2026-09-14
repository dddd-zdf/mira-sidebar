'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { defaults, normalize, migrateV1 } = require('../src/lib/config');

test('defaults are complete and self valid', () => {
  const { config, issues } = normalize(defaults());
  assert.deepEqual(issues, []);
  assert.deepEqual(config, defaults());
});

test('normalize is idempotent', () => {
  const messy = {
    activeProvider: 'perplexity',
    enabledProviders: ['perplexity', 'chatgpt'],
    hotkey: 'Ctrl+Alt+A',
    alwaysOnTop: true,
    dockWidthFraction: 0.3,
    windowBounds: { x: 10, y: 20, width: 700, height: 900 },
  };
  const first = normalize(messy);
  assert.deepEqual(first.issues, []);
  const second = normalize(first.config);
  assert.deepEqual(second.issues, []);
  assert.deepEqual(second.config, first.config);
});

test('non object config degrades to defaults with an issue', () => {
  for (const raw of ['nope', 42, [1, 2]]) {
    const { config, issues } = normalize(raw);
    assert.deepEqual(config, defaults());
    assert.equal(issues.length, 1);
  }
  assert.deepEqual(normalize(null).config, defaults());
  assert.deepEqual(normalize(undefined).config, defaults());
});

test('every malformed field degrades to its default with a reason, never throws', () => {
  const { config, issues } = normalize({
    activeProvider: 'unknown-provider',
    enabledProviders: 'not-an-array',
    customProviders: { not: 'an array' },
    hotkey: 'has spaces in it',
    alwaysOnTop: 'yes',
    hideOnBlur: 1,
    dockWidthFraction: 0.9,
    windowBounds: { x: 'a', y: 0, width: 100, height: 100 },
  });
  const d = defaults();
  assert.deepEqual(config, d);
  const fields = issues.map((i) => i.field).sort();
  assert.deepEqual(fields, [
    'activeProvider',
    'alwaysOnTop',
    'customProviders',
    'dockWidthFraction',
    'enabledProviders',
    'hideOnBlur',
    'hotkey',
    'windowBounds',
  ]);
});

test('unknown enabled provider ids are dropped, empty result falls back to defaults', () => {
  const partial = normalize({ enabledProviders: ['claude', 'bogus'] });
  assert.deepEqual(partial.config.enabledProviders, ['claude']);
  assert.equal(partial.issues.length, 1);

  const empty = normalize({ enabledProviders: ['bogus'] });
  assert.deepEqual(empty.config.enabledProviders, defaults().enabledProviders);
});

test('active provider must be enabled, else first enabled wins', () => {
  const { config } = normalize({ activeProvider: 'gemini', enabledProviders: ['claude'] });
  assert.equal(config.activeProvider, 'claude');
});

test('custom providers are validated individually, bad ones dropped with reasons', () => {
  const { config, issues } = normalize({
    customProviders: [
      { name: 'Kagi', url: 'https://kagi.com/assistant' },
      { name: 'Evil', url: 'http://evil.com' },
    ],
  });
  assert.equal(config.customProviders.length, 1);
  assert.equal(config.customProviders[0].id, 'kagi');
  assert.equal(issues.length, 1);
  assert.match(issues[0].reason, /https/);
});

test('custom providers can be enabled and active', () => {
  const { config, issues } = normalize({
    customProviders: [{ name: 'Kagi', url: 'https://kagi.com/' }],
    enabledProviders: ['kagi', 'chatgpt'],
    activeProvider: 'kagi',
  });
  assert.deepEqual(issues, []);
  assert.equal(config.activeProvider, 'kagi');
  assert.deepEqual(config.enabledProviders, ['kagi', 'chatgpt']);
});

test('dock width fraction is bounded', () => {
  assert.equal(normalize({ dockWidthFraction: 0.15 }).issues.length, 0);
  assert.equal(normalize({ dockWidthFraction: 0.6 }).issues.length, 0);
  assert.equal(normalize({ dockWidthFraction: 0.14 }).config.dockWidthFraction, 0.25);
  assert.equal(normalize({ dockWidthFraction: Infinity }).config.dockWidthFraction, 0.25);
});

// migrateV1

test('migration is a no-op without legacy keys', () => {
  const clean = { activeProvider: 'claude' };
  const { data, migrated } = migrateV1(clean);
  assert.equal(migrated, false);
  assert.equal(data, clean);
});

test('migration carries over bounds and always on top', () => {
  const { data, migrated } = migrateV1({
    app_windowBounds: { x: 5, y: 6, width: 800, height: 1000 },
    app_alwaysOnTop: true,
  });
  assert.equal(migrated, true);
  assert.deepEqual(data.windowBounds, { x: 5, y: 6, width: 800, height: 1000 });
  assert.equal(data.alwaysOnTop, true);
  assert.equal('app_windowBounds' in data, false);
  assert.equal('app_alwaysOnTop' in data, false);
});

test('the dead chat.openai.com default maps to the chatgpt catalog default', () => {
  const { data, migrated } = migrateV1({ app_loadUrl: 'https://chat.openai.com/chat/' });
  assert.equal(migrated, true);
  assert.equal(data.customProviders, undefined);
  assert.equal(data.activeProvider, undefined);
});

test('a custom v1 url becomes an enabled active custom provider', () => {
  const { data, migrated } = migrateV1({ app_loadUrl: 'https://chat.example.com/app' });
  assert.equal(migrated, true);
  assert.equal(data.customProviders.length, 1);
  assert.equal(data.customProviders[0].id, 'imported-v1');
  assert.equal(data.customProviders[0].url, 'https://chat.example.com/app');
  assert.equal(data.activeProvider, 'imported-v1');
  assert.ok(data.enabledProviders.includes('imported-v1'));

  const normalized = normalize(data);
  assert.deepEqual(normalized.issues, []);
  assert.equal(normalized.config.activeProvider, 'imported-v1');
});

test('an insecure or invalid v1 url is dropped with a reason', () => {
  const http = migrateV1({ app_loadUrl: 'http://insecure.example.com/' });
  assert.equal(http.data.customProviders, undefined);
  assert.equal(http.issues.length, 1);

  const garbage = migrateV1({ app_loadUrl: ':::not a url' });
  assert.equal(garbage.data.customProviders, undefined);
  assert.equal(garbage.issues.length, 1);
});

test('migration is idempotent', () => {
  const first = migrateV1({
    app_loadUrl: 'https://chat.example.com/app',
    app_windowBounds: { x: 0, y: 0, width: 500, height: 600 },
    app_alwaysOnTop: false,
  });
  const second = migrateV1(first.data);
  assert.equal(second.migrated, false);
  assert.deepEqual(second.data, first.data);
});

test('migration handles all presence combinations of the three legacy keys', () => {
  const legacy = {
    app_loadUrl: 'https://chat.example.com/',
    app_windowBounds: { x: 1, y: 2, width: 600, height: 700 },
    app_alwaysOnTop: true,
  };
  const keys = Object.keys(legacy);
  for (let mask = 1; mask < 8; mask += 1) {
    const raw = {};
    keys.forEach((k, i) => {
      if (mask & (1 << i)) raw[k] = legacy[k];
    });
    const { data, migrated } = migrateV1(raw);
    assert.equal(migrated, true, `mask ${mask}`);
    for (const k of keys) assert.equal(k in data, false, `mask ${mask} left ${k}`);
    const { issues } = normalize(data);
    assert.deepEqual(issues, [], `mask ${mask} produced invalid config`);
  }
});
