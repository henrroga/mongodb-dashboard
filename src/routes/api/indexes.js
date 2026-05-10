// Index management for a collection.
//
// Routes mounted (relative to the api router):
//   GET    /:db/:collection/indexes
//   POST   /:db/:collection/indexes
//   DELETE /:db/:collection/indexes/:indexName
//   PUT    /:db/:collection/indexes/:indexName  (toggle hidden)

const express = require("express");
const router = express.Router();
const mongoService = require("../../services/mongodb");

router.get("/:db/:collection/indexes", async (req, res) => {
  try {
    const client = mongoService.getClient();
    if (!client) return res.status(400).json({ error: "Not connected" });

    const col = client.db(req.params.db).collection(req.params.collection);
    const indexes = await col.indexes();

    // Enrich with on-disk size when available.
    let indexSizes = {};
    try {
      const stats = await client
        .db(req.params.db)
        .command({ collStats: req.params.collection });
      indexSizes = stats.indexSizes || {};
    } catch (_) {}

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

module.exports = router;
