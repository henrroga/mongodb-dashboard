const { test } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

function clearModule(id) {
  try { delete require.cache[require.resolve(id)]; } catch {}
}

function makeClient() {
  const calls = { insertOne: 0, updateOne: 0 };
  const col = {
    insertOne: async () => {
      calls.insertOne += 1;
      return { insertedId: { toString: () => "abc123" } };
    },
    updateOne: async () => {
      calls.updateOne += 1;
      return { matchedCount: 1, modifiedCount: 1 };
    },
  };
  return {
    calls,
    db() {
      return {
        collection() {
          return col;
        },
      };
    },
  };
}

function buildAppWithDocumentsRouter(client) {
  process.env.NODE_ENV = "test";
  process.env.AUTH_ENABLED = "false";
  process.env.SESSION_SECRET = "deadbeef".repeat(8);
  clearModule("../src/config");
  clearModule("../src/services/mongodb");
  clearModule("../src/routes/api/documents");
  const mongoService = require("../src/services/mongodb");
  mongoService.getClient = () => client;
  const router = require("../src/routes/api/documents");
  const app = express();
  app.use(express.json());
  app.use("/", router);
  return app;
}

test("insert requires object body", async () => {
  const client = makeClient();
  const app = buildAppWithDocumentsRouter(client);
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/db/col`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify([]),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /json object/i);
    assert.equal(client.calls.insertOne, 0);
  } finally {
    server.close();
  }
});

test("patch requires $set or $unset object", async () => {
  const client = makeClient();
  const app = buildAppWithDocumentsRouter(client);
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/db/col/507f1f77bcf86cd799439011`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /\$set|\$unset/i);
    assert.equal(client.calls.updateOne, 0);
  } finally {
    server.close();
  }
});

test("patch updates one field successfully", async () => {
  const client = makeClient();
  const app = buildAppWithDocumentsRouter(client);
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/db/col/507f1f77bcf86cd799439011`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ $set: { status: "active" } }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(client.calls.updateOne, 1);
  } finally {
    server.close();
  }
});
