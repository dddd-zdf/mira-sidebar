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

## Sources inspected

- [Upstream repository](https://github.com/thinkdj/ChatGPT-Desktop-Companion)
- [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron persistent sessions](https://www.electronjs.org/docs/latest/api/session)
- [Tauri webview window API](https://v2.tauri.app/reference/javascript/api/namespacewebviewwindow/)

No official OpenAI documentation found during this task guarantees support for signing in through a third-party embedded browser.
