const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

function clear(id) {
  try { delete require.cache[require.resolve(id)]; } catch {}
}

test('bootstraps first user when store is empty and bootstrap env is set', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mdb-users-'));
  const usersPath = path.join(tmpDir, 'users.json');

  process.env.NODE_ENV = 'test';
  process.env.AUTH_ENABLED = 'true';
  process.env.SESSION_SECRET = 'deadbeef'.repeat(8);
  process.env.AUTH_USERS_FILE = usersPath;
  process.env.AUTH_PASSWORD = '';
  process.env.AUTH_PASSWORD_HASH = '';
  process.env.AUTH_BOOTSTRAP_USERNAME = 'seed-admin';
  process.env.AUTH_BOOTSTRAP_PASSWORD = 'seed-pass';
  process.env.AUTH_BOOTSTRAP_ROLE = 'admin';

  clear('../src/config');
  clear('../src/services/users');
  const usersService = require('../src/services/users');

  const user = await usersService.verifyUser('seed-admin', 'seed-pass');
  assert.ok(user);
  assert.equal(user.username, 'seed-admin');
  assert.equal(user.role, 'admin');

  const raw = JSON.parse(await fs.readFile(usersPath, 'utf8'));
  assert.equal(Array.isArray(raw.users), true);
  assert.equal(raw.users.length, 1);
});
