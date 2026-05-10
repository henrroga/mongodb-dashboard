const crypto = require("crypto");

function requestIdMiddleware(req, res, next) {
  const incoming = req.get("x-request-id");
  const requestId =
    incoming && typeof incoming === "string" && incoming.trim()
      ? incoming.trim().slice(0, 128)
      : crypto.randomUUID();

  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);
  next();
}

module.exports = requestIdMiddleware;
