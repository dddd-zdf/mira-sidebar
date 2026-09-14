'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// House style: no em dashes and no en dashes anywhere, in code, UI strings,
// comments, or docs. This cannot check commit messages; those are on you.

const ROOT = path.join(__dirname, '..');
const SCAN_ROOTS = ['main.js', 'package.json', 'README.md', 'src', 'chrome', 'test', '.github'];
const SCAN_EXTENSIONS = new Set(['.js', '.json', '.md', '.yml', '.yaml', '.html', '.css']);
const BANNED = /[\u2013\u2014]/;

function collectFiles(entry) {
  const full = path.join(ROOT, entry);
  let stat;
  try {
    stat = fs.statSync(full);
  } catch {
    return [];
  }
  if (stat.isFile()) return [full];
  if (!stat.isDirectory()) return [];
  const files = [];
  for (const name of fs.readdirSync(full)) {
    const child = path.join(full, name);
    const childStat = fs.statSync(child);
    if (childStat.isDirectory()) {
      files.push(...collectFiles(path.relative(ROOT, child)));
    } else if (SCAN_EXTENSIONS.has(path.extname(name))) {
      files.push(child);
    }
  }
  return files;
}

test('no em or en dashes in source, chrome, tests, or docs', () => {
  const offenders = [];
  for (const entry of SCAN_ROOTS) {
    for (const file of collectFiles(entry)) {
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (BANNED.test(line)) {
          offenders.push(`${path.relative(ROOT, file)}:${i + 1}`);
        }
      });
    }
  }
  assert.deepEqual(offenders, [], `em or en dash found at: ${offenders.join(', ')}`);
});
