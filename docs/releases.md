# Build, update and release

Desktop release commands are in the README. Build Windows installers on Windows for native installation/signing validation, Linux packages on the oldest supported Linux baseline, and macOS artifacts on a Mac for both supported CPU architectures. Cross-generated Windows packages still need Windows installation testing.

1. Inventory the actual site's permitted origins and required capabilities. Keep a staging tenant with realistic authentication, upload/download, printing and offline/error scenarios.
2. Update the pinned Electron version and lockfile in a reviewed change. Run `node node_modules/electron/install.js` after `npm ci`. Electron updates bundle Chromium security fixes independently of the installed Chrome. Rebuild all desktop packages when updating Electron; an application code-only update does not patch an older embedded runtime.
3. Run automated tests and the manual checklist on each OS/architecture. Maintain an internal test ring; do not freeze a vulnerable engine to avoid testing. Android WebView patches must be tested through managed OS/provider channels.
4. Increment application version (and Android versionCode), generate packages and record SHA-256 checksums and exact tool/engine versions. Preserve app ID, product name, profile location and signing identity across updates.
5. Sign Windows with your organization's Authenticode certificate in release infrastructure. For Electron Builder, use the supported `CSC_LINK`/`CSC_KEY_PASSWORD` or your managed signing provider. Verify signatures on Windows. Do not put signing credentials in source/configuration.
6. On macOS use Developer ID Application signing, Electron Builder hardened-runtime defaults and current recommended Electron entitlements. Supply Apple notarization credentials securely via Electron Builder's supported notarization environment configuration (`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, or an App Store Connect API key). Notarize/staple and verify with `codesign --verify --deep --strict` and `spctl --assess`. Test downloaded artifacts through Gatekeeper; unsigned artifacts are not public-distribution ready.
7. Sign Android using your own keystore as documented. Keep the keystore and aliases stable across upgrades. Test `adb install -r` retains settings and sessions as expected.
8. Upgrade over the previous package without deleting the user profile. Confirm saved URL and administrator protection. If a release fails, restore a signed known-good package and a compatible profile backup while planning a patched release. Do not silently downgrade schema or Chromium profiles.

There is no automatic update service in this implementation. Distribute reviewed signed installers/packages using managed software deployment or a trusted download channel. Application artifacts generated in development are unsigned unless release signing was explicitly configured. Publication, signatures, notarization, app-store approval and production website compatibility have not been established by a local build.

## Linux-hosted Windows installer fallback

Electron Builder's normal NSIS target needs Wine on Linux to generate/sign its uninstaller. Both its bundled Wine 11 runtime and a relocated Debian Wine runtime failed to initialize in this environment. No incomplete intermediate installer should be distributed. The supplied fallback generates an uninstaller during installation with standard NSIS `WriteUninstaller`, avoiding Wine at build time:

```sh
npx electron-builder --win --dir
# With a verified NSIS compiler on PATH (makensis):
makensis -WX -V2 \
  "-DAPP_DIR=$(pwd)/dist/win-unpacked" \
  "-DOUTPUT_FILE=$(pwd)/dist/HLM Browser Setup 1.1.0.exe" \
  scripts/windows-installer.nsi
```

NSIS 3.0.4.1 from Electron Builder's checksum-verified tool cache was used for the cloud artifact. The standalone script installs to a fixed per-user directory, writes shortcuts and the uninstall registry entry, leaves the profile intact and offers optional launch. Close the application before installing/upgrading. Keep its version fields synchronized with package.json for future releases. Native Windows installation, upgrade, uninstall and Authenticode verification remain release gates. The CI workflow builds the normal Electron Builder installer on Windows instead.
