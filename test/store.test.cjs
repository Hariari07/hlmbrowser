const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Store, passwordRecord, verify } = require('../desktop/store.cjs');
const config = { website: 'https://app.example/', origins: [], allowHttp: false, fullscreen: false, autoOpen: true };
test('password hashing and restart persistence retain configuration without plaintext password', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hlm-test-'));
  try {
    const password = 'a long test password';
    const admin = await passwordRecord(password);
    assert.equal(await verify(password, admin), true);
    assert.equal(await verify('incorrect password', admin), false);
    assert.equal(await verify('x'.repeat(257), admin), false);
    const store = new Store(dir);
    assert.equal(store.load(), null); assert.equal(store.invalid, false);
    store.save({ config, admin });
    assert.equal(fs.readFileSync(store.file, 'utf8').includes(password), false);
    if (process.platform !== 'win32') assert.equal(fs.statSync(store.file).mode & 0o777, 0o600);
    assert.equal(new Store(dir).load().config.website, config.website);
    store.save({ config: { ...config, website: 'https://new.example/' }, admin });
    assert.equal(new Store(dir).load().config.website, 'https://new.example/');
    assert.deepEqual(fs.readdirSync(dir), ['settings.json']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('invalid saved configuration fails closed instead of resetting administrator', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hlm-corrupt-'));
  try {
    fs.writeFileSync(path.join(dir, 'settings.json'), '{broken');
    const store = new Store(dir); assert.equal(store.load(), null); assert.equal(store.invalid, true);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
