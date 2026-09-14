'use strict';

const { WebContentsView, shell, dialog } = require('electron');

const { splitBounds } = require('../lib/layout');
const { partitionFor } = require('../lib/providers');
const { stripElectronTokens } = require('../lib/ua');
const { classifyOpen, isPermissionAllowed } = require('../lib/policy');

// One cached WebContentsView per enabled provider, created lazily on first
// activation and kept alive for the process lifetime. Switching is visibility
// toggling, never loadURL, so typed drafts, scroll position and streaming
// responses survive. All Electron view lifecycle stays inside this file.
function createViewManager({ win, appName, stripHeight, onInput, onActiveChange, onStatus, onTransient }) {
  const views = new Map();
  const popups = new Set();
  let activeId = null;

  function viewRect() {
    const { width, height } = win.getContentBounds();
    return splitBounds({ width, height }, stripHeight).view;
  }

  function layout() {
    const rect = viewRect();
    for (const { view } of views.values()) view.setBounds(rect);
  }

  function configureSession(ses, provider) {
    const providerHost = new URL(provider.url).hostname;
    ses.setUserAgent(stripElectronTokens(ses.getUserAgent(), appName));
    // No device access for login pages or embedded third-party frames.
    const permittedOrigin = url => { try { return new URL(url).origin === new URL(provider.url).origin; } catch { return false; } };
    ses.setPermissionCheckHandler((wc, permission, origin) =>
      permittedOrigin(origin) && isPermissionAllowed(permission) && permission !== 'media' && permission !== 'notifications');
    ses.setPermissionRequestHandler(async (wc, permission, callback, details) => {
      const url = details?.requestingUrl ?? wc?.getURL();
      if (!permittedOrigin(url) || !isPermissionAllowed(permission)) return callback(false);
      if (permission !== 'media' && permission !== 'notifications') return callback(true);
      onTransient?.(1);
      try {
        const devices = details?.mediaTypes?.join(' and ') || 'microphone/camera';
        const result = await dialog.showMessageBox({ type: 'question', title: 'Mira Sidebar permission',
          message: `${new URL(provider.url).origin} wants to use ${permission === 'media' ? devices : 'notifications'}.`,
          buttons: ['Deny', 'Allow this time'], defaultId: 0, cancelId: 0 });
        callback(result.response === 1);
      } catch { callback(false); }
      finally { onTransient?.(-1); }
    });
    ses.on('will-download', (_event, item) => {
      // Let Chromium present the native save dialog; never auto-open a file.
      onTransient?.(1);
      item.once('done', (_e, state) => { onTransient?.(-1); onStatus?.(state === 'completed' ? 'Download saved' : 'Download canceled or failed'); });
    });
  }

  // Applied recursively to every window a provider spawns, so OAuth popups
  // and their descendants live under the same policy as the provider view.
  function wirePolicy(wc, provider) {
    const providerHost = new URL(provider.url).hostname;

    wc.setWindowOpenHandler(({ url }) => {
      const verdict = classifyOpen(url, providerHost);
      if (verdict === 'popup' || verdict === 'internal') {
        // OAuth popups must inherit the provider partition or the SSO cookie
        // lands in the wrong session and login silently fails.
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            width: 540,
            height: 700,
            autoHideMenuBar: true,
            parent: win,
            alwaysOnTop: win.isAlwaysOnTop(),
            webPreferences: {
              partition: partitionFor(provider.id),
              sandbox: true,
              contextIsolation: true,
              nodeIntegration: false,
            },
          },
        };
      }
      if (verdict === 'external') shell.openExternal(url);
      return { action: 'deny' };
    });

    wc.on('will-navigate', (event, url) => {
      const verdict = classifyOpen(url, providerHost);
      if (verdict === 'external') {
        event.preventDefault();
        shell.openExternal(url);
      } else if (verdict === 'deny') {
        event.preventDefault();
      }
    });

    // Redirects only block unsafe schemes. Treating external targets like
    // will-navigate does would cancel legitimate multi hop SSO chains
    // (Google hops through accounts.youtube.com, Microsoft through
    // login.live.com) and cross domain initial loads of custom providers,
    // because will-redirect also fires for loadURL navigations.
    wc.on('will-redirect', (event, url) => {
      if (classifyOpen(url, providerHost) === 'deny') event.preventDefault();
    });

    wc.on('did-create-window', (child) => {
      popups.add(child);
      child.once('closed', () => popups.delete(child));
      wirePolicy(child.webContents, provider);
    });
  }

  function ensureView(provider) {
    let entry = views.get(provider.id);
    if (entry) return entry;
    const view = new WebContentsView({
      webPreferences: {
        partition: partitionFor(provider.id),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        spellcheck: true,
        backgroundThrottling: false,
      },
    });
    configureSession(view.webContents.session, provider);
    // A webContents snapshots the session user agent at creation, before
    // configureSession stripped it, so it must be applied here explicitly.
    view.webContents.setUserAgent(view.webContents.session.getUserAgent());
    wirePolicy(view.webContents, provider);
    if (onInput) {
      view.webContents.on('before-input-event', (event, input) => onInput(event, input));
    }
    win.contentView.addChildView(view);
    view.setVisible(false);
    view.setBounds(viewRect());
    let loadingTimer;
    view.webContents.on('did-start-loading', () => {
      onStatus?.('Loading ChatGPT...');
      clearTimeout(loadingTimer);
      loadingTimer = setTimeout(() => onStatus?.('Taking longer than expected. Try Reload.'), 30000);
    });
    view.webContents.on('did-finish-load', () => { clearTimeout(loadingTimer); onStatus?.(''); });
    view.webContents.on('destroyed', () => clearTimeout(loadingTimer));
    view.webContents.on('did-fail-load', (_event, code, _description, _url, mainFrame) => {
      if (mainFrame && code !== -3) { clearTimeout(loadingTimer); onStatus?.(`Could not load (${code}). Try Reload or Open in Browser.`); }
    });
    view.webContents.on('render-process-gone', () => onStatus?.('Page stopped. Use Reload to recover.'));
    view.webContents.loadURL(provider.url).catch(() => onStatus?.('Could not load. Use Reload or Open in Browser.'));
    entry = { view, provider };
    views.set(provider.id, entry);
    return entry;
  }

  function show(provider) {
    ensureView(provider);
    for (const [id, entry] of views) entry.view.setVisible(id === provider.id);
    layout();
    activeId = provider.id;
    views.get(provider.id).view.webContents.focus();
    if (onActiveChange) onActiveChange(provider.id);
  }

  function destroy(id) {
    const entry = views.get(id);
    if (!entry) return;
    for (const child of popups) if (!child.isDestroyed()) child.close();
    win.contentView.removeChildView(entry.view);
    entry.view.webContents.close();
    views.delete(id);
    if (activeId === id) activeId = null;
  }

  function activeWebContents() {
    return views.get(activeId)?.view.webContents ?? null;
  }

  return {
    show,
    layout,
    destroy,
    activeWebContents,
    getActiveId: () => activeId,
    hasView: (id) => views.has(id),
    cachedIds: () => [...views.keys()],
    cachedProvider: (id) => views.get(id)?.provider ?? null,
    hasPopups: () => popups.size > 0,
  };
}

module.exports = { createViewManager };
