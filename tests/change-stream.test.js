const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeOperationTypeFilter,
  buildChangeStreamPipeline,
} = require("../src/utils/changeStream");

test("normalizeOperationTypeFilter accepts all/empty as null", () => {
  assert.equal(normalizeOperationTypeFilter(undefined), null);
  assert.equal(normalizeOperationTypeFilter(""), null);
  assert.equal(normalizeOperationTypeFilter("all"), null);
});

test("normalizeOperationTypeFilter accepts known operation type", () => {
  assert.equal(normalizeOperationTypeFilter("insert"), "insert");
  assert.equal(normalizeOperationTypeFilter("update"), "update");
});

test("normalizeOperationTypeFilter rejects unknown operation type", () => {
  assert.throws(
    () => normalizeOperationTypeFilter("evil_op"),
    /Unsupported operationType/
  );
});

test("buildChangeStreamPipeline builds expected match stage", () => {
  assert.deepEqual(buildChangeStreamPipeline(null), []);
  assert.deepEqual(buildChangeStreamPipeline("insert"), [
    { $match: { operationType: "insert" } },
  ]);
});
