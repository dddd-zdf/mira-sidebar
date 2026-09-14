'use strict';

// Maps a before-input-event payload to an app action string. Only chords the
// app owns return an action; everything else is 'noop' and passes through to
// the page untouched.
//
// Owned chords:
//   Ctrl or Cmd + 1..9      switch to the nth enabled provider
//   Ctrl+Tab / Ctrl+Shift+Tab   cycle providers (Ctrl on every platform,
//                               matching browser tab switching)
//   Ctrl or Cmd + =, -, 0   zoom in, out, reset
//   Ctrl or Cmd + R         reload the active provider
function resolveAction(input, platform, enabledCount, swappedCtrlAlt = false) {
  if (!input || input.type !== 'keyDown') return 'noop';
  const key = input.key ?? '';
  const control = !!input.control;
  const meta = !!input.meta;
  const shift = !!input.shift;
  const alt = !!input.alt;
  const primary = platform === 'darwin' ? meta : control;

  // Local aliases accommodate an existing Ctrl/Alt swap. They never register
  // global hotkeys or alter the user's keyboard mapping.
  const chatModifier = !meta && ((control && !alt) ||
    (platform === 'win32' && swappedCtrlAlt && alt && !control));
  if (chatModifier || (platform === 'darwin' && meta && !control && !alt)) {
    if ((input.code === 'KeyF' || key.toLowerCase() === 'f') && !shift) return 'find:open';
    const letter = input.code === 'KeyT' ? 't' : input.code === 'KeyN' ? 'n' : input.code === 'KeyW' ? 'w' : key.toLowerCase();
    if (letter === 't' && !shift) return 'chat:new';
    if (letter === 'n' && shift) return 'chat:temporary';
    if (letter === 'w' && !shift) return 'chat:delete';
  }

  if (key === 'Tab' && control && !alt && !meta) {
    return shift ? 'cycle:prev' : 'cycle:next';
  }
  if (!primary || alt) return 'noop';

  // Match digits by physical key position first (input.code), the way
  // Chromium resolves its own tab switch accelerators. On layouts with
  // shifted digits such as AZERTY, input.key is a symbol while the code is
  // still Digit1..Digit9.
  const positional = /^Digit([1-9])$/.exec(input.code ?? '');
  if (!shift && positional) {
    const n = Number(positional[1]);
    return n <= enabledCount ? `switch:${n}` : 'noop';
  }
  if (!shift && /^[1-9]$/.test(key)) {
    const n = Number(key);
    return n <= enabledCount ? `switch:${n}` : 'noop';
  }
  if (key === '=' || key === '+') return 'zoom:in';
  if (key === '-' && !shift) return 'zoom:out';
  if (key === '0' && !shift) return 'zoom:reset';
  if ((key === 'r' || key === 'R') && !shift) return 'reload';
  return 'noop';
}

module.exports = { resolveAction };
