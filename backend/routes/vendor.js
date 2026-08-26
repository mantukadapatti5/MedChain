const express = require("express");
const { getDB, getChain, save, nextId } = require("../utils/store");
const { verifyToken, requireRole } = require("../middleware/auth");
const {
  forecastDemand,
  getAIForecast,
  getTrainingReport,
  dynamicReorderPoint,
  detectInventoryAnomalies,
  computeProvenanceChecksum,
  detectSurge,
  checkColdChain,
} = require("../utils/mlEngine");
const { allocateFEFO } = require("../utils/fefo");
const { applySafeInventoryUpdate } = require("../utils/inventoryGuard");

const router = express.Router();
router.use(verifyToken, requireRole("vendor", "admin"));

const PRIORITY_WEIGHT = { critical: 3, urgent: 2, routine: 1 };

// ---------- Dashboard ----------
router.get("/dashboard", (req, res) => {
  const db = getDB();
  const inv = db.vendorInventory;
  const lowStock = inv.filter((i) => i.stock <= i.reorderPoint);
  const nearExpiry = inv.filter((i) => detectInventoryAnomalies(i).some((a) => a.type === "near-expiry" || a.type === "expired"));
  const pendingRequests = db.stockRequests.filter((r) => r.status === "pending");
  const inTransit = db.stockRequests.filter((r) => r.status === "dispatched");
  const totalValue = inv.reduce((sum, i) => sum + i.stock * i.unitPrice, 0);
  const outstandingBilling = db.billing.filter((b) => b.status === "pending").reduce((s, b) => s + b.amount, 0);

  res.json({
    totalDrugs: new Set(inv.map((i) => i.drugName)).size,
    totalBatches: inv.length,
    totalStockUnits: inv.reduce((s, i) => s + i.stock, 0),
    lowStockCount: lowStock.length,
    nearExpiryCount: nearExpiry.length,
    pendingRequests: pendingRequests.length,
    inTransit: inTransit.length,
    inventoryValue: Number(totalValue.toFixed(2)),
    outstandingBilling: Number(outstandingBilling.toFixed(2)),
    lowStockItems: lowStock,
    emergencyMode: db.settings.emergencyMode,
  });
});

// ---------- Inventory (batches) ----------
router.get("/inventory", (req, res) => {
  const db = getDB();
  res.json(db.vendorInventory.map((i) => ({ ...i, flags: detectInventoryAnomalies(i) })));
});

router.post("/inventory", (req, res) => {
  const { drugName, category, batch, manufacturer, stock, reorderPoint, unitPrice, expiryDate, coldChain } = req.body;
  if (!drugName || !batch || stock == null || !expiryDate) {
    return res.status(400).json({ error: "drugName, batch, stock and expiryDate are required." });
  }
  const db = getDB();
  const item = {
    id: nextId("vendorInventory"),
    drugName,
    category: category || "General",
    batch,
    manufacturer: manufacturer || "Sunrise Pharma",
    stock: Number(stock),
    reorderPoint: Number(reorderPoint) || 50,
    unitPrice: Number(unitPrice) || 0,
    expiryDate,
    coldChain: !!coldChain,
    provenanceChecksum: computeProvenanceChecksum(batch, manufacturer),
  };
  db.vendorInventory.push(item);
  getChain().addBlock("INVENTORY_UPDATE", req.user.email, { portal: "vendor", action: "batch-created", drugName, batch, stock: item.stock });
  save();
  res.status(201).json(item);
});

router.put("/inventory/:id", (req, res) => {
  const db = getDB();
  const item = db.vendorInventory.find((i) => i.id === Number(req.params.id));
  if (!item) return res.status(404).json({ error: "Inventory item not found." });
  const before = item.stock;

  const validationError = applySafeInventoryUpdate(item, req.body);
  if (validationError) return res.status(400).json({ error: validationError });

  getChain().addBlock("INVENTORY_UPDATE", req.user.email, { portal: "vendor", action: "stock-adjusted", drugName: item.drugName, batch: item.batch, stockBefore: before, stockAfter: item.stock });
  save();
  res.json(item);
});

// ---------- Incoming Stock Requests (from Distributor) ----------
router.get("/stock-requests", (req, res) => {
  const db = getDB();
  const sorted = db.stockRequests.slice().sort((a, b) => {
    const w = (PRIORITY_WEIGHT[b.priority] || 0) - (PRIORITY_WEIGHT[a.priority] || 0);
    if (w !== 0) return w;
    return new Date(a.createdAt) - new Date(b.createdAt);
  });
  res.json(sorted);
});

router.post("/stock-requests/:id/approve", (req, res) => {
  const db = getDB();
  const request = db.stockRequests.find((r) => r.id === Number(req.params.id));
  if (!request) return res.status(404).json({ error: "Stock request not found." });
  if (request.status !== "pending") {
    return res.status(400).json({ error: `Only pending requests can be approved. Current status: ${request.status}.` });
  }

  const { allocated, totalAllocated, shortfall } = allocateFEFO(db.vendorInventory, request.drugName, request.qtyRequested);
  if (totalAllocated === 0) {
    return res.status(400).json({ error: `No available stock for ${request.drugName}. Add inventory before approving.` });
  }

  request.status = "dispatched";
  request.approvedAt = new Date().toISOString();
  request.dispatchedAt = request.approvedAt;
  request.qtyDispatched = totalAllocated;
  request.batchesAllocated = allocated;
  request.gpsLog.push({ lat: 12.9716, lng: 77.5946, timestamp: request.dispatchedAt, label: "Departed Vendor Warehouse" });

  const isColdChain = allocated.some((a) => a.coldChain);
  if (isColdChain) {
    request.coldChainLog.push({ temp: 4.6, humidity: 39, timestamp: request.dispatchedAt, alert: false });
  }

  const avgUnitPrice = allocated.reduce((s, a) => s + a.unitPrice * a.qty, 0) / totalAllocated;
  const invoice = {
    id: nextId("billing"),
    requestId: request.id,
    drugName: request.drugName,
    amount: Number((avgUnitPrice * totalAllocated).toFixed(2)),
    status: "pending",
    date: request.approvedAt,
  };
  db.billing.push(invoice);

  getChain().addBlock("STOCK_REQUEST_APPROVED", req.user.email, {
    portal: "vendor",
    requestId: request.id,
    drugName: request.drugName,
    region: request.region,
    qtyRequested: request.qtyRequested,
    qtyDispatched: totalAllocated,
    shortfall,
    batchesAllocated: allocated.map((a) => ({ batch: a.batch, qty: a.qty, expiryDate: a.expiryDate })),
  });
  getChain().addBlock("ORDER_DISPATCHED", req.user.email, {
    portal: "vendor",
    requestId: request.id,
    drugName: request.drugName,
    qty: totalAllocated,
  });

  save();
  res.json({ request, shortfall, message: shortfall > 0 ? `Partially fulfilled: ${totalAllocated}/${request.qtyRequested} units (insufficient stock).` : "Request fully approved and dispatched via FEFO allocation." });
});

router.post("/stock-requests/:id/reject", (req, res) => {
  const db = getDB();
  const request = db.stockRequests.find((r) => r.id === Number(req.params.id));
  if (!request) return res.status(404).json({ error: "Stock request not found." });
  if (request.status !== "pending") {
    return res.status(400).json({ error: `Only pending requests can be rejected. Current status: ${request.status}.` });
  }
  request.status = "rejected";
  request.rejectionReason = req.body.reason || "Not specified";
  getChain().addBlock("STOCK_REQUEST_REJECTED", req.user.email, {
    portal: "vendor",
    requestId: request.id,
    drugName: request.drugName,
    reason: request.rejectionReason,
  });
  save();
  res.json(request);
});

// ---------- Billing ----------
router.get("/billing", (req, res) => {
  res.json(getDB().billing);
});

// ---------- Vendor-side Cold Chain Monitoring ----------
router.get("/cold-chain", (req, res) => {
  const db = getDB();
  const coldBatches = db.vendorInventory.filter((i) => i.coldChain);
  const withLatest = coldBatches.map((item) => {
    const readings = db.coldChainLogs
      .filter((l) => l.portal === "vendor" && l.batch === item.batch)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return { ...item, latestReading: readings[0] || null, readingCount: readings.length };
  });
  res.json(withLatest);
});

router.post("/cold-chain/:batch/reading", (req, res) => {
  const db = getDB();
  const item = db.vendorInventory.find((i) => i.batch === req.params.batch);
  if (!item) return res.status(404).json({ error: "Batch not found in vendor inventory." });
  if (!item.coldChain) return res.status(400).json({ error: "This batch is not marked as cold-chain." });

  const temp = req.body.temp != null ? Number(req.body.temp) : Number((4 + Math.random() * 6).toFixed(1));
  const humidity = req.body.humidity != null ? Number(req.body.humidity) : Number((35 + Math.random() * 30).toFixed(0));
  const result = checkColdChain({ temp, humidity });
  const reading = { id: nextId("coldChainLogs"), portal: "vendor", batch: item.batch, temp, humidity, timestamp: new Date().toISOString(), alert: result.breached };
  db.coldChainLogs.push(reading);

  if (result.breached) {
    const anomaly = {
      id: nextId("anomalies"),
      type: "cold-chain-breach",
      drugName: item.drugName,
      batch: item.batch,
      severity: "high",
      detectedAt: reading.timestamp,
      status: "open",
      source: "vendor",
      message: result.alerts.join("; "),
    };
    db.anomalies.push(anomaly);
    getChain().addBlock("COLD_CHAIN_ALERT", "system:iot-sensor", { portal: "vendor", drugName: item.drugName, batch: item.batch, ...reading });
  }
  save();
  res.json({ reading, breached: result.breached, alerts: result.alerts });
});

// ---------- Demand Forecasting, Surge Detection & Auto-Procure ----------
router.get("/demand-forecast/:drugName", (req, res) => {
  const db = getDB();
  const history = db.sales.filter((s) => s.drugName === req.params.drugName).sort((a, b) => new Date(a.date) - new Date(b.date));
  res.json({ forecast: getAIForecast(req.params.drugName, history), surge: detectSurge(history) });
});

// Exposes the trained model's training report (dataset size, methodology,
// held-out test metrics per drug) so the forecasting claim is fully
// auditable from inside the running app, not just in project docs.
router.get("/model-info", (req, res) => {
  const report = getTrainingReport();
  if (!report) {
    return res.status(404).json({ error: "No trained model found. Run `npm run train-model` in the backend directory." });
  }
  res.json(report);
});

router.get("/analytics", (req, res) => {
  const db = getDB();
  const byDrug = {};
  const drugNames = [...new Set(db.vendorInventory.map((i) => i.drugName))];
  drugNames.forEach((name) => {
    const history = db.sales.filter((s) => s.drugName === name);
    const batches = db.vendorInventory.filter((i) => i.drugName === name);
    const currentStock = batches.reduce((s, b) => s + b.stock, 0);
    const reorderPoint = Math.max(...batches.map((b) => b.reorderPoint));
    const surge = detectSurge(history);
    byDrug[name] = {
      currentStock,
      reorderPoint,
      forecast: getAIForecast(name, history),
      surge,
      recommendedROP: dynamicReorderPoint({
        avgDailyUsage: (history.length ? history.reduce((s, h) => s + h.qty, 0) / Math.max(history.length, 1) / 3 : 5) * (surge.isSurge ? surge.ratio : 1),
      }),
    };
  });
  res.json(byDrug);
});

// Smart Contract Auto-Procure: raises replenishment when a batch is below
// its reorder point. In Emergency Mode, target quantities scale up sharply
// to get ahead of demand instead of trickling in normal-sized restocks.
// Smart Contract Auto-Procure: raises replenishment when a batch is below
// its reorder point. In Emergency Mode, target quantities scale up sharply
// to get ahead of demand instead of trickling in normal-sized restocks.
// Since the Vendor is the manufacturer — the top of this supply chain, with
// no further "supplier" above it — replenishment here means recording a
// production run and adding the output to stock, not placing an order with
// anyone. Each run is written to a persisted, auditable log (not just a
// silent number change) so it can be reviewed after the fact.
router.post("/auto-procure/run", (req, res) => {
  const db = getDB();
  const emergency = db.settings.emergencyMode;
  const created = [];

  db.vendorInventory.forEach((item) => {
    if (item.stock <= item.reorderPoint) {
      const history = db.sales.filter((s) => s.drugName === item.drugName);
      const surge = detectSurge(history);
      const multiplier = emergency ? 4 : surge.isSurge ? Math.min(surge.ratio, 6) : 2;
      const qty = Math.ceil(Math.max(item.reorderPoint * multiplier - item.stock, item.reorderPoint));
      const reason = emergency ? "Emergency Mode active" : surge.isSurge ? `surge ratio ${surge.ratio}x detected` : "routine replenishment";

      const run = {
        id: nextId("productionRuns"),
        drugName: item.drugName,
        batch: item.batch,
        qtyProduced: qty,
        stockBefore: item.stock,
        stockAfter: item.stock + qty,
        reason,
        triggeredBy: "smart-contract",
        emergencyMode: emergency,
        createdAt: new Date().toISOString(),
      };
      db.productionRuns.push(run);
      created.push(run);

      getChain().addBlock("SMART_CONTRACT_AUTO_PROCURE", "system:smart-contract", {
        portal: "vendor",
        productionRunId: run.id,
        drugName: item.drugName,
        batch: item.batch,
        qty,
        emergencyMode: emergency,
        surge,
        reason: `Stock ${item.stock} <= reorder point ${item.reorderPoint}`,
      });
      item.stock += qty; // the recorded production run's output enters inventory
    }
  });

  if (created.length) save();
  res.json({
    createdOrders: created,
    message: created.length ? `${created.length} production run(s) recorded and added to stock by the smart contract${emergency ? " under Emergency Mode" : ""}.` : "All stock levels are healthy. No auto-procurement needed.",
  });
});

// Auditable log of every smart-contract-triggered production run — this is
// what makes auto-procure a reviewable event instead of an invisible
// mutation. Newest first.
router.get("/production-runs", (req, res) => {
  const db = getDB();
  res.json(db.productionRuns.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

module.exports = router;
