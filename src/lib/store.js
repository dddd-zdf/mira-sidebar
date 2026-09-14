'use strict';

const fs = require('fs');
const path = require('path');

// Minimal JSON settings store. Replaces electron-store and reads the same
// userData/config.json file that electron-store 8.x wrote, which is what makes
// in-place migration of v1 settings possible.

function loadJson(filePath, fsImpl = fs) {
  let text;
  try {
    text = fsImpl.readFileSync(filePath, 'utf8');
  } catch {
    return {};
  }
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

// Write to a sibling tmp file and rename over the target so a crash mid-write
// never leaves a truncated config behind.
function saveJsonAtomic(filePath, data, fsImpl = fs) {
  const tmpPath = `${filePath}.tmp`;
  const text = `${JSON.stringify(data, null, 2)}\n`;
  fsImpl.mkdirSync(path.dirname(filePath), { recursive: true });
  try {
    fsImpl.writeFileSync(tmpPath, text, 'utf8');
    fsImpl.renameSync(tmpPath, filePath);
  } catch (err) {
    try {
      fsImpl.unlinkSync(tmpPath);
    } catch {
      // tmp file may not exist; nothing to clean
    }
    throw err;
  }
}

module.exports = { loadJson, saveJsonAtomic };
