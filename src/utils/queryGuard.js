const MAX_SKIP = 50000;
const MAX_SORT_FIELDS = 8;
const MAX_PROJECTION_FIELDS = 60;
const MAX_FILTER_DEPTH = 12;
const BLOCKED_OPERATORS = new Set(["$where", "$function", "$accumulator"]);

function isPlainObject(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function assertSafeMongoQueryShape(value, depth = 0) {
  if (depth > MAX_FILTER_DEPTH) {
    throw new Error("Query is too deeply nested");
  }
  if (Array.isArray(value)) {
    for (const item of value) assertSafeMongoQueryShape(item, depth + 1);
    return;
  }
  if (!isPlainObject(value)) return;

  for (const [key, child] of Object.entries(value)) {
    if (BLOCKED_OPERATORS.has(key)) {
      throw new Error(`Operator ${key} is not allowed`);
    }
    assertSafeMongoQueryShape(child, depth + 1);
  }
}

function normalizeSkip(value) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.min(parsed, MAX_SKIP);
}

function validateSortObject(sort) {
  if (!isPlainObject(sort)) throw new Error("Sort must be an object");
  const entries = Object.entries(sort);
  if (entries.length > MAX_SORT_FIELDS) {
    throw new Error(`Sort exceeds ${MAX_SORT_FIELDS} fields`);
  }
  for (const [, direction] of entries) {
    if (![1, -1, "asc", "desc"].includes(direction)) {
      throw new Error("Sort directions must be 1, -1, 'asc', or 'desc'");
    }
  }
}

function validateProjectionObject(projection) {
  if (!isPlainObject(projection)) throw new Error("Projection must be an object");
  const entries = Object.entries(projection);
  if (entries.length > MAX_PROJECTION_FIELDS) {
    throw new Error(`Projection exceeds ${MAX_PROJECTION_FIELDS} fields`);
  }
  for (const [, val] of entries) {
    if (![0, 1, false, true].includes(val)) {
      throw new Error("Projection values must be 0/1 or boolean");
    }
  }
}

module.exports = {
  MAX_SKIP,
  assertSafeMongoQueryShape,
  normalizeSkip,
  validateSortObject,
  validateProjectionObject,
};
