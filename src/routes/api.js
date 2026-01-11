const express = require("express");
const router = express.Router();
const mongoService = require("../services/mongodb");
const { ObjectId } = require("mongodb");
const { serializeDocument, parseDocument } = require("../utils/bson");
const { inferSchema } = require("../utils/schema");

/**
 * Recursively extract all field paths from a document that can be searched
 */
function extractSearchableFields(obj, prefix = "", fields = new Set()) {
  if (obj === null || obj === undefined) {
    return fields;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    obj.forEach((item) => {
      if (typeof item === "string" || typeof item === "number") {
        // For arrays, we'll search the array field itself
        if (prefix) fields.add(prefix);
      } else if (typeof item === "object" && item !== null) {
        extractSearchableFields(item, prefix, fields);
      }
    });
    return fields;
  }

  // Handle objects
  if (typeof obj === "object") {
    // Skip BSON type wrappers
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
 * Build a MongoDB query to search across all fields in documents
 */
function buildSearchQuery(searchTerm, sampleDoc = null) {
  const conditions = [];
  const searchRegex = { $regex: searchTerm, $options: "i" }; // Case-insensitive
  const isNumeric = !isNaN(parseFloat(searchTerm)) && isFinite(searchTerm);
  const numValue = isNumeric ? parseFloat(searchTerm) : null;

  // If we have a sample document, extract all searchable fields from it
  if (sampleDoc) {
    const fields = extractSearchableFields(sampleDoc);
    fields.forEach((field) => {
      // For string fields, use regex
      conditions.push({ [field]: searchRegex });

      // For numeric fields, also check exact match if search term is numeric
      if (isNumeric) {
        // We'll add numeric conditions separately
      }
    });
  }

  // Always search in common top-level fields
  const commonFields = [
    "_id",
    "name",
    "title",
    "description",
    "email",
    "username",
    "text",
    "content",
    "message",
    "value",
    "label",
    "type",
    "status",
    "category",
    "tags",
    "notes",
    "comment",
    "address",
    "phone",
    "url",
    "link",
    "id",
    "code",
    "key",
  ];

  commonFields.forEach((field) => {
    if (!conditions.some((c) => c[field])) {
      conditions.push({ [field]: searchRegex });
    }
  });

  // If numeric, also search in numeric fields
  if (isNumeric) {
    const numericFields = [
      "id",
      "count",
      "quantity",
      "price",
      "amount",
      "score",
      "rating",
      "age",
      "year",
      "month",
      "day",
      "index",
      "order",
    ];
    numericFields.forEach((field) => {
      conditions.push({ [field]: numValue });
    });
  }

  return {
    $or: conditions.length > 0 ? conditions : [{ _id: searchRegex }],
  };
}

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
    const { cursor, limit = 50, filter, search } = req.query;
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

    // Add text search across all fields
    let searchConditions = null;
    if (search && search.trim()) {
      const searchTerm = search.trim();

      // Get a sample document to understand field structure
      let sampleDoc = null;
      try {
        sampleDoc = await collection.findOne({}, { projection: { _id: 0 } });
      } catch (e) {
        // Ignore errors, will use default fields
      }

      searchConditions = buildSearchQuery(searchTerm, sampleDoc);
    }

    // Build sort - prioritize createdAt descending (most recent first), then _id descending
    const sort = { createdAt: -1, _id: -1 };

    // Cursor-based pagination
    // For createdAt sorting, we need to handle cursor differently
    let cursorConditions = null;
    if (cursor) {
      try {
        // Try to parse cursor as JSON containing createdAt and _id
        const cursorData = JSON.parse(cursor);
        if (
          cursorData.createdAt !== null &&
          cursorData.createdAt !== undefined &&
          cursorData._id
        ) {
          // Parse createdAt date if it's a string
          let createdAtValue = cursorData.createdAt;
          if (typeof createdAtValue === "string") {
            createdAtValue = new Date(createdAtValue);
          }

          // Use compound cursor for createdAt + _id sorting
          // Documents with createdAt < cursor OR (createdAt == cursor AND _id < cursor._id)
          cursorConditions = {
            $or: [
              { createdAt: { $lt: createdAtValue } },
              {
                createdAt: createdAtValue,
                _id: { $lt: new ObjectId(cursorData._id) },
              },
            ],
          };
        } else if (cursorData._id) {
          // Fallback to _id cursor only (for documents without createdAt)
          cursorConditions = { _id: { $lt: new ObjectId(cursorData._id) } };
        }
      } catch (e) {
        // If cursor is not JSON, try as simple _id (backward compatibility)
        try {
          cursorConditions = { _id: { $lt: new ObjectId(cursor) } };
        } catch (e2) {
          cursorConditions = { _id: { $lt: cursor } };
        }
      }
    }

    // Combine all query conditions
    const conditions = [];
    if (Object.keys(query).length > 0) {
      conditions.push(query);
    }
    if (searchConditions) {
      conditions.push(searchConditions);
    }
    if (cursorConditions) {
      conditions.push(cursorConditions);
    }

    // Build final query
    if (conditions.length === 0) {
      query = {};
    } else if (conditions.length === 1) {
      query = conditions[0];
    } else {
      query = { $and: conditions };
    }

    // Fetch documents
    const docs = await collection
      .find(query)
      .sort(sort)
      .limit(pageLimit + 1) // Fetch one extra to check if there's more
      .toArray();

    const hasMore = docs.length > pageLimit;
    if (hasMore) docs.pop();

    const serializedDocs = docs.map(serializeDocument);

    // Build cursor with createdAt and _id for proper pagination
    let nextCursor = null;
    if (hasMore && docs.length > 0) {
      const lastDoc = docs[docs.length - 1];
      const cursorData = {
        createdAt: lastDoc.createdAt
          ? lastDoc.createdAt instanceof Date
            ? lastDoc.createdAt.toISOString()
            : lastDoc.createdAt
          : null,
        _id: lastDoc._id.toString(),
      };
      nextCursor = JSON.stringify(cursorData);
    }

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
          connectionString: mongoService.getConnectionString(),
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
