const express = require("express");
const router = express.Router();
const mongoService = require("../../services/mongodb");
const { serializeDocument } = require("../../utils/bson");
const logger = require("../../utils/logger");

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
    logger.error(err);
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

    const safePipeline = [...pipeline];
    const lastStage = safePipeline[safePipeline.length - 1];
    const hasLimit = lastStage && (lastStage.$limit != null || lastStage.$out || lastStage.$merge);
    if (!hasLimit) safePipeline.push({ $limit: limit });

    const docs = await col.aggregate(safePipeline, { allowDiskUse: true }).toArray();
    res.json({ documents: docs.map(serializeDocument), count: docs.length });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
