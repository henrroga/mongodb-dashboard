# MongoDB Dashboard Audit & Roadmap

This document tracks the audit findings and the planned roadmap for improving the MongoDB Dashboard project.

## 1. Code Quality & Refactoring

- [x] **Logging:** Transition from `console.log` to `pino` throughout the codebase for structured logging.
- [x] **API Route Consolidation:** Complete the migration of logic from `src/routes/api.js` into modular sub-routers in `src/routes/api/`.
- [x] **Error Handling:** Implement a centralized Express error handling middleware to reduce try-catch boilerplate.
- [x] **Validation:** Add request/body/query validation utilities for key API endpoints and reject malformed JSON query payloads.

## 2. Security & Performance

- [x] **Streaming Exports:** Refactor the `/export` API route to use MongoDB's `cursor.stream()` to prevent OOM errors on large collections.
- [x] **BSON Type Completeness:** Update `src/utils/bson.js` to handle all common BSON types during parsing (missing `$binary`, `$timestamp`).
- [ ] **CSRF Protection:** Evaluate and implement CSRF protection (e.g., using `csurf` or similar middleware).
- [x] **Shell Parser Audit:** Perform a deep dive into `src/utils/shellArg.js` to ensure no injection vulnerabilities exist.

## 3. Feature Enhancements

- [x] **View Management:** Add support for listing, creating, and dropping MongoDB Views.
- [x] **GridFS Explorer:** Implement a basic interface to browse and download files stored in GridFS.
- [x] **Bulk Operations:** Ensure "Select All" and bulk delete/update features are fully functional in the UI (added bulk delete API).
- [ ] **Index Improvements:** Add support for more index types (e.g., Geospatial, Text) and options.
- [ ] **User/Role Management:** Add a tab to manage database users and roles.

## 4. UI/UX Polishing

- [ ] **Loading States:** Ensure all async actions have proper skeleton loaders or spinners.
- [ ] **Responsiveness:** Audit the CSS to ensure the dashboard works well on smaller screens.
- [ ] **Interactive Explain Plans:** Improve the visualization of explain plans (currently raw JSON or basic tree).
- [ ] **Aggregation Builder:** Add more stage templates and helper snippets.

---

## Execution Plan (Batches)

### Batch 1: Housekeeping
1. Integrate `pino` logger.
2. Refactor `api.js` and modularize sub-routers.
3. Centralized error handling.

### Batch 2: Reliability & BSON
1. Streaming `/export`.
2. Completing `src/utils/bson.js`.
3. Audit `shellArg.js`.

### Batch 3: New Features
1. View Management.
2. GridFS support.

### Batch 4: API Hardening (in progress)
1. Add centralized route parameter validation middleware.
2. Harden JSON query parsing for `filter`/`sort`/`projection` payloads.
3. Enforce bounds on expensive query inputs (limits, pipeline stages).
4. Validate import/export formats and reject unsupported ones early.

### Batch 5: Frontend Resilience
1. Add consistent `fetch` error normalization in `public/js/app.js`.
2. Improve loading/error states for high-latency actions (schema analysis, exports, indexes).
3. Improve Aggregation Builder templates and pipeline UX safety rails.

### Batch 6: Security + Session
1. Add CSRF protection design and compatibility checks for API + SSR flows.
2. Add secure logout/session-expiry UX handling in frontend state.
3. Review auth boundaries and lock down any unauthenticated metadata endpoints.

### Batch 7: Reliability + Observability
1. Add request correlation IDs surfaced in logs and API errors.
2. Add health diagnostics (`/healthz` deep mode) for Mongo connectivity and latency.
3. Add test coverage for new validators and failure cases.

### Batch 8: Performance + Data UX
1. Add optional projection presets and server-side sampling for large documents.
2. Improve index management with richer options (text/geospatial/TTL helpers).
3. Add safer bulk update flow (preview + dry-run mode).
