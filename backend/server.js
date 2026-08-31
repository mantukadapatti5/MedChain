const express = require("express");
const cors = require("cors");
const { load, getDB, getChain, save, nextId } = require("./utils/store");
const eventBus = require("./utils/eventBus");
const { verifyToken, requireRole } = require("./middleware/auth");
const { issueTicket, consumeTicket } = require("./utils/sseTickets");
const { scanInventoryWithIsolationForest } = require("./ml/anomalyDetector");
const { calculateShipmentTracking } = require("./utils/geo");

load(); // initialize JSON "database" + blockchain ledger

const authRoutes = require("./routes/auth");
const vendorRoutes = require("./routes/vendor");
const distributorRoutes = require("./routes/distributor");
const adminRoutes = require("./routes/admin");
const blockchainRoutes = require("./routes/blockchain");
const clientRoutes = require("./routes/client");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "drug-scm-backend", time: new Date().toISOString() });
});

app.post("/api/events/ticket", verifyToken, (req, res) => {
  res.json({ ticket: issueTicket(req.user) });
});

app.get("/api/events", (req, res) => {
  const user = consumeTicket(req.query.ticket || "");
  if (!user) return res.status(401).end();

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write("retry: 3000\n\n");

  const ping = () => res.write(`data: update\n\n`);
  eventBus.on("update", ping);
  const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 20000);

  req.on("close", () => {
    eventBus.off("update", ping);
    clearInterval(heartbeat);
  });
});

// ---------- Level 1: real Isolation Forest anomaly scan ----------
app.post("/api/admin/anomalies/scan", verifyToken, requireRole("admin"), (req, res) => {
  const db = getDB();
  const inventories = [
    ["vendor", db.vendorInventory || []],
    ["distributor", db.distributorInventory || []],
    ["client", db.clientInventory || []],
  ];
  const allItems = inventories.flatMap(([portal, items]) => items.map((item) => ({ portal, item })));
  const salesHistory = db.sales || [];

  if (allItems.length < 3) {
    return res.status(400).json({ error: "At least 3 inventory records are required for Isolation Forest scanning." });
  }

  const results = scanInventoryWithIsolationForest(allItems.map((x) => x.item), salesHistory);
  const created = [];

  results.forEach((result, index) => {
    if (!result.anomaly) return;
    const { portal, item } = allItems[index];
    const type = "ml-inventory-anomaly";
    const alreadyOpen = db.anomalies.some(
      (a) => a.batch === item.batch && a.type === type && (a.status === "open" || a.status === "investigating")
    );
    if (alreadyOpen) return;

    const anomaly = {
      id: nextId("anomalies"),
      type,
      drugName: item.drugName,
      batch: item.batch,
      severity: result.severity,
      detectedAt: new Date().toISOString(),
      status: "open",
      source: portal,
      message: result.reason,
      model: "Isolation Forest",
      anomalyScore: result.score,
      features: result.features,
    };
    db.anomalies.push(anomaly);
    created.push(anomaly);

    getChain().addBlock("ANOMALY_DETECTED", "system:isolation-forest", {
      portal,
      drugName: item.drugName,
      batch: item.batch,
      severity: result.severity,
      anomalyScore: result.score,
      model: "Isolation Forest",
    });
  });

  if (created.length) save();
  res.json({
    model: "Isolation Forest",
    scannedRecords: allItems.length,
    anomaliesFound: results.filter((r) => r.anomaly).length,
    created,
    message: created.length
      ? `${created.length} new ML anomaly case(s) raised by Isolation Forest.`
      : "Isolation Forest found no new unusual inventory patterns.",
  });
});

// ---------- Level 1: GPS distance + ETA ----------
// Uses the existing simulated GPS trail. No hardware or external maps API is
// required: distance is calculated with the Haversine formula and ETA is
// derived from the observed GPS speed, with a documented fallback speed when
// timestamps are too close to infer a reliable speed.
app.get("/api/distributor/stock-requests/:id/tracking", verifyToken, requireRole("distributor", "admin"), (req, res) => {
  const db = getDB();
  const request = db.stockRequests.find((r) => r.id === Number(req.params.id));
  if (!request) return res.status(404).json({ error: "Stock request not found." });
  res.json(calculateShipmentTracking(request));
});

app.use("/api/auth", authRoutes);
app.use("/api/vendor", vendorRoutes);
app.use("/api/distributor", distributorRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/blockchain", blockchainRoutes);
app.use("/api/client", clientRoutes);

app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error. Please try again." });
});

app.listen(PORT, () => {
  console.log(`\n🔐  Drug Supply Chain API running on http://localhost:${PORT}`);
  console.log(`📦  Portals: /api/vendor  /api/distributor  /api/admin`);
  console.log(`⛓️   Blockchain ledger:  /api/blockchain/ledger\n`);
});
