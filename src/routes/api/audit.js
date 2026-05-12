const express = require("express");
const router = express.Router();
const config = require("../../config");
const usersService = require("../../services/users");
const audit = require("../../utils/audit");

router.get("/audit/logs", async (req, res) => {
  try {
    if (config.auth.enabled && !usersService.hasPermission(req.session, "audit")) {
      return res.status(403).json({ error: "Audit access denied by RBAC" });
    }
    const limit = Math.min(parseInt(req.query.limit || "300", 10), 1000);
    const entries = await audit.readRecent(limit);
    res.json({ entries });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
