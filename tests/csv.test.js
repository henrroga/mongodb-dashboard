const { test } = require("node:test");
const assert = require("node:assert/strict");

const { parseCsv, toCsvRow, sanitizeForCsvCell } = require("../src/utils/csv");

test("parseCsv handles quoted commas and escaped quotes", () => {
  const rows = parseCsv('name,notes\n"a,b","say ""hi"""');
  assert.deepEqual(rows, [
    ["name", "notes"],
    ["a,b", 'say "hi"'],
  ]);
});

test("parseCsv throws on unclosed quote", () => {
  assert.throws(() => parseCsv('a,b\n"oops'), /unclosed quoted field/);
});

test("sanitizeForCsvCell neutralizes formula-like cells", () => {
  assert.equal(sanitizeForCsvCell("=1+1"), "'=1+1");
  assert.equal(sanitizeForCsvCell("+SUM(A1:A2)"), "'+SUM(A1:A2)");
  assert.equal(sanitizeForCsvCell("safe"), "safe");
});

test("toCsvRow quotes as needed and sanitizes dangerous prefixes", () => {
  const row = toCsvRow(["a", "b", "c"], {
    a: "hello,world",
    b: '=cmd|\' /C calc\'!A0',
    c: "ok",
  });
  assert.equal(row, '"hello,world",\'=cmd|\' /C calc\'!A0,ok');
});
