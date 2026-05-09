const bcrypt = require("bcryptjs");
const config = require("../config");

const failedAttempts = new Map();

function recordFailure(ip) {
  const now = Date.now();
  const entry = failedAttempts.get(ip) || { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= config.auth.maxAttempts) {
    entry.lockedUntil = now + config.auth.lockoutMs;
    entry.count = 0;
  }
  failedAttempts.set(ip, entry);
}

function clearFailures(ip) {
  failedAttempts.delete(ip);
}

function isLocked(ip) {
  const entry = failedAttempts.get(ip);
  if (!entry) return false;
  if (entry.lockedUntil && entry.lockedUntil > Date.now()) {
    return Math.ceil((entry.lockedUntil - Date.now()) / 1000);
  }
  return false;
}

async function verifyPassword(plain) {
  if (!config.auth.passwordHash) return false;
  return bcrypt.compare(plain, config.auth.passwordHash);
}

function requireAuth(req, res, next) {
  if (!config.auth.enabled) return next();
  if (req.session && req.session.authenticated) return next();
  if (req.originalUrl.startsWith("/api/") || req.baseUrl === "/api") {
    return res.status(401).json({ error: "Authentication required" });
  }
  const next_ = encodeURIComponent(req.originalUrl || "/");
  return res.redirect(`/login?next=${next_}`);
}

function requireWritable(req, res, next) {
  if (config.readOnly) {
    return res.status(403).json({ error: "Dashboard is in read-only mode" });
  }
  next();
}

module.exports = {
  verifyPassword,
  recordFailure,
  clearFailures,
  isLocked,
  requireAuth,
  requireWritable,
};
