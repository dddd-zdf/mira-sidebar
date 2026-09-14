'use strict';

const { CATALOG, DEFAULT_ENABLED, validateCustomProvider } = require('./providers');

const DEFAULTS = Object.freeze({
  activeProvider: 'chatgpt',
  enabledProviders: DEFAULT_ENABLED,
  customProviders: Object.freeze([]),
  hotkey: 'Control+Space',
  alwaysOnTop: true,
  hideOnBlur: false,
  arrangementMode: 'adaptive',
  dockSide: 'right',
  dockWidthFraction: 0.25,
  startMinimized: true,
  windowBounds: null,
});

const DOCK_FRACTION_MIN = 0.15;
const DOCK_FRACTION_MAX = 0.6;

// Accelerator strings look like Ctrl+Shift+Space: plus-separated tokens with
// no whitespace. Deeper validation is left to globalShortcut.register, which
// is wrapped fail-soft in main.
const ACCELERATOR_RE = /^[^\s+]+(\+[^\s+]+)*$/;

function defaults() {
  return {
    activeProvider: DEFAULTS.activeProvider,
    enabledProviders: [...DEFAULTS.enabledProviders],
    customProviders: [],
    hotkey: DEFAULTS.hotkey,
    alwaysOnTop: DEFAULTS.alwaysOnTop,
    hideOnBlur: DEFAULTS.hideOnBlur,
    arrangementMode: DEFAULTS.arrangementMode,
    dockSide: DEFAULTS.dockSide,
    startMinimized: DEFAULTS.startMinimized,
    dockWidthFraction: DEFAULTS.dockWidthFraction,
    windowBounds: DEFAULTS.windowBounds,
  };
}

function isValidBounds(b) {
  return (
    !!b &&
    typeof b === 'object' &&
    ['x', 'y', 'width', 'height'].every((k) => Number.isFinite(b[k]))
  );
}

// Every malformed field degrades to its default with a reported reason.
// This function never throws and is idempotent.
function normalize(raw) {
  const issues = [];
  const config = defaults();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    if (raw != null) issues.push({ field: 'config', reason: 'config must be an object; using defaults' });
    return { config, issues };
  }

  const catalogIds = CATALOG.map((p) => p.id);

  if (raw.customProviders !== undefined) {
    if (Array.isArray(raw.customProviders)) {
      const acceptedIds = [...catalogIds];
      for (const entry of raw.customProviders) {
        const result = validateCustomProvider(entry, acceptedIds);
        if (result.ok) {
          config.customProviders.push(result.provider);
          acceptedIds.push(result.provider.id);
        } else {
          issues.push({ field: 'customProviders', reason: result.reason });
        }
      }
    } else {
      issues.push({ field: 'customProviders', reason: 'must be an array' });
    }
  }

  const knownIds = [...catalogIds, ...config.customProviders.map((p) => p.id)];

  if (raw.enabledProviders !== undefined) {
    if (Array.isArray(raw.enabledProviders)) {
      const enabled = [];
      for (const id of raw.enabledProviders) {
        if (typeof id === 'string' && knownIds.includes(id) && !enabled.includes(id)) {
          enabled.push(id);
        } else {
          issues.push({ field: 'enabledProviders', reason: `unknown or duplicate provider id "${id}"` });
        }
      }
      if (enabled.length > 0) {
        config.enabledProviders = enabled;
      } else {
        issues.push({ field: 'enabledProviders', reason: 'no valid providers listed; using defaults' });
      }
    } else {
      issues.push({ field: 'enabledProviders', reason: 'must be an array' });
    }
  }

  if (raw.activeProvider !== undefined) {
    if (typeof raw.activeProvider === 'string' && config.enabledProviders.includes(raw.activeProvider)) {
      config.activeProvider = raw.activeProvider;
    } else {
      issues.push({ field: 'activeProvider', reason: `"${raw.activeProvider}" is not an enabled provider` });
    }
  }
  if (!config.enabledProviders.includes(config.activeProvider)) {
    config.activeProvider = config.enabledProviders[0];
  }

  if (raw.hotkey !== undefined) {
    if (typeof raw.hotkey === 'string' && ACCELERATOR_RE.test(raw.hotkey)) {
      config.hotkey = raw.hotkey;
    } else {
      issues.push({ field: 'hotkey', reason: 'not a valid accelerator string' });
    }
  }

  if (raw.arrangementMode !== undefined) {
    if (['normal', 'adaptive', 'always-reserve'].includes(raw.arrangementMode)) config.arrangementMode = raw.arrangementMode;
    else issues.push({ field: 'arrangementMode', reason: 'must be normal, adaptive, or always-reserve' });
  }

  for (const field of ['alwaysOnTop', 'hideOnBlur', 'startMinimized']) {
    if (raw[field] !== undefined) {
      if (typeof raw[field] === 'boolean') {
        config[field] = raw[field];
      } else {
        issues.push({ field, reason: 'must be a boolean' });
      }
    }
  }

  if (raw.dockSide !== undefined) {
    if (raw.dockSide === 'left' || raw.dockSide === 'right') config.dockSide = raw.dockSide;
    else issues.push({ field: 'dockSide', reason: 'must be left or right' });
  }

  if (raw.dockWidthFraction !== undefined) {
    const f = raw.dockWidthFraction;
    if (Number.isFinite(f) && f >= DOCK_FRACTION_MIN && f <= DOCK_FRACTION_MAX) {
      config.dockWidthFraction = f;
    } else {
      issues.push({
        field: 'dockWidthFraction',
        reason: `must be a number between ${DOCK_FRACTION_MIN} and ${DOCK_FRACTION_MAX}`,
      });
    }
  }

  if (raw.windowBounds !== undefined && raw.windowBounds !== null) {
    if (isValidBounds(raw.windowBounds)) {
      const { x, y, width, height } = raw.windowBounds;
      config.windowBounds = { x, y, width, height };
    } else {
      issues.push({ field: 'windowBounds', reason: 'must have numeric x, y, width, height' });
    }
  }

  return { config, issues };
}

// v1 stored app_loadUrl, app_windowBounds and app_alwaysOnTop at the top
// level of the same config.json file. Rewrite those keys into the v2 shape.
// Running this on already-migrated data is a no-op.
function migrateV1(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { data: {}, migrated: false, issues: [] };
  }
  const legacyKeys = ['app_loadUrl', 'app_windowBounds', 'app_alwaysOnTop'];
  if (!legacyKeys.some((k) => k in raw)) {
    return { data: raw, migrated: false, issues: [] };
  }

  const issues = [];
  const data = { ...raw };
  const loadUrl = data.app_loadUrl;
  const bounds = data.app_windowBounds;
  const alwaysOnTop = data.app_alwaysOnTop;
  for (const k of legacyKeys) delete data[k];

  if (isValidBounds(bounds) && data.windowBounds == null) {
    data.windowBounds = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
  }
  if (typeof alwaysOnTop === 'boolean' && data.alwaysOnTop === undefined) {
    data.alwaysOnTop = alwaysOnTop;
  }

  if (typeof loadUrl === 'string' && loadUrl.trim()) {
    let hostname = null;
    try {
      hostname = new URL(loadUrl).hostname;
    } catch {
      issues.push({ field: 'app_loadUrl', reason: 'not a valid URL; dropped' });
    }
    const wasLegacyDefault = hostname === 'chat.openai.com' || hostname === 'chatgpt.com';
    if (hostname && !wasLegacyDefault) {
      const result = validateCustomProvider({ id: 'imported-v1', name: hostname, url: loadUrl });
      if (result.ok) {
        const custom = Array.isArray(data.customProviders) ? data.customProviders : [];
        data.customProviders = [...custom, result.provider];
        const enabled = Array.isArray(data.enabledProviders) ? data.enabledProviders : [...DEFAULT_ENABLED];
        data.enabledProviders = [...new Set([...enabled, result.provider.id])];
        data.activeProvider = result.provider.id;
      } else {
        issues.push({ field: 'app_loadUrl', reason: `${result.reason}; dropped` });
      }
    }
  }

  return { data, migrated: true, issues };
}

module.exports = { DEFAULTS, defaults, normalize, migrateV1, isValidBounds };
