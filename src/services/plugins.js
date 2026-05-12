const fs = require('fs/promises');
const path = require('path');

const PLUGINS_DIR = path.resolve(process.cwd(), 'plugins');

async function listPlugins() {
  try {
    const dirs = await fs.readdir(PLUGINS_DIR, { withFileTypes: true });
    const out = [];
    for (const d of dirs) {
      if (!d.isDirectory()) continue;
      const manifestPath = path.join(PLUGINS_DIR, d.name, 'plugin.json');
      try {
        const raw = await fs.readFile(manifestPath, 'utf8');
        const m = JSON.parse(raw);
        out.push({
          id: m.id || d.name,
          name: m.name || d.name,
          version: m.version || '0.0.0',
          description: m.description || '',
          entry: m.entry || null,
          hooks: Array.isArray(m.hooks) ? m.hooks : [],
          directory: d.name,
        });
      } catch {
        continue;
      }
    }
    return out;
  } catch {
    return [];
  }
}

module.exports = { listPlugins };
