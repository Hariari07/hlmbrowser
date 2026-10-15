'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const derive = promisify(crypto.scrypt);
const { validateConfig } = require('./policy.cjs');
async function passwordRecord(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 256) throw new Error('Use an administrator password of 12–256 characters.');
  const salt = crypto.randomBytes(16).toString('hex');
  return { salt, hash: (await derive(password, salt, 64)).toString('hex') };
}
async function verify(password, record) {
  if (!record || typeof password !== 'string' || password.length > 256) return false;
  const actual = await derive(password, record.salt, 64);
  const expected = Buffer.from(record.hash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
class Store {
  constructor(directory) { this.directory = directory; this.file = path.join(directory, 'settings.json'); this.value = null; this.invalid = false; }
  load() {
    try {
      const v = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (!v.admin || !/^[a-f0-9]{32}$/.test(v.admin.salt) || !/^[a-f0-9]{128}$/.test(v.admin.hash)) throw new Error('Invalid administrator record');
      this.value = { config: validateConfig(v.config), admin: v.admin };
    } catch (e) { this.invalid = e.code !== 'ENOENT'; this.value = null; }
    return this.value;
  }
  save(value) {
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    const temp = `${this.file}.${crypto.randomUUID()}.tmp`;
    try {
      const fd = fs.openSync(temp, 'wx', 0o600);
      try { fs.writeFileSync(fd, JSON.stringify(value)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      fs.renameSync(temp, this.file);
      this.value = value;
    } finally { fs.rmSync(temp, { force: true }); }
  }
}
module.exports = { Store, passwordRecord, verify };
