const express = require("express");
const router = express.Router();
const { readOnlyAndAuditMiddleware } = require("./api/_shared");
const { validateMongoPathParams } = require("../middleware/validate");

router.use(readOnlyAndAuditMiddleware);
router.use(validateMongoPathParams);

// Sub-routers — extracted incrementally from this file. Order matters:
// concrete top-level paths (/databases, /server/*, /status, /connect) must
// register BEFORE catch-alls like /:db/:collection so routing precedence
// resolves them first.
router.use("/", require("./api/connection"));
router.use("/", require("./api/databases"));
router.use("/", require("./api/indexes"));
router.use("/", require("./api/shell"));
router.use("/", require("./api/transfer"));
router.use("/", require("./api/query"));
router.use("/", require("./api/collection"));
router.use("/", require("./api/documents"));

module.exports = router;
