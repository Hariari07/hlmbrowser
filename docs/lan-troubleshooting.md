# Desktop LAN API troubleshooting — 1.1.1

The supplied frontend is `http://192.168.0.127:4200/fbs`; its backend is `http://172.21.17.75:7896`. HLM's desktop permission handler previously denied all Chromium local-network permissions. Approving an origin in the request allowlist did not grant this separate browser permission. This can prevent LAN requests before a backend receives them.

Version 1.1.1 grants `local-network`, `local-network-access`, and `loopback-network` permissions only to approved requesting frames within an approved website window. Each network destination still has to pass the exact-origin request allowlist. Other permissions, CORS, TLS validation, renderer isolation, and the HTTPS requirement for media are unchanged. There is no need to disable browser security or allow every origin.

## Install and configure

1. Exit all HLM instances and install the 1.1.1 desktop package. Windows and Linux packages are included; the existing macOS and Android packages remain 1.1.0 and do not include this desktop fix.
2. Unlock Settings using the existing administrator password. Profiles and passwords are retained by the Windows installer.
3. Set Website URL to `http://192.168.0.127:4200/fbs`, enable trusted HTTP, and add `http://172.21.17.75:7896` under additional approved origins. Include any other actual authentication, API, CDN or WebSocket origins separately.
4. Save and sign in within HLM. Changing the website or origin list clears the old website session; Chrome's login session is separate from HLM's.
5. Reload and watch the status bar. Blocked API, script and WebSocket requests now show their origin. Transport errors show the origin and Chromium error code. Paths, query strings, headers and response bodies are not displayed.

If records remain absent, record the status message and check the backend's access logs while reloading. An HTTP response with no records, an expired login, or a frontend initialization problem requires evidence from the running application; this patch cannot prove those are resolved.

## Verification and limits

Before the change, a real Electron fixture returned `denied` for all three local-network permission queries. After the change, the same queries return `granted` for the approved site, while geolocation remains denied. The startup fixture automatically fetches and displays JSON in application state from a separately approved backend origin. Existing tests continue to verify that unapproved fetches, images, links, redirects and pop-ups never reach the forbidden fixture server. Unit tests also cover unapproved requesters, missing settings and unapproved backend ports.

The cloud proxy returned HTTP 403 for both supplied private addresses; direct requests without the proxy could not connect. Consequently the user's Angular application and MySQL-backed endpoint were not tested, and no database records were read or changed. The endpoint path, authentication behavior and live response remain unknown. Local fixtures verify browser behavior, not live-site acceptance. Windows packages are unsigned and cross-built; native Windows installation and LAN application testing remain required.
