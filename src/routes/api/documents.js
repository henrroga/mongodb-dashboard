// Document CRUD: list, fetch, insert, update, delete.
//
// Routes mounted (relative to the api router):
//   GET    /:db/:collection         — paginated list with filter/search/sort
//   GET    /:db/:collection/:id     — single document
//   POST   /:db/:collection         — insert
//   PUT    /:db/:collection/:id     — replace
//   DELETE /:db/:collection/:id     — delete
//
// Note ordering: this router must be mounted AFTER any router that owns
// concrete top-level segments under /api/ (e.g. /databases, /server, /status,
// /connect) — otherwise GET /:db/:collection would shadow them.

const express = require("express");
const logger = require("../../utils/logger");

const router = express.Router();
const mongoService = require("../../services/mongodb");
const { ObjectId } = require("mongodb");
const { serializeDocument, parseDocument } = require("../../utils/bson");
const { buildSearchQuery } = require("./_shared");
const {
  readJsonQueryParam,
  normalizePositiveInt,
} = require("../../middleware/validate");
const {
  assertSafeMongoQueryShape,
  normalizeSkip,
  validateSortObject,
  validateProjectionObject,
} = require("../../utils/queryGuard");

function parseIdQuery(id) {
  try {
    return { _id: new ObjectId(id) };
  } catch (_) {
    return { _id: id };
  }
}

function isPlainObject(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function toClientError(err) {
  if (!err) return "Operation failed";
  if (err.code === 11000) return "Duplicate key error";
  return err.message || "Operation failed";
}

// List documents (paginated, with filter / search / sort / projection /
// array-filters and either cursor- or offset-based pagination).
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
    const pageLimit = normalizePositiveInt(limit, 50, 1000);

    const collection = client.db(dbName).collection(colName);

    // Parse sort — custom sort disables cursor-based pagination
    const hasCustomSort = !!sortParam;
    let sort = { createdAt: -1, _id: -1 };
    if (sortParam) {
      const parsedSort = readJsonQueryParam(req, res, "sort", null);
      if (parsedSort === null) return;
      validateSortObject(parsedSort);
      sort = parsedSort;
    }

    let projection = {};
    if (projectionParam) {
      const parsedProjection = readJsonQueryParam(req, res, "projection", null);
      if (parsedProjection === null) return;
      validateProjectionObject(parsedProjection);
      projection = parsedProjection;
    }

    const skipOffset = normalizeSkip(skipParam);
    const useOffsetPagination = hasCustomSort || skipOffset > 0;

    let query = {};
    if (filter) {
      const parsedFilter = readJsonQueryParam(req, res, "filter", null);
      if (parsedFilter === null) return;
      assertSafeMongoQueryShape(parsedFilter);
      query = parsedFilter;
    }

    if (arrayFilters) {
      const filters = readJsonQueryParam(req, res, "arrayFilters", null);
      if (filters === null) return;
      try {
        const arrayConditions = [];

        Object.keys(filters).forEach((fieldName) => {
          const f = filters[fieldName];

          if (f.type === "empty") {
            arrayConditions.push({
              $or: [
                { [fieldName]: { $exists: false } },
                { [fieldName]: { $size: 0 } },
                { [fieldName]: null },
              ],
            });
          } else if (f.type === "gte" && typeof f.value === "number") {
            arrayConditions.push({
              $expr: {
                $gte: [
                  { $size: { $ifNull: [`$${fieldName}`, []] } },
                  f.value,
                ],
              },
            });
          }
        });

        if (arrayConditions.length > 0) {
          if (Object.keys(query).length === 0) {
            query = { $and: arrayConditions };
          } else {
            query = { $and: [query, ...arrayConditions] };
          }
        }
      } catch (e) {
        logger.error({ err: e }, "Error parsing arrayFilters");
      }
    }

    let searchConditions = null;
    if (search && search.trim()) {
      const searchTerm = search.trim();
      let sampleDoc = null;
      try {
        sampleDoc = await collection.findOne({}, { projection: { _id: 0 } });
      } catch (_) {}
      searchConditions = buildSearchQuery(searchTerm, sampleDoc);
    }

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
      } catch (_) {
        try {
          cursorConditions = { _id: { $lt: new ObjectId(cursor) } };
        } catch (_e2) {
          cursorConditions = { _id: { $lt: cursor } };
        }
      }
    }

    const conditions = [];
    if (Object.keys(query).length > 0) conditions.push(query);
    if (searchConditions) conditions.push(searchConditions);
    if (cursorConditions) conditions.push(cursorConditions);

    if (conditions.length === 0) query = {};
    else if (conditions.length === 1) query = conditions[0];
    else query = { $and: conditions };

    let findCursor = collection.find(query);
    if (Object.keys(projection).length > 0) {
      findCursor = findCursor.project(projection);
    }
    findCursor = findCursor.sort(sort);

    let docs;
    if (useOffsetPagination) {
      docs = await findCursor.skip(skipOffset).limit(pageLimit + 1).toArray();
    } else {
      docs = await findCursor.limit(pageLimit + 1).toArray();
    }

    const hasMore = docs.length > pageLimit;
    if (hasMore) docs.pop();

    const serializedDocs = docs.map(serializeDocument);

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
    if (
      /not allowed|must be|too deeply nested|exceeds/.test(err.message || "")
    ) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

// Single document.
router.get("/:db/:collection/:id", async (req, res) => {
  try {
    const client = mongoService.getClient();
    if (!client) return res.status(400).json({ error: "Not connected" });

    const { db: dbName, collection: colName, id } = req.params;
    const collection = client.db(dbName).collection(colName);

    let query;
    try { query = { _id: new ObjectId(id) }; }
    catch (_) { query = { _id: id }; }

    const doc = await collection.findOne(query);
    if (!doc) return res.status(404).json({ error: "Document not found" });

    res.json({ document: serializeDocument(doc) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:db/:collection", async (req, res) => {
  try {
    const client = mongoService.getClient();
    if (!client) return res.status(400).json({ error: "Not connected" });

    const { db: dbName, collection: colName } = req.params;
    const collection = client.db(dbName).collection(colName);

    if (!isPlainObject(req.body)) {
      return res.status(400).json({ error: "Document body must be a JSON object" });
    }
    const doc = parseDocument(req.body);
    if (!isPlainObject(doc)) {
      return res.status(400).json({ error: "Document body must be a JSON object" });
    }
    const result = await collection.insertOne(doc);
    res.json({ success: true, insertedId: result.insertedId.toString() });
  } catch (err) {
    res.status(500).json({ error: toClientError(err) });
  }
});

router.put("/:db/:collection/:id", async (req, res) => {
  try {
    const client = mongoService.getClient();
    if (!client) return res.status(400).json({ error: "Not connected" });

    const { db: dbName, collection: colName, id } = req.params;
    const collection = client.db(dbName).collection(colName);

    const query = parseIdQuery(id);

    if (!isPlainObject(req.body)) {
      return res.status(400).json({ error: "Document body must be a JSON object" });
    }
    const updates = parseDocument(req.body);
    if (!isPlainObject(updates)) {
      return res.status(400).json({ error: "Document body must be a JSON object" });
    }
    delete updates._id;

    const result = await collection.replaceOne(query, updates);
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Document not found" });
    }
    res.json({ success: true, modifiedCount: result.modifiedCount });
  } catch (err) {
    res.status(500).json({ error: toClientError(err) });
  }
});

router.patch("/:db/:collection/:id", async (req, res) => {
  try {
    const client = mongoService.getClient();
    if (!client) return res.status(400).json({ error: "Not connected" });

    const { db: dbName, collection: colName, id } = req.params;
    const collection = client.db(dbName).collection(colName);
    const query = parseIdQuery(id);

    const { $set, $unset } = req.body || {};
    const hasSet = isPlainObject($set) && Object.keys($set).length > 0;
    const hasUnset = isPlainObject($unset) && Object.keys($unset).length > 0;
    if (!hasSet && !hasUnset) {
      return res.status(400).json({ error: "Provide $set and/or $unset object" });
    }

    const updateDoc = {};
    if (hasSet) updateDoc.$set = parseDocument($set);
    if (hasUnset) updateDoc.$unset = $unset;

    const result = await collection.updateOne(query, updateDoc);
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Document not found" });
    }
    res.json({ success: true, matchedCount: result.matchedCount, modifiedCount: result.modifiedCount });
  } catch (err) {
    res.status(500).json({ error: toClientError(err) });
  }
});

router.delete("/:db/:collection/:id", async (req, res) => {
  try {
    const client = mongoService.getClient();
    if (!client) return res.status(400).json({ error: "Not connected" });

    const { db: dbName, collection: colName, id } = req.params;
    const collection = client.db(dbName).collection(colName);

    const query = parseIdQuery(id);

    const result = await collection.deleteOne(query);
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Document not found" });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: toClientError(err) });
  }
});

router.delete("/:db/:collection", async (req, res) => {
  try {
    const client = mongoService.getClient();
    if (!client) return res.status(400).json({ error: "Not connected" });

    const { db: dbName, collection: colName } = req.params;
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "No IDs provided" });
    }

    const collection = client.db(dbName).collection(colName);

    const objectIds = ids.map((id) => {
      try {
        return new ObjectId(id);
      } catch (_) {
        return id;
      }
    });

    const result = await collection.deleteMany({ _id: { $in: objectIds } });
    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:db/:collection/bulk-update", async (req, res) => {
  try {
    const client = mongoService.getClient();
    if (!client) return res.status(400).json({ error: "Not connected" });

    const { db: dbName, collection: colName } = req.params;
    const { ids, filter, update, dryRun = false } = req.body || {};

    if (!update || typeof update !== "object" || Array.isArray(update)) {
      return res.status(400).json({ error: "Update document is required" });
    }

    const collection = client.db(dbName).collection(colName);

    let query = null;
    if (Array.isArray(ids) && ids.length > 0) {
      const objectIds = ids.map((id) => {
        try {
          return new ObjectId(id);
        } catch (_) {
          return id;
        }
      });
      query = { _id: { $in: objectIds } };
    } else if (filter && typeof filter === "object") {
      query = filter;
    }

    if (!query) {
      return res.status(400).json({ error: "Provide ids or filter" });
    }

    const sample = await collection
      .find(query, { projection: { _id: 1 } })
      .limit(5)
      .toArray();
    const matchedCount = await collection.countDocuments(query, { limit: 100000 });

    if (dryRun) {
      return res.json({
        dryRun: true,
        matchedCount,
        sampleIds: sample.map((d) => String(d._id)),
      });
    }

    const parsedUpdate = parseDocument(update);
    const result = await collection.updateMany(query, parsedUpdate);
    return res.json({
      success: true,
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
