const fs = require("fs");
const path = require("path");

const LOG_DIR = process.env.AUDIT_LOG_DIR || path.join(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "audit.log");
const ENABLED = process.env.AUDIT_LOG_ENABLED !== "false";
const MAX_BYTES = parseInt(
  process.env.AUDIT_LOG_MAX_BYTES || String(10 * 1024 * 1024),
  10
);

let stream = null;

function ensureStream() {
  if (!ENABLED) return null;
  if (stream) return stream;
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    if (fs.existsSync(LOG_FILE)) {
      const { size } = fs.statSync(LOG_FILE);
      if (size > MAX_BYTES) {
        fs.renameSync(LOG_FILE, LOG_FILE + "." + Date.now());
      }
    }
    stream = fs.createWriteStream(LOG_FILE, { flags: "a" });
    stream.on("error", () => {
      stream = null;
    });
  } catch (err) {
    // Audit failures must never break the request.
    stream = null;
  }
  return stream;
}

function log(entry) {
  if (!ENABLED) return;
  const s = ensureStream();
  if (!s) return;
  try {
    const line =
      JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n";
    s.write(line);
  } catch (_) {
    /* ignore */
  }
}

module.exports = { log };
async function readRecent(limit = 500) {
  const fsPromises = require("fs/promises");
  try {
    const raw = await fsPromises.readFile(LOG_FILE, "utf8");
    const lines = raw.trim().split("\n").filter(Boolean);
    const tail = lines.slice(Math.max(0, lines.length - Math.max(1, limit)));
    return tail
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .reverse();
  } catch {
    return [];
  }
}

module.exports = { log, readRecent };
