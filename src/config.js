require("dotenv").config();
const crypto = require("crypto");

function parseBool(v, def = false) {
  if (v === undefined || v === null || v === "") return def;
  return ["1", "true", "yes", "on"].includes(String(v).toLowerCase());
}

const authPasswordHash = process.env.AUTH_PASSWORD_HASH || "";
const authPasswordPlain = process.env.AUTH_PASSWORD || "";
const authEnabled = parseBool(
  process.env.AUTH_ENABLED,
  !!(authPasswordHash || authPasswordPlain)
);

if (authEnabled && !authPasswordHash && !authPasswordPlain) {
  throw new Error(
    "AUTH_ENABLED=true but no AUTH_PASSWORD or AUTH_PASSWORD_HASH was provided"
  );
}

let resolvedHash = authPasswordHash;
if (!resolvedHash && authPasswordPlain) {
  const bcrypt = require("bcryptjs");
  resolvedHash = bcrypt.hashSync(authPasswordPlain, 12);
}

let sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  if (process.env.NODE_ENV === "production" && authEnabled) {
    throw new Error(
      "SESSION_SECRET must be set in production when auth is enabled"
    );
  }
  sessionSecret = crypto.randomBytes(32).toString("hex");
  console.warn(
    "[config] SESSION_SECRET not set — generated an ephemeral secret. Sessions will be invalidated on restart."
  );
}

const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  trustProxy: process.env.TRUST_PROXY || "loopback",
  readOnly: parseBool(process.env.READ_ONLY, false),
  publicUrl: process.env.PUBLIC_URL || "",
  cookieSecure: parseBool(
    process.env.COOKIE_SECURE,
    process.env.NODE_ENV === "production"
  ),
  presetMongoUri: process.env.MONGODB_URI || "",
  connectionVaultSecret: process.env.CONNECTION_VAULT_SECRET || "",
  auth: {
    enabled: authEnabled,
    passwordHash: resolvedHash,
    sessionSecret,
    sessionMaxAgeMs: parseInt(
      process.env.SESSION_MAX_AGE_MS || String(1000 * 60 * 60 * 24 * 7),
      10
    ),
    sessionIdleTimeoutMs: parseInt(
      process.env.SESSION_IDLE_TIMEOUT_MS || String(1000 * 60 * 60 * 8),
      10
    ),
    sessionAbsoluteTimeoutMs: parseInt(
      process.env.SESSION_ABSOLUTE_TIMEOUT_MS || String(1000 * 60 * 60 * 24),
      10
    ),
    maxAttempts: parseInt(process.env.LOGIN_MAX_ATTEMPTS || "5", 10),
    lockoutMs: parseInt(process.env.LOGIN_LOCKOUT_MS || "900000", 10),
    usersFile: process.env.AUTH_USERS_FILE || "data/users.json",
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "60000", 10),
    max: parseInt(process.env.RATE_LIMIT_MAX || "300", 10),
    loginMax: parseInt(process.env.RATE_LIMIT_LOGIN_MAX || "10", 10),
  },
};

module.exports = config;
