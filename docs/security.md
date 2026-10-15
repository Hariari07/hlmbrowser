# Configuration, security and recovery

## Persistent state

Desktop uses Electron `app.getPath('userData')`: normally `%APPDATA%/HLM Browser` on Windows, `$XDG_CONFIG_HOME/HLM Browser` (or `~/.config/HLM Browser`) on Linux, and `~/Library/Application Support/HLM Browser` on macOS. `settings.json` stores schema version, URL, exact additional origins, HTTP opt-in, full-screen preference, auto-open preference and a salted scrypt administrator password hash. POSIX files are mode 0600 and created directories mode 0700; Windows relies on the user profile's inherited ACL. Website storage lives in the persistent `hlm-website` session partition. This is not a custom password vault.

Android stores configuration in app-private `files/settings.json` using AtomicFile, with a random salt and PBKDF2-HMAC-SHA256 (210,000 iterations) administrator hash. Backups are disabled. WebView owns website cookies and storage. Configuration is validated again after every launch. Package identity must remain `com.hlm.browser`, and upgrades must use the same signing key to retain private storage.

There are no plaintext passwords/session tokens in configuration. URLs are configuration, not secrets; never embed credentials or bearer tokens in them. A user-supplied website can still store sensitive material using normal browser facilities. Disk encryption, strong OS accounts, appropriate session expiration and device management remain deployment responsibilities.

Version 1.1 adds validated, default-off `capabilities.camera`, `capabilities.microphone` and `capabilities.popups`. Android also stores `capabilities.thirdPartyCookies`. These flags use the same password-protected, confirmed settings transaction as the URL. Existing version-1 configuration remains readable, with absent capabilities disabled. Updating the application does not choose a new URL or administrator password. See [IT provisioning](it-deployment.md).

## Enforcement

Only complete HTTP(S) origins are permitted. HTTPS is default; HTTP must be explicitly enabled. Requests to unapproved origins, including subdomains or different ports, are rejected. Desktop also checks navigations, frame navigations, redirects and pop-ups. The remote renderer has no Node integration or native preload, devtools are disabled, TLS verification is retained, and camera/microphone permissions default off and require IT opt-in, approved HTTPS requesting/top-level origins and native/OS consent; other native device permissions remain denied. File chooser access is user-mediated. Downloads are never executed automatically. Website code cannot call administrative IPC; sender and main-frame identity are checked. Administrator unlock attempts are rate-limited. Closing/reopening Settings relocks it; saving returns to the website and clears the unlocked state.

First setup claims administration for the current local profile. An attacker with control of that OS account can alter files, launch a different browser, modify the app or erase its profile. A password screen cannot defend against this. Provision the first run before handing over the device and use OS management to prevent local tampering or clearing app data. Corrupt settings fail closed and do not silently reset the administrator password.

This is an application browser restriction, not a network firewall. Engine internals, DNS, WebRTC and platform traffic are not guaranteed isolated by an application URL allowlist. In particular, Android WebView interception does not cover every resource redirect, WebSocket or data/blob request. Strict prevention of every unapproved network destination requires deployment-level egress controls or additional engine work. Do not deploy the Android build as though this requirement has passed.

## Recovery

- Inaccessible but valid URL: open Settings, authenticate, repair URL/origins and confirm. Retry keeps the existing configuration.
- Forgotten password: an authorized OS/device administrator must close HLM Browser, back up its profile, and remove `settings.json` (desktop) or clear app storage through managed Android settings. Re-provision while the device is under administrator control. Clearing storage deletes website sessions and preferences.
- Corrupt file: back it up, repair from a known-good copy or perform the same controlled reset. Do not expose a website-triggered recovery/reset endpoint.

Application updates replace binaries, not profiles. Trust-configuration changes intentionally clear website sessions on desktop. Android clears cookies/Web Storage; its cache and service-worker management are less comprehensive and require additional review before a strict multi-tenant deployment.
