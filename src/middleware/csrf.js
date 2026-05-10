const crypto = require("crypto");

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function ensureCsrfToken(req) {
  if (!req.session) return null;
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString("hex");
  }
  return req.session.csrfToken;
}

function csrfContext(req, res, next) {
  const token = ensureCsrfToken(req);
  if (token && res.locals && res.locals.appConfig) {
    res.locals.appConfig.csrfToken = token;
  }
  next();
}

function hasSameOriginFetchMetadata(req) {
  const site = req.get("sec-fetch-site");
  return site === "same-origin" || site === "same-site";
}

function csrfApiProtection(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const sessionToken = ensureCsrfToken(req);
  if (!sessionToken) {
    return res.status(403).json({ error: "Session unavailable for CSRF check" });
  }

  const headerToken = req.get("x-csrf-token");
  if (headerToken && headerToken === sessionToken) return next();

  if (hasSameOriginFetchMetadata(req)) return next();

  return res.status(403).json({ error: "CSRF validation failed" });
}

module.exports = {
  csrfContext,
  csrfApiProtection,
};
