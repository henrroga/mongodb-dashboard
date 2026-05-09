const { ObjectId } = require("mongodb");

const MQL_TOKEN_RE =
  /\b(ObjectId|ISODate|Date|NumberLong|NumberInt|NumberDecimal)\(([^)]*)\)/g;

const FORBIDDEN_RE =
  /\b(require|process|global|globalThis|eval|Function|module|exports|child_process|fs|fetch|setTimeout|setInterval|XMLHttpRequest|import|constructor|__proto__)\b/;

function evalArg(str) {
  const trimmed = String(str || "").trim();
  if (!trimmed) return undefined;
  if (trimmed.length > 100_000) {
    throw new Error("Shell argument too large");
  }
  if (FORBIDDEN_RE.test(trimmed)) {
    throw new Error("Disallowed identifier in shell argument");
  }

  const placeholders = [];
  let normalized = trimmed.replace(MQL_TOKEN_RE, (_, name, raw) => {
    placeholders.push({ name, raw: raw.trim() });
    return JSON.stringify({ __mql__: placeholders.length - 1 });
  });

  normalized = normalized
    .replace(/'((?:\\.|[^'\\])*)'/g, (_m, body) => JSON.stringify(body))
    .replace(/([{,\s])([A-Za-z_$][A-Za-z0-9_$]*)\s*:/g, '$1"$2":');

  let parsed;
  try {
    parsed = JSON.parse(normalized);
  } catch (e) {
    throw new Error("Invalid argument syntax: " + e.message);
  }
  return revive(parsed, placeholders);
}

function revive(value, placeholders) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => revive(v, placeholders));
  if (typeof value.__mql__ === "number") {
    const ph = placeholders[value.__mql__];
    return reviveCtor(ph.name, ph.raw);
  }
  const out = {};
  for (const k of Object.keys(value)) out[k] = revive(value[k], placeholders);
  return out;
}

function reviveCtor(name, rawArg) {
  let arg = rawArg;
  if (
    (arg.startsWith('"') && arg.endsWith('"')) ||
    (arg.startsWith("'") && arg.endsWith("'"))
  ) {
    arg = arg.slice(1, -1);
  }
  switch (name) {
    case "ObjectId":
      return arg ? new ObjectId(arg) : new ObjectId();
    case "ISODate":
    case "Date":
      return arg ? new Date(arg) : new Date();
    case "NumberLong":
    case "NumberInt":
      return Number(arg);
    case "NumberDecimal":
      return arg;
    default:
      throw new Error("Unknown constructor: " + name);
  }
}

module.exports = { evalArg };
