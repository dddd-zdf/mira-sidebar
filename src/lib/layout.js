'use strict';

// Pure window geometry. All inputs are plain rectangles; nothing here touches
// Electron, which is what keeps this testable under node:test.

const MIN_WIDTH = 420;
const MIN_HEIGHT = 500;
const STRIP_HEIGHT = 28;

function dockBounds(workArea, side, widthFraction = 0.25) {
  const width = Math.min(
    workArea.width,
    Math.max(MIN_WIDTH, Math.round(workArea.width * widthFraction)),
  );
  const x = side === 'left' ? workArea.x : workArea.x + workArea.width - width;
  return { x, y: workArea.y, width, height: workArea.height };
}

function overlapArea(a, b) {
  const w = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const h = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return w * h;
}

function centerDistanceSq(a, b) {
  const dx = a.x + a.width / 2 - (b.x + b.width / 2);
  const dy = a.y + a.height / 2 - (b.y + b.height / 2);
  return dx * dx + dy * dy;
}

// Saved bounds can reference a monitor that is no longer plugged in. Pull the
// window onto the work area it overlaps most, or the nearest one if it is
// fully off screen, and enforce the minimum size.
function clampToDisplay(bounds, workAreas) {
  if (!bounds || !Array.isArray(workAreas) || workAreas.length === 0) return null;

  let best = workAreas[0];
  let bestOverlap = -1;
  for (const wa of workAreas) {
    const o = overlapArea(bounds, wa);
    if (o > bestOverlap) {
      bestOverlap = o;
      best = wa;
    }
  }
  if (bestOverlap <= 0) {
    let bestDist = Infinity;
    for (const wa of workAreas) {
      const d = centerDistanceSq(bounds, wa);
      if (d < bestDist) {
        bestDist = d;
        best = wa;
      }
    }
  }

  const width = Math.min(best.width, Math.max(MIN_WIDTH, Math.round(bounds.width)));
  const height = Math.min(best.height, Math.max(MIN_HEIGHT, Math.round(bounds.height)));
  const x = Math.min(Math.max(Math.round(bounds.x), best.x), best.x + best.width - width);
  const y = Math.min(Math.max(Math.round(bounds.y), best.y), best.y + best.height - height);
  return { x, y, width, height };
}

// Split the window content area into the strip rect and the provider view
// rect, flush against each other with no gap or overlap.
function splitBounds(contentSize, stripHeight = STRIP_HEIGHT) {
  const width = Math.max(0, Math.round(contentSize.width));
  const height = Math.max(0, Math.round(contentSize.height));
  const stripH = Math.max(0, Math.min(Math.round(stripHeight), height));
  return {
    strip: { x: 0, y: 0, width, height: stripH },
    view: { x: 0, y: stripH, width, height: height - stripH },
  };
}

module.exports = { MIN_WIDTH, MIN_HEIGHT, STRIP_HEIGHT, dockBounds, clampToDisplay, splitBounds };
