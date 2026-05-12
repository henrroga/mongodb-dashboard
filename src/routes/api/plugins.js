const express = require('express');
const router = express.Router();
const plugins = require('../../services/plugins');
const config = require('../../config');
const usersService = require('../../services/users');

router.get('/plugins', async (req, res) => {
  if (config.auth.enabled && !usersService.hasPermission(req.session, 'audit')) {
    return res.status(403).json({ error: 'Plugin listing denied by RBAC' });
  }
  const items = await plugins.listPlugins();
  res.json({ plugins: items });
});

module.exports = router;
