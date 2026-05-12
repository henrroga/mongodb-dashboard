const express = require("express");
const router = express.Router();
const fs = require("fs/promises");
const path = require("path");
const mongoService = require("../../services/mongodb");
const config = require("../../config");
const usersService = require("../../services/users");
const {
  bad,
  requireStringField,
  isPlainObject,
} = require("../../middleware/validate-body");
const { serializeDocument, parseDocument } = require("../../utils/bson");
const { parseCsv, toCsvRow } = require("../../utils/csv");
const audit = require("../../utils/audit");
const logger = require("../../utils/logger");
const { GridFSBucket, ObjectId } = require("mongodb");
const {
  readJsonQueryParam,
  normalizePositiveInt,
} = require("../../middleware/validate");

const SUPPORTED_IMPORT_FORMATS = new Set(["json", "jsonl", "csv"]);
const SUPPORTED_EXPORT_FORMATS = new Set(["json", "jsonl", "csv"]);

const MAX_IMPORT_DOCS = 50000;
const BACKUP_RUNS_PATH = path.resolve(process.cwd(), "data", "backup-runs.json");

async function appendBackupRun(run) {
  try {
    await fs.mkdir(path.dirname(BACKUP_RUNS_PATH), { recursive: true });
    let existing = [];
    try {
      existing = JSON.parse(await fs.readFile(BACKUP_RUNS_PATH, "utf8"));
      if (!Array.isArray(existing)) existing = [];
    } catch {}
    existing.unshift(run);
    await fs.writeFile(BACKUP_RUNS_PATH, JSON.stringify(existing.slice(0, 200), null, 2), "utf8");
  } catch (_) {}
}

function parseRestorePayload(content) {
  const lines = String(content).split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) {
    const err = new Error("Empty backup content");
    err.status = 400;
    throw err;
  }
  const docs = [];
  for (const line of lines) {
    const parsed = JSON.parse(line);
    if (parsed && parsed._meta) continue;
    docs.push(parseDocument(parsed));
  }
  if (!docs.length) {
    const err = new Error("No documents found in backup payload");
    err.status = 400;
    throw err;
  }
  return docs;
}

// Import documents (JSON array, NDJSON, or CSV)
router.post("/:db/:collection/import", express.json({ limit: "50mb" }), async (req, res) => {
  try {
    if (config.auth.enabled && !usersService.hasPermission(req.session, "write")) {
      return res.status(403).json({ error: "Import denied by RBAC" });
    }
    const client = mongoService.getClient();
    if (!client) return res.status(400).json({ error: "Not connected" });

    const { db: dbName, collection: colName } = req.params;
    const { format = "json", content, stopOnError = false } = req.body;

    if (!SUPPORTED_IMPORT_FORMATS.has(format)) {
      return res.status(400).json({ error: "Invalid import format" });
    }

    if (!content) return res.status(400).json({ error: "No content provided" });

    const collection = client.db(dbName).collection(colName);

    let docs = [];
    if (format === "csv") {
      const normalized = String(content).replace(/^\uFEFF/, "").trim();
      const rows = parseCsv(normalized);
      if (rows.length < 2) return res.status(400).json({ error: "CSV must have a header row and at least one data row" });
      const headers = rows[0].map((h) => String(h || "").trim());
      if (headers.some((h) => !h)) {
        return res.status(400).json({ error: "CSV header contains an empty column name" });
      }
      if (new Set(headers).size !== headers.length) {
        return res.status(400).json({ error: "CSV header contains duplicate column names" });
      }
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
          .split(/\r?\n/)
          .filter((l) => l.trim())
          .map((l) => JSON.parse(l));
      }
      docs = docs.map(parseDocument);
    }

    if (!Array.isArray(docs)) {
      return res.status(400).json({ error: "Import payload must resolve to an array of documents" });
    }
    if (docs.length > MAX_IMPORT_DOCS) {
      return res.status(413).json({ error: `Import too large: max ${MAX_IMPORT_DOCS} documents per request` });
    }

    let inserted = 0;
    let errors = [];
    for (const doc of docs) {
      try {
        if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
          throw new Error("Each imported row must be a JSON object/document");
        }
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
    const { format = "json", limit: limitParam } = req.query;
    if (!SUPPORTED_EXPORT_FORMATS.has(format)) {
      return res.status(400).json({ error: "Invalid export format" });
    }

    const collection = client.db(dbName).collection(colName);

    const query = readJsonQueryParam(req, res, "filter", {});
    if (query === null) return;
    const sort = readJsonQueryParam(req, res, "sort", {});
    if (sort === null) return;

    const limit = normalizePositiveInt(limitParam, 10000, 100000);

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
    const query = readJsonQueryParam(req, res, "filter", {});
    if (query === null) return;
    const sort = readJsonQueryParam(req, res, "sort", {});
    if (sort === null) return;

    const db = client.db(dbName);
    const collection = db.collection(colName);

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
    appendBackupRun({
      ts: new Date().toISOString(),
      db: dbName,
      collection: colName,
      count,
      ip: req.ip,
      filename,
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

router.get("/backups/history", async (_req, res) => {
  try {
    if (config.auth.enabled && !usersService.hasPermission(_req.session, "audit")) {
      return res.status(403).json({ error: "Backup history denied by RBAC" });
    }
    const raw = await fs.readFile(BACKUP_RUNS_PATH, "utf8");
    const runs = JSON.parse(raw);
    res.json({ runs: Array.isArray(runs) ? runs : [] });
  } catch {
    res.json({ runs: [] });
  }
});

router.post("/:db/:collection/restore", express.json({ limit: "100mb" }), async (req, res) => {
  try {
    if (config.auth.enabled && !usersService.hasPermission(req.session, "write")) {
      return res.status(403).json({ error: "Restore denied by RBAC" });
    }
    const client = mongoService.getClient();
    if (!client) return res.status(400).json({ error: "Not connected" });
    const { db: dbName, collection: colName } = req.params;
    const contentField = requireStringField(req.body, "content", { min: 2, max: 100000000 });
    if (!contentField.ok) return bad(res, contentField.error);
    const mode = String(req.body?.mode || "insert");
    if (!["insert", "replace"].includes(mode)) return bad(res, "mode must be insert or replace");
    const dryRun = req.body?.dryRun === true;
    const confirmReplace = req.body?.confirmReplace === true;
    const content = contentField.value;
    const docs = parseRestorePayload(content);
    const withId = docs.filter((d) => d && typeof d === "object" && d._id).length;
    const withoutId = docs.length - withId;
    if (dryRun) {
      return res.json({
        success: true,
        dryRun: true,
        total: docs.length,
        withId,
        withoutId,
        mode,
        warning: mode === "replace"
          ? "Replace mode will delete all documents in the target collection before restore."
          : null,
      });
    }
    if (mode === "replace" && !confirmReplace) {
      return res.status(400).json({
        error: "replace mode requires explicit confirmation",
        code: "RESTORE_CONFIRM_REQUIRED",
      });
    }
    const col = client.db(dbName).collection(colName);
    let restored = 0;
    if (mode === "replace") {
      await col.deleteMany({});
    }
    for (const d of docs) {
      try {
        if (d && d._id) {
          await col.replaceOne({ _id: d._id }, d, { upsert: true });
        } else {
          await col.insertOne(d);
        }
        restored += 1;
      } catch (_) {}
    }
    appendBackupRun({
      ts: new Date().toISOString(),
      db: dbName,
      collection: colName,
      restored,
      mode,
      event: "restore",
    });
    res.json({ success: true, restored, total: docs.length });
  } catch (err) {
    logger.error(err);
    res.status(err.status || 500).json({ error: err.message });
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

router.get("/:db/:bucket/gridfs", async (req, res) => {
  try {
    const client = mongoService.getClient();
    if (!client) return res.status(400).json({ error: "Not connected" });
    const { db: dbName, bucket } = req.params;
    const db = client.db(dbName);
    const bucketName = bucket.replace(".files", "");
    const docs = await db
      .collection(`${bucketName}.files`)
      .find({})
      .sort({ uploadDate: -1 })
      .limit(200)
      .project({ filename: 1, length: 1, contentType: 1, uploadDate: 1, metadata: 1 })
      .toArray();
    res.json({ files: docs.map(serializeDocument), bucket: bucketName });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/:db/:bucket/gridfs", express.json({ limit: "50mb" }), async (req, res) => {
  try {
    if (config.auth.enabled && !usersService.hasPermission(req.session, "write")) {
      return res.status(403).json({ error: "GridFS upload denied by RBAC" });
    }
    const client = mongoService.getClient();
    if (!client) return res.status(400).json({ error: "Not connected" });
    const { db: dbName, bucket } = req.params;
    const filenameField = requireStringField(req.body, "filename", { min: 1, max: 512 });
    if (!filenameField.ok) return bad(res, filenameField.error);
    const b64Field = requireStringField(req.body, "contentBase64", { min: 4, max: 70000000 });
    if (!b64Field.ok) return bad(res, b64Field.error);
    const contentType = typeof req.body?.contentType === "string"
      ? req.body.contentType.slice(0, 200)
      : undefined;
    const metadata = isPlainObject(req.body?.metadata) ? req.body.metadata : {};
    const db = client.db(dbName);
    const bucketName = bucket.replace(".files", "");
    const gfs = new GridFSBucket(db, { bucketName });
    const bytes = Buffer.from(String(b64Field.value), "base64");
    const uploadStream = gfs.openUploadStream(filenameField.value, { contentType, metadata });
    uploadStream.end(bytes);
    await new Promise((resolve, reject) => {
      uploadStream.on("finish", resolve);
      uploadStream.on("error", reject);
    });
    res.json({ success: true, id: uploadStream.id });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:db/:bucket/gridfs/:id", async (req, res) => {
  try {
    if (config.auth.enabled && !usersService.hasPermission(req.session, "write")) {
      return res.status(403).json({ error: "GridFS delete denied by RBAC" });
    }
    const client = mongoService.getClient();
    if (!client) return res.status(400).json({ error: "Not connected" });
    const { db: dbName, bucket, id } = req.params;
    const db = client.db(dbName);
    const bucketName = bucket.replace(".files", "");
    const gfs = new GridFSBucket(db, { bucketName });
    await gfs.delete(new ObjectId(id));
    res.json({ success: true });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
