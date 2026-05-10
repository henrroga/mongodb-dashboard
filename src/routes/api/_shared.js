// Shared helpers + middleware for the API router family. Extracting these
// lets each future sub-router under src/routes/api/ require only what it
// needs, instead of inheriting a 1500-line context from a single file.

const config = require("../../config");
const audit = require("../../utils/audit");

function redactConnectionString(uri) {
  if (!uri) return uri;
  return String(uri).replace(/(\/\/)[^@/]+@/, "$1***@");
}

// Routes that use POST/PUT/DELETE but are NOT considered "writes" against the DB.
// (Connection management, query helpers that don't mutate.)
const NON_WRITE_PATHS = new Set(["/connect", "/disconnect"]);
const NON_WRITE_SUFFIXES = ["/explain", "/aggregate"];

/**
 * Express middleware: enforce READ_ONLY mode at the API boundary, and
 * append every actual write op to the audit log.
 *
 * Mounted once on the top-level api router so every sub-router inherits
 * it — no need for individual handlers to remember to check.
 */
function readOnlyAndAuditMiddleware(req, res, next) {
  const method = req.method;
  if (method === "GET" || method === "HEAD" || method === "OPTIONS")
    return next();

  const p = req.path;
  if (NON_WRITE_PATHS.has(p)) return next();
  if (NON_WRITE_SUFFIXES.some((s) => p.endsWith(s))) return next();
  // Shell exec is gated separately (read-only ops are still allowed inside).
  if (p === "/shell/exec") return next();

  if (config.readOnly) {
    audit.log({
      event: "write_blocked_read_only",
      method,
      path: p,
      ip: req.ip,
    });
    return res
      .status(403)
      .json({ error: "Dashboard is in read-only mode (READ_ONLY=true)" });
  }

  if (
    method === "DELETE" ||
    p === "/databases" ||
    p.endsWith("/import") ||
    p.includes("/indexes") ||
    p.includes("/validation") ||
    p.match(/^\/[^/]+\/collections/) ||
    /^\/[^/]+\/[^/]+(\/[^/]+)?$/.test(p)
  ) {
    audit.log({ event: "write", method, path: p, ip: req.ip });
  }
  next();
}

/**
 * Recursively extract all field paths from a document that can be searched.
 * Used by the document list endpoint when the user types a free-text search
 * — we walk the sample doc to discover every leaf field worth matching.
 */
function extractSearchableFields(obj, prefix = "", fields = new Set()) {
  if (obj === null || obj === undefined) return fields;

  if (Array.isArray(obj)) {
    obj.forEach((item) => {
      if (typeof item === "string" || typeof item === "number") {
        if (prefix) fields.add(prefix);
      } else if (typeof item === "object" && item !== null) {
        extractSearchableFields(item, prefix, fields);
      }
    });
    return fields;
  }

  if (typeof obj === "object") {
    if (
      obj.$oid ||
      obj.$date ||
      obj.$binary ||
      obj.$numberDecimal ||
      obj.$numberLong
    ) {
      return fields;
    }

    for (const key in obj) {
      const fullPath = prefix ? `${prefix}.${key}` : key;
      const value = obj[key];

      if (
        typeof value === "string" ||
        typeof value === "number" ||
        value instanceof Date
      ) {
        fields.add(fullPath);
      } else if (typeof value === "object" && value !== null) {
        extractSearchableFields(value, fullPath, fields);
      }
    }
  }
  return fields;
}

/**
 * Build a MongoDB $or query that probes a free-text search across:
 *   - every searchable leaf field discovered from `sampleDoc`
 *   - a fixed list of common top-level fields (for empty collections /
 *     when no sample is available)
 *   - common numeric fields when the search term parses as a number
 */
function buildSearchQuery(searchTerm, sampleDoc = null) {
  const conditions = [];
  const searchRegex = { $regex: searchTerm, $options: "i" };
  const isNumeric = !isNaN(parseFloat(searchTerm)) && isFinite(searchTerm);
  const numValue = isNumeric ? parseFloat(searchTerm) : null;

  if (sampleDoc) {
    const fields = extractSearchableFields(sampleDoc);
    fields.forEach((field) => {
      conditions.push({ [field]: searchRegex });
    });
  }

  const commonFields = [
    "_id", "name", "title", "description", "email", "username",
    "text", "content", "message", "value", "label", "type",
    "status", "category", "tags", "notes", "comment", "address",
    "phone", "url", "link", "id", "code", "key",
  ];
  commonFields.forEach((field) => {
    if (!conditions.some((c) => c[field])) {
      conditions.push({ [field]: searchRegex });
    }
  });

  if (isNumeric) {
    const numericFields = [
      "id", "count", "quantity", "price", "amount", "score",
      "rating", "age", "year", "month", "day", "index", "order",
    ];
    numericFields.forEach((field) => {
      conditions.push({ [field]: numValue });
    });
  }

  return {
    $or: conditions.length > 0 ? conditions : [{ _id: searchRegex }],
  };
}

module.exports = {
  redactConnectionString,
  readOnlyAndAuditMiddleware,
  extractSearchableFields,
  buildSearchQuery,
};
