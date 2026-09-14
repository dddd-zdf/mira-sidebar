'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { loadJson, saveJsonAtomic } = require('../src/lib/store');

function tmpFile(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'companion-store-'));
  return path.join(dir, name);
}

test('round trips an object through save and load', () => {
  const file = tmpFile('config.json');
  const data = { activeProvider: 'claude', windowBounds: { x: 1, y: 2, width: 500, height: 600 } };
  saveJsonAtomic(file, data);
  assert.deepEqual(loadJson(file), data);
});

test('creates missing parent directories on save', () => {
  const file = path.join(tmpFile('nested'), 'deeper', 'config.json');
  saveJsonAtomic(file, { a: 1 });
  assert.deepEqual(loadJson(file), { a: 1 });
});

test('load returns empty object for a missing file', () => {
  assert.deepEqual(loadJson(tmpFile('does-not-exist.json')), {});
});

test('load returns empty object for corrupt json', () => {
  const file = tmpFile('config.json');
  fs.writeFileSync(file, '{ not json !!!', 'utf8');
  assert.deepEqual(loadJson(file), {});
});

test('load returns empty object for non object json', () => {
  const file = tmpFile('config.json');
  fs.writeFileSync(file, '[1, 2, 3]', 'utf8');
  assert.deepEqual(loadJson(file), {});
  fs.writeFileSync(file, '"a string"', 'utf8');
  assert.deepEqual(loadJson(file), {});
});

test('failed save leaves the existing file intact and cleans the tmp file', () => {
  const file = tmpFile('config.json');
  saveJsonAtomic(file, { original: true });

  const unlinked = [];
  const failingFs = {
    mkdirSync: fs.mkdirSync.bind(fs),
    writeFileSync: fs.writeFileSync.bind(fs),
    renameSync: () => {
      throw new Error('simulated rename failure');
    },
    unlinkSync: (p) => {
      unlinked.push(p);
      fs.unlinkSync(p);
    },
    readFileSync: fs.readFileSync.bind(fs),
  };

  assert.throws(() => saveJsonAtomic(file, { replacement: true }, failingFs), /simulated/);
  assert.deepEqual(loadJson(file), { original: true });
  assert.deepEqual(unlinked, [`${file}.tmp`]);
  assert.equal(fs.existsSync(`${file}.tmp`), false);
});
