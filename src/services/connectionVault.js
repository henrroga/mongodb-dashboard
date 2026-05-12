const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const config = require("../config");

const VAULT_PATH = path.resolve(process.cwd(), "data", "connection-vault.json");

function getKey() {
  return crypto
    .createHash("sha256")
    .update(String(config.connectionVaultSecret || config.auth.sessionSecret))
    .digest();
}

function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const key = getKey();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted.toString("base64"),
  };
}

function decrypt(payload) {
  const key = getKey();
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(payload.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.data, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

function nowIso() {
  return new Date().toISOString();
}

async function readVaultFile() {
  try {
    const raw = await fs.readFile(VAULT_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return { version: 1, connections: [] };
    }
    if (!Array.isArray(parsed.connections)) parsed.connections = [];
    return parsed;
  } catch (err) {
    if (err.code === "ENOENT") return { version: 1, connections: [] };
    throw err;
  }
}

async function writeVaultFile(vault) {
  await fs.mkdir(path.dirname(VAULT_PATH), { recursive: true });
  await fs.writeFile(VAULT_PATH, JSON.stringify(vault, null, 2), "utf8");
}

function toPublicEntry(entry) {
  return {
    id: entry.id,
    name: entry.name || "",
    color: entry.color || "",
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

async function listConnections() {
  const vault = await readVaultFile();
  return vault.connections
    .slice()
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
    .map(toPublicEntry);
}

async function getConnectionUri(id) {
  const vault = await readVaultFile();
  const entry = vault.connections.find((c) => c.id === id);
  if (!entry) return null;
  return decrypt(entry.secret);
}

async function upsertConnection({ id, connectionString, name, color }) {
  const vault = await readVaultFile();
  const at = nowIso();
  const next = {
    id: id || crypto.randomUUID(),
    name: (name || "").trim(),
    color: (color || "").trim(),
    secret: encrypt(connectionString),
    updatedAt: at,
  };

  const idx = vault.connections.findIndex((c) => c.id === next.id);
  if (idx >= 0) {
    next.createdAt = vault.connections[idx].createdAt || at;
    vault.connections[idx] = next;
  } else {
    next.createdAt = at;
    vault.connections.unshift(next);
  }

  // Keep vault small and fast.
  vault.connections = vault.connections.slice(0, 50);
  await writeVaultFile(vault);
  return toPublicEntry(next);
}

async function updateConnectionMeta(id, { name, color }) {
  const vault = await readVaultFile();
  const idx = vault.connections.findIndex((c) => c.id === id);
  if (idx < 0) return null;

  const curr = vault.connections[idx];
  const next = {
    ...curr,
    name: name === undefined ? curr.name : String(name || "").trim(),
    color: color === undefined ? curr.color : String(color || "").trim(),
    updatedAt: nowIso(),
  };
  vault.connections[idx] = next;
  await writeVaultFile(vault);
  return toPublicEntry(next);
}

async function removeConnection(id) {
  const vault = await readVaultFile();
  const before = vault.connections.length;
  vault.connections = vault.connections.filter((c) => c.id !== id);
  if (vault.connections.length === before) return false;
  await writeVaultFile(vault);
  return true;
}

module.exports = {
  listConnections,
  getConnectionUri,
  upsertConnection,
  updateConnectionMeta,
  removeConnection,
};
