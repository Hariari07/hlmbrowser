// Run under a display (xvfb-run on headless Linux). Uses only local fixtures and an isolated profile.
const { _electron: electron } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { once } = require('node:events');
(async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'hlm-functional-'));
  let forbiddenHits = 0, app, uploadBody = '';
  const forbidden = http.createServer((_q, r) => { forbiddenHits++; r.end('Must never receive requests'); });
  forbidden.listen(0, '127.0.0.1'); await once(forbidden, 'listening');
  const evil = `http://127.0.0.1:${forbidden.address().port}`;
  const authentication = http.createServer((_q, r) => { r.setHeader('Content-Type', 'text/html'); r.end(`<h1>Approved authentication fixture</h1><button id="finish">Complete sign-in</button><script>document.getElementById('finish').onclick=()=>{window.opener.postMessage('fixture-login-complete','*');window.close();};</script>`); });
  authentication.listen(0, '127.0.0.1'); await once(authentication, 'listening');
  const authOrigin = `http://127.0.0.1:${authentication.address().port}`;
  const server = http.createServer((q, r) => {
    if (q.url === '/redirect') { r.writeHead(302, { Location: evil }); r.end(); return; }
    if (q.url === '/upload' && q.method === 'POST') { q.on('data', data => { uploadBody += data; }); q.on('end', () => r.end('upload-received')); return; }
    if (q.url === '/download') { r.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="fixture.txt"' }); r.end('download fixture contents'); return; }
    r.setHeader('Content-Type', 'text/html');
    r.end(`<h1>Application fixture</h1><a href="/route">Internal route</a><a href="${evil}">External link</a><a href="${evil}" target="_blank">External popup</a><button id="sign-in">Sign in</button><form id="upload-form"><input id="upload" name="document" type="file"></form><a href="/download" download>Download fixture</a><img src="${evil}/pixel"><script>window.cookieBefore=document.cookie;document.cookie='fixture-session=retained; Max-Age=3600; SameSite=Lax';window.storageBefore=localStorage.getItem('fixture-state');localStorage.setItem('fixture-state','retained');document.getElementById('sign-in').onclick=()=>window.open('${authOrigin}/login','hlm-sign-in');window.addEventListener('message',e=>{if(e.origin==='${authOrigin}')window.authResult=e.data;});fetch('${evil}/api').catch(()=>{});window.bridgePresent=typeof window.hlm!=='undefined';window.nodePresent=typeof require!=='undefined';</script>`);
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  const env = { ...process.env, XDG_CONFIG_HOME: path.join(temporary, 'config'), XDG_CACHE_HOME: path.join(temporary, 'cache') };
  async function launch() {
    app = await electron.launch({ chromiumSandbox: true, args: [path.resolve(__dirname, '..')], env, timeout: 30000 });
    return app.firstWindow();
  }
  async function website() {
    for (let i = 0; i < 50; i++) {
      const pages = await app.context().pages();
      const page = pages.find(p => p.url().startsWith(origin));
      if (page) return page;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Website view never loaded');
  }
  try {
    let shell = await launch();
    await shell.getByRole('heading', { name: 'Welcome to HLM Browser' }).waitFor();
    await shell.locator('#website').fill(origin);
    await shell.locator('#allowHttp').check();
    await shell.locator('#origins').fill(authOrigin);
    await shell.locator('#popups').check();
    await shell.locator('#new-admin').fill('administrator test password');
    await shell.locator('#save').click();
    let site = await website();
    await site.getByRole('heading', { name: 'Application fixture' }).waitFor();
    assert.equal(await site.evaluate(() => window.bridgePresent), false);
    assert.equal(await site.evaluate(() => window.nodePresent), false);
    const popupPromise = app.context().waitForEvent('page', { predicate: page => page !== shell && page !== site });
    await site.locator('#sign-in').click();
    const popup = await popupPromise;
    await popup.getByRole('heading', { name: 'Approved authentication fixture' }).waitFor();
    assert.equal(await popup.evaluate(() => typeof window.hlm), 'undefined');
    assert.equal(await popup.evaluate(() => !!window.opener), true);
    await popup.evaluate(url => { window.open(url); }, evil);
    assert.equal(forbiddenHits, 0, 'Nested popups share the destination policy');
    await popup.locator('#finish').click();
    await site.waitForFunction(() => window.authResult === 'fixture-login-complete');
    await site.locator('#upload').setInputFiles({ name: 'fixture.txt', mimeType: 'text/plain', buffer: Buffer.from('uploaded fixture contents') });
    assert.equal(await site.evaluate(async () => (await fetch('/upload', { method: 'POST', body: new FormData(document.getElementById('upload-form')) })).text()), 'upload-received');
    assert.match(uploadBody, /uploaded fixture contents/);
    const downloadPath = path.join(temporary, 'fixture-download.txt');
    await app.evaluate(({ dialog }, filename) => { dialog.showSaveDialogSync = () => filename; }, downloadPath);
    await site.getByText('Download fixture', { exact: true }).click();
    for (let i = 0; i < 100 && (!fs.existsSync(downloadPath) || fs.readFileSync(downloadPath, 'utf8') !== 'download fixture contents'); i++) await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(fs.readFileSync(downloadPath, 'utf8'), 'download fixture contents');
    const blobPath = path.join(temporary, 'fixture-blob.txt');
    await app.evaluate(({ dialog }, filename) => { dialog.showSaveDialogSync = () => filename; }, blobPath);
    await site.evaluate(() => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['blob fixture contents'], { type: 'text/plain' })); a.download = 'fixture-blob.txt'; a.click(); });
    for (let i = 0; i < 100 && (!fs.existsSync(blobPath) || fs.readFileSync(blobPath, 'utf8') !== 'blob fixture contents'); i++) await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(fs.readFileSync(blobPath, 'utf8'), 'blob fixture contents');
    await site.getByText('Internal route', { exact: true }).click();
    await site.waitForURL(`${origin}/route`);
    await site.evaluate(() => [...document.querySelectorAll('a')].find(a => a.textContent === 'External link').click());
    await shell.locator('#status').filter({ hasText: 'An unapproved destination was blocked' }).waitFor();
    assert.equal(site.url(), `${origin}/route`);
    await site.evaluate(() => [...document.querySelectorAll('a')].find(a => a.textContent === 'External popup').click());
    assert.equal(forbiddenHits, 0, 'Unapproved links, popups, images and fetches must not reach server');
    await site.goto(`${origin}/redirect`, { timeout: 2000 }).catch(() => {});
    assert.equal(forbiddenHits, 0, 'Unapproved redirect must be blocked');
    await shell.getByRole('button', { name: 'Settings', exact: true }).first().click();
    await shell.locator('#password').fill('wrong password');
    await shell.getByRole('button', { name: 'Unlock settings' }).click();
    await shell.getByText('Incorrect administrator password.', { exact: true }).waitFor();
    const denied = await shell.evaluate(() => window.hlm.save({ website: 'https://evil.example', origins: [], allowHttp: false, fullscreen: false, autoOpen: true }));
    assert.match(denied.error, /authorization/);
    await app.close(); app = null;
    shell = await launch(); site = await website();
    await site.getByRole('heading', { name: 'Application fixture' }).waitFor();
    assert.equal(await site.evaluate(() => window.storageBefore), 'retained');
    assert.match(await site.evaluate(() => window.cookieBefore), /fixture-session=retained/);
    assert.equal(forbiddenHits, 0);
    await shell.getByRole('button', { name: 'Settings', exact: true }).first().click();
    await shell.locator('#password').fill('administrator test password');
    await shell.getByRole('button', { name: 'Unlock settings' }).click();
    await shell.getByRole('heading', { name: 'Application settings' }).waitFor();
    await shell.locator('#website').fill(`${origin}/new-application`);
    await shell.locator('#popups').uncheck();
    await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1 }); });
    await shell.locator('#save').click();
    await site.waitForURL(`${origin}/new-application`);
    assert.equal(forbiddenHits, 0, 'Policy remains active after configuration change');
    assert.equal(await site.evaluate(url => window.open(url) === null, authOrigin), true, 'Disabling popups takes effect after administrator save');
    await shell.getByRole('button', { name: 'Full screen', exact: true }).click();
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen()), true);
    await shell.getByRole('button', { name: 'Full screen', exact: true }).click();
    await new Promise(resolve => server.close(resolve));
    await shell.getByRole('button', { name: 'Settings', exact: true }).first().click();
    await shell.getByRole('button', { name: 'Return to application' }).click();
    await shell.getByRole('heading', { name: 'Unable to open your application' }).waitFor();
    console.log('PASS: setup/restart, cookie and local-storage persistence, opener-preserving approved sign-in popup, popup revocation, upload/download, settings replacement, routes, blocked requests/links/popups/redirects, bridge isolation, administrator enforcement, full screen and network error.');
  } finally {
    if (app) await app.close();
    server.close(); forbidden.close(); authentication.close(); fs.rmSync(temporary, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
