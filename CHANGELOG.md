# Changelog

All notable user-facing changes. The dashboard reads this file via
`GET /api/changelog` to drive the in-app "What's new" panel.

## 1.1.0 — UX polish round

- **Per-column quick filter row** above the document table: type to filter the loaded page without writing MQL. Multiple filters AND together, object values are stringified before matching.
- **Insert from template**: right-click a row → "New from this as template", or use the new caret on the Add Document button to pick from loaded docs. Pre-fills the new-doc editor with a clone of the source (with `_id` stripped).
- **Cmd/Ctrl + 1..9** recalls your top saved queries instantly. The Saved dropdown shows a small ⌘+N pill next to each entry.
- **Sidebar sparklines**: each collection now shows a tiny trendline of its document count over your last 30 visits. Green = growing, red = shrinking.
- **Pinned recents + share-doc**: pin documents to the top of the recents widget; copy a deep-link to any document with one click.
- **Per-collection scratchpad** with markdown preview, auto-save, and Cmd/Ctrl-S to flush.
- **JSON parse errors** in the query bar now show inline with the column number; focus jumps to the offending character before the request goes out.
- **Theme variants**: Dracula, Nord, Solarized Dark, Solarized Light alongside System / Light / Dark.
- **J / K** to walk recent documents on the detail page.

## 1.0.0 — Self-host hardening

- Password authentication, helmet CSP, brute-force lockout, rate limiting.
- `READ_ONLY` mode toggle and JSONL audit log of every write op.
- `MONGODB_URI` env preset that auto-connects and disables the user-supplied connect form.
- Hardened Dockerfile (non-root, dumb-init, healthcheck) + tightened compose (read_only rootfs, ALL caps dropped, bound to 127.0.0.1).
- Self-host docs: SECURITY.md, Caddyfile, nginx.conf, systemd unit, Cloudflare Tunnel notes.

## Pre-1.0 — UX foundation

- Document browser with cursor + offset pagination, table / list / JSON views.
- Query bar (filter / projection / sort), saved queries + history, query explain.
- Indexes / Schema / Aggregation / Validation / Stats / Change-stream tabs.
- Inline cell editing, bulk operations, document duplication, import / export.
- Collection sidebar with favorites, search, drag-to-reorder open tabs.
- Command palette (Cmd/Ctrl-K), keyboard shortcuts (?), dark/light/system theme.
- Toast notifications, polished modals (confirm/prompt/alert), context menu on rows.
- Skeleton loaders, polished empty states, copy-as-code in 5 languages.
- First-run onboarding tour, click-to-copy JSON field paths.
