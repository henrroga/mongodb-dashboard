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
    const { connectionString } = req.body;
    if (!connectionString) {
      return res.status(400).json({ error: "Connection string is required" });
    }

    const client = await mongoService.connect(connectionString);
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
    const client = mongoService.getClient();
    if (!client) return res.status(400).json({ error: "Not connected" });

    const admin = client.db().admin();
    await admin.command({ killOp: 1, op: parseInt(req.params.opid) });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
