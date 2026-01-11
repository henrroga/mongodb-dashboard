const express = require("express");
const router = express.Router();
const mongoService = require("../services/mongodb");
const { ObjectId } = require("mongodb");
const { serializeDocument, parseDocument } = require("../utils/bson");
const { inferSchema } = require("../utils/schema");

// Test connection and get databases
router.post("/connect", async (req, res) => {
  try {
    const { connectionString } = req.body;
    if (!connectionString) {
      return res.status(400).json({ error: "Connection string is required" });
    }

    const client = await mongoService.connect(connectionString);
    const adminDb = client.db().admin();
    const { databases } = await adminDb.listDatabases();

    res.json({
      success: true,
      databases: databases.map((db) => ({
        name: db.name,
        sizeOnDisk: db.sizeOnDisk,
        empty: db.empty,
      })),
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

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
router.get("/:db/:collection", async (req, res) => {
  try {
    const client = mongoService.getClient();
    if (!client) {
      return res.status(400).json({ error: "Not connected" });
    }

    const { db: dbName, collection: colName } = req.params;
    const { cursor, limit = 50, filter } = req.query;
    const pageLimit = Math.min(parseInt(limit) || 50, 100);

    const collection = client.db(dbName).collection(colName);

    // Build query
    let query = {};
    if (filter) {
      try {
        query = JSON.parse(filter);
      } catch (e) {
        // If not valid JSON, search in common string fields
        query = { $or: [] };
      }
    }

    // Cursor-based pagination
    if (cursor) {
      try {
        query._id = { $gt: new ObjectId(cursor) };
      } catch (e) {
        // Handle non-ObjectId _id fields
        query._id = { $gt: cursor };
      }
    }

    // Fetch documents
    const docs = await collection
      .find(query)
      .sort({ _id: 1 })
      .limit(pageLimit + 1) // Fetch one extra to check if there's more
      .toArray();

    const hasMore = docs.length > pageLimit;
    if (hasMore) docs.pop();

    const serializedDocs = docs.map(serializeDocument);
    const nextCursor =
      hasMore && docs.length > 0 ? docs[docs.length - 1]._id.toString() : null;

    // Get total count (estimated for speed)
    const totalCount = await collection.estimatedDocumentCount();

    res.json({
      documents: serializedDocs,
      nextCursor,
      hasMore,
      totalCount,
    });
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

// Get single document
router.get("/:db/:collection/:id", async (req, res) => {
  try {
    const client = mongoService.getClient();
    if (!client) {
      return res.status(400).json({ error: "Not connected" });
    }

    const { db: dbName, collection: colName, id } = req.params;
    const collection = client.db(dbName).collection(colName);

    let query;
    try {
      query = { _id: new ObjectId(id) };
    } catch (e) {
      query = { _id: id };
    }

    const doc = await collection.findOne(query);
    if (!doc) {
      return res.status(404).json({ error: "Document not found" });
    }

    res.json({ document: serializeDocument(doc) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create document
router.post("/:db/:collection", async (req, res) => {
  try {
    const client = mongoService.getClient();
    if (!client) {
      return res.status(400).json({ error: "Not connected" });
    }

    const { db: dbName, collection: colName } = req.params;
    const collection = client.db(dbName).collection(colName);

    const doc = parseDocument(req.body);
    const result = await collection.insertOne(doc);

    res.json({
      success: true,
      insertedId: result.insertedId.toString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update document
router.put("/:db/:collection/:id", async (req, res) => {
  try {
    const client = mongoService.getClient();
    if (!client) {
      return res.status(400).json({ error: "Not connected" });
    }

    const { db: dbName, collection: colName, id } = req.params;
    const collection = client.db(dbName).collection(colName);

    let query;
    try {
      query = { _id: new ObjectId(id) };
    } catch (e) {
      query = { _id: id };
    }

    const updates = parseDocument(req.body);
    delete updates._id; // Don't update _id

    const result = await collection.replaceOne(query, updates);

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Document not found" });
    }

    res.json({ success: true, modifiedCount: result.modifiedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete document
router.delete("/:db/:collection/:id", async (req, res) => {
  try {
    const client = mongoService.getClient();
    if (!client) {
      return res.status(400).json({ error: "Not connected" });
    }

    const { db: dbName, collection: colName, id } = req.params;
    const collection = client.db(dbName).collection(colName);

    let query;
    try {
      query = { _id: new ObjectId(id) };
    } catch (e) {
      query = { _id: id };
    }

    const result = await collection.deleteOne(query);

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Document not found" });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Check connection status
router.get("/status", async (req, res) => {
  try {
    const client = mongoService.getClient();
    const isConnected = mongoService.isConnected();
    
    if (isConnected && client) {
      // Test the connection
      try {
        await client.db().admin().ping();
        res.json({ 
          connected: true,
          connectionString: mongoService.getConnectionString() 
        });
      } catch (err) {
        // Connection exists but is invalid
        await mongoService.disconnect();
        res.json({ connected: false });
      }
    } else {
      res.json({ connected: false });
    }
  } catch (err) {
    res.json({ connected: false });
  }
});

// Disconnect
router.post("/disconnect", async (req, res) => {
  try {
    await mongoService.disconnect();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
