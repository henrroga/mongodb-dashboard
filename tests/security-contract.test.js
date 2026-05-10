const { test } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

const { csrfContext, csrfApiProtection } = require("../src/middleware/csrf");
const requestIdMiddleware = require("../src/middleware/request-id");

test("request-id middleware sets and echoes x-request-id", async () => {
  const app = express();
  app.use(requestIdMiddleware);
  app.get("/t", (req, res) => res.json({ requestId: req.requestId }));

  const server = app.listen(0);
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/t`, {
      headers: { "x-request-id": "abc-123" },
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("x-request-id"), "abc-123");
    const data = await res.json();
    assert.equal(data.requestId, "abc-123");
  } finally {
    server.close();
  }
});

test("csrf protection blocks unsafe requests without token", async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session = {};
    next();
  });
  app.use(csrfContext);
  app.post("/api/test", csrfApiProtection, (_req, res) => res.json({ ok: true }));

  const server = app.listen(0);
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/test`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ a: 1 }),
    });
    assert.equal(res.status, 403);
  } finally {
    server.close();
  }
});

test("csrf protection allows same-session token", async () => {
  const app = express();
  app.use(express.json());

  const sessionStore = {};
  app.use((req, _res, next) => {
    req.session = sessionStore;
    next();
  });
  app.use(csrfContext);
  app.get("/token", (req, res) => res.json({ token: req.session.csrfToken }));
  app.post("/api/test", csrfApiProtection, (_req, res) => res.json({ ok: true }));

  const server = app.listen(0);
  const { port } = server.address();
  try {
    const tRes = await fetch(`http://127.0.0.1:${port}/token`);
    const { token } = await tRes.json();
    const res = await fetch(`http://127.0.0.1:${port}/api/test`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": token,
      },
      body: JSON.stringify({ a: 1 }),
    });
    assert.equal(res.status, 200);
  } finally {
    server.close();
  }
});
