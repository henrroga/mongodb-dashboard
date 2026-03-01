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
    const {
      cursor,
      limit = 50,
      filter,
      search,
      arrayFilters,
      sort: sortParam,
      projection: projectionParam,
      skip: skipParam,
    } = req.query;
    const pageLimit = Math.min(parseInt(limit) || 50, 1000);

    const collection = client.db(dbName).collection(colName);

    // Parse sort — custom sort disables cursor-based pagination
    const hasCustomSort = !!sortParam;
    let sort = { createdAt: -1, _id: -1 };
    if (sortParam) {
      try {
        sort = JSON.parse(sortParam);
      } catch (e) {
        // ignore invalid sort, use default
      }
    }

    // Parse projection
    let projection = {};
    if (projectionParam) {
      try {
        projection = JSON.parse(projectionParam);
      } catch (e) {
        // ignore invalid projection
      }
    }

    // Skip offset for offset-based pagination (used with custom sort)
    const skipOffset = Math.max(0, parseInt(skipParam) || 0);
    const useOffsetPagination = hasCustomSort || skipOffset > 0;

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

    // Add array filters
    if (arrayFilters) {
      try {
        const filters = JSON.parse(arrayFilters);
        const arrayConditions = [];

        Object.keys(filters).forEach((fieldName) => {
          const filter = filters[fieldName];

          if (filter.type === "empty") {
            // Filter for empty arrays: field exists and has length 0, or field doesn't exist
            arrayConditions.push({
              $or: [
                { [fieldName]: { $exists: false } },
                { [fieldName]: { $size: 0 } },
                { [fieldName]: null },
              ],
            });
          } else if (
            filter.type === "gte" &&
            typeof filter.value === "number"
          ) {
            // Filter for arrays with length >= value
            // Use $expr to compare array length
            arrayConditions.push({
              $expr: {
                $gte: [
                  { $size: { $ifNull: [`$${fieldName}`, []] } },
                  filter.value,
                ],
              },
            });
          }
        });

        // Combine array conditions with existing query
        if (arrayConditions.length > 0) {
          if (Object.keys(query).length === 0) {
            query = { $and: arrayConditions };
          } else {
            query = { $and: [query, ...arrayConditions] };
          }
        }
      } catch (e) {
        console.error("Error parsing arrayFilters:", e);
        // Ignore invalid arrayFilters
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

    // Cursor-based pagination (only when using default sort)
    let cursorConditions = null;
    if (!useOffsetPagination && cursor) {
      try {
        const cursorData = JSON.parse(cursor);
        if (
          cursorData.createdAt !== null &&
          cursorData.createdAt !== undefined &&
          cursorData._id
        ) {
          let createdAtValue = cursorData.createdAt;
          if (typeof createdAtValue === "string") {
            createdAtValue = new Date(createdAtValue);
          }
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
          cursorConditions = { _id: { $lt: new ObjectId(cursorData._id) } };
        }
      } catch (e) {
        try {
          cursorConditions = { _id: { $lt: new ObjectId(cursor) } };
        } catch (e2) {
          cursorConditions = { _id: { $lt: cursor } };
        }
      }
    }

    // Combine all query conditions
    const conditions = [];
    if (Object.keys(query).length > 0) conditions.push(query);
    if (searchConditions) conditions.push(searchConditions);
    if (cursorConditions) conditions.push(cursorConditions);

    if (conditions.length === 0) {
      query = {};
    } else if (conditions.length === 1) {
      query = conditions[0];
    } else {
      query = { $and: conditions };
    }

    // Build the find cursor with optional projection
    let findCursor = collection.find(query);
    if (Object.keys(projection).length > 0) {
      findCursor = findCursor.project(projection);
    }
    findCursor = findCursor.sort(sort);

    // Fetch documents (offset or cursor pagination)
    let docs;
    if (useOffsetPagination) {
      docs = await findCursor
        .skip(skipOffset)
        .limit(pageLimit + 1)
        .toArray();
    } else {
      docs = await findCursor.limit(pageLimit + 1).toArray();
    }

    const hasMore = docs.length > pageLimit;
    if (hasMore) docs.pop();

    const serializedDocs = docs.map(serializeDocument);

    // Build next cursor / next skip depending on pagination mode
    let nextCursor = null;
    let nextSkip = null;
    if (hasMore) {
      if (useOffsetPagination) {
        nextSkip = skipOffset + pageLimit;
      } else if (docs.length > 0) {
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
    }

    // Get total count (estimated for speed, or exact when filters are active)
    const totalCount = await collection.estimatedDocumentCount();

    res.json({
      documents: serializedDocs,
      nextCursor,
      nextSkip,
      hasMore,
      totalCount,
      paginationMode: useOffsetPagination ? "offset" : "cursor",
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

    // JSON
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${colName}.json"`);
    res.send(JSON.stringify(serialized, null, 2));
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
