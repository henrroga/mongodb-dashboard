#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const username = process.argv[2];
const password = process.argv[3];
const role = process.argv[4] || 'viewer';
const USERS_FILE = process.env.AUTH_USERS_FILE || path.resolve(process.cwd(), 'data/users.json');
const VALID_ROLES = new Set(['viewer', 'editor', 'admin']);

if (!username || !password) {
  console.error('Usage: node scripts/create-user.js <username> <password> [viewer|editor|admin]');
  process.exit(1);
}
if (!VALID_ROLES.has(role)) {
  console.error(`Invalid role: ${role}. Use viewer|editor|admin`);
  process.exit(1);
}

let data = { version: 1, users: [] };
try {
  const raw = fs.readFileSync(USERS_FILE, 'utf8');
  const parsed = JSON.parse(raw);
  if (parsed && Array.isArray(parsed.users)) data = parsed;
} catch {
  fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });
}

const passwordHash = bcrypt.hashSync(password, 12);
const now = new Date().toISOString();
const idx = data.users.findIndex((u) => String(u.username).toLowerCase() === username.toLowerCase());
const next = { username, passwordHash, role, updatedAt: now, createdAt: idx >= 0 ? (data.users[idx].createdAt || now) : now };
if (idx >= 0) data.users[idx] = { ...data.users[idx], ...next };
else data.users.push(next);

fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2), 'utf8');
console.log(`${idx >= 0 ? 'Updated' : 'Created'} user '${username}' with role '${role}' in ${USERS_FILE}`);
