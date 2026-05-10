const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  assertSafeMongoQueryShape,
  normalizeSkip,
  validateSortObject,
  validateProjectionObject,
} = require("../src/utils/queryGuard");

test("assertSafeMongoQueryShape blocks dangerous operators", () => {
  assert.throws(
    () => assertSafeMongoQueryShape({ $where: "this.a > 1" }),
    /not allowed/
  );
  assert.throws(
    () => assertSafeMongoQueryShape({ a: { $function: { body: "x" } } }),
    /not allowed/
  );
});

test("assertSafeMongoQueryShape allows regular nested query", () => {
  assert.doesNotThrow(() =>
    assertSafeMongoQueryShape({
      status: "active",
      age: { $gte: 18 },
      tags: { $in: ["a", "b"] },
    })
  );
});

test("normalizeSkip clamps and normalizes", () => {
  assert.equal(normalizeSkip(undefined), 0);
  assert.equal(normalizeSkip("-1"), 0);
  assert.equal(normalizeSkip("120"), 120);
  assert.equal(normalizeSkip("999999"), 50000);
});

test("validateSortObject enforces limits and values", () => {
  assert.doesNotThrow(() => validateSortObject({ a: 1, b: -1 }));
  assert.throws(() => validateSortObject({ a: "ascending" }), /Sort directions/);
});

test("validateProjectionObject enforces values", () => {
  assert.doesNotThrow(() => validateProjectionObject({ a: 1, b: 0, c: true }));
  assert.throws(() => validateProjectionObject({ a: "yes" }), /Projection values/);
});
