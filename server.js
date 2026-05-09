const express = require("express");
const path = require("path");
const session = require("express-session");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const config = require("./src/config");
const { requireAuth } = require("./src/middleware/auth");
const apiRoutes = require("./src/routes/api");
const pageRoutes = require("./src/routes/pages");
const { loginRouter, logoutRouter } = require("./src/routes/auth");
const mongoService = require("./src/services/mongodb");

const app = express();

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
app.use(express.static(path.join(__dirname, "public"), { maxAge: "1d" }));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use((req, res, next) => {
  res.locals.appConfig = {
    authEnabled: config.auth.enabled,
    readOnly: config.readOnly,
    presetLocked: !!config.presetMongoUri,
  };
  next();
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

app.get("/healthz", (req, res) => res.json({ ok: true }));

app.use("/login", loginLimiter, loginRouter);
app.use("/logout", logoutRouter);

app.use(generalLimiter);
app.use("/api", requireAuth, apiRoutes);
app.use("/", requireAuth, pageRoutes);

app.use((err, req, res, next) => {
  console.error(err.stack);
  if (res.headersSent) return next(err);
  if (req.path && req.path.startsWith("/api/")) {
    return res
      .status(500)
      .json({ error: err.message || "Internal Server Error" });
  }
  res.status(500).send("Internal Server Error");
});

async function bootstrap() {
  if (config.presetMongoUri) {
    // Fire-and-forget so a slow/failing Mongo doesn't block HTTP startup.
    // The /api/status endpoint reflects connection state; clients reconnect.
    mongoService
      .connect(config.presetMongoUri)
      .then(() => console.log("[bootstrap] Connected to MONGODB_URI preset"))
      .catch((err) =>
        console.error("[bootstrap] Preset connection failed:", err.message)
      );
  }

  app.listen(config.port, () => {
    console.log(
      `MongoDB Dashboard running at http://localhost:${config.port}` +
        (config.auth.enabled ? " (auth enabled)" : " (auth DISABLED)") +
        (config.readOnly ? " [READ-ONLY]" : "")
    );
  });
}

bootstrap().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});

function shutdown() {
  console.log("Shutting down...");
  mongoService.disconnect().finally(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
