# Mira Sidebar

Based on [ChatGPT Desktop Companion by thinkdj](https://github.com/thinkdj/ChatGPT-Desktop-Companion). Mira Sidebar adapts that project's Electron sidebar, with the original GPL-3.0 license preserved. See [attribution and modification details](NOTICE.md).

A slim Windows sidebar containing the real ChatGPT website. Press **Ctrl+Space** to show it, and press it again to hide it. Sign in directly on ChatGPT once; its embedded browser profile persists across restarts.

## Run the built Windows app

1. Run **dist/Mira Sidebar Setup 1.0.0.exe** for a per-user install, or run **dist/win-unpacked/Mira Sidebar.exe** directly. Keep the whole win-unpacked folder together.
2. Mira starts hidden. Find its lavender M icon in the Windows system tray (possibly under the ^ overflow), or press **Ctrl+Space**.
3. Sign in on the ChatGPT page yourself. Mira does not import your Chrome or official desktop-app session.
4. Use the title-strip menu or right-click the tray icon for **Mira Settings**, docking, reload, and quit.

The local build is unsigned. No signing certificate or publisher identity was supplied. Launch at login is off until you enable it. Prefer the installed version before enabling it; moving the unpacked folder breaks its startup path.

## Controls

| Action | Control |
| --- | --- |
| Show / hide | Ctrl+Space or tray-icon click |
| Switch to Mira while visible | Alt+Tab or its Windows taskbar button; hidden Mira is summoned with Ctrl+Space |
| Fresh chat (inside Mira) | Ctrl+T |
| Temporary chat (inside Mira) | Ctrl+Shift+N |
| Delete current saved chat (inside Mira) | Ctrl+W; ChatGPT asks for confirmation |
| Change global hotkey | Mira Settings > Global shortcut > Save settings |
| Shortcut collision | Startup tries Ctrl+Shift+Space; the actual chord appears in the menu and title strip. If both are occupied, use the tray. |
| Keep previous shortcut after rejected change | Automatic; settings explains the conflict |
| Dock left / right | Mira menu > Dock Left / Dock Right |
| Make other windows fit beside Mira | Drag another window to the top edge to maximize it on Mira's monitor (Windows only) |
| Resize width | Drag a window edge; minimum width is 420 logical pixels |
| Move to another monitor | Drag the Mira title strip, then dock on that display |
| Always on top | Enabled by default; change in settings/menu |
| Hide when switching apps | Optional in settings/menu; off by default |
| Start hidden | On by default; adjustable in settings/menu |
| Launch at Windows login | Settings/menu in the built app; optional, always launches hidden |
| Reload ChatGPT | Reload button or Ctrl+R |
| Page zoom | Ctrl++ / Ctrl+- / Ctrl+0 |
| Hide without quitting | Title-strip X, Alt+F4, or hotkey |
| Quit completely | Mira menu > Quit |

ChatGPT remains alive while hidden, so a draft or in-progress response survives ordinary show/hide. Window position and size are saved with a short debounce and at exit. Monitor removal brings the window back onto an available display. Windows scaling may round bounds by one or two logical pixels.

## Development on Windows

### Windows space reservation

Mira opens as an overlay. With **Fit Beside Top-Edge Maximize** enabled in its menu (the default), drag another window to the top edge of Mira's monitor and release it to maximize. Mira then reserves its width, allowing the maximized window to fit beside it. Choose **Dock Left** or **Dock Right** to select Mira's side.

The reservation is released when that window is restored, minimized, closed, hidden, or moved to another monitor, or when Mira is hidden or the option is disabled. Showing Mira again starts as an overlay. Clicking a maximize button, using Win+Up, opening an already-maximized window, F11 fullscreen, and partial Snap layouts do not trigger this mode.

Windows finishes its maximize operation before Mira reserves space, so a brief resize may be visible. Width changes update the reservation when you finish dragging Mira's edge. Hide on Focus Loss is suspended during the drag and while space is reserved. This uses a local Windows event hook and AppBar APIs; it does not change PowerToys settings or access other windows' content. Live validation is pending at the user's request.

### Build from source

Requires Node.js 22 or newer, npm, and internet access. No Rust, Visual Studio build tools, API key, or developer account is required for this Electron build.

From this project directory in PowerShell:

```powershell
npm.cmd ci
npm.cmd start
# To show immediately during development:
npm.cmd start -- --show
npm.cmd test
npm.cmd run build:win
```

If your npm policy skips dependency install scripts, run `node node_modules/electron/install.js` before starting. This fetches the pinned Electron runtime. The installer is generated under dist. There is no update server or automatic updater; rebuild with a supported Electron release when maintaining this app.

## Session and settings

Normal profile: **%APPDATA%/Mira Sidebar/**. Settings are in config.json; the persistent ChatGPT web session lives under its Partitions directory. Do not share this folder. The executable/source contains no account data. Sign out through ChatGPT to sign out of this embedded session. Uninstalling may retain the profile for reinstall continuity.

Use Settings for common options. Advanced JSON editing is available from Edit Config, then Reload Config. A malformed JSON file falls back to defaults. Preferred hotkey and active fallback can differ when another app owns the preferred chord. Windows input-method shortcuts can also interact with Ctrl+Space; choose Ctrl+Shift+Space if needed.

## Compatibility limits

This loads chatgpt.com directly and preserves the website rather than recreating its features through an API. Features depend on your ChatGPT account and the website's support for embedded Chromium. It does not add the native ChatGPT desktop app's computer-control integrations, Chrome extensions, or local MCP connections.

Google/Apple/Microsoft sign-in, passkeys, SSO policies, or Cloudflare checks can reject embedded browsers. Mira cannot guarantee they work and does not bypass them. If a provider offers another normal sign-in method, use that on the page yourself. Open in Browser opens the site in your default browser but does not transfer a login back to Mira.

File inputs use the normal embedded browser picker. Downloads use a save dialog. Microphone/camera and notifications prompt before access. Screen sharing and all account-only features have not been validated. See TEST-RESULTS.md for exactly what was tested locally.

## Source and license

Adapted from [thinkdj/ChatGPT-Desktop-Companion](https://github.com/thinkdj/ChatGPT-Desktop-Companion), with its [GPL-3.0 license](LICENSE) retained. See [NOTICE.md](NOTICE.md) for the pinned upstream commit and modifications, and [ARCHITECTURE.md](ARCHITECTURE.md) for the Electron/Tauri decision and security boundaries.
