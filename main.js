'use strict';

const {
  app,
  BaseWindow,
  BrowserWindow,
  dialog,
  Menu,
  WebContentsView,
  globalShortcut,
  ipcMain,
  screen,
  shell,
} = require('electron');
const path = require('path');
app.setName('Mira Sidebar');
app.setAppUserModelId('local.difei.mira-sidebar');
if (!app.isPackaged && process.env.MIRA_TEST_PROFILE) app.setPath('userData', process.env.MIRA_TEST_PROFILE);
const { bindHotkey } = require('./src/lib/hotkey');
let settingsWindow = null;
let activeHotkey = null;
let transientDepth = 0;
let loadStatus = 'Loading ChatGPT...';

const providers = require('./src/lib/providers');
const { loadJson, saveJsonAtomic } = require('./src/lib/store');
const { defaults, normalize, migrateV1 } = require('./src/lib/config');
const layout = require('./src/lib/layout');
const { resolveAction } = require('./src/lib/keymap');
const { hasCtrlAltSwap, runChatAction } = require('./src/lib/chat-shortcuts');
let chatActionBusy = false;
function readCtrlAltSwap() {
  if (process.platform !== 'win32' || !process.env.LOCALAPPDATA) return false;
  const root = path.join(process.env.LOCALAPPDATA, 'Microsoft', 'PowerToys');
  if (!loadJson(path.join(root, 'settings.json')).enabled?.['Keyboard Manager']) return false;
  const folder = path.join(root, 'Keyboard Manager');
  const profile = loadJson(path.join(folder, 'settings.json')).properties?.activeConfiguration?.value;
  if (typeof profile !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(profile)) return false;
  return hasCtrlAltSwap(loadJson(path.join(folder, `${profile}.json`)));
}
const swappedCtrlAlt = readCtrlAltSwap();
const zoom = require('./src/lib/zoom');
const { createViewManager } = require('./src/app/views');
const { createTray } = require('./src/app/tray');

let win = null;
let stripView = null;
let viewManager = null;
let trayHandle = null;
let config = defaults();
let configPath = null;
let quitting = false;
let boundsSaveTimer = null;
let blurHandler = null;
let hotkeyRegistered = false;
let hiddenByBlurAt = 0;
let windowsAppbar = null;
let maximizeWatcher = null;
let pinnedBesideWindows = false;

function watchTopEdgeMaximize() {
  if (process.platform !== 'win32' || maximizeWatcher) return;
  try {
    maximizeWatcher = require('./src/app/windows-maximize-watcher').createMaximizeWatcher({
      win,
      isEnabled: () => config.autoFitOnMaximize && !quitting,
      onReservation: active => {
        pinnedBesideWindows = active;
        applyReservedDocking();
        if (!quitting) refreshUi();
      },
      onError: dockingFailed,
    });
  } catch (error) { dockingFailed(error); }
}

function unpinSidebar() {
  pinnedBesideWindows = false;
  windowsAppbar?.configure(false, config.dockSide);
  if (!quitting) refreshUi();
}

function applyReservedDocking() {
  if (process.platform !== 'win32' || !win) return;
  try {
    if (pinnedBesideWindows && !windowsAppbar) {
      windowsAppbar = require('./src/app/windows-appbar').createWindowsAppbar({
        win, screen,
        isAlwaysOnTop: () => config.alwaysOnTop,
        onError: dockingFailed,
      });
    }
    windowsAppbar?.configure(pinnedBesideWindows, config.dockSide);
  } catch (error) { dockingFailed(error); }
}

function dockingFailed(error) {
  console.error('Windows docking:', error);
  pinnedBesideWindows = false;
  loadStatus = 'Automatic window fitting failed. Toggle it off and on in the menu to retry.';
  refreshUi();
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function activeProvider() {
  return providers.byId(config.activeProvider, config.customProviders);
}

function enabledProviders() {
  return config.enabledProviders
    .map((id) => providers.byId(id, config.customProviders))
    .filter(Boolean);
}

// Persist only the keys an action actually changed, merged over whatever is
// on disk. Writing the whole normalized config would silently destroy fields
// the user just hand edited but has not reloaded yet. When the file is
// missing or unparseable there is nothing on disk worth preserving, so fall
// back to the full in memory config instead of shrinking the file to the
// patch keys alone.
function persist(patch) {
  try {
    const onDisk = loadJson(configPath);
    const base = Object.keys(onDisk).length === 0 ? config : onDisk;
    saveJsonAtomic(configPath, { ...base, ...patch });
  } catch (err) {
    console.error('failed to save config:', err);
  }
}

function loadConfigFromDisk() {
  const raw = loadJson(configPath);
  const { data, migrated, issues: migrationIssues } = migrateV1(raw);
  const { config: normalized, issues } = normalize(data);
  for (const issue of [...migrationIssues, ...issues]) {
    console.warn(`config: ${issue.field}: ${issue.reason}`);
  }
  config = normalized;
  if (migrated) {
    try {
      saveJsonAtomic(configPath, data);
    } catch (err) {
      console.error('failed to save migrated config:', err);
    }
  }
}

// ---------------------------------------------------------------------------
// UI state
// ---------------------------------------------------------------------------

// setLoginItemSettings is unreliable on Linux, so the tray item is hidden
// there (null means hide in the template).
function supportsLoginItem() {
  return process.platform === 'darwin' || process.platform === 'win32';
}

// Windows requires the same executable and arguments when reading and writing.
function loginItemOptions() {
  return { path: process.execPath, args: ['--hidden'] };
}

function trayState() {
  return {
    tooltip: `Mira Sidebar - ${activeHotkey ?? 'use tray to open'}`,
    hideOnBlur: config.hideOnBlur,
    startMinimized: config.startMinimized,
    providers: providers.allProviders(config.customProviders).map((p) => ({
      id: p.id,
      name: p.name,
      enabled: config.enabledProviders.includes(p.id),
      active: p.id === config.activeProvider,
    })),
    alwaysOnTop: config.alwaysOnTop,
    autoFitOnMaximize: process.platform === 'win32' ? config.autoFitOnMaximize : null,
    startAtLogin: supportsLoginItem() ? app.getLoginItemSettings(loginItemOptions()).openAtLogin : null,
    hotkey: { accelerator: activeHotkey ?? config.hotkey, registered: hotkeyRegistered },
  };
}

// Fail soft: a hotkey collision must never break the app. The tray shows a
// disabled explanatory item instead.
function registerHotkey() {
  const result = bindHotkey(globalShortcut, config.hotkey, activeHotkey, () => dispatch('toggle-window'));
  activeHotkey = result.active;
  if (!result.ok && !activeHotkey) {
    activeHotkey = bindHotkey(globalShortcut, 'Control+Shift+Space', null, () => dispatch('toggle-window')).active;
  }
  hotkeyRegistered = !!activeHotkey;
}

function refreshUi() {
  if (trayHandle) trayHandle.refresh();
  pushStripState();
}

function pushStripState() {
  if (!stripView) return;
  stripView.webContents.send('strip:state', {
    providers: enabledProviders().map(({ id, name }) => ({ id, name })),
    activeId: config.activeProvider,
    hotkey: activeHotkey ?? 'Tray menu',
    status: loadStatus,
  });
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function toggleWindow() {
  if (!win) return;
  if (win.isMinimized()) {
    win.restore();
    win.show();
    viewManager.activeWebContents()?.focus();
    return;
  }
  if (win.isVisible()) {
    win.hide();
    return;
  }
  // With hideOnBlur on, clicking the tray icon blurs and hides the window
  // before the tray click arrives; treat that click as the hide it caused
  // instead of instantly showing the window again.
  if (Date.now() - hiddenByBlurAt < 300) return;
  win.show();
  win.setAlwaysOnTop(config.alwaysOnTop, 'screen-saver');
  win.focus();
  viewManager.activeWebContents()?.focus();
}

function switchProvider(id) {
  const provider = providers.byId(id, config.customProviders);
  if (!provider || !config.enabledProviders.includes(id)) return;
  config.activeProvider = id;
  viewManager.show(provider);
  persist({ activeProvider: id });
  refreshUi();
}

function toggleProvider(id) {
  const enabled = config.enabledProviders;
  if (enabled.includes(id)) {
    if (enabled.length === 1) return;
    config.enabledProviders = enabled.filter((e) => e !== id);
    viewManager.destroy(id);
    persist({ enabledProviders: config.enabledProviders });
    if (config.activeProvider === id) {
      switchProvider(config.enabledProviders[0]);
    } else {
      refreshUi();
    }
  } else {
    if (!providers.byId(id, config.customProviders)) return;
    config.enabledProviders = [...enabled, id];
    persist({ enabledProviders: config.enabledProviders });
    refreshUi();
  }
}

function cycleProvider(direction) {
  const enabled = config.enabledProviders;
  const index = enabled.indexOf(config.activeProvider);
  const next = (index + direction + enabled.length) % enabled.length;
  switchProvider(enabled[next]);
}

function dock(side) {
  if (!win) return;
  config.dockSide = side;
  persist({ dockSide: side });
  if (pinnedBesideWindows && process.platform === 'win32') {
    applyReservedDocking();
    saveBoundsNow();
    return;
  }
  const { workArea } = screen.getDisplayMatching(win.getBounds());
  const widthFraction = win.getBounds().width / workArea.width;
  win.setBounds(layout.dockBounds(workArea, side, widthFraction));
  saveBoundsNow();
}

function toggleAlwaysOnTop() {
  config.alwaysOnTop = !config.alwaysOnTop;
  win.setAlwaysOnTop(config.alwaysOnTop, 'screen-saver');
  persist({ alwaysOnTop: config.alwaysOnTop });
  refreshUi();
}

function applyZoom(kind) {
  const wc = viewManager.activeWebContents();
  if (!wc) return;
  if (kind === 'reset') {
    wc.setZoomLevel(0);
  } else {
    const level = wc.getZoomLevel();
    wc.setZoomLevel(kind === 'in' ? zoom.zoomIn(level) : zoom.zoomOut(level));
  }
}

function openSettings() {
  if (settingsWindow) { settingsWindow.show(); settingsWindow.focus(); return; }
  settingsWindow = new BrowserWindow({
    width: 480, height: 710, resizable: false, autoHideMenuBar: true,
    title: 'Mira Sidebar settings', alwaysOnTop: true,
    icon: path.join(__dirname, 'assets', 'mira.png'),
    webPreferences: { preload: path.join(__dirname, 'chrome', 'settings-preload.js'), sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  settingsWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  settingsWindow.webContents.on('will-navigate', event => event.preventDefault());
  settingsWindow.on('closed', () => { settingsWindow = null; });
  settingsWindow.loadFile(path.join(__dirname, 'chrome', 'settings.html'));
}

function trustedSettings(event) {
  return settingsWindow && event.sender === settingsWindow.webContents && event.senderFrame === settingsWindow.webContents.mainFrame;
}

ipcMain.handle('settings:read', event => {
  if (!trustedSettings(event)) throw new Error('Untrusted sender');
  return { ...config, activeHotkey, packaged: app.isPackaged, startAtLogin: app.getLoginItemSettings(loginItemOptions()).openAtLogin };
});
ipcMain.handle('settings:save', (event, raw) => {
  if (!trustedSettings(event)) throw new Error('Untrusted sender');
  if (!raw || typeof raw.hotkey !== 'string' || raw.hotkey.length > 80 ||
      !['alwaysOnTop','hideOnBlur','startMinimized','startAtLogin'].every(key => typeof raw[key] === 'boolean')) {
    return { message: 'Please check the settings and try again.' };
  }
  const { issues } = normalize({ hotkey: raw.hotkey });
  if (issues.length) return { message: 'Use a shortcut such as Control+Space.' };
  const previous = activeHotkey;
  const result = bindHotkey(globalShortcut, raw.hotkey, activeHotkey, () => dispatch('toggle-window'));
  if (!result.ok) return { message: 'That shortcut is unavailable. Your previous shortcut is still active.' };
  const patch = Object.fromEntries(['hotkey','alwaysOnTop','hideOnBlur','startMinimized'].map(key => [key, raw[key]]));
  try {
    saveJsonAtomic(configPath, { ...config, ...patch });
  } catch {
    globalShortcut.unregister(raw.hotkey);
    activeHotkey = null;
    if (previous) activeHotkey = bindHotkey(globalShortcut, previous, null, () => dispatch('toggle-window')).active;
    hotkeyRegistered = !!activeHotkey;
    refreshUi();
    return { message: 'Could not write settings. Check that the profile folder is writable.' };
  }
  activeHotkey = result.active; hotkeyRegistered = true;
  Object.assign(config, patch);
  win.setAlwaysOnTop(config.alwaysOnTop, 'screen-saver'); applyHideOnBlur();
  applyReservedDocking();
  if (app.isPackaged) app.setLoginItemSettings({ ...loginItemOptions(), openAtLogin: raw.startAtLogin });
  refreshUi();
  return { message: `Saved. Press ${activeHotkey} to show or hide Mira.` };
});

function reloadConfig() {
  loadConfigFromDisk();
  if (!config.autoFitOnMaximize) maximizeWatcher?.reset();
  applyReservedDocking();
  win.setAlwaysOnTop(config.alwaysOnTop, 'screen-saver');
  applyHideOnBlur();
  registerHotkey();
  // Reconcile from the cached views, not the new provider list: a cached view
  // may belong to a provider that was disabled, removed, or given a new url.
  for (const id of viewManager.cachedIds()) {
    const next = providers.byId(id, config.customProviders);
    const cached = viewManager.cachedProvider(id);
    if (!next || !config.enabledProviders.includes(id) || next.url !== cached.url) {
      viewManager.destroy(id);
    }
  }
  switchProvider(config.activeProvider);
}

function dispatch(action) {
  if (action.startsWith('chat:')) {
    if (chatActionBusy) return;
    chatActionBusy = true;
    runChatAction(viewManager?.activeWebContents(), action).then(ok => {
      if (!ok) { loadStatus = action === 'chat:delete' ? 'Open a saved chat to delete it.' : 'Open ChatGPT to use this shortcut.'; pushStripState(); }
    }).catch(() => { loadStatus = 'Chat action failed. Try reloading ChatGPT.'; pushStripState(); })
      .finally(() => { chatActionBusy = false; });
    return;
  }
  if (action.startsWith('switch-provider:')) {
    return switchProvider(action.slice('switch-provider:'.length));
  }
  if (action.startsWith('toggle-provider:')) {
    return toggleProvider(action.slice('toggle-provider:'.length));
  }
  if (action.startsWith('switch:')) {
    const id = config.enabledProviders[Number(action.slice('switch:'.length)) - 1];
    if (id) switchProvider(id);
    return undefined;
  }
  switch (action) {
    case 'settings': return openSettings();
    case 'hide-window': return win.hide();
    case 'menu': return trayHandle?.tray.popUpContextMenu();
    case 'toggle-hide-on-blur':
      config.hideOnBlur = !config.hideOnBlur;
      persist({ hideOnBlur: config.hideOnBlur });
      applyHideOnBlur(); refreshUi(); return;
    case 'toggle-start-minimized':
      config.startMinimized = !config.startMinimized;
      persist({ startMinimized: config.startMinimized }); refreshUi(); return;
    case 'toggle-window':
      return toggleWindow();
    case 'cycle:next':
      return cycleProvider(1);
    case 'cycle:prev':
      return cycleProvider(-1);
    case 'dock:left':
      return dock('left');
    case 'dock:right':
      return dock('right');
    case 'toggle-always-on-top':
      return toggleAlwaysOnTop();
    case 'toggle-auto-fit':
      if (process.platform !== 'win32') return;
      config.autoFitOnMaximize = !config.autoFitOnMaximize;
      persist({ autoFitOnMaximize: config.autoFitOnMaximize });
      if (!config.autoFitOnMaximize) maximizeWatcher?.reset();
      else watchTopEdgeMaximize();
      refreshUi(); return;
    case 'toggle-start-at-login': {
      if (!supportsLoginItem()) return undefined;
      const current = app.getLoginItemSettings(loginItemOptions()).openAtLogin;
      if (!app.isPackaged) { dialog.showMessageBox({ message: 'Install Mira Sidebar first to enable launch at login.' }); return; }
      app.setLoginItemSettings({ ...loginItemOptions(), openAtLogin: !current });
      refreshUi();
      return undefined;
    }
    case 'zoom:in':
      return applyZoom('in');
    case 'zoom:out':
      return applyZoom('out');
    case 'zoom:reset':
      return applyZoom('reset');
    case 'reload':
    case 'reload-page':
      return viewManager.activeWebContents()?.reload();
    case 'open-in-browser': {
      const wc = viewManager.activeWebContents();
      if (wc && /^https:\/\//.test(wc.getURL())) shell.openExternal(wc.getURL());
      return undefined;
    }
    case 'edit-config':
      // Seed the file with the current config only when it does not exist
      // yet; an existing file may hold edits that must not be overwritten.
      if (Object.keys(loadJson(configPath)).length === 0) persist({ ...config });
      shell.openPath(configPath);
      return undefined;
    case 'reload-config':
      return reloadConfig();
    case 'quit':
      quitting = true;
      app.quit();
      return undefined;
    default:
      return undefined;
  }
}

function onViewInput(event, input) {
  const action = resolveAction(
    {
      type: input.type,
      key: input.key,
      code: input.code,
      control: input.control,
      meta: input.meta,
      shift: input.shift,
      alt: input.alt,
    },
    process.platform,
    config.enabledProviders.length,
    swappedCtrlAlt,
  );
  if (action !== 'noop') {
    event.preventDefault();
    if (input.isAutoRepeat && action.startsWith('chat:')) return;
    dispatch(action);
  }
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

function scheduleBoundsSave() {
  if (boundsSaveTimer) clearTimeout(boundsSaveTimer);
  boundsSaveTimer = setTimeout(saveBoundsNow, 500);
}

function saveBoundsNow() {
  if (boundsSaveTimer) {
    clearTimeout(boundsSaveTimer);
    boundsSaveTimer = null;
  }
  if (!win || win.isDestroyed()) return;
  config.windowBounds = win.getBounds();
  persist({ windowBounds: config.windowBounds });
}

function applyHideOnBlur() {
  if (blurHandler) {
    win.removeListener('blur', blurHandler);
    blurHandler = null;
  }
  if (config.hideOnBlur) {
    blurHandler = () => {
      // A blur that trails a programmatic hide (hotkey, tray) must not stamp
      // the guard window, or the next toggle within 300ms would be dropped.
      if (!win.isVisible()) return;
      setTimeout(() => {
        if (!win || win.isDestroyed() || win.isFocused() || pinnedBesideWindows || maximizeWatcher?.isDragging() || transientDepth || settingsWindow || viewManager.hasPopups()) return;
        hiddenByBlurAt = Date.now();
        win.hide();
      }, 180);
    };
    win.on('blur', blurHandler);
  }
}

// The strip is the only chrome: a drag handle with the provider tabs on it.
// It exists because a frameless window filled by remote content has no drag
// surface at all; requests to grow it should be declined.
function createStrip() {
  stripView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'chrome', 'preload.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.contentView.addChildView(stripView);
  stripView.webContents.on('before-input-event', onViewInput);
  layoutStrip();
  // The strip must never leave its local file or open windows; its preload
  // exposes the ipc bridge, so any navigation would hand it to a remote page.
  stripView.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  stripView.webContents.on('will-navigate', (event) => event.preventDefault());
  stripView.webContents.on('did-finish-load', pushStripState);
  stripView.webContents.loadFile(path.join(__dirname, 'chrome', 'strip.html'));
}

function layoutStrip() {
  if (!stripView) return;
  const { width, height } = win.getContentBounds();
  stripView.setBounds(layout.splitBounds({ width, height }).strip);
}

function installAppMenu() {
  const template = [];
  if (process.platform === 'darwin') template.push({ role: 'appMenu' });
  template.push({ role: 'editMenu' });
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  const workAreas = screen.getAllDisplays().map((d) => d.workArea);
  const restored = layout.clampToDisplay(config.windowBounds, workAreas);
  const bounds =
    restored ??
    layout.dockBounds(screen.getPrimaryDisplay().workArea, 'right', config.dockWidthFraction);

  win = new BaseWindow({
    ...bounds,
    minWidth: layout.MIN_WIDTH,
    minHeight: layout.MIN_HEIGHT,
    frame: false,
    show: false,
    skipTaskbar: true,
    alwaysOnTop: config.alwaysOnTop,
    title: 'Mira Sidebar',
    icon: path.join(__dirname, 'assets', 'mira.png'),
  });

  createStrip();

  viewManager = createViewManager({
    win,
    appName: app.getName(),
    stripHeight: layout.STRIP_HEIGHT,
    onInput: onViewInput,
    onStatus: (status) => { loadStatus = status; pushStripState(); },
    onTransient: (delta) => { transientDepth += delta; },
  });

  win.on('resize', () => {
    layoutStrip();
    viewManager.layout();
    scheduleBoundsSave();
  });
  win.on('move', scheduleBoundsSave);
  win.on('hide', unpinSidebar);
  win.on('minimize', unpinSidebar);
  win.on('close', (event) => {
    saveBoundsNow();
    if (!quitting) {
      event.preventDefault();
      win.hide();
    }
    else windowsAppbar?.dispose();
  });
  win.on('closed', () => {
    win = null;
  });
  applyHideOnBlur();

  applyReservedDocking();
  watchTopEdgeMaximize();
  viewManager.show(activeProvider());
  if ((!config.startMinimized && !process.argv.includes('--hidden')) || process.argv.includes('--show')) win.show();
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });

  ipcMain.on('mira:action', (event, action) => {
    if (event.sender === stripView?.webContents && event.senderFrame === stripView.webContents.mainFrame && ['menu','settings','hide-window','reload-page'].includes(action)) dispatch(action);
  });
  ipcMain.on('strip:switch-provider', (event, id) => {
    if (stripView && event.sender === stripView.webContents && typeof id === 'string') {
      switchProvider(id);
    }
  });

  app.whenReady().then(() => {
    configPath = path.join(app.getPath('userData'), 'config.json');
    loadConfigFromDisk();
    installAppMenu();
    createWindow();
    registerHotkey();
    pushStripState();
    trayHandle = createTray(
      path.join(__dirname, 'assets', 'mira.png'),
      trayState,
      dispatch,
    );
    screen.on('display-removed', () => {
      if (pinnedBesideWindows && process.platform === 'win32') return;
      const bounds = layout.clampToDisplay(win.getBounds(), screen.getAllDisplays().map(d => d.workArea));
      if (bounds) win.setBounds(bounds);
    });
    if (!app.isPackaged && process.env.MIRA_SMOKE_REPORT) require('./scripts/smoke.cjs')({ app, win, dispatch, config, viewManager, globalShortcut, getHotkey: () => activeHotkey, saveBoundsNow, reloadConfig });
  });

  app.on('before-quit', () => {
    saveBoundsNow();
    quitting = true;
    maximizeWatcher?.dispose();
    windowsAppbar?.dispose();
    for (const id of viewManager?.cachedIds() ?? []) viewManager.destroy(id);
    stripView?.webContents.close();
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('activate', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
  });
}
