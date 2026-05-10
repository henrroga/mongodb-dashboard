const express = require("express");
const router = express.Router();
const mongoService = require("../../services/mongodb");
const { serializeDocument, parseDocument } = require("../../utils/bson");
const audit = require("../../utils/audit");
const logger = require("../../utils/logger");
const { GridFSBucket, ObjectId } = require("mongodb");

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
          if (val === "true") val = true;
          else if (val === "false") val = false;
          else if (val !== "" && !isNaN(Number(val))) val = Number(val);
          if (val !== "") doc[h] = val;
        });
        return doc;
      });
    } else {
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
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Export documents (JSON or CSV) - now with streaming!
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

    const cursor = collection.find(query).sort(sort).limit(limit);

    if (format === "csv") {
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${colName}.csv"`);
      
      const sampleDocs = await collection.find(query).sort(sort).limit(Math.min(limit, 100)).toArray();
      if (sampleDocs.length === 0) return res.send("");
      
      const headers = [...new Set(sampleDocs.flatMap(d => Object.keys(serializeDocument(d))))];
      res.write(headers.join(",") + "\n");
      
      for await (const doc of cursor) {
        res.write(toCsvRow(headers, serializeDocument(doc)) + "\n");
      }
      return res.end();
    }

    if (format === "jsonl") {
      res.setHeader("Content-Type", "application/x-ndjson");
      res.setHeader("Content-Disposition", `attachment; filename="${colName}.jsonl"`);
      for await (const doc of cursor) {
        res.write(JSON.stringify(serializeDocument(doc)) + "\n");
      }
      return res.end();
    }

    // JSON Array
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${colName}.json"`);
    res.write("[\n");
    let first = true;
    for await (const doc of cursor) {
      if (!first) res.write(",\n");
      res.write(JSON.stringify(serializeDocument(doc), null, 2));
      first = false;
    }
    res.write("\n]");
    res.end();
  } catch (err) {
    logger.error(err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.end();
    }
  }
});

// Stream the entire collection as JSONL with a metadata header line.
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
    logger.error(err);
    if (!res.headersSent) {
      return res.status(500).json({ error: err.message });
    }
    res.end();
  }
});

// Download file from GridFS
router.get("/:db/:bucket/gridfs/:id", async (req, res) => {
  try {
    const client = mongoService.getClient();
    if (!client) return res.status(400).json({ error: "Not connected" });

    const { db: dbName, bucket, id } = req.params;
    const db = client.db(dbName);
    
    // Bucket name is the prefix (e.g. 'fs' if collection is 'fs.files')
    const bucketName = bucket.replace(".files", "");
    const gfs = new GridFSBucket(db, { bucketName });

    const fileId = new ObjectId(id);
    const files = await db.collection(`${bucketName}.files`).find({ _id: fileId }).toArray();
    if (files.length === 0) return res.status(404).json({ error: "File not found" });

    const file = files[0];
    res.setHeader("Content-Type", file.contentType || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);
    res.setHeader("Content-Length", file.length);

    const downloadStream = gfs.openDownloadStream(fileId);
    downloadStream.pipe(res);

    downloadStream.on("error", (err) => {
      logger.error(err);
      if (!res.headersSent) res.status(500).json({ error: err.message });
    });
  } catch (err) {
    logger.error(err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

module.exports = router;
