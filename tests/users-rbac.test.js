const { test } = require('node:test');
const assert = require('node:assert/strict');

process.env.AUTH_ENABLED = 'false';
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'deadbeef'.repeat(8);

test('users service exposes expected role permissions', () => {
  const users = require('../src/services/users');
  assert.deepEqual(users.resolvePermissions('viewer'), ['read']);
  assert.deepEqual(users.resolvePermissions('editor'), ['read', 'write']);
  assert.ok(users.resolvePermissions('admin').includes('audit'));
  assert.ok(users.resolvePermissions('admin').includes('shell'));
});

test('hasPermission checks authenticated session permissions', () => {
  const users = require('../src/services/users');
  assert.equal(users.hasPermission(null, 'read'), false);
  assert.equal(users.hasPermission({ authenticated: false, permissions: ['read'] }, 'read'), false);
  assert.equal(users.hasPermission({ authenticated: true, permissions: ['read', 'write'] }, 'write'), true);
  assert.equal(users.hasPermission({ authenticated: true, permissions: ['read'] }, 'write'), false);
});
