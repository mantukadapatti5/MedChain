const express = require("express");
const cors = require("cors");
const { load, getDB, getChain, save, nextId } = require("./utils/store");
const eventBus = require("./utils/eventBus");
const { verifyToken, requireRole } = require("./middleware/auth");
const { issueTicket, consumeTicket } = require("./utils/sseTickets");
const { scanInventoryWithIsolationForest } = require("./ml/anomalyDetector");
const { calculateShipmentTracking } = require("./utils/geo");
const { createNotification } = require("./utils/notifications");

load(); // initialize JSON "database" + blockchain ledger

const authRoutes = require("./routes/auth");
const vendorRoutes = require("./routes/vendor");
const distributorRoutes = require("./routes/distributor");
const adminRoutes = require("./routes/admin");
const blockchainRoutes = require("./routes/blockchain");
const clientRoutes = require("./routes/client");
const notificationRoutes = require("./routes/notifications");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Level 1 notification bridge. Domain routes remain responsible for their
// business transactions; this bridge turns successful domain events into
// persistent user-facing notifications while using eventKey to prevent spam.
app.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    const result = originalJson(body);
    try {
      if (res.statusCode >= 200 && res.statusCode < 300 && req.user) {
        const db = getDB();
        const created = [];
        const notify = (payload) => {
          const before = db.notifications?.length || 0;
          const item = createNotification(payload);
          if ((db.notifications?.length || 0) > before) created.push(item);
        };
        const path = req.path;

        // Admin ML shortage endpoint: notify only when a new high/critical
        // shortage state appears, not on every dashboard refresh.
        if (path === "/api/admin/shortage-risk" && Array.isArray(body)) {
          body.filter((row) => row.mlRiskLevel === "high" || row.mlRiskLevel === "critical").forEach((row) => {
            notify({
              role: "admin",
              type: "SHORTAGE",
              severity: row.mlRiskLevel,
              title: `${row.mlRiskLevel === "critical" ? "Critical" : "High"} shortage risk: ${row.drugName}`,
              message: `${row.drugName} (${row.batch}) has ${row.mlShortageProbability ?? "unknown"}% ML shortage probability with about ${row.daysOfSupply} day(s) of supply.`,
              relatedDrug: row.drugName,
              relatedBatch: row.batch,
              actionPath: "/admin/shortage-risk",
              eventKey: `shortage:${row.batch}:${row.mlRiskLevel}:${Math.round(Number(row.mlShortageProbability || 0))}`,
            });
          });
        }

        // Recall issuance is an explicit compliance event.
        if (path === "/api/admin/recalls" && req.method === "POST" && body?.id) {
          notify({
            role: null,
            type: "RECALL",
            severity: body.severity || "high",
            title: `Drug recall issued: ${body.drugName}`,
            message: `Batch ${body.batch} was recalled. Reason: ${body.reason}`,
            relatedDrug: body.drugName,
            relatedBatch: body.batch,
            actionPath: "/admin/recalls",
            eventKey: `recall:${body.id}`,
          });
        }

        // Vendor dispatch and distributor receipt are shipment milestones.
        if (/^\/api\/vendor\/stock-requests\/\d+\/approve$/.test(path) && req.method === "POST" && body?.request?.id) {
          notify({
            role: "distributor",
            type: "SHIPMENT",
            severity: body.request.priority === "critical" ? "critical" : "info",
            title: `Shipment dispatched: ${body.request.drugName}`,
            message: `Stock request #${body.request.id} has been dispatched with ${body.request.qtyDispatched} unit(s) to ${body.request.region}.`,
            relatedDrug: body.request.drugName,
            relatedRequestId: body.request.id,
            actionPath: "/distributor/requests",
            eventKey: `dispatch:${body.request.id}:${body.request.dispatchedAt}`,
          });
        }

        if (/^\/api\/distributor\/stock-requests\/\d+\/receive$/.test(path) && req.method === "POST" && body?.request?.id) {
          notify({
            role: "vendor",
            type: "SHIPMENT",
            severity: body.mismatch?.mismatch ? "high" : "info",
            title: `Shipment received: ${body.request.drugName}`,
            message: body.mismatch?.mismatch
              ? `Request #${body.request.id} was received with a quantity mismatch. Review the shipment."
              : `Request #${body.request.id} was received successfully with ${body.request.qtyReceived} unit(s).`,
            relatedDrug: body.request.drugName,
            relatedRequestId: body.request.id,
            actionPath: "/vendor/requests",
            eventKey: `receive:${body.request.id}:${body.request.receivedAt}`,
          });
        }

        // Cold-chain breach is a high-priority compliance event. Repeated
        // readings at the same breach state are deduplicated by batch/time bucket.
        if (/^\/api\/(vendor|distributor)\/.*cold-chain.*(reading|reading)$/.test(path) && req.method === "POST" && body?.breached) {
          const batch = body.reading?.batch || body.request?.batchesAllocated?.[0]?.batch || "N/A";
          const drug = body.reading?.drugName || body.request?.drugName || "Unknown medicine";
          const minute = body.reading?.timestamp ? body.reading.timestamp.slice(0, 16) : new Date().toISOString().slice(0, 16);
          notify({
            role: "admin",
            type: "COLD_CHAIN",
            severity: "high",
            title: `Cold-chain breach: ${drug}`,
            message: (body.alerts || []).join("; ") || `Cold-chain limits were breached for batch ${batch}.`,
            relatedDrug: drug,
            relatedBatch: batch,
            actionPath: "/admin/anomalies",
            eventKey: `cold-chain:${batch}:${minute}`,
          });
        }

        // If notifications were added after the domain handler's normal save,
        // persist them and emit one SSE refresh for connected portals.
        if (created.length) save();
      }
    } catch (notificationError) {
      console.error("Notification bridge error:", notificationError);
    }
    return result;
  };
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
      id: nextId("anomalies"), type, drugName: item.drugName, batch: item.batch,
      severity: result.severity, detectedAt: new Date().toISOString(), status: "open",
      source: portal, message: result.reason, model: "Isolation Forest",
      anomalyScore: result.score, features: result.features,
    };
    db.anomalies.push(anomaly);
    created.push(anomaly);
    getChain().addBlock("ANOMALY_DETECTED", "system:isolation-forest", {
      portal, drugName: item.drugName, batch: item.batch, severity: result.severity,
      anomalyScore: result.score, model: "Isolation Forest",
    });

    createNotification({
      role: "admin", type: "ANOMALY", severity: result.severity,
      title: `ML anomaly detected: ${item.drugName}`, message: result.reason,
      relatedDrug: item.drugName, relatedBatch: item.batch,
      actionPath: "/admin/anomalies", eventKey: `anomaly:${item.batch}:${Math.round(Number(result.score) * 1000)}`,
    });
  });

  if (created.length) save();
  res.json({ model: "Isolation Forest", scannedRecords: allItems.length,
    anomaliesFound: results.filter((r) => r.anomaly).length, created,
    message: created.length ? `${created.length} new ML anomaly case(s) raised by Isolation Forest.` : "Isolation Forest found no new unusual inventory patterns." });
});

// ---------- Level 1: GPS distance + ETA ----------
app.get("/api/distributor/stock-requests/:id/tracking", verifyToken, requireRole("distributor", "admin"), (req, res) => {
  const db = getDB();
  const request = db.stockRequests.find((r) => r.id === Number(req.params.id));
  if (!request) return res.status(404).json({ error: "Stock request not found." });
  res.json(calculateShipmentTracking(request));
});

// ---------- Level 1: persistent notification history ----------
app.use("/api/notifications", notificationRoutes);

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
