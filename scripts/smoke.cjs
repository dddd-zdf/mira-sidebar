'use strict';
// Explicit development-only harness; never packaged, never examines login data.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
module.exports = async ({ app, win, dispatch, config, viewManager, globalShortcut, getHotkey, saveBoundsNow, reloadConfig }) => {
  const report = { started: new Date().toISOString(), checks: [], events: [] };
  const output = process.env.MIRA_SMOKE_REPORT;
  const write = () => fs.writeFileSync(output, JSON.stringify(report, null, 2));
  const check = (name, fn) => { fn(); report.checks.push(name); write(); };
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  try {
    await wait(500);
    check('starts hidden', () => assert.equal(win.isVisible(), false));
    report.hotkey = getHotkey();
    check('global hotkey registered', () => assert.ok(globalShortcut.isRegistered(getHotkey())));
    dispatch('toggle-window');
    await wait(300);
    check('toggle shows', () => assert.equal(win.isVisible(), true));
    report.alwaysOnTop = { requested: config.alwaysOnTop, actualBeforeReapply: win.isAlwaysOnTop() };
    check('always on top when shown', () => assert.equal(win.isAlwaysOnTop(), true));
    dispatch('toggle-window');
    await wait(300);
    check('toggle hides', () => assert.equal(win.isVisible(), false));
    const wc = viewManager.activeWebContents();
    check('same live web view after hide/show', () => assert.equal(wc, viewManager.activeWebContents()));
    const prefs = wc.getLastWebPreferences();
    check('remote sandbox enabled without Node or preload', () => { assert.equal(prefs.sandbox,true); assert.equal(prefs.nodeIntegration,false); assert.equal(prefs.contextIsolation,true); assert.ok(!prefs.preload); });
    const original = win.getBounds();
    win.setBounds({ ...original, width: 510 });
    dispatch('dock:left');
    const left = win.getBounds();
    dispatch('dock:right');
    check('dock preserves resized width within Windows DPI rounding (2 DIP)', () => assert.ok(Math.abs(win.getBounds().width - left.width) <= 2));
    saveBoundsNow();
    check('bounds saved to disk', () => assert.deepEqual(JSON.parse(fs.readFileSync(path.join(app.getPath('userData'),'config.json'))).windowBounds, win.getBounds()));
    // Only a synthetic cookie for the reserved .invalid domain, in test profile.
    const ses = wc.session;
    if (!process.env.MIRA_TEST_PROFILE) throw Error('Isolated test profile is mandatory');
    const existing = await ses.cookies.get({ url:'https://mira-test.invalid', name:'mira-smoke' });
    report.syntheticCookieSurvivedRestart = existing.some(c => c.value === 'persistent');
    await ses.cookies.set({ url:'https://mira-test.invalid', name:'mira-smoke', value:'persistent', expirationDate:Date.now()/1000+86400, secure:true });
    await ses.cookies.flushStore();
    check('persistent session has disk storage', () => assert.ok(ses.getStoragePath()));
    dispatch('toggle-hide-on-blur');
    win.show();
    await wait(300);
    const { BrowserWindow } = require('electron');
    const focusTarget = new BrowserWindow({ width:300, height:200, title:'Mira focus test', webPreferences:{ sandbox:true } });
    focusTarget.show(); focusTarget.focus();
    await wait(350);
    check('hide on blur', () => assert.equal(win.isVisible(),false));
    focusTarget.destroy();
    dispatch('toggle-hide-on-blur');
    win.setBounds(original); saveBoundsNow();
    for (const event of ['show','hide','focus','blur']) win.on(event, () => { report.events.push({ event, time:new Date().toISOString(), visible:win.isVisible() }); write(); });
    report.status = 'ready-for-physical-hotkey-test'; write();
    report.web = [];
    for (const name of ['did-start-loading','dom-ready','did-finish-load','did-stop-loading']) wc.on(name, () => { report.web.push({event:name,time:new Date().toISOString()}); write(); });
    wc.on('did-fail-load', (_e, code, description) => { report.web.push({ event:'did-fail-load', code, description }); write(); });
    const timer = setInterval(() => { if (!wc.isDestroyed()) { report.page = { origin: (()=>{ try { return new URL(wc.getURL()).origin; } catch { return ''; } })(), title:wc.getTitle(), loading:wc.isLoading() }; write(); } }, 5000);
    timer.unref();
    if (process.env.MIRA_SMOKE_EXIT) { await wait(1000); app.quit(); }
  } catch (error) { report.error = error.stack; report.status = 'failed'; write(); app.quit(); }
};
