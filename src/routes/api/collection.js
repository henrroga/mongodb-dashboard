const express = require("express");
const router = express.Router();
const mongoService = require("../../services/mongodb");
const { serializeDocument } = require("../../utils/bson");
const { inferSchema } = require("../../utils/schema");
const logger = require("../../utils/logger");

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
    logger.error(err);
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
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get collection schema
router.get("/:db/:collection/schema", async (req, res) => {
  try {
    const client = mongoService.getClient();
    if (!client) return res.status(400).json({ error: "Not connected" });

    const { db: dbName, collection: colName } = req.params;
    const collection = client.db(dbName).collection(colName);

    const schema = await inferSchema(collection);
    res.json({ schema });
  } catch (err) {
    logger.error(err);
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
          fields[key] = { types: {}, values: [], numbers: [], dates: [], booleans: { true: 0, false: 0 } };
        }
        const f = fields[key];
        const type = getType(value);
        f.types[type] = (f.types[type] || 0) + 1;

        if (type === "string" && f.values.length < 2000) f.values.push(value);
        if (type === "number" && f.numbers.length < 2000) f.numbers.push(value);
        if (type === "date" && f.dates.length < 2000) {
          const d = value && value.$date ? new Date(value.$date) : new Date(value);
          if (!isNaN(d.getTime())) f.dates.push(d.getTime());
        }
        if (type === "boolean") {
          if (value === true) f.booleans.true++;
          else f.booleans.false++;
        }
      }
    }

    const result = {};
    for (const [key, f] of Object.entries(fields)) {
      const entry = {
        types: f.types,
        presence: parseFloat((Object.values(f.types).reduce((a, b) => a + b, 0) / total).toFixed(3)),
      };

      if (f.values.length > 0) {
        const counts = {};
        f.values.forEach((v) => { counts[v] = (counts[v] || 0) + 1; });
        entry.topValues = Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([value, count]) => ({ value, count }));
        entry.uniqueCount = Object.keys(counts).length;
      }

      if ((f.booleans.true + f.booleans.false) > 0) {
        entry.booleans = f.booleans;
      }

      if (f.dates.length > 1) {
        const sorted = f.dates.slice().sort((a, b) => a - b);
        const minTs = sorted[0];
        const maxTs = sorted[sorted.length - 1];
        entry.dateMin = new Date(minTs).toISOString();
        entry.dateMax = new Date(maxTs).toISOString();
        const span = maxTs - minTs;
        const bucketCount = 12;
        if (span > 0) {
          const size = span / bucketCount;
          const buckets = Array.from({ length: bucketCount }, (_, i) => ({
            min: new Date(minTs + i * size).toISOString(),
            max: new Date(minTs + (i + 1) * size).toISOString(),
            count: 0,
          }));
          for (const ts of sorted) {
            const idx = Math.min(Math.floor((ts - minTs) / size), bucketCount - 1);
            buckets[idx].count++;
          }
          entry.dateHistogram = buckets;
        }
      }

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
    logger.error(err);
    res.status(500).json({ error: err.message });
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
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Watch collection change stream (SSE)
router.get("/:db/:collection/watch", async (req, res) => {
  try {
    const client = mongoService.getClient();
    if (!client) return res.status(400).json({ error: "Not connected" });

    const { db: dbName, collection: colName } = req.params;
    const collection = client.db(dbName).collection(colName);

    const pipeline = [];
    const opFilter = req.query.operationType;
    if (opFilter && opFilter !== "all") {
      pipeline.push({ $match: { operationType: opFilter } });
    }

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
      logger.error(err);
      res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
      changeStream.close();
    });

    req.on("close", () => {
      changeStream.close();
    });
  } catch (err) {
    logger.error(err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});

module.exports = router;
