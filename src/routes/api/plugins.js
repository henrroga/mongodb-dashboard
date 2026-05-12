const express = require('express');
const router = express.Router();
const plugins = require('../../services/plugins');

router.get('/plugins', async (_req, res) => {
  const items = await plugins.listPlugins();
  res.json({ plugins: items });
});

module.exports = router;
