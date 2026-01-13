const express = require("express");
const router = express.Router();
const mongoService = require("../services/mongodb");

// Home / Connect page
router.get("/", async (req, res) => {
  try {
    // Check if already connected
    const client = mongoService.getClient();
    if (client) {
      // Test the connection
      try {
        await client.db().admin().ping();
        // Already connected, redirect to databases
        return res.redirect("/databases");
      } catch (err) {
        // Connection exists but is invalid, disconnect it
        await mongoService.disconnect();
      }
    }
    // Not connected, show connect page
    res.render("connect", { title: "Connect" });
  } catch (err) {
    // On error, show connect page
    res.render("connect", { title: "Connect" });
  }
});

// Database list
router.get("/databases", async (req, res) => {
  try {
    const client = mongoService.getClient();
    if (!client) {
      return res.redirect("/");
    }

    const adminDb = client.db().admin();
    const { databases } = await adminDb.listDatabases();

    res.render("databases", {
      title: "Databases",
      databases: databases.filter(
        (db) => !["admin", "local", "config"].includes(db.name)
      ),
    });
  } catch (err) {
    res.redirect("/");
  }
});

// Collection browser
router.get("/browse/:db", async (req, res) => {
  try {
    const client = mongoService.getClient();
    const dbName = req.params.db;

    // If not connected, render page with empty collections to allow client-side reconnection
    if (!client) {
      return res.render("browser", {
        title: dbName,
        dbName,
        collections: [],
        activeCollection: null,
      });
    }

    const db = client.db(dbName);
    const collections = await db.listCollections().toArray();

    // Get counts for all collections
    const collectionsWithCounts = await Promise.all(
      collections.map(async (col) => {
        const count = await db.collection(col.name).estimatedDocumentCount();
        return { name: col.name, count };
      })
    );

    res.render("browser", {
      title: dbName,
      dbName,
      collections: collectionsWithCounts.sort((a, b) =>
        a.name.localeCompare(b.name)
      ),
      activeCollection: null,
    });
  } catch (err) {
    console.error(err);
    // On error, still render page to allow client-side reconnection
    res.render("browser", {
      title: req.params.db,
      dbName: req.params.db,
      collections: [],
      activeCollection: null,
    });
  }
});

// Collection view
router.get("/browse/:db/:collection", async (req, res) => {
  try {
    const client = mongoService.getClient();
    const { db: dbName, collection: colName } = req.params;

    // If not connected, render page with empty collections to allow client-side reconnection
    if (!client) {
      return res.render("browser", {
        title: `${dbName} / ${colName}`,
        dbName,
        collections: [],
        activeCollection: colName,
      });
    }

    const db = client.db(dbName);
    const collections = await db.listCollections().toArray();

    // Get counts for all collections
    const collectionsWithCounts = await Promise.all(
      collections.map(async (col) => {
        const count = await db.collection(col.name).estimatedDocumentCount();
        return { name: col.name, count };
      })
    );

    res.render("browser", {
      title: `${dbName} / ${colName}`,
      dbName,
      collections: collectionsWithCounts.sort((a, b) =>
        a.name.localeCompare(b.name)
      ),
      activeCollection: colName,
    });
  } catch (err) {
    console.error(err);
    // On error, still render page to allow client-side reconnection
    res.render("browser", {
      title: `${req.params.db} / ${req.params.collection}`,
      dbName: req.params.db,
      collections: [],
      activeCollection: req.params.collection,
    });
  }
});

// Document detail page
router.get("/browse/:db/:collection/:id", async (req, res) => {
  try {
    const client = mongoService.getClient();
    if (!client) {
      return res.redirect("/");
    }

    const { db: dbName, collection: colName, id } = req.params;

    res.render("document", {
      title: `Document ${id}`,
      dbName,
      colName,
      docId: id,
    });
  } catch (err) {
    console.error(err);
    res.redirect(`/browse/${req.params.db}/${req.params.collection}`);
  }
});

module.exports = router;
