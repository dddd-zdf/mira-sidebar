'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  MIN_WIDTH,
  MIN_HEIGHT,
  STRIP_HEIGHT,
  dockBounds,
  clampToDisplay,
  splitBounds,
} = require('../src/lib/layout');

const FHD = { x: 0, y: 0, width: 1920, height: 1040 };
const UHD = { x: 0, y: 0, width: 3840, height: 2120 };
const LAPTOP = { x: 0, y: 0, width: 1366, height: 728 };
const LEFT_MONITOR = { x: -1920, y: 0, width: 1920, height: 1040 };

test('dock right hugs the right work area edge', () => {
  const b = dockBounds(FHD, 'right', 0.25);
  assert.deepEqual(b, { x: 1440, y: 0, width: 480, height: 1040 });
});

test('dock left hugs the left work area edge', () => {
  const b = dockBounds(FHD, 'left', 0.25);
  assert.deepEqual(b, { x: 0, y: 0, width: 480, height: 1040 });
});

test('dock respects taskbar insets carried in the work area', () => {
  const inset = { x: 0, y: 30, width: 1920, height: 1010 };
  const b = dockBounds(inset, 'right', 0.25);
  assert.equal(b.y, 30);
  assert.equal(b.height, 1010);
});

test('dock enforces the minimum width on small screens', () => {
  const b = dockBounds(LAPTOP, 'right', 0.25);
  assert.equal(b.width, MIN_WIDTH);
  assert.equal(b.x, LAPTOP.width - MIN_WIDTH);
});

test('dock scales up on large screens', () => {
  const b = dockBounds(UHD, 'left', 0.25);
  assert.equal(b.width, 960);
});

test('dock in negative coordinate multi monitor space', () => {
  const b = dockBounds(LEFT_MONITOR, 'left', 0.25);
  assert.equal(b.x, -1920);
  const r = dockBounds(LEFT_MONITOR, 'right', 0.25);
  assert.equal(r.x + r.width, 0);
});

test('clamp returns null without bounds or displays', () => {
  assert.equal(clampToDisplay(null, [FHD]), null);
  assert.equal(clampToDisplay({ x: 0, y: 0, width: 500, height: 600 }, []), null);
});

test('clamp keeps well placed bounds unchanged', () => {
  const b = { x: 100, y: 50, width: 600, height: 800 };
  assert.deepEqual(clampToDisplay(b, [FHD]), b);
});

test('clamp pulls fully off screen bounds onto the nearest display', () => {
  const unplugged = { x: 5000, y: 200, width: 600, height: 800 };
  const clamped = clampToDisplay(unplugged, [FHD, LEFT_MONITOR]);
  assert.ok(clamped.x + clamped.width <= FHD.x + FHD.width);
  assert.ok(clamped.x >= FHD.x);
});

test('clamp picks the display with the most overlap', () => {
  const mostlyLeft = { x: -1000, y: 100, width: 900, height: 700 };
  const clamped = clampToDisplay(mostlyLeft, [FHD, LEFT_MONITOR]);
  assert.ok(clamped.x >= LEFT_MONITOR.x);
  assert.ok(clamped.x + clamped.width <= LEFT_MONITOR.x + LEFT_MONITOR.width);
});

test('clamp enforces minimum window size', () => {
  const tiny = { x: 10, y: 10, width: 100, height: 100 };
  const clamped = clampToDisplay(tiny, [FHD]);
  assert.equal(clamped.width, MIN_WIDTH);
  assert.equal(clamped.height, MIN_HEIGHT);
});

test('clamp caps size to the work area', () => {
  const huge = { x: 0, y: 0, width: 9000, height: 9000 };
  const clamped = clampToDisplay(huge, [LAPTOP]);
  assert.equal(clamped.width, LAPTOP.width);
  assert.equal(clamped.height, LAPTOP.height);
});

test('split puts the strip at exactly its height and the view flush below', () => {
  const { strip, view } = splitBounds({ width: 480, height: 1040 });
  assert.deepEqual(strip, { x: 0, y: 0, width: 480, height: STRIP_HEIGHT });
  assert.deepEqual(view, { x: 0, y: STRIP_HEIGHT, width: 480, height: 1040 - STRIP_HEIGHT });
  assert.equal(strip.height + view.height, 1040);
});

test('split tolerates fractional sizes without drift', () => {
  const { strip, view } = splitBounds({ width: 480.4, height: 1039.6 });
  assert.equal(strip.width, view.width);
  assert.equal(strip.height + view.height, strip.height + view.height | 0);
  assert.equal(view.y, strip.height);
});

test('split survives a window shorter than the strip', () => {
  const { strip, view } = splitBounds({ width: 480, height: 10 });
  assert.equal(strip.height, 10);
  assert.equal(view.height, 0);
});

test('split with zero strip height gives the view everything', () => {
  const { strip, view } = splitBounds({ width: 480, height: 1040 }, 0);
  assert.equal(strip.height, 0);
  assert.deepEqual(view, { x: 0, y: 0, width: 480, height: 1040 });
});
