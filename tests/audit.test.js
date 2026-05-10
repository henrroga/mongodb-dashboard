const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

test("audit log appends a JSONL line per event", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mdb-audit-"));
  process.env.AUDIT_LOG_DIR = tmp;
  // Re-require so it picks up the new dir.
  delete require.cache[require.resolve("../src/utils/audit")];
  const audit = require("../src/utils/audit");

  audit.log({ event: "test_a", method: "POST", path: "/x", ip: "1.1.1.1" });
  audit.log({ event: "test_b", method: "DELETE", path: "/y", ip: "2.2.2.2" });

  // Give the stream a beat to flush.
  return new Promise((resolve) => {
    setTimeout(() => {
      const content = fs.readFileSync(path.join(tmp, "audit.log"), "utf8");
      const lines = content.trim().split("\n");
      assert.equal(lines.length, 2);
      const a = JSON.parse(lines[0]);
      assert.equal(a.event, "test_a");
      assert.equal(a.method, "POST");
      assert.ok(a.ts);
      const b = JSON.parse(lines[1]);
      assert.equal(b.event, "test_b");
      // Cleanup.
      fs.rmSync(tmp, { recursive: true, force: true });
      delete process.env.AUDIT_LOG_DIR;
      resolve();
    }, 50);
  });
});
