// Connection lifecycle + server-level info routes.
//
// Routes mounted (relative to the api router):
//   POST   /connect
//   POST   /disconnect
//   GET    /status
//   GET    /server-info
//   GET    /server/stats
//   GET    /server/currentop
//   DELETE /server/currentop/:opid

const express = require("express");
const router = express.Router();
const mongoService = require("../../services/mongodb");
const config = require("../../config");
const { redactConnectionString } = require("./_shared");
const connectionVault = require("../../services/connectionVault");
const usersService = require("../../services/users");
const { bad, requireStringField } = require("../../middleware/validate-body");

// Test connection and return database list. Refused when MONGODB_URI is set
// at the env level — in that mode the dashboard is locked to one cluster.
router.post("/connect", async (req, res) => {
  try {
    if (config.presetMongoUri) {
      return res.status(403).json({
        error:
          "This dashboard is locked to its server-side MONGODB_URI. The user-supplied connection form is disabled.",
      });
    }
    const { connectionString, connectionId } = req.body;
    let resolvedConnectionString = connectionString;
    if (!resolvedConnectionString && connectionId) {
      resolvedConnectionString = await connectionVault.getConnectionUri(
        connectionId
      );
    }
    if (!resolvedConnectionString) {
      return res.status(400).json({ error: "Connection string is required" });
    }

    const client = await mongoService.connect(resolvedConnectionString);
    const adminDb = client.db().admin();
    const { databases } = await adminDb.listDatabases();

    res.json({
      success: true,
      databases: databases.map((db) => ({
        name: db.name,
        sizeOnDisk: db.sizeOnDisk,
        empty: db.empty,
      })),
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/disconnect", async (req, res) => {
  if (config.presetMongoUri) {
    return res
      .status(403)
      .json({ error: "Disconnect is disabled when MONGODB_URI is preset." });
  }
  try {
    await mongoService.disconnect();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/status", async (req, res) => {
  try {
    const client = mongoService.getClient();
    const isConnected = mongoService.isConnected();

    if (isConnected && client) {
      try {
        await client.db().admin().ping();
        res.json({
          connected: true,
          connectionString: redactConnectionString(
            mongoService.getConnectionString()
          ),
          presetLocked: !!config.presetMongoUri,
          readOnly: !!config.readOnly,
        });
      } catch (_err) {
        await mongoService.disconnect();
        res.json({ connected: false, presetLocked: !!config.presetMongoUri });
      }
    } else {
      res.json({ connected: false, presetLocked: !!config.presetMongoUri });
    }
  } catch (_err) {
    res.json({ connected: false });
  }
});

router.get("/server-info", async (req, res) => {
  try {
    const client = mongoService.getClient();
    if (!client) return res.status(400).json({ error: "Not connected" });

    const admin = client.db().admin();
    const info = await admin.command({ buildInfo: 1 });
    const status = await admin.command({ serverStatus: 1 });

    res.json({
      version: info.version,
      gitVersion: info.gitVersion,
      modules: info.modules || [],
      storageEngine: status.storageEngine?.name || "unknown",
      uptime: status.uptime,
      host: status.host,
      connections: {
        current: status.connections?.current,
        available: status.connections?.available,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/server/stats", async (req, res) => {
  try {
    const client = mongoService.getClient();
    if (!client) return res.status(400).json({ error: "Not connected" });

    const admin = client.db().admin();
    const ss = await admin.command({ serverStatus: 1 });

    res.json({
      version: ss.version,
      uptime: ss.uptimeMillis,
      connections: ss.connections,
      opcounters: ss.opcounters,
      opcountersRepl: ss.opcountersRepl,
      mem: ss.mem,
      network: ss.network,
      globalLock: ss.globalLock,
      wiredTiger: ss.wiredTiger
        ? {
            cache: {
              bytesCurrentlyInCache:
                ss.wiredTiger.cache["bytes currently in the cache"],
              maximumBytesConfigured:
                ss.wiredTiger.cache["maximum bytes configured"],
            },
          }
        : null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/server/currentop", async (req, res) => {
  try {
    const client = mongoService.getClient();
    if (!client) return res.status(400).json({ error: "Not connected" });

    const admin = client.db().admin();
    const result = await admin.command({ currentOp: 1, active: true });
    const ops = (result.inprog || []).filter(
      (op) => !op.ns?.startsWith("admin") && op.secs_running != null
    );
    res.json({ ops });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/server/currentop/:opid", async (req, res) => {
  try {
    if (config.auth.enabled && !usersService.hasPermission(req.session, "write")) {
      return res.status(403).json({ error: "Operation kill denied by RBAC" });
    }
    const client = mongoService.getClient();
    if (!client) return res.status(400).json({ error: "Not connected" });

    const admin = client.db().admin();
    await admin.command({ killOp: 1, op: parseInt(req.params.opid) });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/server/profiler", async (req, res) => {
  try {
    const client = mongoService.getClient();
    if (!client) return res.status(400).json({ error: "Not connected" });
    const dbName = String(req.query.db || "admin");
    const db = client.db(dbName);
    const status = await db.command({ profile: -1 });
    res.json({
      db: dbName,
      level: status.was,
      slowms: status.slowms,
      sampleRate: status.sampleRate,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/server/profiler", async (req, res) => {
  try {
    if (config.auth.enabled && !usersService.hasPermission(req.session, "write")) {
      return res.status(403).json({ error: "Profiler update denied by RBAC" });
    }
    const client = mongoService.getClient();
    if (!client) return res.status(400).json({ error: "Not connected" });
    const dbName = String(req.body?.db || "admin");
    const level = Number(req.body?.level ?? 1);
    const slowms = Number(req.body?.slowms ?? 100);
    if (![0, 1, 2].includes(level)) return bad(res, "level must be 0, 1, or 2");
    if (!Number.isFinite(slowms) || slowms < 1 || slowms > 600000) {
      return bad(res, "slowms must be between 1 and 600000");
    }
    const db = client.db(dbName);
    await db.command({ profile: level, slowms });
    const status = await db.command({ profile: -1 });
    res.json({ db: dbName, level: status.was, slowms: status.slowms });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/server/slow-ops", async (req, res) => {
  try {
    const client = mongoService.getClient();
    if (!client) return res.status(400).json({ error: "Not connected" });
    const limit = Math.min(parseInt(req.query.limit || "50", 10), 200);
    const dbName = String(req.query.db || "admin");
    const db = client.db(dbName);
    const col = db.collection("system.profile");
    const docs = await col
      .find({ millis: { $gte: 1 } })
      .sort({ ts: -1 })
      .limit(limit)
      .project({
        ts: 1,
        op: 1,
        ns: 1,
        millis: 1,
        planSummary: 1,
        command: 1,
        nreturned: 1,
      })
      .toArray();
    res.json({ operations: docs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/connections", async (_req, res) => {
  try {
    const connections = await connectionVault.listConnections();
    res.json({ connections });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/connections", async (req, res) => {
  try {
    const parsed = requireStringField(req.body, "connectionString", {
      min: 3,
      max: 4096,
    });
    if (!parsed.ok) return bad(res, parsed.error);
    const { name, color } = req.body;
    const connection = await connectionVault.upsertConnection({
      connectionString: parsed.value,
      name,
      color,
    });
    res.status(201).json({ connection });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch("/connections/:id", async (req, res) => {
  try {
    const connection = await connectionVault.updateConnectionMeta(req.params.id, {
      name: req.body?.name,
      color: req.body?.color,
    });
    if (!connection) return res.status(404).json({ error: "Not found" });
    res.json({ connection });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/connections/:id", async (req, res) => {
  try {
    const removed = await connectionVault.removeConnection(req.params.id);
    if (!removed) return res.status(404).json({ error: "Not found" });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
