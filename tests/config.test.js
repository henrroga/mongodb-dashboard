const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

function loadConfigWithEnv(env) {
  const cached = require.resolve("../src/config");
  delete require.cache[cached];
  // dotenv may overlay .env; isolate this test by clearing first.
  const before = { ...process.env };
  // Wipe any keys we touch.
  for (const k of [
    "AUTH_ENABLED",
    "AUTH_PASSWORD",
    "AUTH_PASSWORD_HASH",
    "SESSION_SECRET",
    "READ_ONLY",
    "MONGODB_URI",
    "NODE_ENV",
    "PORT",
  ]) {
    delete process.env[k];
  }
  Object.assign(process.env, env);
  try {
    return require("../src/config");
  } finally {
    for (const k of Object.keys(process.env)) delete process.env[k];
    Object.assign(process.env, before);
  }
}

test("defaults: auth disabled when no password provided", () => {
  const cfg = loadConfigWithEnv({ NODE_ENV: "test" });
  assert.equal(cfg.auth.enabled, false);
  assert.equal(cfg.readOnly, false);
});

test("AUTH_ENABLED with no password throws", () => {
  assert.throws(() =>
    loadConfigWithEnv({ AUTH_ENABLED: "true", NODE_ENV: "test" })
  );
});

test("AUTH_PASSWORD gets hashed at boot, never persisted as plaintext", () => {
  const cfg = loadConfigWithEnv({
    AUTH_ENABLED: "true",
    AUTH_PASSWORD: "test-pass-12345",
    SESSION_SECRET: "deadbeef-deadbeef-deadbeef-deadbe",
    NODE_ENV: "test",
  });
  assert.equal(cfg.auth.enabled, true);
  assert.match(cfg.auth.passwordHash, /^\$2[aby]\$/);
  // Hash should not equal the plaintext.
  assert.notEqual(cfg.auth.passwordHash, "test-pass-12345");
});

test("READ_ONLY parsing accepts 'true' / '1' / 'yes'", () => {
  for (const v of ["true", "1", "yes", "on"]) {
    const cfg = loadConfigWithEnv({ READ_ONLY: v, NODE_ENV: "test" });
    assert.equal(cfg.readOnly, true, `failed for ${v}`);
  }
  for (const v of ["", "false", "0", "no"]) {
    const cfg = loadConfigWithEnv({ READ_ONLY: v, NODE_ENV: "test" });
    assert.equal(cfg.readOnly, false, `failed for ${v}`);
  }
});

test("production + auth requires SESSION_SECRET", () => {
  assert.throws(() =>
    loadConfigWithEnv({
      NODE_ENV: "production",
      AUTH_ENABLED: "true",
      AUTH_PASSWORD: "x",
    })
  );
});

test("MONGODB_URI passes through as presetMongoUri", () => {
  const cfg = loadConfigWithEnv({
    MONGODB_URI: "mongodb://localhost:27017",
    NODE_ENV: "test",
  });
  assert.equal(cfg.presetMongoUri, "mongodb://localhost:27017");
});
