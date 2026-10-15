# Architecture and technology decision

The repository began with only a README. The website is hosted separately at http://192.168.0.127:4200/fbs and needs authentication, cookies/local storage, files, printing, pop-ups and media capabilities. No website source or additional authentication/API/CDN origin inventory is available. The host is implemented independently; the existing web frontend has not been changed. The private site could not be reached through the cloud proxy.

## Engine evaluation

| Option | Benefit | Trade-off |
|---|---|---|
| Electron desktop | Same bundled Chromium on Windows/Linux/macOS; controllable application/engine releases; mature network interception and packaging | Large packages; security patch releases must be shipped promptly; no Android support |
| Windows WebView2 | Supported Windows integration, smaller host, evergreen security patches | Windows only; evergreen engine updates outside application releases, or additional fixed-runtime servicing responsibility |
| Tauri/system WebViews | Small shared shell; WebView2 on Windows and WebKit on macOS/Linux | Different rendering behavior and request-interception capabilities across engines; strict origin/resource enforcement needs substantial native platform work |
| Qt WebEngine | Shared desktop Chromium engine and native widgets | Larger native build toolchain; Qt WebEngine is not an Android WebView solution |
| Android WebView | Platform-supported rendering, cookies and mobile lifecycle integration | OS/provider-controlled engine updates; incomplete interception of WebSockets, redirects in resource loaders and other channels |

Electron plus native Android WebView is the implemented choice. It reduces desktop dependence on installed Chrome and avoids pretending a uniform WebView API supplies identical security guarantees. A strict Android deployment needs managed-device/network enforcement or a separately evaluated engine with comprehensive request controls. That remains required work for the full specification.

## Boundaries

- `desktop/policy.cjs`: strict URL/configuration validation, exact-origin checks and HTTP opt-in. WebSocket resource origins map to their HTTP(S) equivalents.
- `desktop/store.cjs`: scrypt password records and atomic, restrictive-permission configuration writes.
- `desktop/main.cjs`: trusted IPC sender checks; remote renderer sandbox, request/navigation filtering, scoped media permission handling, approved native pop-ups, download confirmation, settings transactions and engine profile.
- `desktop/shell.*`: trusted configuration UI; CSP disallows network access and inline code. The website never receives this preload.
- `android/.../Policy.java`: pure-Java URL/origin policy.
- `android/.../MainActivity.java`: native configuration and password screens, private AtomicFile storage, WebView restrictions, lifecycle, file selection and print adapter.

The policy permits origins, not URL path sandboxes. Any route within an approved origin is trusted. Both outgoing APIs and authentication providers must be inventoried before deployment. Full screen is a display preference; use Assigned Access/MDM, managed Linux sessions or Android lock-task provisioning for an OS-enforced kiosk. The app intentionally provides an exit mechanism.

## Capability compatibility

| Capability | Desktop | Android |
|---|---|---|
| Cookies, local storage, forms, SPA routes | Engine-supported within allowlist | Engine-supported; third-party cookies default off, with IT opt-in |
| File uploads | Engine file chooser | System document picker; user-selected files only |
| Downloads | HTTP(S) and approved-origin Blob downloads use explicit save dialog; never auto-opened | Native HTTP(S) streaming with consent and redirect checks; device testing pending |
| Printing | Toolbar opens engine/OS print UI | Android print adapter |
| Pop-ups | IT-approved native windows with opener preserved; all child navigation remains filtered | IT-approved native WebView dialogs with opener preserved; device qualification pending |
| Camera and microphone | IT opt-in, approved HTTPS origins, native consent and macOS privacy flow | IT opt-in, approved HTTPS origins, native consent and runtime Android permissions |
| Geolocation, USB/HID and other devices | Denied | Denied |
| Strict arbitrary-network isolation | App-level request and navigation controls; OS firewall required for absolute isolation | Incomplete with WebView alone; requires additional controls |
| Responsive website | Resizable viewport | Touch and orientation changes; website must itself support responsive layout |

A browser cannot make a fixed-width website responsive without altering its presentation. Existing rendering bugs and provider-specific authentication behavior cannot be promised away. Add any native capability only after identifying the actual site's requirement, limiting it to approved requesting origins, and testing the OS permission path.
