'use strict';

// Only the local main process loads this module. All coordinates passed to
// Windows are physical pixels; Electron's DIP bounds never enter this API.
// https://learn.microsoft.com/en-us/windows/win32/shell/application-desktop-toolbars
function createWindowsAppbar({ win, screen, onError, isAlwaysOnTop }) {
  const koffi = require('koffi');
  const path = require('path');
  const system32 = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32');
  const shell32 = koffi.load(path.join(system32, 'shell32.dll'));
  const user32 = koffi.load(path.join(system32, 'user32.dll'));
  const dwmapi = koffi.load(path.join(system32, 'dwmapi.dll'));
  const getFrame = dwmapi.func('int __stdcall DwmGetWindowAttribute(void *hwnd, uint32_t attribute, void *value, uint32_t size)');
  const message = shell32.func('uintptr_t __stdcall SHAppBarMessage(uint32_t message, void *data)');
  const registerMessage = user32.func('uint32_t __stdcall RegisterWindowMessageW(const char16_t *name)');
  const monitorFromWindow = user32.func('void * __stdcall MonitorFromWindow(void *hwnd, uint32_t flags)');
  const monitorInfo = user32.func('int __stdcall GetMonitorInfoW(void *monitor, void *info)');
  const windowRect = user32.func('int __stdcall GetWindowRect(void *hwnd, void *rect)');
  const setWindowPos = user32.func('int __stdcall SetWindowPos(void *hwnd, void *after, int x, int y, int width, int height, uint32_t flags)');
  const handle = win.getNativeWindowHandle();
  const wide = handle.length === 8;
  const hwnd = wide ? handle.readBigUInt64LE() : BigInt(handle.readUInt32LE());
  const rectOffset = wide ? 24 : 16;
  const callbackOffset = wide ? 16 : 8;
  const dataSize = wide ? 48 : 36;
  const callback = registerMessage('MiraSidebar.AppBar');
  const taskbarCreated = registerMessage('TaskbarCreated');
  if (!callback || !taskbarCreated) throw new Error('Could not register Windows docking messages.');

  let enabled = false;
  let registered = false;
  let disposed = false;
  let busy = false;
  let moving = false;
  let side = 'right';
  let timer = null;
  let lastPosition = null;
  let fullscreen = false;
  const hooks = [];
  const listeners = [];

  function data() {
    const value = Buffer.alloc(dataSize);
    value.writeUInt32LE(dataSize);
    handle.copy(value, wide ? 8 : 4);
    value.writeUInt32LE(callback, callbackOffset);
    value.writeUInt32LE(side === 'left' ? 0 : 2, callbackOffset + 4);
    return value;
  }

  function release() {
    clearTimeout(timer);
    timer = null;
    lastPosition = null;
    if (registered) {
      registered = false;
      message(1, data()); // ABM_REMOVE; never alter global work-area settings.
    }
    if (fullscreen && !win.isDestroyed()) {
      fullscreen = false;
      win.setAlwaysOnTop(isAlwaysOnTop(), 'screen-saver');
    }
  }

  function fail(error) {
    enabled = false;
    release();
    onError(error);
  }

  function schedule() {
    if (disposed || !enabled || moving || timer) return;
    // Never call back into the Shell from inside a window-message hook.
    timer = setTimeout(() => { timer = null; sync(); }, 80);
  }

  function sync() {
    if (disposed || busy || moving) return;
    if (!enabled || !win.isVisible() || win.isMinimized()) { release(); return; }
    busy = true;
    try {
      const info = Buffer.alloc(40); // MONITORINFO, rcMonitor starts at 4.
      info.writeUInt32LE(40);
      const current = Buffer.alloc(16);
      if (!monitorInfo(monitorFromWindow(hwnd, 2), info) || !windowRect(hwnd, current)) {
        throw new Error('Could not read the sidebar monitor.');
      }
      const left = info.readInt32LE(4);
      const top = info.readInt32LE(8);
      const right = info.readInt32LE(12);
      const bottom = info.readInt32LE(16);
      // GetWindowRect includes invisible resize borders. Reserve the visible
      // DWM frame, then let those borders extend beyond the reserved rectangle.
      // Re-measure after every resize/DPI change rather than assuming 9 pixels.
      const frame = Buffer.alloc(16);
      const outerWidth = current.readInt32LE(8) - current.readInt32LE(0);
      const outerHeight = current.readInt32LE(12) - current.readInt32LE(4);
      let inset = [0, 0, 0, 0];
      if (getFrame(hwnd, 9, frame, 16) === 0) { // DWMWA_EXTENDED_FRAME_BOUNDS
        const measured = [
          frame.readInt32LE(0) - current.readInt32LE(0),
          frame.readInt32LE(4) - current.readInt32LE(4),
          current.readInt32LE(8) - frame.readInt32LE(8),
          current.readInt32LE(12) - frame.readInt32LE(12),
        ];
        // DWM can briefly report stale geometry during transitions.
        if (measured.every(value => value >= 0) &&
            measured[0] + measured[2] < outerWidth / 2 &&
            measured[1] + measured[3] < outerHeight / 2) inset = measured;
      }
      const width = Math.max(1, Math.min(outerWidth - inset[0] - inset[2], right - left));
      const value = data();
      if (!registered) {
        if (!message(0, value)) throw new Error('Windows could not reserve space for Mira.'); // ABM_NEW
        registered = true;
      }
      value.writeInt32LE(side === 'left' ? left : right - width, rectOffset);
      value.writeInt32LE(top, rectOffset + 4);
      value.writeInt32LE(side === 'left' ? left + width : right, rectOffset + 8);
      value.writeInt32LE(bottom, rectOffset + 12);
      message(2, value); // ABM_QUERYPOS excludes taskbars and other appbars.
      if (side === 'left') value.writeInt32LE(value.readInt32LE(rectOffset) + width, rectOffset + 8);
      else value.writeInt32LE(value.readInt32LE(rectOffset + 8) - width, rectOffset);
      const proposed = `${side}:${value.subarray(rectOffset, rectOffset + 16).toString('hex')}`;
      // Work-area changes caused by our own reservation must not form a loop.
      if (proposed !== lastPosition) {
        message(3, value); // ABM_SETPOS may adjust the proposed rectangle again.
        lastPosition = `${side}:${value.subarray(rectOffset, rectOffset + 16).toString('hex')}`;
      }
      const x = value.readInt32LE(rectOffset);
      const y = value.readInt32LE(rectOffset + 4);
      const w = value.readInt32LE(rectOffset + 8) - x;
      const h = value.readInt32LE(rectOffset + 12) - y;
      if (w <= 0 || h <= 0) throw new Error('There is no space available on this monitor.');
      const outerX = x - inset[0];
      const outerY = y - inset[1];
      const desiredWidth = w + inset[0] + inset[2];
      const desiredHeight = h + inset[1] + inset[3];
      if (current.readInt32LE(0) !== outerX || current.readInt32LE(4) !== outerY ||
          outerWidth !== desiredWidth || outerHeight !== desiredHeight) {
        if (!setWindowPos(hwnd, null, outerX, outerY, desiredWidth, desiredHeight, 0x14)) { // NOZORDER | NOACTIVATE
          throw new Error('Windows could not position Mira.');
        }
      }
    } catch (error) { fail(error); }
    finally { busy = false; }
  }

  function hook(id, fn) {
    win.hookWindowMessage(id, fn);
    hooks.push(id);
  }
  function listen(target, name, fn) {
    target.on(name, fn);
    listeners.push([target, name, fn]);
  }
  function notify(kind, active = false) {
    setImmediate(() => {
      if (!registered || disposed || win.isDestroyed()) return;
      const value = data();
      value.writeInt32LE(active ? 1 : 0, wide ? 40 : 32);
      message(kind, value);
    });
  }

  hook(callback, (wParam, lParam) => {
    const notification = wParam.readUInt32LE();
    if (notification === 1) schedule(); // ABN_POSCHANGED
    if (notification === 2) { // ABN_FULLSCREENAPP
      const opening = lParam.readUInt32LE() !== 0;
      setImmediate(() => {
        if (!registered || disposed || win.isDestroyed()) return;
        fullscreen = opening;
        win.setAlwaysOnTop(opening ? false : isAlwaysOnTop(), 'screen-saver');
        if (opening) setWindowPos(hwnd, 1n, 0, 0, 0, 0, 0x13); // HWND_BOTTOM; no activation/move/size
      });
    }
  });
  hook(taskbarCreated, () => {
    registered = false;
    lastPosition = null;
    schedule(); // Explorer restart loses AppBar registrations.
  });
  hook(0x0006, wParam => notify(6, (wParam.readUInt32LE() & 0xffff) !== 0)); // WM_ACTIVATE
  hook(0x0047, () => notify(9)); // WM_WINDOWPOSCHANGED
  hook(0x0231, () => { moving = true; }); // WM_ENTERSIZEMOVE
  hook(0x0232, () => { moving = false; schedule(); }); // WM_EXITSIZEMOVE
  listen(win, 'show', schedule);
  listen(win, 'restore', schedule);
  listen(win, 'hide', release);
  listen(win, 'minimize', release);
  listen(screen, 'display-added', schedule);
  listen(screen, 'display-removed', schedule);
  listen(screen, 'display-metrics-changed', schedule);

  return {
    configure(nextEnabled, nextSide) {
      enabled = !!nextEnabled;
      side = nextSide === 'left' ? 'left' : 'right';
      if (!enabled) release();
      else sync();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      release();
      for (const [target, name, fn] of listeners) target.removeListener(name, fn);
      if (!win.isDestroyed()) for (const id of hooks) win.unhookWindowMessage(id);
    },
  };
}

module.exports = { createWindowsAppbar };
