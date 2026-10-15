# HLM Browser

A dedicated browser with a device-configured website, exact-origin allowlist, persistent settings, and an administrator password. The existing website is loaded directly; no frontend integration or native JavaScript bridge is required.

**Status:** working Electron desktop implementation and a native Android implementation with material limitations. This is not yet a completed four-platform security qualification. Android WebView cannot enforce every network channel; Camera/microphone and approved pop-ups are IT-controlled; media requires HTTPS and OS consent. Native Android permissions, pop-ups and downloads need device testing. The supplied private HTTP site could not be reached through the cloud proxy. See [validation](docs/validation.md) before deployment.

## Architecture

Windows, Linux and macOS share `desktop/`, using Electron's bundled Chromium rather than the user's installed Chrome. A sandboxed `WebContentsView` displays the website. A separate trusted renderer displays setup, administrator settings, loading status and recovery. Only that renderer receives a narrow IPC bridge. The main process owns settings, password verification, navigation and request policy. The UI has no address bar, back or forward controls.

Android uses `android/`, a native Java activity and the system WebView. It shares configuration concepts and acceptance scenarios with desktop rather than sharing engine-specific security code. Native controls stay separate from website content; no JavaScript interface is exposed. See [architecture and trade-offs](docs/architecture.md).

## Desktop development

Prerequisites: Node **24.19.0 or later in Node 24**, npm 11, and a graphical desktop. Linux also needs Electron's standard GTK 3, NSS, GBM, ALSA and X11/Wayland runtime libraries. Use a supported 64-bit OS. Keep Chromium's sandbox enabled; never use `--no-sandbox` to fix deployment.

```sh
npm ci
# Electron 44 uses an explicit binary installation step:
node node_modules/electron/install.js
npm test
npm start
# Under an existing graphical display, or xvfb-run on headless Linux:
npm run test:desktop
```

Corporate proxies: Node 24 supports `NODE_USE_ENV_PROXY=1`; preserve TLS validation and configure a trusted CA through your organization where necessary. Writable cache overrides are `npm_config_cache`, `electron_config_cache` (Electron 44), and `ELECTRON_BUILDER_CACHE`.

### Windows

Run the commands above on Windows, then `npm run dist:windows`. The NSIS installer is written to `dist/HLM Browser Setup 1.1.0.exe`. It supports choosing the installation directory, a desktop shortcut, and launching after installation. The build is unsigned unless your release infrastructure supplies an Authenticode certificate. Windows may show an untrusted-publisher warning for unsigned artifacts. Test installation, upgrade and uninstall on Windows before distributing.

The installer generated in this cloud environment uses the standalone fallback described in [release procedures](docs/releases.md), because Wine could not run. It installs per user in `%LOCALAPPDATA%/Programs/HLM Browser`, provides shortcuts and uninstall, and offers optional launch. It does not offer a directory chooser. It has compiled successfully but has not been installed on Windows.

### Linux

Run `npm run dist:linux`. Outputs: `dist/HLM Browser-1.1.0.AppImage` and `dist/hlm-browser_1.1.0_amd64.deb`.

```sh
chmod +x 'HLM Browser-1.1.0.AppImage'
./'HLM Browser-1.1.0.AppImage'
# Debian/Ubuntu; installing system packages requires administrator privileges:
sudo apt install ./hlm-browser_1.1.0_amd64.deb
```

AppImage may require FUSE 2; where unavailable, extract using `--appimage-extract` and run `squashfs-root/AppRun`. A supported kernel user-namespace sandbox or a correctly installed system sandbox is required. Do not turn the sandbox off. DEB installs the application and desktop entry. Other distributions need compatible GTK/NSS/glibc libraries; these artifacts were built on Debian 13 and are not claimed to support every older distribution.

### macOS

On a Mac with Node 24, run `npm ci`, the explicit Electron installation step, tests and `npm run dist:mac`. DMG and ZIP outputs are written under `dist/`. Build and test separately on Intel and Apple Silicon (`npx electron-builder --mac --arm64` or `--x64`). Distribution requires Apple Developer ID signing and notarization; see [release procedures](docs/releases.md). This Linux environment cannot launch, sign or notarize a macOS app.

An unsigned Intel macOS ZIP containing `HLM Browser.app` was cross-built here using `npx electron-builder --mac zip --x64`. Its bundle metadata was inspected; it has not been launched on macOS. Build Apple Silicon and signed/notarized distribution artifacts on a Mac.

## Android

See [Android build, installation and limitations](docs/android.md). Java 17+, SDK 35 and the checksum-pinned Gradle wrapper are required. `cd android && ./gradlew :app:assembleDebug` builds an installable debug APK; `:app:assembleRelease` builds a release APK, signed only when your own secure signing variables are configured. Never distribute a debug-signed APK as a production release.

## Configure and use

For the supplied LAN site and developer/IT-only URL changes, follow [IT provisioning](docs/it-deployment.md). HTTP is supported for the requested local connectivity test; camera/microphone require HTTPS when used.

First launch asks for an HTTPS URL and a new administrator password of 12–256 characters. Add each needed API, CDN, authentication and embedded-frame origin explicitly, including scheme and non-default port. The configured website's origin is automatically permitted. Wildcards and implicit subdomain approvals are not supported. HTTP requires explicit trusted-development opt-in. Website routes and query strings are permitted within approved origins.

Save opens the website immediately. By default subsequent launches open the saved site automatically. Settings requires the administrator password; replacement asks for confirmation. Replacing the trust configuration clears website storage and sessions on desktop; Android clears cookies and Web Storage. Preferences survive restarts and in-place updates. Full-screen preference and automatic startup are saved in settings. The toolbar/menu provides temporary full-screen switching, printing and exit; desktop remains a normal resizable window when full screen is off.

Keep secrets out of configured URLs: a URL and its query string are persistent configuration. Passwords are hashed; authentication cookies and browser storage belong to the engine's profile, not settings.json. See [security and recovery](docs/security.md) for local protection and kiosk boundaries.

## Troubleshooting

- Blank/incomplete website: approve the exact required resource origins; do not add wildcard rules or bypass TLS. API CORS and cookie rules still apply.
- Authentication fails: permit the identity provider and callback origins. Enable IT-approved pop-ups and explicitly approve the identity-provider and callback origins. Native windows preserve the opener relationship. Android additionally offers an IT-only third-party-cookie setting for embedded authentication. Provider-specific flows still require testing.
- Certificate error: correct the server certificate/trust chain. No ignore-certificate switch is provided.
- Network error: use Retry after restoring connectivity, or open Settings to repair the URL.
- Forgotten administrator password/corrupt configuration: use the documented OS-authorized recovery procedure. There is no website-accessible reset route.
- Camera/microphone: enable each needed device in IT settings, use an approved HTTPS origin, and allow the native/OS permission prompt. Other native device access remains denied. The LAN HTTP URL supports navigation but is not a secure context for media capture.

## Tests and releases

`npm test` runs policy and persistent-store tests. `npm run test:desktop` launches real Electron with local HTTP fixtures and a disposable profile, verifying first setup, restart persistence, cookies/local storage, opener-based sign-in pop-ups, upload/download, IT settings changes, request/navigation blocking, isolation, full screen and network failure. [Manual checklist](docs/validation.md) covers installation, upgrades, platform features and real application compatibility. [Release procedures](docs/releases.md) cover controlled engine updates, signing and rollback. Selected version 1.1.0 distribution packages and checksums are committed under `dist/`; binary packages use Git LFS. Build working directories and dependencies remain ignored. Install Git LFS and run `git lfs pull` after cloning to retrieve the binaries.
