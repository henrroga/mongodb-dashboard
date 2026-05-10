// Database + collection lifecycle and listings.
//
// Routes mounted (relative to the api router):
//   GET    /databases
//   POST   /databases
//   DELETE /databases/:db
//   GET    /:db/collections
//   POST   /:db/collections
//   DELETE /:db/collections/:collection
//   PUT    /:db/collections/:collection
//
// Mounted before documents.js so /databases doesn't get shadowed by the
// /:db/:collection catchall (databases.js owns concrete top-level paths).

const express = require("express");
const router = express.Router();
const mongoService = require("../../services/mongodb");

router.get("/databases", async (req, res) => {
  try {
    const client = mongoService.getClient();
    if (!client) return res.status(400).json({ error: "Not connected" });

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

// MongoDB creates a db lazily, so we create an initial collection.
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

router.get("/:db/collections", async (req, res) => {
  try {
    const client = mongoService.getClient();
    if (!client) return res.status(400).json({ error: "Not connected" });

    const db = client.db(req.params.db);
    const collections = await db.listCollections().toArray();
    const collectionsWithCounts = await Promise.all(
      collections.map(async (col) => {
        let count = 0;
        if (col.type === "collection") {
          try {
            count = await db.collection(col.name).estimatedDocumentCount();
          } catch (_) {}
        }
        return {
          name: col.name,
          type: col.type || "collection",
          count,
          options: col.options || {},
        };
      })
    );
    res.json({ collections: collectionsWithCounts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:db/collections", async (req, res) => {
  try {
    const client = mongoService.getClient();
    if (!client) return res.status(400).json({ error: "Not connected" });

    const { name, options = {}, isView, viewOn, pipeline } = req.body;
    if (!name)
      return res.status(400).json({ error: "Collection name is required" });

    if (isView) {
      if (!viewOn)
        return res.status(400).json({ error: "Source collection is required for views" });
      await client.db(req.params.db).createCollection(name, {
        viewOn,
        pipeline: pipeline || [],
      });
    } else {
      await client.db(req.params.db).createCollection(name, options);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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

module.exports = router;
