# Architecture decision

## Existing project inspection

Inspected thinkdj/ChatGPT-Desktop-Companion at commit 2904515a930ba1d517ceef640bbaa4f7bca030b4, including main process, remote views, session policy, config, tray, layout and tests. It offers a useful maintained shell and no production npm dependencies. Ace's custom chat/API surface does not fit the requested embedded-web-session design.

## Electron for this build

Tauri is smaller and remains the preferred candidate for a later native shell. This build adapts the existing Electron project because its separate WebContentsView and native popup/session routing provide a concrete, inspectable implementation for preserving the actual site's browser behavior, including same-session OAuth child windows. A Tauri rewrite would need that Windows WebView2 popup and permission handling implemented and separately validated. Rust is not installed on the inspected machine.

This is an engineering tradeoff for the working v1, not evidence that Electron can bypass provider restrictions or that Tauri cannot authenticate. No comparative login test was performed. Electron bundles Chromium, so disk size and memory use are higher than Tauri. Only ChatGPT is enabled and loaded by default. The renderer stays alive when hidden, preserving drafts and streaming responses during the app's lifetime.

## Trust boundaries

- Main process owns windows, tray, shortcuts, settings and startup integration.
- Tiny local title strip and settings page have constrained preload interfaces. IPC verifies the sending webContents and main frame; remote pages have no preload, Node integration, or native IPC bridge.
- Remote ChatGPT uses a sandboxed, isolated WebContentsView with persistent `persist:provider-chatgpt` storage. Login is handled entirely by the website. No token extraction, credential interception, cookie import/export or API client exists in production code.
- OAuth children inherit the same partition. Other external links open in the default browser. Redirect chains remain browser-handled, with unsafe schemes denied. Permissions are restricted to the exact ChatGPT origin. Microphone/camera and notifications require an explicit native prompt; arbitrary device permissions are denied.
- Downloads use Chromium's save dialog and are never automatically opened. Standard file inputs remain browser-managed. TLS validation and web security remain enabled.
- The development smoke harness uses a reserved .invalid-domain synthetic cookie in a separate test profile. The harness is excluded from packaged files.

## Windows docking

The `arrangementMode` setting is normal, adaptive (default), or always-reserve. Normal never registers an AppBar; Always reserve registers while visible. Adaptive uses the watcher described below. Always on Top is independent. `windows-maximize-watcher.js` observes EVENT_SYSTEM_MOVESIZESTART/END with an out-of-context WinEvent hook that excludes Mira's own process. After a drag ends at the top edge on Mira's monitor, it waits up to one second for IsZoomed to confirm native maximization. Only then does it activate `windows-appbar.js`. No window content, keyboard events, or credentials are read. The watcher polls only the tracked maximized window every 300 ms to release the reservation when it is restored, hidden, minimized, closed, or changes monitors. Pending work is canceled on hide and shutdown; the native hook and Koffi callback are unregistered on exit.

Koffi 3.2.1 calls system User32/Shell32 libraries. ABM_NEW/QUERYPOS/SETPOS reserve space; ABM_REMOVE releases it. The previous autoFitOnMaximize and reserveSpace flags no longer control docking. Mode changes reset pending watcher state and apply the new reservation immediately. F11 and maximize-button actions do not trigger this gesture-based mode. There is no global work-area override or PowerToys configuration change.

Native monitor/window rectangles and positioning use physical pixels throughout to avoid mixing Windows pixels with Electron DIP coordinates. Message hooks defer Shell calls; position caching prevents feedback loops from our own work-area notifications. Interactive moves/resizes settle before repositioning. Explorer's `TaskbarCreated` message re-registers a visible dock; display changes renegotiate the rectangle. Native API failures disable the option and report an error in the sidebar. The prior overlay path remains the default. Live validation is pending at the user's request.

## Sources inspected

- [Upstream repository](https://github.com/thinkdj/ChatGPT-Desktop-Companion)
- [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron persistent sessions](https://www.electronjs.org/docs/latest/api/session)
- [Tauri webview window API](https://v2.tauri.app/reference/javascript/api/namespacewebviewwindow/)

No official OpenAI documentation found during this task guarantees support for signing in through a third-party embedded browser.
