const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

function clearModule(id) {
  try { delete require.cache[require.resolve(id)]; } catch {}
}

function fresh(modulePath) {
  clearModule('../src/config');
  clearModule('../src/services/users');
  clearModule(modulePath);
  return require(modulePath);
}

function makeApp(router, session) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session = session;
    next();
  });
  app.use('/', router);
  return app;
}

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'deadbeef'.repeat(8);
process.env.AUTH_ENABLED = 'true';
process.env.AUTH_PASSWORD = 'test-pass';

test('RBAC blocks transfer writes for viewer', async () => {
  const transferRouter = fresh('../src/routes/api/transfer');
  const app = makeApp(transferRouter, {
    authenticated: true,
    role: 'viewer',
    permissions: ['read'],
  });
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/db/col/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ format: 'json', content: '[]' }),
    });
    assert.equal(res.status, 403);
  } finally {
    server.close();
  }
});

test('RBAC blocks profiler mutation for viewer', async () => {
  const connectionRouter = fresh('../src/routes/api/connection');
  const app = makeApp(connectionRouter, {
    authenticated: true,
    role: 'viewer',
    permissions: ['read'],
  });
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/server/profiler`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ db: 'admin', level: 1, slowms: 100 }),
    });
    assert.equal(res.status, 403);
  } finally {
    server.close();
  }
});

test('RBAC blocks killOp for viewer', async () => {
  const connectionRouter = fresh('../src/routes/api/connection');
  const app = makeApp(connectionRouter, {
    authenticated: true,
    role: 'viewer',
    permissions: ['read'],
  });
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/server/currentop/123`, {
      method: 'DELETE',
    });
    assert.equal(res.status, 403);
  } finally {
    server.close();
  }
});

test('RBAC blocks plugins listing for non-admin', async () => {
  const pluginsRouter = fresh('../src/routes/api/plugins');
  const app = makeApp(pluginsRouter, {
    authenticated: true,
    role: 'viewer',
    permissions: ['read'],
  });
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/plugins`);
    assert.equal(res.status, 403);
  } finally {
    server.close();
  }
});
