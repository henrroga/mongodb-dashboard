const logger = require("../utils/logger");

function errorHandler(err, req, res, next) {
  logger.error({
    err: {
      message: err.message,
      stack: err.stack,
      ...err,
    },
    req: {
      method: req.method,
      url: req.url,
      path: req.path,
      params: req.params,
      query: req.query,
      ip: req.ip,
    },
  }, "Unhandled error");

  if (res.headersSent) {
    return next(err);
  }

  // Handle specific MongoDB errors if needed
  if (err.name === "MongoServerError") {
    return res.status(400).json({
      error: err.message,
      code: err.code,
      codeName: err.codeName,
    });
  }

  if (req.path && req.path.startsWith("/api/")) {
    return res.status(500).json({
      error: err.message || "Internal Server Error",
    });
  }

  res.status(500).render("error", {
    title: "Error",
    error: err,
    message: err.message,
  });
}

module.exports = errorHandler;
