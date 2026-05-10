# MongoDB Dashboard Audit & Roadmap

This document tracks the audit findings and the planned roadmap for improving the MongoDB Dashboard project.

## 1. Code Quality & Refactoring

- [x] **Logging:** Transition from `console.log` to `pino` throughout the codebase for structured logging.
- [x] **API Route Consolidation:** Complete the migration of logic from `src/routes/api.js` into modular sub-routers in `src/routes/api/`.
- [x] **Error Handling:** Implement a centralized Express error handling middleware to reduce try-catch boilerplate.
- [ ] **Validation:** Add request body validation (e.g., using a library or simple schema) for API endpoints.

## 2. Security & Performance

- [ ] **Streaming Exports:** Refactor the `/export` API route to use MongoDB's `cursor.stream()` to prevent OOM errors on large collections.
- [ ] **BSON Type Completeness:** Update `src/utils/bson.js` to handle all common BSON types during parsing (missing `$binary`, `$timestamp`).
- [ ] **CSRF Protection:** Evaluate and implement CSRF protection (e.g., using `csurf` or similar middleware).
- [ ] **Shell Parser Audit:** Perform a deep dive into `src/utils/shellArg.js` to ensure no injection vulnerabilities exist.

## 3. Feature Enhancements

- [ ] **View Management:** Add support for listing, creating, and dropping MongoDB Views.
- [ ] **GridFS Explorer:** Implement a basic interface to browse and download files stored in GridFS.
- [ ] **Bulk Operations:** Ensure "Select All" and bulk delete/update features are fully functional in the UI.
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
