const express = require("express");
const router = express.Router();
const config = require("../config");
const {
  verifyPassword,
  recordFailure,
  clearFailures,
  isLocked,
} = require("../middleware/auth");

router.get("/", (req, res) => {
  if (!config.auth.enabled) return res.redirect("/");
  if (req.session && req.session.authenticated) return res.redirect("/");
  res.render("login", {
    title: "Sign in",
    error: null,
    next: typeof req.query.next === "string" ? req.query.next : "/",
  });
});

router.post(
  "/",
  express.urlencoded({ extended: false }),
  async (req, res) => {
    if (!config.auth.enabled) return res.redirect("/");

    const ip = req.ip;
    const lockedFor = isLocked(ip);
    if (lockedFor) {
      return res.status(429).render("login", {
        title: "Sign in",
        error: `Too many failed attempts. Try again in ${Math.ceil(
          lockedFor / 60
        )} minute(s).`,
        next: typeof req.body.next === "string" ? req.body.next : "/",
      });
    }

    const password = (req.body && req.body.password) || "";
    const nextUrl = typeof req.body.next === "string" ? req.body.next : "/";

    const ok = await verifyPassword(password);
    if (!ok) {
      recordFailure(ip);
      return res.status(401).render("login", {
        title: "Sign in",
        error: "Incorrect password.",
        next: nextUrl,
      });
    }

    clearFailures(ip);
    req.session.regenerate((err) => {
      if (err) {
        return res.status(500).render("login", {
          title: "Sign in",
          error: "Session error. Please try again.",
          next: nextUrl,
        });
      }
      req.session.authenticated = true;
      req.session.loginAt = Date.now();
      req.session.lastSeenAt = req.session.loginAt;
      const safeNext =
        nextUrl.startsWith("/") && !nextUrl.startsWith("//") ? nextUrl : "/";
      res.redirect(safeNext);
    });
  }
);

const logoutRouter = express.Router();
logoutRouter.post("/", (req, res) => {
  if (req.session) {
    req.session.destroy(() => {
      res.clearCookie("mdb.sid", {
        httpOnly: true,
        sameSite: "strict",
        secure: config.cookieSecure,
      });
      if (req.accepts("html")) return res.redirect("/login");
      res.json({ success: true });
    });
  } else {
    res.redirect("/login");
  }
});

module.exports = { loginRouter: router, logoutRouter };
