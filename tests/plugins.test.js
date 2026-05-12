const { test } = require('node:test');
const assert = require('node:assert/strict');

// Ensure app config won't fail on import in test env.
process.env.AUTH_ENABLED = 'false';
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'deadbeef'.repeat(8);

test('plugin service discovers plugin manifests from plugins/', async () => {
  const pluginsService = require('../src/services/plugins');
  const plugins = await pluginsService.listPlugins();
  assert.ok(Array.isArray(plugins));
  assert.ok(plugins.some((p) => p.id === 'example-renderer'));
  const sample = plugins.find((p) => p.id === 'example-renderer');
  assert.equal(sample.name, 'Example Renderer');
  assert.ok(Array.isArray(sample.hooks));
});
