const { test } = require('node:test');
const assert = require('node:assert/strict');
const { allowed, validateConfig, parseURL, mediaAllowed, networkPermissionAllowed, popupAllowed } = require('../desktop/policy.cjs');
const base = { website: 'https://app.example/portal', origins: ['https://login.example'], allowHttp: false, fullscreen: false, autoOpen: true };
test('LAN permissions require approved document and requester without approving other permissions or destinations', () => {
  const c = validateConfig({ ...base, website: 'http://192.168.0.127:4200/fbs', origins: ['http://172.21.17.75:7896'], allowHttp: true });
  for (const permission of ['local-network', 'local-network-access', 'loopback-network']) {
    assert.equal(networkPermissionAllowed(permission, c.website, c.website, c), true);
    assert.equal(networkPermissionAllowed(permission, c.website, 'http://evil.example', c), false);
    assert.equal(networkPermissionAllowed(permission, 'http://evil.example', c.website, c), false);
    assert.equal(networkPermissionAllowed(permission, c.website, undefined, c), false);
    assert.equal(networkPermissionAllowed(permission, c.website, c.website, null), false);
  }
  for (const permission of ['media', 'geolocation', 'notifications', 'unknown']) assert.equal(networkPermissionAllowed(permission, c.website, c.website, c), false);
  assert.equal(allowed('http://172.21.17.75:7896/api', c, true), true);
  assert.equal(allowed('http://172.21.17.75:7897/api', c, true), false);
});
test('validates and canonicalizes configuration', () => {
  const c = validateConfig({ ...base, origins: ['https://LOGIN.example:443', 'https://login.example'] });
  assert.deepEqual(c.origins, ['https://login.example']);
  assert.equal(c.version, 1);
});
test('exact origins permit SPA paths and identity redirects, not suffix matches', () => {
  const c = validateConfig(base);
  for (const u of ['https://app.example/route?q=1#fragment', 'https://login.example/oauth']) assert.equal(allowed(u, c), true, u);
  for (const u of ['https://evil.app.example', 'https://app.example.evil.org', 'https://app.example:444', 'https://app.example@evil.org', 'http://app.example', 'file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,evil', 'https://evil.org/https://app.example']) assert.equal(allowed(u, c), false, u);
});
test('rejects malformed settings, credentials, insecure origins and wildcard rules', () => {
  for (const u of ['invalid', ' https://app.example', 'https://user:pass@app.example', 'ftp://app.example', 'http://app.example']) assert.throws(() => parseURL(u));
  for (const origin of ['https://app.example/path', 'https://app.example/?x', 'https://app.example/#x', '*.example', 'http://dev.example']) assert.throws(() => validateConfig({ ...base, origins: [origin] }));
  assert.throws(() => validateConfig({ ...base, fullscreen: 'yes' }));
  assert.throws(() => validateConfig({ ...base, version: 2 }));
  assert.throws(() => validateConfig({ ...base, origins: ['https://*.example'] }));
  assert.throws(() => validateConfig({ ...base, origins: Array(101).fill('https://app.example') }));
});
test('HTTP and WebSocket resources require explicit corresponding approval', () => {
  assert.equal(allowed('wss://app.example/socket', base, true), true);
  assert.equal(allowed('wss://app.example/socket', base), false);
  assert.equal(allowed('wss://evil.org/socket', base, true), false);
  assert.equal(allowed('ws://app.example/socket', base, true), false);
  const c = validateConfig({ ...base, website: 'http://localhost:8181/', allowHttp: true });
  assert.equal(allowed('ws://localhost:8181/socket', c, true), true);
  assert.equal(allowed('http://localhost:8182', c), false);
});
test('removed origins immediately lose access and missing settings fail closed', () => {
  assert.equal(allowed('https://login.example', { ...base, origins: [] }), false);
  assert.equal(allowed('https://app.example', null), false);
});
test('legacy settings default to denied device and popup capabilities; invalid flags fail closed', () => {
  assert.deepEqual(validateConfig(base).capabilities, { camera: false, microphone: false, popups: false });
  for (const capabilities of [null, [], { camera: 'yes' }, { microphone: null }, { popups: 1 }]) assert.throws(() => validateConfig({ ...base, capabilities }));
});
test('media requires IT opt-in, approved HTTPS origin and only the requested enabled devices', () => {
  const c = validateConfig({ ...base, capabilities: { camera: true, microphone: false } });
  assert.equal(mediaAllowed('https://app.example', ['video'], c), true);
  for (const types of [['audio'], ['audio', 'video'], ['screen'], [], undefined]) assert.equal(mediaAllowed('https://app.example', types, c), false);
  assert.equal(mediaAllowed('https://evil.example', ['video'], c), false);
  const internal = validateConfig({ ...c, website: 'http://192.168.0.127:4200/fbs', allowHttp: true });
  assert.equal(allowed('http://192.168.0.127:4200/route', internal), true);
  assert.equal(mediaAllowed(internal.website, ['video'], internal), false);
  assert.equal(mediaAllowed('https://app.example', ['video'], validateConfig(base)), false);
});
test('popup destinations remain restricted after IT enables windows', () => {
  const c = validateConfig({ ...base, capabilities: { popups: true } });
  assert.equal(popupAllowed('https://login.example/oauth', c), true);
  assert.equal(popupAllowed('about:blank', c), true);
  for (const u of ['https://evil.example', 'file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,test']) assert.equal(popupAllowed(u, c), false);
  assert.equal(popupAllowed('https://login.example', validateConfig(base)), false);
});
test('blob resources and downloads require an approved inherited origin; navigation remains blocked', () => {
  const c = validateConfig(base);
  assert.equal(allowed('blob:https://app.example/fixture-id', c, true), true);
  assert.equal(allowed('blob:https://evil.example/fixture-id', c, true), false);
  assert.equal(allowed('blob:null/fixture-id', c, true), false);
  assert.equal(allowed('blob:https://app.example/fixture-id', c), false);
});
