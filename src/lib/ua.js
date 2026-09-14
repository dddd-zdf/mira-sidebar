'use strict';

// Some AI sites degrade or block sessions when the user agent advertises an
// embedded browser. Strip the Electron token and the app-name token, nothing
// more: we do not impersonate Chrome any deeper than the default UA already
// does, and Google may still reject embedded sign-in regardless.
function stripElectronTokens(ua, appName = null) {
  let out = String(ua ?? '');
  out = out.replace(/\sElectron\/\S+/g, '');
  if (appName) {
    const escaped = String(appName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`\\s${escaped}/\\S+`, 'g'), '');
  }
  return out.replace(/\s{2,}/g, ' ').trim();
}

module.exports = { stripElectronTokens };
