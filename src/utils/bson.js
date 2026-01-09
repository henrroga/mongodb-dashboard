const { ObjectId, Binary, Decimal128, Long, Timestamp } = require("mongodb");

/**
 * Serialize a MongoDB document for JSON transmission
 * Handles special BSON types
 */
function serializeDocument(doc) {
  if (doc === null || doc === undefined) {
    return doc;
  }

  if (Array.isArray(doc)) {
    return doc.map(serializeDocument);
  }

  if (doc instanceof ObjectId) {
    return { $oid: doc.toString() };
  }

  if (doc instanceof Date) {
    return { $date: doc.toISOString() };
  }

  if (doc instanceof Binary) {
    return {
      $binary: doc.toString("base64"),
      $type: doc.sub_type.toString(16),
    };
  }

  if (doc instanceof Decimal128) {
    return { $numberDecimal: doc.toString() };
  }

  if (doc instanceof Long) {
    return { $numberLong: doc.toString() };
  }

  if (doc instanceof Timestamp) {
    return { $timestamp: { t: doc.high, i: doc.low } };
  }

  if (typeof doc === "object") {
    const result = {};
    for (const key in doc) {
      result[key] = serializeDocument(doc[key]);
    }
    return result;
  }

  return doc;
}

/**
 * Parse a JSON document back to MongoDB types
 */
function parseDocument(doc) {
  if (doc === null || doc === undefined) {
    return doc;
  }

  if (Array.isArray(doc)) {
    return doc.map(parseDocument);
  }

  if (typeof doc === "object") {
    // Check for special BSON type representations
    if (doc.$oid) {
      return new ObjectId(doc.$oid);
    }
    if (doc.$date) {
      return new Date(doc.$date);
    }
    if (doc.$numberDecimal) {
      return Decimal128.fromString(doc.$numberDecimal);
    }
    if (doc.$numberLong) {
      return Long.fromString(doc.$numberLong);
    }

    const result = {};
    for (const key in doc) {
      result[key] = parseDocument(doc[key]);
    }
    return result;
  }

  return doc;
}

/**
 * Extract field names from a document for table headers
 */
function extractFields(doc, maxFields = 5) {
  if (!doc || typeof doc !== "object") return ["_id"];

  const fields = Object.keys(doc);
  const priorityFields = [
    "_id",
    "name",
    "title",
    "email",
    "username",
    "createdAt",
    "updatedAt",
  ];

  const sorted = fields.sort((a, b) => {
    const aIdx = priorityFields.indexOf(a);
    const bIdx = priorityFields.indexOf(b);
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
    if (aIdx !== -1) return -1;
    if (bIdx !== -1) return 1;
    return 0;
  });

  return sorted.slice(0, maxFields);
}

module.exports = {
  serializeDocument,
  parseDocument,
  extractFields,
};
