#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const ROOT_ENV = path.join(ROOT, ".env.example");
const COOLIFY_ENV = path.join(ROOT, "coolify", ".env.example");
const COOLIFY_COMPOSE = path.join(ROOT, "coolify", "docker-compose.yml");

function parseEnvKeys(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const keys = new Set();
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const m = trimmed.match(/^#?\s*([A-Z0-9_]+)=/);
    if (m) keys.add(m[1]);
  }
  return keys;
}

function parseComposeTemplateVars(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const keys = new Set();
  const re = /\$\{([A-Z0-9_]+)(?::-[^}]*)?\}/g;
  let m;
  while ((m = re.exec(raw))) keys.add(m[1]);
  return keys;
}

function fail(msg) {
  console.error(`\n[contract] ${msg}`);
  process.exitCode = 1;
}

function toSorted(arrOrSet) {
  return [...arrOrSet].sort((a, b) => a.localeCompare(b));
}

const rootKeys = parseEnvKeys(ROOT_ENV);
const coolifyKeys = parseEnvKeys(COOLIFY_ENV);
const composeTemplateKeys = parseComposeTemplateVars(COOLIFY_COMPOSE);

const requiredInCoolify = new Set([
  "PUBLIC_URL",
  "SESSION_SECRET",
  "MONGODB_URI",
  "AUTH_ENABLED",
  "COOKIE_SECURE",
  "AUTH_BOOTSTRAP_USERNAME",
  "AUTH_BOOTSTRAP_PASSWORD",
  "AUTH_BOOTSTRAP_ROLE",
  "CONNECTION_VAULT_SECRET",
  "READ_ONLY",
  "RATE_LIMIT_MAX",
  "RATE_LIMIT_LOGIN_MAX",
  "TRUST_PROXY",
]);

for (const key of requiredInCoolify) {
  if (!coolifyKeys.has(key)) {
    fail(`coolify/.env.example is missing required key: ${key}`);
  }
}

for (const key of composeTemplateKeys) {
  if (!coolifyKeys.has(key)) {
    fail(`coolify/docker-compose.yml references \${${key}} but coolify/.env.example does not define it`);
  }
}

const missingFromRoot = toSorted([...coolifyKeys].filter((k) => !rootKeys.has(k)));
if (missingFromRoot.length) {
  fail(`coolify/.env.example keys not found in root .env.example:\n  - ${missingFromRoot.join("\n  - ")}`);
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log("[contract] Coolify template/env contract is valid.");
