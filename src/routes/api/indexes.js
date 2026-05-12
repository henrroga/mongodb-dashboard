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
const config = require("../../config");
const usersService = require("../../services/users");

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
    if (config.auth.enabled && !usersService.hasPermission(req.session, "indexAdmin")) {
      return res.status(403).json({ error: "Index admin access denied by RBAC" });
    }
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
    if (config.auth.enabled && !usersService.hasPermission(req.session, "indexAdmin")) {
      return res.status(403).json({ error: "Index admin access denied by RBAC" });
    }
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
    if (config.auth.enabled && !usersService.hasPermission(req.session, "indexAdmin")) {
      return res.status(403).json({ error: "Index admin access denied by RBAC" });
    }
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

router.post("/:db/:collection/indexes/advisor", async (req, res) => {
  try {
    const client = mongoService.getClient();
    if (!client) return res.status(400).json({ error: "Not connected" });
    const db = client.db(req.params.db);
    const col = db.collection(req.params.collection);
    const indexes = await col.indexes();
    const { filter = {}, sort = {} } = req.body || {};

    const recommendations = [];
    const warnings = [];

    const hasPrefixIndex = (fields) => {
      const wanted = Object.keys(fields);
      return indexes.some((idx) => {
        const keys = Object.keys(idx.key || {});
        if (keys.length < wanted.length) return false;
        for (let i = 0; i < wanted.length; i += 1) {
          if (keys[i] !== wanted[i]) return false;
        }
        return true;
      });
    };

    if (filter && typeof filter === "object" && Object.keys(filter).length > 0) {
      const key = {};
      for (const k of Object.keys(filter)) key[k] = 1;
      if (!hasPrefixIndex(key)) {
        recommendations.push({
          type: "missing_filter_index",
          message: "No index matches current filter fields",
          key,
        });
      }
    }

    if (sort && typeof sort === "object" && Object.keys(sort).length > 0) {
      if (!hasPrefixIndex(sort)) {
        recommendations.push({
          type: "missing_sort_index",
          message: "No index matches current sort pattern",
          key: sort,
        });
      }
    }

    const byKey = new Map();
    for (const idx of indexes) {
      const sig = JSON.stringify(idx.key || {});
      if (!byKey.has(sig)) byKey.set(sig, []);
      byKey.get(sig).push(idx.name);
    }
    for (const [sig, names] of byKey.entries()) {
      if (names.length > 1) {
        warnings.push({
          type: "duplicate_index",
          message: "Duplicate index key pattern detected",
          key: JSON.parse(sig),
          names,
        });
      }
    }

    res.json({ recommendations, warnings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
