'use strict';
// Register first so a conflict cannot strand a running sidebar.
function bindHotkey(shortcuts, requested, current, toggle) {
  if (requested === current && shortcuts.isRegistered(current)) return { ok: true, active: current };
  let ok = false;
  try { ok = shortcuts.register(requested, toggle); } catch { /* invalid accelerator */ }
  if (!ok) return { ok: false, active: current };
  if (current && current !== requested) shortcuts.unregister(current);
  return { ok: true, active: requested };
}
module.exports = { bindHotkey };
