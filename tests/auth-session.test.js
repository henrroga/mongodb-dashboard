const { test } = require("node:test");
const assert = require("node:assert/strict");

delete require.cache[require.resolve("../src/config")];
process.env.AUTH_ENABLED = "true";
process.env.AUTH_PASSWORD = "test-password";
process.env.SESSION_IDLE_TIMEOUT_MS = "1000";
process.env.SESSION_ABSOLUTE_TIMEOUT_MS = "2000";

const { shouldInvalidateSession } = require("../src/middleware/auth");

test("shouldInvalidateSession returns true when timestamps missing", () => {
  assert.equal(shouldInvalidateSession({ authenticated: true }, 10000), true);
});

test("shouldInvalidateSession enforces idle timeout", () => {
  const session = {
    authenticated: true,
    loginAt: 1000,
    lastSeenAt: 2000,
  };
  assert.equal(shouldInvalidateSession(session, 3501), true);
});

test("shouldInvalidateSession enforces absolute timeout", () => {
  const session = {
    authenticated: true,
    loginAt: 1000,
    lastSeenAt: 2500,
  };
  assert.equal(shouldInvalidateSession(session, 3201), true);
});

test("shouldInvalidateSession keeps valid session", () => {
  const session = {
    authenticated: true,
    loginAt: 1000,
    lastSeenAt: 1500,
  };
  assert.equal(shouldInvalidateSession(session, 2200), false);
});
