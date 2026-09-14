'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { ZOOM_MIN, ZOOM_MAX, ZOOM_STEP, clampZoom, zoomIn, zoomOut } = require('../src/lib/zoom');

test('clamp holds the floor and ceiling', () => {
  assert.equal(clampZoom(-100), ZOOM_MIN);
  assert.equal(clampZoom(100), ZOOM_MAX);
  assert.equal(clampZoom(0), 0);
  assert.equal(clampZoom(NaN), 0);
  assert.equal(clampZoom(undefined), 0);
});

test('step sequences land on expected levels', () => {
  let level = 0;
  level = zoomIn(level);
  assert.equal(level, ZOOM_STEP);
  level = zoomIn(level);
  assert.equal(level, ZOOM_STEP * 2);
  level = zoomOut(level);
  level = zoomOut(level);
  assert.equal(level, 0);
});

test('stepping never escapes the clamp range', () => {
  let level = ZOOM_MAX;
  for (let i = 0; i < 5; i += 1) level = zoomIn(level);
  assert.equal(level, ZOOM_MAX);
  for (let i = 0; i < 100; i += 1) level = zoomOut(level);
  assert.equal(level, ZOOM_MIN);
});
