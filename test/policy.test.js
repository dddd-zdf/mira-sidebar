'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { OAUTH_ORIGINS, classifyOpen, isPermissionAllowed } = require('../src/lib/policy');

test('same provider navigation is internal', () => {
  assert.equal(classifyOpen('https://chatgpt.com/c/123', 'chatgpt.com'), 'internal');
  assert.equal(classifyOpen('https://claude.ai/new', 'claude.ai'), 'internal');
});

test('subdomains of the provider host are internal', () => {
  assert.equal(classifyOpen('https://cdn.chatgpt.com/asset.js', 'chatgpt.com'), 'internal');
  assert.equal(classifyOpen('https://www.perplexity.ai/search', 'www.perplexity.ai'), 'internal');
  assert.equal(classifyOpen('https://perplexity.ai/search', 'www.perplexity.ai'), 'internal');
});

test('sibling domains are not internal', () => {
  assert.equal(classifyOpen('https://sites.google.com/view/x', 'gemini.google.com'), 'external');
  assert.equal(classifyOpen('https://evil.co.uk/', 'myai.co.uk'), 'external');
  assert.equal(classifyOpen('https://evilchatgpt.com/', 'chatgpt.com'), 'external');
});

test('every allowlisted oauth origin yields popup', () => {
  for (const origin of OAUTH_ORIGINS) {
    assert.equal(classifyOpen(`${origin}/signin?flow=1`, 'chatgpt.com'), 'popup', origin);
  }
});

test('arbitrary https urls are external', () => {
  assert.equal(classifyOpen('https://example.com/article', 'chatgpt.com'), 'external');
  assert.equal(classifyOpen('http://example.com/', 'chatgpt.com'), 'external');
  assert.equal(classifyOpen('https://github.com/', null), 'external');
});

test('about blank opens as a policed popup for script driven sso flows', () => {
  assert.equal(classifyOpen('about:blank', 'chatgpt.com'), 'popup');
});

test('non web schemes are denied', () => {
  for (const url of [
    'javascript:alert(1)',
    'file:///etc/passwd',
    'data:text/html,<h1>hi</h1>',
    'about:config',
    'chrome://settings',
    'not a url at all',
    '',
  ]) {
    assert.equal(classifyOpen(url, 'chatgpt.com'), 'deny', url);
  }
});

test('permissions allow media, notifications, clipboard write, fullscreen', () => {
  for (const p of ['media', 'notifications', 'clipboard-sanitized-write', 'fullscreen']) {
    assert.equal(isPermissionAllowed(p), true, p);
  }
});

test('permissions deny everything else', () => {
  for (const p of ['geolocation', 'midi', 'midiSysex', 'pointerLock', 'openExternal', 'display-capture', 'clipboard-read', 'idle-detection', 'unknown']) {
    assert.equal(isPermissionAllowed(p), false, p);
  }
});
