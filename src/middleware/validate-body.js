function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function bad(res, message) {
  return res.status(400).json({ error: message });
}

function requireStringField(body, field, { min = 1, max = 2000000 } = {}) {
  const value = body?.[field];
  if (typeof value !== 'string') return { ok: false, error: `${field} must be a string` };
  if (value.length < min) return { ok: false, error: `${field} is required` };
  if (value.length > max) return { ok: false, error: `${field} is too large` };
  return { ok: true, value };
}

function requireObjectField(body, field, { allowEmpty = true } = {}) {
  const value = body?.[field];
  if (!isPlainObject(value)) return { ok: false, error: `${field} must be an object` };
  if (!allowEmpty && Object.keys(value).length === 0) {
    return { ok: false, error: `${field} cannot be empty` };
  }
  return { ok: true, value };
}

module.exports = {
  isPlainObject,
  bad,
  requireStringField,
  requireObjectField,
};
