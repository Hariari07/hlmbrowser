# Android

The native Android app uses system Android WebView, minimum Android 8 (API 26), target/compile SDK 35. Java source uses Java 17. No website/native JavaScript bridge is installed. TLS errors are always canceled. The manifest permits cleartext at the transport layer only so the explicit, default-off HTTP policy can work; it does not automatically approve HTTP origins.

## Build and installation

Install JDK 17 or 21 and Android SDK command-line tools. Configure `ANDROID_HOME` to your SDK. Review and accept Google's SDK licenses, then install:

```sh
sdkmanager 'platforms;android-35' 'build-tools;35.0.0' 'platform-tools'
cd android
./gradlew :app:assembleDebug :app:testDebugUnitTest :app:lintDebug
# Windows: gradlew.bat :app:assembleDebug :app:testDebugUnitTest :app:lintDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

The wrapper pins Gradle 8.13 and verifies its distribution SHA-256. Android Gradle Plugin is pinned to 8.10.1. Java dependencies come from Google's Maven repository and Maven Central. Do not disable TLS or Gradle verification to fix proxy problems. Android Studio can import the `android` directory.

For a release, provide your own keystore securely using `HLM_KEYSTORE` (absolute path), `HLM_STORE_PASSWORD`, `HLM_KEY_ALIAS` and `HLM_KEY_PASSWORD`. Do not commit these values or the keystore. Run `./gradlew :app:assembleRelease`; the result is under `app/build/outputs/apk/release/`. Without signing variables the release APK is unsigned and cannot be installed as a signed release. Verify with `apksigner verify --verbose` and test upgrades using the same key. Back up that key outside the repository.

## Known required work

This source is buildable, but its full security and functional acceptance is not complete:

- WebView's request interceptor cannot enforce an origin allowlist for all channels. Navigation checks and resource interception are defense in depth, not complete network isolation. Use a managed network policy or evaluate an alternate engine before claiming strict enforcement. See [Android WebViewClient](https://developer.android.com/reference/android/webkit/WebViewClient#shouldInterceptRequest(android.webkit.WebView,%20android.webkit.WebResourceRequest)).
- IT can enable native pop-up WebViews (maximum five), all using the same navigation/request policy. The opener is preserved. Embedded third-party cookies require a separate explicit IT opt-in. Real-provider/device regression tests remain required.
- HTTP(S) downloads use an explicit system document destination, WebView cookies and per-redirect origin validation. Blob downloads, HTTP authentication/client-certificate downloads and download resumption are unsupported. Device testing is still required.
- Camera and microphone are separately controlled in IT settings, require approved HTTPS requesting/top-level origins, a native confirmation, and Android runtime permission. HTTP LAN pages remain ineligible for capture. Geolocation and external application launches remain denied.
- Service worker caches and all engine-specific persistence need additional trust-transition review. Cookies and Web Storage are cleared when settings change.
- Touch, file chooser, printing, OS process death, rotation, APK installation and upgrade need emulator/device testing. No physical device is connected in this environment.
- Target SDK 35 is a pinned build baseline, not a promise of current Play Store eligibility. Check current store target SDK, privacy, signing and distribution requirements before Play publication.

WebView's engine is managed by Android's system/provider updates; the app does not freeze it. Use a managed device test ring and promptly apply security fixes. Immersive full screen is reversible with OS gestures; lock-task kiosk enforcement requires device-owner/MDM provisioning.
