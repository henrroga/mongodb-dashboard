const { test } = require("node:test");
const assert = require("node:assert/strict");
const { ObjectId } = require("mongodb");
const { evalArg, splitTopLevelArgs } = require("../src/utils/shellArg");

test("parses plain JSON", () => {
  assert.deepEqual(evalArg('{"a":1}'), { a: 1 });
  assert.deepEqual(evalArg("[1,2,3]"), [1, 2, 3]);
});

test("accepts MQL shorthand: unquoted keys + single-quoted strings", () => {
  assert.deepEqual(evalArg("{a: 1, b: 'x'}"), { a: 1, b: "x" });
  assert.deepEqual(evalArg("{filter: {nested: 'yes'}}"), {
    filter: { nested: "yes" },
  });
});

test("revives ObjectId / ISODate / Date constructors", () => {
  const oid = evalArg('ObjectId("507f1f77bcf86cd799439011")');
  assert.ok(oid instanceof ObjectId);
  assert.equal(oid.toHexString(), "507f1f77bcf86cd799439011");

  const date = evalArg('ISODate("2024-01-01")');
  assert.ok(date instanceof Date);
  assert.equal(date.toISOString(), "2024-01-01T00:00:00.000Z");
});

test("nested constructors inside object/array", () => {
  const result = evalArg(
    '{filter: {_id: ObjectId("507f1f77bcf86cd799439011")}}'
  );
  assert.ok(result.filter._id instanceof ObjectId);
});

test("rejects forbidden identifiers", () => {
  for (const bad of [
    "{a: process.env}",
    'require("fs")',
    "(function(){return process})()",
    'eval("1+1")',
    "{a: globalThis}",
    "{a: __proto__}",
    "{a: constructor.constructor}",
  ]) {
    assert.throws(
      () => evalArg(bad),
      /Disallowed identifier/,
      `did not block: ${bad}`
    );
  }
});

test("rejects oversized input", () => {
  assert.throws(
    () => evalArg("{" + "a:1,".repeat(50_000) + "}"),
    /too large/
  );
});

test("returns undefined for empty input", () => {
  assert.equal(evalArg(""), undefined);
  assert.equal(evalArg("   "), undefined);
});

test("rejects malformed JSON with a meaningful error", () => {
  assert.throws(() => evalArg("{a: 1,, b: 2}"), /Invalid argument syntax/);
});

test("splitTopLevelArgs handles nested objects and constructor calls", () => {
  const args = splitTopLevelArgs(
    '{a: 1, b: "x,y"}, ObjectId("507f1f77bcf86cd799439011"), [1, {z: 2}]'
  );
  assert.equal(args.length, 3);
  assert.match(args[0], /^\{a:/);
  assert.match(args[1], /^ObjectId\(/);
  assert.match(args[2], /^\[/);
});
