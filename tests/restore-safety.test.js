const { test } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

function clearModule(id) {
  try { delete require.cache[require.resolve(id)]; } catch {}
}

function freshTransferRouterWithClient(client) {
  process.env.NODE_ENV = "test";
  process.env.AUTH_ENABLED = "false";
  process.env.SESSION_SECRET = "deadbeef".repeat(8);
  clearModule("../src/config");
  clearModule("../src/services/mongodb");
  clearModule("../src/routes/api/transfer");
  const mongoService = require("../src/services/mongodb");
  mongoService.getClient = () => client;
  return require("../src/routes/api/transfer");
}

function makeMockClient() {
  const calls = { deleteMany: 0, replaceOne: 0, insertOne: 0 };
  const col = {
    deleteMany: async () => { calls.deleteMany += 1; },
    replaceOne: async () => { calls.replaceOne += 1; },
    insertOne: async () => { calls.insertOne += 1; },
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

function makeFailingClient() {
  const calls = { deleteMany: 0, replaceOne: 0, insertOne: 0 };
  const col = {
    deleteMany: async () => { calls.deleteMany += 1; },
    replaceOne: async () => {
      calls.replaceOne += 1;
      throw new Error("duplicate key");
    },
    insertOne: async () => {
      calls.insertOne += 1;
      throw new Error("duplicate key");
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

test("restore dryRun previews payload and does not mutate collection", async () => {
  const client = makeMockClient();
  const router = freshTransferRouterWithClient(client);
  const app = express();
  app.use(express.json({ limit: "110mb" }));
  app.use("/", router);
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const content = [
      JSON.stringify({ _meta: { kind: "mongodb-dashboard-backup" } }),
      JSON.stringify({ _id: { $oid: "507f1f77bcf86cd799439011" }, name: "a" }),
      JSON.stringify({ name: "b" }),
    ].join("\n");
    const res = await fetch(`http://127.0.0.1:${port}/db/col/restore`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content, mode: "replace", dryRun: true }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.dryRun, true);
    assert.equal(body.total, 2);
    assert.equal(body.withId, 1);
    assert.equal(body.withoutId, 1);
    assert.match(body.warning, /delete all documents/i);
    assert.equal(client.calls.deleteMany, 0);
    assert.equal(client.calls.replaceOne, 0);
    assert.equal(client.calls.insertOne, 0);
  } finally {
    server.close();
  }
});

test("restore replace mode requires explicit confirmation", async () => {
  const client = makeMockClient();
  const router = freshTransferRouterWithClient(client);
  const app = express();
  app.use(express.json({ limit: "110mb" }));
  app.use("/", router);
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const content = JSON.stringify({ name: "a" });
    const res = await fetch(`http://127.0.0.1:${port}/db/col/restore`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content, mode: "replace" }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.code, "RESTORE_CONFIRM_REQUIRED");
    assert.equal(client.calls.deleteMany, 0);
    assert.equal(client.calls.replaceOne, 0);
    assert.equal(client.calls.insertOne, 0);
  } finally {
    server.close();
  }
});

test("restore reports partial failures in non-strict mode", async () => {
  const client = makeFailingClient();
  const router = freshTransferRouterWithClient(client);
  const app = express();
  app.use(express.json({ limit: "110mb" }));
  app.use("/", router);
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const content = [JSON.stringify({ _id: 1, name: "a" }), JSON.stringify({ _id: 2, name: "b" })].join("\n");
    const res = await fetch(`http://127.0.0.1:${port}/db/col/restore`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content, mode: "insert", strict: false }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.restored, 0);
    assert.equal(body.failed, 2);
    assert.equal(body.total, 2);
    assert.equal(Array.isArray(body.errors), true);
    assert.match(body.errors[0], /duplicate key/i);
  } finally {
    server.close();
  }
});

test("restore strict mode stops on first write error", async () => {
  const client = makeFailingClient();
  const router = freshTransferRouterWithClient(client);
  const app = express();
  app.use(express.json({ limit: "110mb" }));
  app.use("/", router);
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const content = [JSON.stringify({ _id: 1, name: "a" }), JSON.stringify({ _id: 2, name: "b" })].join("\n");
    const res = await fetch(`http://127.0.0.1:${port}/db/col/restore`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content, mode: "insert", strict: true }),
    });
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.strict, true);
    assert.equal(body.failed, 1);
    assert.equal(client.calls.replaceOne, 1);
  } finally {
    server.close();
  }
});
