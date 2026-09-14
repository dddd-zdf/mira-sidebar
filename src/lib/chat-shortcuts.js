'use strict';

function hasCtrlAltSwap(profile) {
  const keys = profile?.remapKeys?.inProcess;
  return Array.isArray(keys) &&
    keys.some(k => k.originalKeys === '162' && k.newRemapKeys === '164') &&
    keys.some(k => k.originalKeys === '164' && k.newRemapKeys === '162');
}

async function runChatAction(wc, action) {
  if (!wc || wc.isDestroyed()) return false;
  let url;
  try { url = new URL(wc.getURL()); } catch { return false; }
  if (url.origin !== 'https://chatgpt.com') return false;
  if (action === 'chat:temporary') {
    await wc.loadURL('https://chatgpt.com/?temporary-chat=true');
    return true;
  }
  if (action !== 'chat:new' && action !== 'chat:delete') return false;
  // Never attempt deletion on a new chat, login, settings or shared page.
  if (action === 'chat:delete' && !/\/c\/[a-zA-Z0-9-]+\/?$/.test(url.pathname)) return false;
  const keyCode = action === 'chat:new' ? 'O' : 'Backspace';
  wc.focus();
  // Verified in ChatGPT's own shortcut dialog. Renderer input bypasses OS
  // remapping and opens the site's delete confirmation. Never send Enter.
  const modifiers = ['control', 'shift'];
  wc.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
  wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
  return true;
}

module.exports = { hasCtrlAltSwap, runChatAction };
