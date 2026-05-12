const fs = require("fs/promises");
const path = require("path");
const bcrypt = require("bcryptjs");
const config = require("../config");

const USERS_PATH = path.resolve(
  process.cwd(),
  config.auth.usersFile || "data/users.json"
);

const ROLE_PERMISSIONS = {
  viewer: ["read"],
  editor: ["read", "write"],
  admin: ["read", "write", "indexAdmin", "shell", "audit"],
};

async function ensureUsersFile() {
  try {
    await fs.access(USERS_PATH);
  } catch {
    await fs.mkdir(path.dirname(USERS_PATH), { recursive: true });
    if (config.auth.passwordHash) {
      const bootstrap = {
        version: 1,
        users: [
          {
            username: "admin",
            passwordHash: config.auth.passwordHash,
            role: "admin",
            createdAt: new Date().toISOString(),
          },
        ],
      };
      await fs.writeFile(USERS_PATH, JSON.stringify(bootstrap, null, 2), "utf8");
    } else {
      await fs.writeFile(
        USERS_PATH,
        JSON.stringify({ version: 1, users: [] }, null, 2),
        "utf8"
      );
    }
  }

  // Optional first-boot admin bootstrap from env, only when store is empty.
  try {
    const raw = await fs.readFile(USERS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    const users = Array.isArray(parsed?.users) ? parsed.users : [];
    if (
      users.length === 0 &&
      config.auth.bootstrapUsername &&
      config.auth.bootstrapPassword
    ) {
      const role = ["viewer", "editor", "admin"].includes(
        config.auth.bootstrapRole
      )
        ? config.auth.bootstrapRole
        : "admin";
      const seeded = {
        version: 1,
        users: [
          {
            username: config.auth.bootstrapUsername,
            passwordHash: bcrypt.hashSync(config.auth.bootstrapPassword, 12),
            role,
            createdAt: new Date().toISOString(),
          },
        ],
      };
      await fs.writeFile(USERS_PATH, JSON.stringify(seeded, null, 2), "utf8");
    }
  } catch {
    // best effort only
  }
}

async function readUsers() {
  await ensureUsersFile();
  const raw = await fs.readFile(USERS_PATH, "utf8");
  const parsed = JSON.parse(raw);
  if (!parsed || !Array.isArray(parsed.users)) {
    return [];
  }
  return parsed.users;
}

function resolvePermissions(role) {
  return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.viewer;
}

async function verifyUser(username, password) {
  const users = await readUsers();
  const user = users.find(
    (u) => String(u.username || "").toLowerCase() === String(username || "").toLowerCase()
  );
  if (!user || !user.passwordHash) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;
  return {
    username: user.username,
    role: user.role || "viewer",
    permissions: resolvePermissions(user.role || "viewer"),
  };
}

function hasPermission(session, permission) {
  if (!session || !session.authenticated) return false;
  const perms = Array.isArray(session.permissions)
    ? session.permissions
    : resolvePermissions(session.role || "viewer");
  return perms.includes(permission);
}

module.exports = {
  verifyUser,
  hasPermission,
  resolvePermissions,
  ROLE_PERMISSIONS,
};
