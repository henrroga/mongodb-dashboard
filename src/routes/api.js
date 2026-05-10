const express = require("express");
const router = express.Router();
const mongoService = require("../services/mongodb");
const { ObjectId } = require("mongodb");
const { serializeDocument, parseDocument } = require("../utils/bson");
const { inferSchema } = require("../utils/schema");
const config = require("../config");
const audit = require("../utils/audit");
const {
  redactConnectionString,
  readOnlyAndAuditMiddleware,
  extractSearchableFields,
  buildSearchQuery,
} = require("./api/_shared");

router.use(readOnlyAndAuditMiddleware);

// Sub-routers — extracted incrementally from this file. Order matters:
// concrete top-level paths (/databases, /server/*, /status, /connect) must
// register BEFORE catch-alls like /:db/:collection so routing precedence
// resolves them first.
router.use("/", require("./api/connection"));
router.use("/", require("./api/documents"));

// List databases
router.get("/databases", async (req, res) => {
  try {
    const client = mongoService.getClient();
    if (!client) {
      return res.status(400).json({ error: "Not connected" });
    }

    const adminDb = client.db().admin();
    const { databases } = await adminDb.listDatabases();

    res.json({
      databases: databases.map((db) => ({
        name: db.name,
        sizeOnDisk: db.sizeOnDisk,
        empty: db.empty,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List collections in a database
router.get("/:db/collections", async (req, res) => {
  try {
    const client = mongoService.getClient();
    if (!client) {
      return res.status(400).json({ error: "Not connected" });
    }

    const db = client.db(req.params.db);
    const collections = await db.listCollections().toArray();

    // Get document counts for each collection (fast estimate)
    const collectionsWithCounts = await Promise.all(
      collections.map(async (col) => {
        const count = await db.collection(col.name).estimatedDocumentCount();
        return { name: col.name, count };
      })
    );

    res.json({ collections: collectionsWithCounts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get documents from a collection (paginated)
// ─── Shell ───────────────────────────────────────────────────────────────────

// Parse MQL-style argument expressions WITHOUT eval. See src/utils/shellArg.js.
const { evalArg } = require("../utils/shellArg");

router.post("/shell/exec", async (req, res) => {
  try {
    const client = mongoService.getClient();
    if (!client) return res.status(400).json({ error: "Not connected" });

    const { command, db: dbName } = req.body;
    if (!command) return res.status(400).json({ error: "No command" });

    const cmd = command.trim();
    const db = client.db(dbName || undefined);

    // show dbs
    if (/^show\s+(dbs|databases)$/i.test(cmd)) {
      const { databases } = await client.db().admin().listDatabases();
      return res.json({ result: databases.map((d) => `${d.name}\t${d.sizeOnDisk} B`).join("\n"), type: "text" });
    }

    // show collections
    if (/^show\s+collections$/i.test(cmd)) {
      const cols = await db.listCollections().toArray();
      return res.json({ result: cols.map((c) => c.name).join("\n"), type: "text" });
    }

    // use dbname
    const useMatch = cmd.match(/^use\s+(\S+)$/i);
    if (useMatch) {
      return res.json({ result: `switched to db ${useMatch[1]}`, type: "text", switchDb: useMatch[1] });
    }

    // db.runCommand({...})
    const runCmdMatch = cmd.match(/^db\.runCommand\(([\s\S]+)\)$/);
    if (runCmdMatch) {
      const arg = evalArg(runCmdMatch[1]);
      const result = await db.command(arg);
      return res.json({ result, type: "json" });
    }

    // db.collection.method(...)
    const colMatch = cmd.match(/^db\.([^.]+)\.(\w+)\(([\s\S]*)\)$/);
    if (colMatch) {
      const [, colName, method, argsStr] = colMatch;
      const col = db.collection(colName);

      const WRITE_METHODS = new Set([
        "insertOne",
        "insertMany",
        "updateOne",
        "updateMany",
        "replaceOne",
        "deleteOne",
        "deleteMany",
        "drop",
        "createIndex",
        "dropIndex",
        "renameCollection",
      ]);
      if (config.readOnly && WRITE_METHODS.has(method)) {
        audit.log({
          event: "shell_write_blocked_read_only",
          method,
          colName,
          ip: req.ip,
        });
        return res
          .status(403)
          .json({ error: "Dashboard is in read-only mode (READ_ONLY=true)" });
      }
      if (WRITE_METHODS.has(method)) {
        audit.log({
          event: "shell_write",
          method,
          colName,
          ip: req.ip,
        });
      }

      // Parse args: split by top-level commas
      const args = argsStr.trim()
        ? argsStr.split(/,(?![^{[]*[}\]])/).map((a) => {
            try { return evalArg(a.trim()); } catch { return a.trim(); }
          })
        : [];

      let result;
      switch (method) {
        case "find": {
          const cursor = col.find(args[0] || {}, { projection: args[1] || {} });
          result = await cursor.limit(50).toArray();
          break;
        }
        case "findOne": result = await col.findOne(args[0] || {}); break;
        case "countDocuments": result = await col.countDocuments(args[0] || {}); break;
        case "estimatedDocumentCount": result = await col.estimatedDocumentCount(); break;
        case "aggregate": result = await col.aggregate(args[0] || []).toArray(); break;
        case "insertOne": result = await col.insertOne(args[0] || {}); break;
        case "insertMany": result = await col.insertMany(args[0] || []); break;
        case "updateOne": result = await col.updateOne(args[0] || {}, args[1] || {}); break;
        case "updateMany": result = await col.updateMany(args[0] || {}, args[1] || {}); break;
        case "deleteOne": result = await col.deleteOne(args[0] || {}); break;
        case "deleteMany": result = await col.deleteMany(args[0] || {}); break;
        case "distinct": result = await col.distinct(args[0], args[1] || {}); break;
        case "drop": result = await col.drop(); break;
        case "createIndex": result = await col.createIndex(args[0] || {}, args[1] || {}); break;
        case "indexes": result = await col.indexes(); break;
        case "stats": result = await db.command({ collStats: colName }); break;
        default:
          return res.status(400).json({ error: `Unknown method: ${method}` });
      }

      return res.json({ result: result !== null && result !== undefined ? serializeDocument(result) : null, type: "json" });
    }

    return res.status(400).json({ error: `Unsupported command. Try: db.collection.find({})` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get collection validation rules
router.get("/:db/:collection/validation", async (req, res) => {
  try {
    const client = mongoService.getClient();
    if (!client) return res.status(400).json({ error: "Not connected" });

    const db = client.db(req.params.db);
    const cols = await db.listCollections({ name: req.params.collection }).toArray();
    const info = cols[0] || {};
    const options = info.options || {};

    res.json({
      validator: options.validator || null,
      validationLevel: options.validationLevel || "strict",
      validationAction: options.validationAction || "error",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update collection validation rules
router.put("/:db/:collection/validation", async (req, res) => {
  try {
    const client = mongoService.getClient();
    if (!client) return res.status(400).json({ error: "Not connected" });

    const { validator, validationLevel, validationAction } = req.body;
    const db = client.db(req.params.db);

    const cmd = { collMod: req.params.collection };
    if (validator !== undefined) cmd.validator = validator;
    if (validationLevel) cmd.validationLevel = validationLevel;
    if (validationAction) cmd.validationAction = validationAction;

    await db.command(cmd);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Explain plan for find queries
router.post("/:db/:collection/explain", async (req, res) => {
  try {
    const client = mongoService.getClient();
    if (!client) return res.status(400).json({ error: "Not connected" });

    const { filter = {}, sort, projection, verbosity = "executionStats" } = req.body;
    const col = client.db(req.params.db).collection(req.params.collection);

    let cursor = col.find(filter);
    if (sort && Object.keys(sort).length > 0) cursor = cursor.sort(sort);
    if (projection && Object.keys(projection).length > 0) cursor = cursor.project(projection);

    const plan = await cursor.explain(verbosity);
    res.json({ plan });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Aggregation pipeline execution
router.post("/:db/:collection/aggregate", async (req, res) => {
  try {
    const client = mongoService.getClient();
    if (!client) return res.status(400).json({ error: "Not connected" });

    const { pipeline = [], options = {} } = req.body;
    if (!Array.isArray(pipeline)) return res.status(400).json({ error: "Pipeline must be an array" });

    const col = client.db(req.params.db).collection(req.params.collection);
    const limit = Math.min(parseInt(options.limit) || 20, 1000);

    // If pipeline doesn't end with $limit, add one for safety
    const safePipeline = [...pipeline];
    const lastStage = safePipeline[safePipeline.length - 1];
    const hasLimit = lastStage && (lastStage.$limit != null || lastStage.$out || lastStage.$merge);
    if (!hasLimit) safePipeline.push({ $limit: limit });

    const docs = await col.aggregate(safePipeline, { allowDiskUse: true }).toArray();
    res.json({ documents: docs.map(serializeDocument), count: docs.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Indexes (must be before /:id routes) ────────────────────────────────────

router.get("/:db/:collection/indexes", async (req, res) => {
  try {
    const client = mongoService.getClient();
    if (!client) return res.status(400).json({ error: "Not connected" });

    const col = client.db(req.params.db).collection(req.params.collection);
    const indexes = await col.indexes();

    // Enrich with size info if available
    let indexSizes = {};
    try {
      const stats = await client.db(req.params.db).command({ collStats: req.params.collection });
      indexSizes = stats.indexSizes || {};
    } catch (e) { /* ignore */ }

    const enriched = indexes.map((idx) => ({
      name: idx.name,
      key: idx.key,
      unique: idx.unique || false,
      sparse: idx.sparse || false,
      hidden: idx.hidden || false,
      expireAfterSeconds: idx.expireAfterSeconds,
      partialFilterExpression: idx.partialFilterExpression,
      sizeBytes: indexSizes[idx.name] || null,
    }));

    res.json({ indexes: enriched });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:db/:collection/indexes", async (req, res) => {
  try {
    const client = mongoService.getClient();
    if (!client) return res.status(400).json({ error: "Not connected" });

    const { key, options = {} } = req.body;
    if (!key || Object.keys(key).length === 0) {
      return res.status(400).json({ error: "Index key is required" });
    }

    const col = client.db(req.params.db).collection(req.params.collection);
    const name = await col.createIndex(key, options);
    res.json({ success: true, name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:db/:collection/indexes/:indexName", async (req, res) => {
  try {
    const client = mongoService.getClient();
    if (!client) return res.status(400).json({ error: "Not connected" });

    if (req.params.indexName === "_id_") {
      return res.status(400).json({ error: "Cannot drop the _id index" });
    }

    const col = client.db(req.params.db).collection(req.params.collection);
    await col.dropIndex(req.params.indexName);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/:db/:collection/indexes/:indexName", async (req, res) => {
  try {
    const client = mongoService.getClient();
    if (!client) return res.status(400).json({ error: "Not connected" });

    const { hidden } = req.body;
    await client.db(req.params.db).command({
      collMod: req.params.collection,
      index: { name: req.params.indexName, hidden: !!hidden },
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get collection schema (MUST be before /:id route to avoid route conflict)
router.get("/:db/:collection/schema", async (req, res) => {
  try {
    const client = mongoService.getClient();
    if (!client) {
      return res.status(400).json({ error: "Not connected" });
    }

    const { db: dbName, collection: colName } = req.params;
    const collection = client.db(dbName).collection(colName);

    const schema = await inferSchema(collection);
    res.json({ schema });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Rich schema analysis for the Schema tab
router.get("/:db/:collection/schema-analysis", async (req, res) => {
  try {
    const client = mongoService.getClient();
    if (!client) return res.status(400).json({ error: "Not connected" });

    const { db: dbName, collection: colName } = req.params;
    const sampleSize = Math.min(parseInt(req.query.sampleSize) || 500, 5000);
    const col = client.db(dbName).collection(colName);

    const docs = await col.find({}).limit(sampleSize).toArray();
    const total = docs.length;
    if (total === 0) return res.json({ totalDocs: 0, fields: {} });

    const fields = {};

    const getType = (val) => {
      if (val === null || val === undefined) return "null";
      if (val instanceof Date) return "date";
      if (Array.isArray(val)) return "array";
      if (val && val._bsontype === "ObjectId") return "objectId";
      if (val && val._bsontype === "Decimal128") return "decimal";
      if (typeof val === "object" && val.$oid) return "objectId";
      if (typeof val === "object" && val.$date) return "date";
      if (typeof val === "object") return "object";
      return typeof val;
    };

    for (const doc of docs) {
      const serialized = serializeDocument(doc);
      for (const [key, value] of Object.entries(serialized)) {
        if (!fields[key]) {
          fields[key] = { types: {}, values: [], numbers: [] };
        }
        const f = fields[key];
        const type = getType(value);
        f.types[type] = (f.types[type] || 0) + 1;

        if (type === "string" && f.values.length < 2000) f.values.push(value);
        if (type === "number" && f.numbers.length < 2000) f.numbers.push(value);
      }
    }

    const result = {};
    for (const [key, f] of Object.entries(fields)) {
      const presence = Object.values(f.types).filter((_, i) => Object.keys(f.types)[i] !== "null")
        .reduce((a, b) => a + b, 0) / total;

      const entry = {
        types: f.types,
        presence: parseFloat((Object.values(f.types).reduce((a, b) => a + b, 0) / total).toFixed(3)),
      };

      // Top values for strings
      if (f.values.length > 0) {
        const counts = {};
        f.values.forEach((v) => { counts[v] = (counts[v] || 0) + 1; });
        entry.topValues = Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([value, count]) => ({ value, count }));
        entry.uniqueCount = Object.keys(counts).length;
      }

      // Histogram for numbers
      if (f.numbers.length > 0) {
        const nums = f.numbers;
        entry.min = Math.min(...nums);
        entry.max = Math.max(...nums);
        entry.mean = parseFloat((nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2));

        const bucketCount = 10;
        const range = entry.max - entry.min;
        if (range > 0) {
          const bucketSize = range / bucketCount;
          const buckets = Array.from({ length: bucketCount }, (_, i) => ({
            min: parseFloat((entry.min + i * bucketSize).toFixed(2)),
            max: parseFloat((entry.min + (i + 1) * bucketSize).toFixed(2)),
            count: 0,
          }));
          nums.forEach((n) => {
            const idx = Math.min(Math.floor((n - entry.min) / bucketSize), bucketCount - 1);
            buckets[idx].count++;
          });
          entry.histogram = buckets;
        }
      }

      result[key] = entry;
    }

    res.json({ totalDocs: total, sampleSize, fields: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single document
// Create database (MongoDB creates a db lazily, so we create an initial collection)
router.post("/databases", async (req, res) => {
  try {
    const client = mongoService.getClient();
    if (!client) return res.status(400).json({ error: "Not connected" });

    const { name, initialCollection = "_init" } = req.body;
    if (!name) return res.status(400).json({ error: "Database name is required" });

    await client.db(name).createCollection(initialCollection);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Drop database
router.delete("/databases/:db", async (req, res) => {
  try {
    const client = mongoService.getClient();
    if (!client) return res.status(400).json({ error: "Not connected" });

    await client.db(req.params.db).dropDatabase();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create collection
router.post("/:db/collections", async (req, res) => {
  try {
    const client = mongoService.getClient();
    if (!client) return res.status(400).json({ error: "Not connected" });

    const { name, options = {} } = req.body;
    if (!name) return res.status(400).json({ error: "Collection name is required" });

    await client.db(req.params.db).createCollection(name, options);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Drop collection
router.delete("/:db/collections/:collection", async (req, res) => {
  try {
    const client = mongoService.getClient();
    if (!client) return res.status(400).json({ error: "Not connected" });

    await client.db(req.params.db).collection(req.params.collection).drop();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Rename collection
router.put("/:db/collections/:collection", async (req, res) => {
  try {
    const client = mongoService.getClient();
    if (!client) return res.status(400).json({ error: "Not connected" });

    const { newName } = req.body;
    if (!newName) return res.status(400).json({ error: "New name is required" });

    const adminDb = client.db().admin();
    await adminDb.command({
      renameCollection: `${req.params.db}.${req.params.collection}`,
      to: `${req.params.db}.${newName}`,
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Import / Export ─────────────────────────────────────────────────────────

/**
 * Simple CSV parser that handles quoted fields and commas inside quotes.
 * Returns an array of row arrays.
 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(field);
        field = "";
      } else if (ch === "\n" || (ch === "\r" && next === "\n")) {
        if (ch === "\r") i++;
        row.push(field);
        field = "";
        if (row.some((f) => f !== "")) rows.push(row);
        row = [];
      } else {
        field += ch;
      }
    }
  }
  row.push(field);
  if (row.some((f) => f !== "")) rows.push(row);
  return rows;
}

/**
 * Convert a flat object to a CSV row string (values quoted if needed).
 */
function toCsvRow(headers, doc) {
  return headers
    .map((h) => {
      const val = doc[h];
      if (val === null || val === undefined) return "";
      const str =
        typeof val === "object" ? JSON.stringify(val) : String(val);
      return str.includes(",") || str.includes('"') || str.includes("\n")
        ? `"${str.replace(/"/g, '""')}"`
        : str;
    })
    .join(",");
}

// Import documents (JSON array, NDJSON, or CSV)
router.post("/:db/:collection/import", express.json({ limit: "50mb" }), async (req, res) => {
  try {
    const client = mongoService.getClient();
    if (!client) return res.status(400).json({ error: "Not connected" });

    const { db: dbName, collection: colName } = req.params;
    const { format = "json", content, stopOnError = false } = req.body;

    if (!content) return res.status(400).json({ error: "No content provided" });

    const collection = client.db(dbName).collection(colName);

    let docs = [];
    if (format === "csv") {
      const rows = parseCsv(content.trim());
      if (rows.length < 2) return res.status(400).json({ error: "CSV must have a header row and at least one data row" });
      const headers = rows[0];
      docs = rows.slice(1).map((row) => {
        const doc = {};
        headers.forEach((h, i) => {
          let val = row[i] ?? "";
          // Try to parse numbers and booleans
          if (val === "true") val = true;
          else if (val === "false") val = false;
          else if (val !== "" && !isNaN(Number(val))) val = Number(val);
          if (val !== "") doc[h] = val;
        });
        return doc;
      });
    } else {
      // JSON: try array first, then NDJSON (one JSON object per line)
      const trimmed = content.trim();
      if (trimmed.startsWith("[")) {
        docs = JSON.parse(trimmed);
      } else {
        docs = trimmed
          .split("\n")
          .filter((l) => l.trim())
          .map((l) => JSON.parse(l));
      }
      docs = docs.map(parseDocument);
    }

    let inserted = 0;
    let errors = [];
    for (const doc of docs) {
      try {
        await collection.insertOne(doc);
        inserted++;
      } catch (err) {
        if (stopOnError) throw err;
        errors.push(err.message);
      }
    }

    res.json({ success: true, inserted, errors: errors.slice(0, 20), total: docs.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Export documents (JSON or CSV)
router.get("/:db/:collection/export", async (req, res) => {
  try {
    const client = mongoService.getClient();
    if (!client) return res.status(400).json({ error: "Not connected" });

    const { db: dbName, collection: colName } = req.params;
    const { format = "json", filter: filterParam, sort: sortParam, limit: limitParam } = req.query;

    const collection = client.db(dbName).collection(colName);

    let query = {};
    if (filterParam) { try { query = JSON.parse(filterParam); } catch (e) {} }

    let sort = {};
    if (sortParam) { try { sort = JSON.parse(sortParam); } catch (e) {} }

    const limit = limitParam ? Math.min(parseInt(limitParam) || 10000, 100000) : 10000;

    const docs = await collection.find(query).sort(sort).limit(limit).toArray();
    const serialized = docs.map(serializeDocument);

    if (format === "csv") {
      if (serialized.length === 0) {
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename="${colName}.csv"`);
        return res.send("");
      }
      const headers = [...new Set(serialized.flatMap((d) => Object.keys(d)))];
      const csv = [headers.join(","), ...serialized.map((d) => toCsvRow(headers, d))].join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${colName}.csv"`);
      return res.send(csv);
    }

    if (format === "jsonl") {
      res.setHeader("Content-Type", "application/x-ndjson");
      res.setHeader("Content-Disposition", `attachment; filename="${colName}.jsonl"`);
      return res.send(serialized.map((d) => JSON.stringify(d)).join("\n"));
    }

    // JSON
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${colName}.json"`);
    res.send(JSON.stringify(serialized, null, 2));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Stream the entire collection as JSONL with a metadata header line.
// Uses cursor.stream() so memory use stays bounded regardless of collection
// size. The caller (browser) gets a download.
router.get("/:db/:collection/backup", async (req, res) => {
  try {
    const client = mongoService.getClient();
    if (!client) return res.status(400).json({ error: "Not connected" });

    const { db: dbName, collection: colName } = req.params;
    const { filter: filterParam, sort: sortParam } = req.query;

    const db = client.db(dbName);
    const collection = db.collection(colName);

    let query = {};
    if (filterParam) {
      try { query = JSON.parse(filterParam); } catch (_) {}
    }
    let sort = {};
    if (sortParam) {
      try { sort = JSON.parse(sortParam); } catch (_) {}
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `${dbName}.${colName}.${stamp}.jsonl`;

    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("X-Content-Type-Options", "nosniff");

    // Best-effort metadata for the header line. Failures here don't block.
    const meta = {
      _meta: {
        kind: "mongodb-dashboard-backup",
        version: 1,
        exportedAt: new Date().toISOString(),
        db: dbName,
        collection: colName,
        filter: query,
        sort,
      },
    };
    try {
      meta._meta.estimatedCount = await collection.estimatedDocumentCount();
    } catch (_) {}
    try {
      meta._meta.indexes = await collection.indexes();
    } catch (_) {}
    try {
      const cols = await db.listCollections({ name: colName }).toArray();
      if (cols[0] && cols[0].options) {
        meta._meta.collectionOptions = cols[0].options;
      }
    } catch (_) {}

    res.write(JSON.stringify(meta) + "\n");

    const cursor = collection.find(query).sort(sort);
    let count = 0;
    for await (const doc of cursor) {
      try {
        res.write(JSON.stringify(serializeDocument(doc)) + "\n");
        count += 1;
      } catch (e) {
        // Skip un-serializable docs but keep streaming.
        continue;
      }
    }
    audit.log({
      event: "backup",
      db: dbName,
      collection: colName,
      count,
      ip: req.ip,
    });
    res.end();
  } catch (err) {
    if (!res.headersSent) {
      return res.status(500).json({ error: err.message });
    }
    res.end();
  }
});

// Collection stats
router.get("/:db/:collection/stats", async (req, res) => {
  try {
    const client = mongoService.getClient();
    if (!client) return res.status(400).json({ error: "Not connected" });

    const db = client.db(req.params.db);
    const stats = await db.command({ collStats: req.params.collection });
    const indexes = await db.collection(req.params.collection).indexes();

    res.json({
      ns: stats.ns,
      count: stats.count,
      size: stats.size,
      avgObjSize: stats.avgObjSize || 0,
      storageSize: stats.storageSize,
      totalIndexSize: stats.totalIndexSize,
      indexSizes: stats.indexSizes || {},
      nindexes: stats.nindexes,
      capped: stats.capped || false,
      maxSize: stats.maxSize,
      maxDocs: stats.max,
      freeStorageSize: stats.freeStorageSize || 0,
      indexes: indexes.length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Server stats for performance page
// Watch collection change stream (SSE)
router.get("/:db/:collection/watch", async (req, res) => {
  try {
    const client = mongoService.getClient();
    if (!client) return res.status(400).json({ error: "Not connected" });

    const { db: dbName, collection: colName } = req.params;
    const collection = client.db(dbName).collection(colName);

    // Build optional pipeline filter
    const pipeline = [];
    const opFilter = req.query.operationType;
    if (opFilter && opFilter !== "all") {
      pipeline.push({ $match: { operationType: opFilter } });
    }

    // SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write("event: connected\ndata: {}\n\n");

    const changeStream = collection.watch(pipeline, { fullDocument: "updateLookup" });

    changeStream.on("change", (change) => {
      const payload = {
        operationType: change.operationType,
        ns: change.ns,
        documentKey: change.documentKey,
        fullDocument: change.fullDocument || null,
        updateDescription: change.updateDescription || null,
        clusterTime: change.clusterTime?.toString() || null,
        wallTime: change.wallTime || new Date().toISOString(),
      };
      res.write(`event: change\ndata: ${JSON.stringify(serializeDocument(payload))}\n\n`);
    });

    changeStream.on("error", (err) => {
      res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
      changeStream.close();
    });

    req.on("close", () => {
      changeStream.close();
    });
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});

module.exports = router;
