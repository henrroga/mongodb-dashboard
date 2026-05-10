const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizePositiveInt,
  readJsonQueryParam,
} = require("../src/middleware/validate");

function createRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test("normalizePositiveInt enforces fallback and max", () => {
  assert.equal(normalizePositiveInt(undefined, 20, 100), 20);
  assert.equal(normalizePositiveInt("-5", 20, 100), 20);
  assert.equal(normalizePositiveInt("40", 20, 100), 40);
  assert.equal(normalizePositiveInt("999", 20, 100), 100);
});

test("readJsonQueryParam parses valid JSON", () => {
  const req = { query: { filter: '{"status":"ok"}' } };
  const res = createRes();
  const out = readJsonQueryParam(req, res, "filter", {});
  assert.deepEqual(out, { status: "ok" });
  assert.equal(res.statusCode, 200);
});

test("readJsonQueryParam returns 400 on invalid JSON", () => {
  const req = { query: { filter: "{broken" } };
  const res = createRes();
  const out = readJsonQueryParam(req, res, "filter", {});
  assert.equal(out, null);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /Invalid JSON/);
});
