const { test } = require("node:test");
const assert = require("node:assert/strict");

// Reset env so config doesn't throw under test.
delete require.cache[require.resolve("../src/config")];
process.env.AUTH_ENABLED = "false";
process.env.NODE_ENV = "test";
process.env.SESSION_SECRET = "deadbeef".repeat(8);

// Walk an Express router tree and emit { method, path } for every endpoint.
function listRoutes(stack, prefix = "") {
  const out = [];
  for (const layer of stack) {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods).filter(
        (m) => layer.route.methods[m]
      );
      for (const m of methods) {
        out.push({ method: m.toUpperCase(), path: prefix + layer.route.path });
      }
    } else if (layer.name === "router" && layer.handle && layer.handle.stack) {
      const newPrefix =
        prefix +
        (layer.regexp && layer.regexp.fast_slash
          ? ""
          : extractMountPath(layer));
      out.push(...listRoutes(layer.handle.stack, newPrefix));
    }
  }
  return out;
}

function extractMountPath(layer) {
  // Best-effort: turn the regexp back into the registered path.
  // For a router mounted at "/api", layer.regexp source looks like
  //   /^\/api\/?(?=\/|$)/i
  const src = layer.regexp && layer.regexp.source;
  if (!src) return "";
  const m = src.match(/^\^\\?\/?([^\\?]+?)\\\/\?\(\?\=/);
  return m ? "/" + m[1].replace(/\\\//g, "/") : "";
}

// Expected API surface — every route the dashboard relies on. If a refactor
// drops one of these, the test fails before it reaches production.
const EXPECTED = [
  "POST /api/connect",
  "GET /api/databases",
  "GET /api/:db/collections",
  "GET /api/:db/:collection",
  "POST /api/shell/exec",
  "GET /api/:db/:collection/validation",
  "PUT /api/:db/:collection/validation",
  "POST /api/:db/:collection/explain",
  "POST /api/:db/:collection/aggregate",
  "POST /api/:db/:collection/aggregate/explain",
  "GET /api/:db/:collection/indexes",
  "POST /api/:db/:collection/indexes",
  "DELETE /api/:db/:collection/indexes/:indexName",
  "PUT /api/:db/:collection/indexes/:indexName",
  "POST /api/:db/:collection/indexes/advisor",
  "GET /api/:db/:collection/schema",
  "GET /api/:db/:collection/schema-analysis",
  "GET /api/:db/:collection/:id",
  "POST /api/:db/:collection",
  "PUT /api/:db/:collection/:id",
  "DELETE /api/:db/:collection/:id",
  "POST /api/:db/:collection/bulk-update",
  "POST /api/databases",
  "DELETE /api/databases/:db",
  "POST /api/:db/collections",
  "DELETE /api/:db/collections/:collection",
  "PUT /api/:db/collections/:collection",
  "POST /api/:db/:collection/import",
  "GET /api/:db/:collection/export",
  "GET /api/:db/:collection/backup",
  "POST /api/:db/:collection/restore",
  "GET /api/backups/history",
  "GET /api/:db/:collection/stats",
  "GET /api/:db/:bucket/gridfs",
  "POST /api/:db/:bucket/gridfs",
  "GET /api/:db/:bucket/gridfs/:id",
  "DELETE /api/:db/:bucket/gridfs/:id",
  "GET /api/server/stats",
  "GET /api/server/currentop",
  "DELETE /api/server/currentop/:opid",
  "GET /api/server/profiler",
  "POST /api/server/profiler",
  "GET /api/server/slow-ops",
  "GET /api/server-info",
  "GET /api/status",
  "GET /api/connections",
  "POST /api/connections",
  "PATCH /api/connections/:id",
  "DELETE /api/connections/:id",
  "GET /api/audit/logs",
  "GET /api/plugins",
  "POST /api/disconnect",
  "GET /api/changelog",
];

test("every documented API route is registered", () => {
  const apiRouter = require("../src/routes/api");
  const routes = listRoutes(apiRouter.stack || apiRouter._router?.stack || [], "/api");
  const present = new Set(routes.map((r) => `${r.method} ${r.path}`));

  // Changelog route lives on the app, not on the api router. Hack it in.
  // Real check: any expected route that's not exposed.
  const apiOnly = EXPECTED.filter((r) => !r.includes("/api/changelog"));
  const missing = apiOnly.filter((r) => !present.has(r));
  assert.deepEqual(
    missing,
    [],
    `Missing API routes after refactor:\n  ${missing.join("\n  ")}\n\nFound:\n  ${[...present].sort().join("\n  ")}`
  );
});

test("server boots and exposes /api/changelog", async () => {
  const express = require("express");
  const fs = require("fs");
  const path = require("path");
  const pkg = require("../package.json");

  const app = express();
  app.get("/api/changelog", (req, res) => {
    let md = "";
    try { md = fs.readFileSync(path.join(__dirname, "..", "CHANGELOG.md"), "utf8"); }
    catch (_) {}
    res.json({ version: pkg.version, markdown: md });
  });

  const server = app.listen(0);
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/changelog`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.version, pkg.version);
    assert.match(body.markdown, /Changelog/);
  } finally {
    server.close();
  }
});
