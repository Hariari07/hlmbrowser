// Checks the packaged executable through Chromium CDP, without Electron's development loader.
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
(async () => {
  if (!process.argv[2]) throw new Error('Usage: node scripts/packaged-smoke.cjs /absolute/path/to/executable');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hlm-packaged-'));
  let hits = 0, child, browser;
  const forbidden = http.createServer((_q, r) => { hits++; r.end('Blocked destination'); });
  forbidden.listen(0, '127.0.0.1'); await once(forbidden, 'listening');
  const server = http.createServer((_q, r) => { r.setHeader('Content-Type', 'text/html'); r.end(`<h1>Packaged application fixture</h1><script>fetch('http://127.0.0.1:${forbidden.address().port}/unapproved').catch(()=>{});</script>`); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  async function prepare(endpoint, firstRun) {
    // An unused WebContentsView has no initialized renderer. Initialize via the actual
    // first-run form before asking Playwright to attach to every page target.
    const socket = new WebSocket(endpoint); await once(socket, 'open');
    let id = 0; const pending = new Map();
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data); const task = pending.get(message.id);
      if (task) { pending.delete(message.id); clearTimeout(task.timer); message.error ? task.reject(new Error(message.error.message)) : task.resolve(message.result); }
    });
    function send(method, params = {}, sessionId) {
      return new Promise((resolve, reject) => {
        const next = ++id; const timer = setTimeout(() => { pending.delete(next); reject(new Error('CDP timed out: ' + method)); }, 10000);
        pending.set(next, { resolve, reject, timer }); socket.send(JSON.stringify({ id: next, method, params, sessionId }));
      });
    }
    try {
      let shell;
      for (let i = 0; i < 100; i++) { shell = (await send('Target.getTargets')).targetInfos.find(t => t.url.startsWith('file:')); if (shell) break; await new Promise(resolve => setTimeout(resolve, 100)); }
      assert.ok(shell, 'Packaged shell target exists');
      const { sessionId } = await send('Target.attachToTarget', { targetId: shell.targetId, flatten: true });
      const current = await send('Runtime.evaluate', { expression: 'window.hlm.state()', awaitPromise: true, returnByValue: true }, sessionId);
      assert.equal(current.result.value.configured, !firstRun);
      if (firstRun) assert.equal(current.result.value.screen, 'setup');
      if (firstRun) {
        const expression = `document.getElementById('website').value=${JSON.stringify(origin)};document.getElementById('allowHttp').checked=true;document.getElementById('new-admin').value='packaged test password';document.getElementById('save').click();`;
        await send('Runtime.evaluate', { expression }, sessionId);
      }
      for (let i = 0; i < 100; i++) { if ((await send('Target.getTargets')).targetInfos.some(t => t.url.startsWith(origin))) return; await new Promise(resolve => setTimeout(resolve, 100)); }
      throw new Error('Packaged website target never loaded');
    } finally { socket.close(); }
  }
  async function launch(firstRun = false) {
    let logs = '';
    child = spawn(process.argv[2], ['--remote-debugging-port=0'], { env: { ...process.env, XDG_CONFIG_HOME: path.join(temp, 'config'), XDG_CACHE_HOME: path.join(temp, 'cache') }, stdio: ['ignore', 'ignore', 'pipe'] });
    const endpoint = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Packaged startup timed out: ' + logs)), 20000);
      child.once('error', e => { clearTimeout(timer); reject(e); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Packaged app exited ${code}: ${logs}`)); });
      child.stderr.on('data', data => {
        logs += data.toString(); const match = logs.match(/DevTools listening on (ws:\/\/\S+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
    });
    await prepare(endpoint, firstRun);
    browser = await chromium.connectOverCDP(endpoint, { noDefaults: true, timeout: 10000 });
    const shell = await browser.contexts()[0].waitForEvent('page', { predicate: p => p.url().startsWith('file:'), timeout: 1000 }).catch(() => browser.contexts()[0].pages().find(p => p.url().startsWith('file:')));
    assert.ok(shell, 'Packaged trusted shell loaded'); return shell;
  }
  async function sitePage() {
    for (let i = 0; i < 100; i++) {
      const page = browser.contexts()[0].pages().find(p => p.url().startsWith(origin));
      if (page) { await page.getByRole('heading', { name: 'Packaged application fixture' }).waitFor(); return page; }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Packaged website never loaded');
  }
  async function close() { const exited = once(child, 'exit'); const shell = browser.contexts()[0].pages().find(p => p.url().startsWith('file:')); await shell.evaluate(() => window.hlm.action('exit')).catch(() => {}); await exited; await browser.close().catch(() => {}); child = null; browser = null; }
  try {
    let shell = await launch(true);
    let site = await sitePage();
    for (const name of ['local-network', 'local-network-access', 'loopback-network']) {
      assert.equal(await site.evaluate(async name => (await navigator.permissions.query({ name })).state, name), 'granted');
    }
    await shell.locator('#status').filter({ hasText: `Blocked application request to http://127.0.0.1:${forbidden.address().port}` }).waitFor();
    assert.equal(await site.evaluate(() => typeof window.hlm), 'undefined');
    assert.equal(await site.evaluate(() => typeof require), 'undefined');
    assert.equal(hits, 0);
    await close(); shell = await launch(); site = await sitePage(); assert.equal(hits, 0); await close();
    console.log('PASS: packaged executable startup, setup, LAN permissions, blocked-request diagnostics, website loading, renderer isolation, request blocking and restart persistence with Chromium sandbox enabled.');
  } finally {
    if (child) child.kill(); if (browser) await browser.close().catch(() => {}); server.close(); forbidden.close(); fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
