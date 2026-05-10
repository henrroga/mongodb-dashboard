const ALLOWED_OPERATION_TYPES = new Set([
  "insert",
  "update",
  "replace",
  "delete",
  "drop",
  "rename",
  "dropDatabase",
  "invalidate",
]);

function normalizeOperationTypeFilter(value) {
  if (value === undefined || value === null || value === "" || value === "all") {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error("operationType filter must be a string");
  }
  const normalized = value.trim();
  if (!ALLOWED_OPERATION_TYPES.has(normalized)) {
    throw new Error("Unsupported operationType filter");
  }
  return normalized;
}

function buildChangeStreamPipeline(operationType) {
  if (!operationType) return [];
  return [{ $match: { operationType } }];
}

module.exports = {
  ALLOWED_OPERATION_TYPES,
  normalizeOperationTypeFilter,
  buildChangeStreamPipeline,
};
