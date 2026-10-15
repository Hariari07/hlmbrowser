# Developer / IT provisioning for local testing

The supplied application URL is **http://192.168.0.127:4200/fbs**. It is a device setting, not a hardcoded frontend URL. Only developer/IT staff should perform first setup and retain the administrator password.

1. Install HLM Browser on a device that can reach `192.168.0.127:4200` on your LAN. Check the web server's LAN binding and firewall. The cloud proxy returned HTTP 403 for this address, so its actual response has not been tested here.
2. During first setup enter `http://192.168.0.127:4200/fbs`, enable **Allow HTTP for trusted internal/development sites**, and create a unique administrator password. Do not give that password to end users. The automatically approved origin is `http://192.168.0.127:4200`; all its paths are allowed, including `/fbs` and application routes.
3. Enable sign-in/application pop-ups if required. Add each authentication provider, API, CDN or WebSocket endpoint's exact HTTP(S) origin only after identifying it. Different ports, hosts and subdomains require separate approval. Do not add wildcard destinations. Android embedded authentication may also need the IT setting for third-party cookies.
4. Save and verify the app opens. Restart and reboot to verify persistence. Hand the device to end users only after provisioning. End users can use the application, file pickers, printing and exit controls. Changing URL, origins or capabilities requires the administrator password and confirmation.
5. To change the site later, developer/IT opens Settings, authenticates, edits the URL/allowlist and confirms replacement. No rebuild is needed. Normal in-place updates preserve URL and password. Trust-setting changes deliberately clear website sessions.

## Camera and microphone

HTTP is acceptable for the current navigation/connectivity test. It does **not** make this LAN page a secure context. LAN HTTP pages normally cannot use `getUserMedia`, even if IT enables camera/microphone and the OS grants permission. No insecure-origin or certificate bypass has been added.

When media capture is needed, serve the application through an HTTPS address with a certificate trusted by each device. Configure that address through IT settings, separately enable camera and/or microphone, and approve native/OS prompts. Windows privacy settings, macOS entitlements/privacy prompts, Android runtime permissions and actual hardware need platform testing. The browser does not install certificates or modify the website frontend.

## Local tamper resistance

The application checks the administrator password before settings changes. It cannot determine company employment or stop an OS account owner from deleting its profile, clearing Android app storage, patching binaries or installing another browser. Use managed OS accounts/MDM/kiosk policy to prevent these operations. Protect first-run handover and recovery; there is no shared default password or public reset button.

Before rollout, check login/logout, session persistence, uploads/downloads, printing, pop-up return to the opener, offline retry and ordinary-user settings denial. Android still requires managed egress controls or additional engine work for strict isolation of every network channel.
