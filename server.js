const express = require("express");
const path = require("path");
const apiRoutes = require("./src/routes/api");
const pageRoutes = require("./src/routes/pages");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// View engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Routes
app.use("/api", apiRoutes);
app.use("/", pageRoutes);

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || "Internal Server Error" });
});

app.listen(PORT, () => {
  console.log(`MongoDB Dashboard running at http://localhost:${PORT}`);
});
