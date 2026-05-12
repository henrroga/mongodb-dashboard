# Plugin SDK (Preview)

Drop plugin folders in `plugins/`.
Each plugin must include `plugin.json`:

```json
{
  "id": "example-renderer",
  "name": "Example Renderer",
  "version": "0.1.0",
  "description": "Adds a custom result renderer.",
  "entry": "index.js",
  "hooks": ["result.renderer", "query.transform"]
}
```

## Planned hooks
- `result.renderer`: custom visualization for query results
- `query.transform`: transform query payloads before execution
- `auth.provider`: additional auth provider integration

This release includes manifest discovery and UI listing only.
