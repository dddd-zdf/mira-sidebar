'use strict';

// Zoom level helpers. Levels are Chromium zoom levels (factor 1.2 per whole
// step). Persistence is deliberately not handled here: Chromium already
// remembers zoom per origin per partition, and a second source of truth
// would fight it.

const ZOOM_MIN = -3;
const ZOOM_MAX = 5;
const ZOOM_STEP = 0.5;

function clampZoom(level) {
  const n = Number.isFinite(level) ? level : 0;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, n));
}

function zoomIn(level) {
  return clampZoom(clampZoom(level) + ZOOM_STEP);
}

function zoomOut(level) {
  return clampZoom(clampZoom(level) - ZOOM_STEP);
}

module.exports = { ZOOM_MIN, ZOOM_MAX, ZOOM_STEP, clampZoom, zoomIn, zoomOut };
