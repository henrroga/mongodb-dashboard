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

  const stringPlaceholders = [];
  const bsonPlaceholders = [];

  // 1. Hide real strings first (both single and double quoted)
  let stage1 = trimmed.replace(/"((?:\\.|[^"\\])*)"/g, (_, body) => {
    stringPlaceholders.push(body);
    return `__STR_${stringPlaceholders.length - 1}__`;
  });
  stage1 = stage1.replace(/'((?:\\.|[^'\\])*)'/g, (_, body) => {
    stringPlaceholders.push(body);
    return `__STR_${stringPlaceholders.length - 1}__`;
  });

  // 2. Identify BSON constructors in the remaining "bare" text
  let stage2 = stage1.replace(MQL_TOKEN_RE, (_, name, raw) => {
    // Restore any hidden strings inside the constructor args
    let restoredRaw = raw.trim().replace(/__STR_(\d+)__/g, (__, id) => {
      return stringPlaceholders[parseInt(id)];
    });
    bsonPlaceholders.push({ name, raw: restoredRaw });
    return `{"__mql__":${bsonPlaceholders.length - 1}}`;
  });

  // 3. Quote unquoted keys (but NOT our placeholders)
  let stage3 = stage2.replace(/([{,\s])([A-Za-z_$][A-Za-z0-9_$]*)\s*:/g, (match, prefix, key) => {
    if (key.startsWith('__STR_')) return match;
    return `${prefix}"${key}":`;
  });

  // 4. Restore remaining strings as proper JSON strings
  let stage4 = stage3.replace(/__STR_(\d+)__/g, (_, id) => {
    return JSON.stringify(stringPlaceholders[parseInt(id)]);
  });

  let parsed;
  try {
    parsed = JSON.parse(stage4);
  } catch (e) {
    // If it's just a bare string or number
    try {
        if (!stage4.startsWith('{') && !stage4.startsWith('[')) {
            const bare = JSON.parse(JSON.stringify(stage4));
            if (typeof bare === 'string' && bare.startsWith('"') && bare.endsWith('"')) return bare.slice(1, -1);
            return bare;
        }
    } catch(_) {}
    throw new Error("Invalid argument syntax: " + e.message);
  }
  return revive(parsed, bsonPlaceholders);
}

function splitTopLevelArgs(input) {
  const src = String(input || "").trim();
  if (!src) return [];

  const out = [];
  let current = "";
  let depthCurly = 0;
  let depthSquare = 0;
  let depthParen = 0;
  let inSingle = false;
  let inDouble = false;
  let escaped = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];

    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }

    if (ch === "\\") {
      current += ch;
      escaped = true;
      continue;
    }

    if (inSingle) {
      current += ch;
      if (ch === "'") inSingle = false;
      continue;
    }

    if (inDouble) {
      current += ch;
      if (ch === '"') inDouble = false;
      continue;
    }

    if (ch === "'") {
      inSingle = true;
      current += ch;
      continue;
    }

    if (ch === '"') {
      inDouble = true;
      current += ch;
      continue;
    }

    if (ch === "{") depthCurly++;
    else if (ch === "}") depthCurly = Math.max(0, depthCurly - 1);
    else if (ch === "[") depthSquare++;
    else if (ch === "]") depthSquare = Math.max(0, depthSquare - 1);
    else if (ch === "(") depthParen++;
    else if (ch === ")") depthParen = Math.max(0, depthParen - 1);

    if (ch === "," && depthCurly === 0 && depthSquare === 0 && depthParen === 0) {
      const part = current.trim();
      if (part) out.push(part);
      current = "";
      continue;
    }

    current += ch;
  }

  const tail = current.trim();
  if (tail) out.push(tail);
  return out;
}

function revive(value, placeholders) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => revive(v, placeholders));
  if (typeof value.__mql__ === "number") {
    const ph = placeholders[value.__mql__];
    return reviveCtor(ph.name, ph.raw);
  }
  const out = {};
  for (const k of Object.keys(value)) {
    if (k === "__proto__" || k === "constructor") continue;
    out[k] = revive(value[k], placeholders);
  }
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

module.exports = { evalArg, splitTopLevelArgs };
