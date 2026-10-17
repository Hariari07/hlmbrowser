# Cloud build report

## Desktop LAN fix — 2026-10-17, version 1.1.1

Windows x64 NSIS, Linux x64 AppImage/DEB and a source ZIP are available under `dist/`, with `SHA256SUMS-1.1.1`. The macOS and Android binaries below remain 1.1.0. This desktop update fixes unconditional denial of Chromium's local-network permissions for approved requesters, and shows blocked API/script origins and network failures in the status bar. The destination allowlist remains enforced.

Validation: 12 policy/store unit tests passed; the real Electron functional test passed automatic cross-origin backend JSON loading, all three LAN permission queries, unrelated permission denial and existing security/functionality checks. The built Linux executable passed LAN permissions, blocked-request status reporting, renderer isolation, request blocking, setup and restart with Chromium sandboxing enabled. The Windows installer compiled with warnings treated as errors; native Windows installation remains untested.

Both supplied LAN addresses were unreachable from this cloud environment (proxy HTTP 403, direct connections failed). The user's Angular application and backend were not tested, and no MySQL data was accessed or changed. This confirms a browser permission defect and its correction; it does not confirm that the live application's missing-data problem is resolved. See [LAN troubleshooting](lan-troubleshooting.md) for configuration and remaining evidence needed.

## Original multi-platform build — 2026-10-15

## Produced

Outputs are under `dist/`. Selected version 1.1.0 distribution packages are tracked through Git LFS, with checksums and update metadata in Git. Older builds and unpacked build working directories remain ignored:

| Artifact | Qualification |
|---|---|
| `HLM Browser Setup 1.1.0.exe` | Unsigned x64 Windows application, standalone NSIS per-user installer; compilation passed with warnings treated as errors. No Windows installation test. |
| `HLM Browser-1.1.0.AppImage` | Linux x64 package; corresponding unpacked executable passed packaged functional checks with Chromium sandbox enabled. |
| `hlm-browser_1.1.0_amd64.deb` | Linux x64 DEB; metadata inspected. Installation on a clean machine remains unrun. |
| `HLM Browser-1.1.0-mac.zip` | Unsigned Intel macOS `.app` bundle, cross-built on Linux. Bundle identity/version inspected; native launch, signing, notarization and Apple Silicon build unrun. |
| `HLM-Browser-1.1.0-debug.apk` | Android debug APK; build and debug-signature verification passed. No emulator/device installation. |
| `HLM-Browser-1.1.0-release-unsigned.apk` | Release APK build passed; requires your own signing key before installation/distribution. |
| `HLM-Browser-1.1.0-source.zip` | Application source, lockfile, Gradle wrapper, tests and documentation. |
| `SHA256SUMS` | Checksums of generated distribution artifacts; checksums are not publisher signatures. |

## Executed checks

- Frozen npm installation and explicit Electron binary installation succeeded. Electron **44.7.2**, Electron Builder **26.15.3**, Node **24.19.0**.
- Desktop policy/store tests: **11 passed**, no failures/skips.
- Desktop functional fixture: **passed** first setup, save/restart, administrator denial/unlock, replacement with confirmation response stubbed, persistent cookies/local storage, approved cross-origin sign-in windows with opener preserved, popup permission revocation, multipart upload, HTTP/Blob downloads with stubbed native save destination, internal routes, blocked external links/pop-ups/redirects/resources, no website native bridge/Node, full-screen switching and network-error UI. Final run kept Chromium sandbox enabled.
- Packaged Linux fixture: **passed** first setup, website loading, resource blocking, renderer isolation and restart with Chromium sandbox enabled.
- Android: **6 policy tests passed**, no failures/errors/skips. Debug and release builds succeeded using SDK 35, JDK 21 and checksum-pinned Gradle 8.13. Lint: **0 errors, 15 warnings** (intentional JavaScript enablement and untranslated UI strings). Release vital lint passed. Debug APK Signature Scheme v2 verified; the release APK is unsigned.
- macOS ZIP integrity/bundle identity inspected (`com.hlm.browser`, version `1.1.0`).
- Repository whitespace check passed. The website frontend was not present or modified. No signing credentials were supplied. The website remains a configurable device setting; the source does not hardcode the user's LAN URL into the application UI.

## Resolved environment failures

Writable npm/Electron caches were configured; Node's supported environment-proxy mode was used. Android SDK caches were redirected to writable locations, and a checksum/signature-verified Debian JDK was installed locally because the base image contained only a JRE. Electron/Gradle/SDK artifact checks and TLS verification remained enabled. Standard Windows installer generation needed unusable Wine runtimes; the included native NSIS fallback produced the installer without Wine. Chromium could not initialize its sandbox inside the nested command sandbox; final GUI validation ran through the supported execution approval mechanism with Chromium sandboxing enabled.

## Remaining gates

This is not full four-platform acceptance. The supplied website is http://192.168.0.127:4200/fbs; the cloud proxy returned 403 for it. Required capabilities are known, but authentication/API/CDN origins are still unspecified and live-site behavior is unverified. Android WebView does not provide complete arbitrary-network origin enforcement; managed network controls or additional engine work is required for that guarantee. Camera/microphone now have IT-controlled HTTPS-only permission flows; hardware capture and OS prompts remain untested. LAN HTTP navigation is supported as requested, but cannot enable camera/microphone APIs. Real-provider authentication, Android pop-ups/downloads, hardware media capture and OS printing need the platform checklist. Windows/macOS native execution, Android device behavior, real upgrades, public-release signing/notarization and actual-site regression checks remain unrun. The added CI workflow has not been executed remotely.

Reusable cloud `install_script` and `start_skill` were saved as a configuration draft. Saving did not publish a snapshot; review/save the settings and publish through the environment UI when ready.

Version 1.1.0 adds developer/IT capability controls, opener-preserving approved pop-ups, native media permission handling, macOS privacy declarations and the LAN IT deployment guide. The website frontend is unchanged. GitHub API release-upload requests were rejected by the environment proxy; source and the build workflow can still be pushed through the existing Git route.
