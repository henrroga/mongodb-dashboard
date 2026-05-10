const MAX_JSON_TEXT_LENGTH = 100000;

function hasNullByte(value) {
  return typeof value === "string" && value.includes("\0");
}

function validateMongoPathParams(req, res, next) {
  const parts = [
    ["db", req.params.db],
    ["collection", req.params.collection],
    ["bucket", req.params.bucket],
    ["indexName", req.params.indexName],
    ["id", req.params.id],
    ["opid", req.params.opid],
  ];

  for (const [label, value] of parts) {
    if (value === undefined) continue;
    if (typeof value !== "string" || value.trim() === "") {
      return res.status(400).json({ error: `Invalid ${label} parameter` });
    }
    if (hasNullByte(value)) {
      return res.status(400).json({ error: `Invalid ${label} parameter` });
    }
  }

  next();
}

function readJsonQueryParam(req, res, key, fallback) {
  const raw = req.query[key];
  if (!raw) return fallback;

  if (typeof raw !== "string") {
    res.status(400).json({ error: `Invalid query parameter: ${key}` });
    return null;
  }

  if (raw.length > MAX_JSON_TEXT_LENGTH) {
    res.status(413).json({ error: `${key} query is too large` });
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (_) {
    res.status(400).json({ error: `Invalid JSON in query parameter: ${key}` });
    return null;
  }
}

function normalizePositiveInt(value, fallback, max) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

module.exports = {
  validateMongoPathParams,
  readJsonQueryParam,
  normalizePositiveInt,
};
