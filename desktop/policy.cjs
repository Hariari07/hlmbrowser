'use strict';
const MAX_ORIGINS = 100;
function parseURL(value, allowHttp = false, originOnly = false) {
  if (typeof value !== 'string' || value.length > 4096 || value !== value.trim()) throw new Error('Enter a valid URL without surrounding spaces.');
  let u;
  try { u = new URL(value); } catch { throw new Error('Enter a complete URL, including https://.'); }
  if (u.protocol !== 'https:' && !(allowHttp && u.protocol === 'http:')) throw new Error('HTTPS is required. Enable trusted HTTP explicitly for development.');
  if (u.username || u.password || !u.hostname || u.hostname.includes('*') || u.origin === 'null') throw new Error('Credentials and wildcard hosts are not allowed in URLs.');
  if (originOnly && (u.pathname !== '/' || u.search || u.hash)) throw new Error('Allowed origins must contain only scheme, host, and optional port.');
  return u;
}
function validateConfig(input) {
  if (!input || typeof input !== 'object' || typeof input.allowHttp !== 'boolean') throw new Error('Invalid settings.');
  if (input.version !== undefined && input.version !== 1) throw new Error('Unsupported settings version.');
  const website = parseURL(input.website, input.allowHttp);
  if (!Array.isArray(input.origins) || input.origins.length > MAX_ORIGINS) throw new Error('At most 100 additional origins are allowed.');
  const origins = [...new Set(input.origins.map(v => parseURL(v, input.allowHttp, true).origin))];
  for (const key of ['fullscreen', 'autoOpen']) if (typeof input[key] !== 'boolean') throw new Error(`Invalid ${key} preference.`);
  const capabilities = {};
  if (input.capabilities !== undefined && (!input.capabilities || typeof input.capabilities !== 'object' || Array.isArray(input.capabilities))) throw new Error('Invalid capabilities.');
  for (const key of ['camera', 'microphone', 'popups']) {
    const value = input.capabilities?.[key] === undefined ? false : input.capabilities[key];
    if (typeof value !== 'boolean') throw new Error(`Invalid ${key} permission.`);
    capabilities[key] = value;
  }
  return { version: 1, website: website.href, origins, allowHttp: input.allowHttp, fullscreen: input.fullscreen, autoOpen: input.autoOpen, capabilities };
}
function allowed(raw, config, resource = false) {
  if (!config) return false;
  try {
    const u = new URL(raw);
    // Blob resources/downloads inherit their creating web origin; opaque blobs and
    // blob top-level navigation remain blocked. No external network origin is added.
    if (resource && u.protocol === 'blob:') return u.origin !== 'null' && allowed(u.origin, config);
    // WebSockets are permitted only as resource traffic to an approved corresponding origin.
    if (resource && (u.protocol === 'wss:' || u.protocol === 'ws:')) u.protocol = u.protocol === 'wss:' ? 'https:' : 'http:';
    const parsed = parseURL(u.href, config.allowHttp);
    return [new URL(config.website).origin, ...config.origins].includes(parsed.origin);
  } catch { return false; }
}
function mediaAllowed(origin, types, config) {
  if (!allowed(origin, config) || new URL(origin).protocol !== 'https:' || !Array.isArray(types) || !types.length) return false;
  return types.every(type => (type === 'video' && config.capabilities?.camera === true) || (type === 'audio' && config.capabilities?.microphone === true));
}
function networkPermissionAllowed(permission, documentURL, requestingURL, config) {
  return ['local-network', 'local-network-access', 'loopback-network'].includes(permission) &&
    allowed(documentURL, config) && allowed(requestingURL, config);
}
function popupAllowed(url, config) { return config?.capabilities?.popups === true && (url === 'about:blank' || allowed(url, config)); }
module.exports = { parseURL, validateConfig, allowed, mediaAllowed, networkPermissionAllowed, popupAllowed };
