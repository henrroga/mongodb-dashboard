const express = require("express");
const router = express.Router();
const mongoService = require("../../services/mongodb");
const config = require("../../config");
const audit = require("../../utils/audit");
const usersService = require("../../services/users");
const { serializeDocument } = require("../../utils/bson");
const { evalArg, splitTopLevelArgs } = require("../../utils/shellArg");
const logger = require("../../utils/logger");

const ALLOWED_RUN_COMMANDS = new Set([
  "ping",
  "buildInfo",
  "serverStatus",
  "dbStats",
  "collStats",
  "listCollections",
  "listIndexes",
  "connectionStatus",
]);

router.post("/shell/exec", async (req, res) => {
  try {
    const client = mongoService.getClient();
    if (!client) return res.status(400).json({ error: "Not connected" });

    const { command, db: dbName } = req.body;
    if (!command) return res.status(400).json({ error: "No command" });

    const cmd = command.trim();
    const db = client.db(dbName || undefined);
    if (config.auth.enabled && !usersService.hasPermission(req.session, "shell")) {
      return res.status(403).json({ error: "Shell access denied by RBAC" });
    }

    // show dbs
    if (/^show\s+(dbs|databases)$/i.test(cmd)) {
      const { databases } = await client.db().admin().listDatabases();
      return res.json({ result: databases.map((d) => `${d.name}\t${d.sizeOnDisk} B`).join("\n"), type: "text" });
    }

    // show collections
    if (/^show\s+collections$/i.test(cmd)) {
      const cols = await db.listCollections().toArray();
      return res.json({ result: cols.map((c) => c.name).join("\n"), type: "text" });
    }

    // use dbname
    const useMatch = cmd.match(/^use\s+(\S+)$/i);
    if (useMatch) {
      return res.json({ result: `switched to db ${useMatch[1]}`, type: "text", switchDb: useMatch[1] });
    }

    // db.runCommand({...})
    const runCmdMatch = cmd.match(/^db\.runCommand\(([\s\S]+)\)$/);
    if (runCmdMatch) {
      const arg = evalArg(runCmdMatch[1]);
      if (!arg || typeof arg !== "object" || Array.isArray(arg)) {
        return res.status(400).json({ error: "runCommand argument must be an object" });
      }
      const commandName = Object.keys(arg)[0];
      if (!commandName || !ALLOWED_RUN_COMMANDS.has(commandName)) {
        return res.status(403).json({
          error: `runCommand '${commandName || "unknown"}' is not allowed from dashboard shell`,
        });
      }
      const result = await db.command(arg);
      return res.json({ result, type: "json" });
    }

    // db.collection.method(...)
    const colMatch = cmd.match(/^db\.([^.]+)\.(\w+)\(([\s\S]*)\)$/);
    if (colMatch) {
      const [, colName, method, argsStr] = colMatch;
      const col = db.collection(colName);

      const WRITE_METHODS = new Set([
        "insertOne",
        "insertMany",
        "updateOne",
        "updateMany",
        "replaceOne",
        "deleteOne",
        "deleteMany",
        "drop",
        "createIndex",
        "dropIndex",
        "renameCollection",
      ]);
      if (config.readOnly && WRITE_METHODS.has(method)) {
        audit.log({
          event: "shell_write_blocked_read_only",
          method,
          colName,
          ip: req.ip,
        });
        return res
          .status(403)
          .json({ error: "Dashboard is in read-only mode (READ_ONLY=true)" });
      }
      if (WRITE_METHODS.has(method)) {
        if (config.auth.enabled && !usersService.hasPermission(req.session, "write")) {
          audit.log({
            event: "shell_write_blocked_rbac",
            method,
            colName,
            ip: req.ip,
            username: req.session?.username || null,
            role: req.session?.role || null,
          });
          return res.status(403).json({ error: "Write access denied by RBAC" });
        }
        audit.log({
          event: "shell_write",
          method,
          colName,
          ip: req.ip,
        });
      }

      // Parse args: split by top-level commas
      const args = argsStr.trim() ? splitTopLevelArgs(argsStr).map((a) => evalArg(a)) : [];

      let result;
      switch (method) {
        case "find": {
          const cursor = col.find(args[0] || {}, { projection: args[1] || {} });
          result = await cursor.limit(50).toArray();
          break;
        }
        case "findOne": result = await col.findOne(args[0] || {}); break;
        case "countDocuments": result = await col.countDocuments(args[0] || {}); break;
        case "estimatedDocumentCount": result = await col.estimatedDocumentCount(); break;
        case "aggregate": {
          const pipeline = args[0] || [];
          if (!Array.isArray(pipeline)) {
            return res.status(400).json({ error: "aggregate pipeline must be an array" });
          }
          result = await col.aggregate(pipeline).limit(200).toArray();
          break;
        }
        case "insertOne": result = await col.insertOne(args[0] || {}); break;
        case "insertMany": result = await col.insertMany(args[0] || []); break;
        case "updateOne": result = await col.updateOne(args[0] || {}, args[1] || {}); break;
        case "updateMany": result = await col.updateMany(args[0] || {}, args[1] || {}); break;
        case "deleteOne": result = await col.deleteOne(args[0] || {}); break;
        case "deleteMany": result = await col.deleteMany(args[0] || {}); break;
        case "distinct": result = await col.distinct(args[0], args[1] || {}); break;
        case "drop": result = await col.drop(); break;
        case "createIndex": result = await col.createIndex(args[0] || {}, args[1] || {}); break;
        case "indexes": result = await col.indexes(); break;
        case "stats": result = await db.command({ collStats: colName }); break;
        default:
          return res.status(400).json({ error: `Unknown method: ${method}` });
      }

      return res.json({ result: result !== null && result !== undefined ? serializeDocument(result) : null, type: "json" });
    }

    return res.status(400).json({ error: `Unsupported command. Try: db.collection.find({})` });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
