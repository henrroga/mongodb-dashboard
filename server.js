const express = require("express");
const path = require("path");
const fs = require("fs");
const fsPromises = require("fs/promises");
const session = require("express-session");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const pkg = require("./package.json");

const config = require("./src/config");
const logger = require("./src/utils/logger");
const pinoHttp = require("pino-http")({ logger });
const mongoSanitize = require("express-mongo-sanitize");
const requestIdMiddleware = require("./src/middleware/request-id");
const { requireAuth } = require("./src/middleware/auth");
const { csrfContext, csrfApiProtection } = require("./src/middleware/csrf");
const apiRoutes = require("./src/routes/api");
const pageRoutes = require("./src/routes/pages");
const { loginRouter, logoutRouter } = require("./src/routes/auth");
const mongoService = require("./src/services/mongodb");

const app = express();

app.use(pinoHttp);
app.use(requestIdMiddleware);
app.set("trust proxy", config.trustProxy);
app.disable("x-powered-by");

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // CodeMirror is loaded from cdnjs in browser.ejs.
        scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
        imgSrc: ["'self'", "data:"],
        fontSrc: ["'self'", "data:", "https://cdnjs.cloudflare.com"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: "same-origin" },
  })
);

app.use(
  session({
    name: "mdb.sid",
    secret: config.auth.sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: "strict",
      secure: config.cookieSecure,
      maxAge: config.auth.sessionMaxAgeMs,
    },
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(mongoSanitize());
app.use(csrfContext);
app.use(express.static(path.join(__dirname, "public"), { maxAge: "1d" }));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use((req, res, next) => {
  res.locals.appConfig = {
    authEnabled: config.auth.enabled,
    readOnly: config.readOnly,
    presetLocked: !!config.presetMongoUri,
    version: pkg.version,
    csrfToken: req.session?.csrfToken || null,
    currentUser: req.session?.username || null,
    currentRole: req.session?.role || null,
    permissions: req.session?.permissions || [],
  };
  next();
});

app.get("/api/changelog", requireAuth, (req, res) => {
  res.json({ version: pkg.version, markdown: loadChangelog() });
});

const generalLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
});
const loginLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.loginMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts, slow down." },
});

app.get("/healthz", async (req, res) => {
  const deep = req.query.deep === "1" || req.query.deep === "true";
  if (!deep) {
    return res.json({ ok: true, requestId: req.requestId });
  }

  const health = {
    ok: true,
    requestId: req.requestId,
    uptimeSec: Math.round(process.uptime()),
    mongodb: {
      connected: false,
    },
  };

  try {
    const client = mongoService.getClient();
    if (client && mongoService.isConnected()) {
      const start = Date.now();
      await client.db().admin().ping();
      health.mongodb.connected = true;
      health.mongodb.pingMs = Date.now() - start;
    }
  } catch (err) {
    health.ok = false;
    health.mongodb.connected = false;
    health.mongodb.error = err.message;
  }

  const status = health.ok ? 200 : 503;
  return res.status(status).json(health);
});

app.get("/readyz", async (_req, res) => {
  const readiness = {
    ok: true,
    checks: {
      mongodb: { ok: true, required: !!config.presetMongoUri },
      dataDir: { ok: true, path: process.env.DATA_DIR || path.join(__dirname, "data") },
    },
  };

  try {
    await fsPromises.mkdir(readiness.checks.dataDir.path, { recursive: true });
    await fsPromises.access(readiness.checks.dataDir.path, fs.constants.W_OK);
  } catch (err) {
    readiness.ok = false;
    readiness.checks.dataDir.ok = false;
    readiness.checks.dataDir.error = err.message;
  }

  if (config.presetMongoUri) {
    try {
      const client = mongoService.getClient();
      if (!client || !mongoService.isConnected()) throw new Error("Mongo client is not connected");
      await client.db().admin().ping();
    } catch (err) {
      readiness.ok = false;
      readiness.checks.mongodb.ok = false;
      readiness.checks.mongodb.error = err.message;
    }
  }

  return res.status(readiness.ok ? 200 : 503).json(readiness);
});

// Public app metadata + changelog (auth-gated below by default).
let cachedChangelog = null;
function loadChangelog() {
  if (cachedChangelog !== null) return cachedChangelog;
  try {
    cachedChangelog = fs.readFileSync(
      path.join(__dirname, "CHANGELOG.md"),
      "utf8"
    );
  } catch (_) {
    cachedChangelog = "";
  }
  return cachedChangelog;
}

app.use("/login", loginLimiter, loginRouter);
app.use("/logout", logoutRouter);

const errorHandler = require("./src/middleware/error");

app.use(generalLimiter);
app.use("/api", csrfApiProtection);
app.use("/api", requireAuth, apiRoutes);
app.use("/", requireAuth, pageRoutes);

app.use(errorHandler);

async function bootstrap() {
  if (config.presetMongoUri) {
    // Fire-and-forget so a slow/failing Mongo doesn't block HTTP startup.
    // The /api/status endpoint reflects connection state; clients reconnect.
    mongoService
      .connect(config.presetMongoUri)
      .then(() => logger.info("[bootstrap] Connected to MONGODB_URI preset"))
      .catch((err) =>
        logger.error({ err }, "[bootstrap] Preset connection failed")
      );
  }

  app.listen(config.port, () => {
    logger.info(
      `MongoDB Dashboard running at http://localhost:${config.port}` +
        (config.auth.enabled ? " (auth enabled)" : " (auth DISABLED)") +
        (config.readOnly ? " [READ-ONLY]" : "")
    );
  });
}

bootstrap().catch((err) => {
  logger.fatal(err, "Fatal startup error");
  process.exit(1);
});

function shutdown() {
  logger.info("Shutting down...");
  mongoService.disconnect().finally(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
