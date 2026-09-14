'use strict';

// Navigation and permission policy for provider web content.
//
// window.open and cross-site navigation classify as:
//   'internal'  same site as the active provider; allowed in place
//   'popup'     a known OAuth origin; allowed as a child window that must
//               inherit the provider partition so the SSO cookie lands in
//               the right session
//   'external'  any other http(s) url; opened in the default browser
//   'deny'      everything else (javascript:, file:, data:, about:, ...)

const OAUTH_ORIGINS = Object.freeze([
  'https://accounts.google.com',
  'https://auth.openai.com',
  'https://auth0.openai.com',
  'https://appleid.apple.com',
  'https://login.microsoftonline.com',
  'https://login.live.com',
  'https://accounts.youtube.com',
]);

const ALLOWED_PERMISSIONS = Object.freeze([
  'media',
  'notifications',
  'clipboard-sanitized-write',
  'fullscreen',
]);

function classifyOpen(url, activeProviderHost = null) {
  let u;
  try {
    u = new URL(String(url));
  } catch {
    return 'deny';
  }
  // Some SSO flows open a blank window and script navigate it. Allow it as a
  // policed popup; the child window inherits the same navigation policy.
  if (u.protocol === 'about:' && u.pathname === 'blank') return 'popup';
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return 'deny';
  if (OAUTH_ORIGINS.includes(u.origin)) return 'popup';
  if (activeProviderHost && u.protocol === 'https:' && !u.username && !u.password && (!u.port || u.port === '443')) {
    // Same host or a subdomain of it, with a leading www. stripped from the
    // provider host. Guessing a registrable domain from the last two labels
    // would misfire on multi label suffixes like co.uk, so we do not.
    const host = String(activeProviderHost).replace(/^www\./, '');
    if (u.hostname === host || u.hostname.endsWith(`.${host}`)) return 'internal';
  }
  return 'external';
}

function isPermissionAllowed(permission) {
  return ALLOWED_PERMISSIONS.includes(permission);
}

module.exports = { OAUTH_ORIGINS, ALLOWED_PERMISSIONS, classifyOpen, isPermissionAllowed };
