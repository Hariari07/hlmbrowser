'use strict';
const { app, BrowserWindow, WebContentsView, session, ipcMain, dialog, Menu, systemPreferences } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { allowed, validateConfig, mediaAllowed, popupAllowed } = require('./policy.cjs');
const { Store, passwordRecord, verify } = require('./store.cjs');
const primary = app.requestSingleInstanceLock();
if (!primary) app.quit();
let win, view, store, unlocked = false, screen = 'home', message = '', loading = false;
let nextAttempt = 0, saving = false;
const shellURL = pathToFileURL(path.join(__dirname, 'shell.html')).href;
const config = () => store.value?.config;
function state() {
  return { screen, message, loading, configured: !!config(), invalid: store.invalid, unlocked,
    fullscreen: !!win?.isFullScreen(), config: unlocked ? config() : undefined };
}
function update() {
  if (!win || win.isDestroyed()) return;
  if (view) {
    const [width, height] = win.getContentSize();
    view.setBounds({ x: 0, y: 48, width, height: Math.max(0, height - 48) });
    view.setVisible(screen === 'browser');
  }
  win.webContents.send('status', state());
}
function fail(text) { screen = 'error'; message = text; loading = false; update(); }
function loadSite() {
  if (!config()) return;
  unlocked = false; screen = 'browser'; message = ''; loading = true; update();
  view.webContents.loadURL(config().website).catch(() => {});
}
function blocked() { message = 'An unapproved destination was blocked. Ask your administrator to approve the exact origin if needed.'; update(); }
function trusted(event) {
  if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame || event.senderFrame.url !== shellURL) throw new Error('Untrusted caller');
}
app.whenReady().then(async () => {
  if (!primary) return;
  store = new Store(app.getPath('userData'));
  store.load();
  // Corrupt settings fail closed: administrator must recover the file using OS account access.
  screen = store.invalid ? 'recovery' : config() ? 'home' : 'setup';
  const remote = session.fromPartition('persist:hlm-website');
  const websiteContents = new Set(), popupWindows = new Set();
  remote.setPermissionCheckHandler((contents, permission, origin, details) => {
    if (!websiteContents.has(contents) || permission !== 'media' || !allowed(contents.getURL(), config()) || !contents.getURL().startsWith('https:')) return false;
    const types = details.mediaType === 'unknown' || !details.mediaType
      ? [config()?.capabilities.camera && 'video', config()?.capabilities.microphone && 'audio'].filter(Boolean) : [details.mediaType];
    return mediaAllowed(details.securityOrigin ?? origin, types, config());
  });
  remote.setPermissionRequestHandler(async (contents, permission, callback, details) => {
    const before = config();
    const documentURL = contents.getURL();
    const origin = details.securityOrigin ?? details.requestingUrl;
    const permitted = () => !contents.isDestroyed() && websiteContents.has(contents) && before === config() &&
      contents.getURL() === documentURL && documentURL.startsWith('https:') && allowed(documentURL, config()) && mediaAllowed(origin, details.mediaTypes, config());
    if (permission !== 'media' || !permitted()) { callback(false); return; }
    try {
      const answer = await dialog.showMessageBox(BrowserWindow.fromWebContents(contents) ?? win, { type: 'question',
        title: 'Application device access', message: `${new URL(origin).origin} requests ${details.mediaTypes.map(t => t === 'video' ? 'camera' : 'microphone').join(' and ')} access.`,
        buttons: ['Deny', 'Allow this request'], defaultId: 0, cancelId: 0 });
      if (answer.response !== 1 || !permitted()) { callback(false); return; }
      if (process.platform === 'darwin') {
        for (const type of new Set(details.mediaTypes)) {
          if (!(await systemPreferences.askForMediaAccess(type === 'video' ? 'camera' : 'microphone')) || !permitted()) { callback(false); return; }
        }
      }
      callback(permitted());
    } catch { callback(false); }
  });
  remote.setDevicePermissionHandler(() => false);
  remote.on('will-download', async (event, item) => {
    if (!allowed(item.getURL(), config(), true)) { event.preventDefault(); return; }
    // Downloads require an explicit OS file chooser and are never automatically opened.
    const result = dialog.showSaveDialogSync(win, { title: 'Save website download', defaultPath: path.basename(item.getFilename()) });
    if (result) item.setSavePath(result); else item.cancel();
  });
  remote.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !allowed(details.url, config(), true) }));
  remote.on('select-usb-device', event => event.preventDefault());
  remote.on('select-hid-device', event => event.preventDefault());
  win = new BrowserWindow({ width: 1200, height: 800, minWidth: 480, minHeight: 400, title: 'HLM Browser',
    fullscreen: config()?.fullscreen ?? false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, devTools: false }
  });
  Menu.setApplicationMenu(null);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  view = new WebContentsView({ webPreferences: { session: remote, sandbox: true, contextIsolation: true, nodeIntegration: false,
    webSecurity: true, allowRunningInsecureContent: false, devTools: false, navigateOnDragDrop: false, webviewTag: false } });
  win.contentView.addChildView(view);
  const wc = view.webContents;
  wc.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');
  function secureWebsiteContents(target, primaryView = false) {
    websiteContents.add(target);
    target.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');
    target.on('destroyed', () => websiteContents.delete(target));
    for (const name of ['will-navigate', 'will-redirect', 'will-frame-navigate']) target.on(name, (event, url) => {
      const destination = typeof url === 'string' ? url : event.url;
      if (!allowed(destination, config()) && !(destination === 'about:blank' && !primaryView)) { event.preventDefault(); blocked(); }
    });
    target.setWindowOpenHandler(({ url }) => {
      if (!popupAllowed(url, config()) || popupWindows.size >= 5) { blocked(); return { action: 'deny' }; }
      return { action: 'allow', overrideBrowserWindowOptions: { parent: win, width: 640, height: 760, autoHideMenuBar: true,
        webPreferences: { session: remote, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true,
          allowRunningInsecureContent: false, devTools: false, webviewTag: false, navigateOnDragDrop: false } } };
    });
    target.on('did-create-window', child => {
      popupWindows.add(child); child.setMenu(null); secureWebsiteContents(child.webContents);
      child.on('closed', () => popupWindows.delete(child));
    });
    target.on('will-attach-webview', event => event.preventDefault());
    target.on('before-input-event', (event, input) => {
      if (input.key === 'F11') { event.preventDefault(); win.setFullScreen(!win.isFullScreen()); update(); }
      if ((input.alt && ['Left', 'Right'].includes(input.key)) || input.key === 'BrowserBack' || input.key === 'BrowserForward') event.preventDefault();
    });
  }
  secureWebsiteContents(wc, true);
  wc.on('did-start-loading', () => { loading = true; update(); });
  wc.on('did-stop-loading', () => { loading = false; update(); });
  wc.on('did-navigate', (_event, _url, code) => { if (code >= 400) fail(`The server returned HTTP ${code}. Retry or contact your administrator.`); });
  wc.on('did-fail-load', (_event, code, description, _url, mainFrame) => {
    if (mainFrame && code !== -3) fail(`The application could not load (${description}). Check your connection or settings, then retry.`);
  });
  wc.on('render-process-gone', () => fail('The website process stopped. Retry to reload the application.'));
  win.on('resize', update);
  win.on('enter-full-screen', update);
  win.on('leave-full-screen', update);
  win.on('closed', () => { wc.close(); win = null; });
  ipcMain.handle('state', event => { trusted(event); return state(); });
  ipcMain.handle('unlock', async (event, password) => {
    trusted(event);
    if (Date.now() < nextAttempt) return { error: 'Wait a few seconds before trying again.' };
    nextAttempt = Date.now() + 2000;
    if (!(await verify(password, store.value?.admin))) return { error: 'Incorrect administrator password.' };
    unlocked = true; screen = 'setup'; update(); return { ok: true };
  });
  ipcMain.handle('save', async (event, input, password) => {
    trusted(event);
    if (saving) return { error: 'A save is already in progress.' };
    saving = true;
    try {
      if (store.invalid || (store.value && !unlocked)) throw new Error('Administrator authorization required.');
      const next = validateConfig(input);
      const admin = store.value?.admin ?? await passwordRecord(password);
      if (store.value) {
        const result = await dialog.showMessageBox(win, { type: 'question', buttons: ['Cancel', 'Replace settings'], defaultId: 0, cancelId: 0,
          title: 'Confirm settings change', message: 'Replace the configured website and security settings?', detail: next.website });
        if (result.response !== 1) return { error: 'Settings were not changed.' };
      }
      const previous = config();
      for (const popup of popupWindows) popup.destroy();
      // Clear old site data when the trust boundary changes, avoiding cross-configuration sessions.
      if (previous && (previous.website !== next.website || JSON.stringify(previous.origins) !== JSON.stringify(next.origins) || previous.allowHttp !== next.allowHttp)) {
        await wc.loadURL('about:blank');
        await remote.clearStorageData(); await remote.clearCache(); await remote.closeAllConnections();
      }
      store.save({ config: next, admin });
      win.setFullScreen(next.fullscreen); loadSite();
      return { ok: true };
    } catch (e) { return { error: e.message }; } finally { saving = false; }
  });
  ipcMain.handle('action', async (event, action) => {
    trusted(event);
    if (action === 'settings') { unlocked = false; screen = config() ? 'locked' : store.invalid ? 'recovery' : 'setup'; message = ''; update(); }
    if (action === 'open' || action === 'retry') loadSite();
    if (action === 'fullscreen') { win.setFullScreen(!win.isFullScreen()); update(); }
    if (action === 'print' && screen === 'browser') wc.print({}, () => {});
    if (action === 'exit') app.quit();
    return state();
  });
  await win.loadURL(shellURL);
  update();
  if (config()?.autoOpen) loadSite();
});
app.on('window-all-closed', () => app.quit());
