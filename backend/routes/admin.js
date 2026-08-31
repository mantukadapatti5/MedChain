const express = require("express");
const { getDB, getChain, save, nextId } = require("../utils/store");
const { verifyToken, requireRole } = require("../middleware/auth");
const { detectInventoryAnomalies, shortageRisk } = require("../utils/mlEngine");
const { predict: predictShortage } = require("../ml/predictShortage");

const router = express.Router();
router.use(verifyToken, requireRole("admin"));

router.get("/dashboard", (req, res) => {
  const db = getDB();
  const chainStatus = getChain().verifyChain();
  const openAnomalies = db.anomalies.filter((a) => a.status === "open" || a.status === "investigating");
  res.json({
    totalUsers: db.users.length,
    usersByRole: { admin: db.users.filter((u) => u.role === "admin").length, vendor: db.users.filter((u) => u.role === "vendor").length, distributor: db.users.filter((u) => u.role === "distributor").length, client: db.users.filter((u) => u.role === "client").length },
    totalStockRequests: db.stockRequests.length,
    requestsInTransit: db.stockRequests.filter((r) => r.status === "dispatched").length,
    pendingRequests: db.stockRequests.filter((r) => r.status === "pending").length,
    totalBlocks: getChain().getAll().length,
    chainValid: chainStatus.valid,
    chainStatus,
    openAnomalies: openAnomalies.length,
    totalAnomalies: db.anomalies.length,
    escalatedAnomalies: db.anomalies.filter((a) => a.status === "escalated").length,
    totalSalesAmount: Number(db.sales.reduce((s, x) => s + x.amount, 0).toFixed(2)),
    totalInventoryValueVendor: Number(db.vendorInventory.reduce((s, i) => s + i.stock * i.unitPrice, 0).toFixed(2)),
    totalInventoryValueDistributor: Number(db.distributorInventory.reduce((s, i) => s + i.stock * i.unitPrice, 0).toFixed(2)),
    emergencyMode: db.settings.emergencyMode,
  });
});

router.get("/users", (req, res) => {
  const db = getDB();
  res.json(db.users.map(({ passwordHash, ...safe }) => safe));
});
router.get("/blockchain", (req, res) => res.json(getChain().getAll()));
router.get("/blockchain/verify", (req, res) => res.json(getChain().verifyChain()));
router.get("/blockchain/provenance/:batch", (req, res) => res.json(getChain().getByBatch(req.params.batch)));

router.get("/emergency-mode", (req, res) => res.json(getDB().settings));
router.post("/emergency-mode", (req, res) => {
  const db = getDB(); const active = !!req.body.active;
  db.settings.emergencyMode = active; db.settings.updatedAt = new Date().toISOString(); db.settings.updatedBy = req.user.email;
  getChain().addBlock("EMERGENCY_MODE_TOGGLED", req.user.email, { active, reason: req.body.reason || (active ? "Regulator activated crisis response mode." : "Regulator deactivated crisis response mode.") });
  save(); res.json(db.settings);
});

// ---------- ML Shortage Risk ----------
// The existing days-of-supply rule remains useful as a transparent safety signal.
// The Random Forest classifier adds a learned shortage probability using live
// inventory + sales history + the existing demand forecast.
router.get("/shortage-risk", (req, res) => {
  const db = getDB();
  const rows = db.distributorInventory.map((item) => {
    const history = db.sales.filter((s) => s.drugName === item.drugName).sort((a, b) => new Date(a.date) - new Date(b.date));
    const qtyHistory = history.map((s) => Number(s.qty || 0));
    const avgDailyDemand = qtyHistory.length ? qtyHistory.reduce((s, q) => s + q, 0) / 21 : 1;
    const baseline = shortageRisk(item.stock, avgDailyDemand);
    let ml = { available: false, reason: "Shortage model not trained yet." };

    try {
      const { predictNextPeriod } = require("../ml/predict");
      const forecast = predictNextPeriod(item.drugName, history, 7);
      if (forecast.available) {
        ml = predictShortage({ stock: item.stock, history: qtyHistory, forecastDemand: forecast.forecastNextPeriod, leadTimeDays: Number(item.leadTimeDays || item.leadTime || 3) });
        ml.forecastDemand = forecast.forecastNextPeriod;
        ml.forecastMethod = forecast.method;
      }
    } catch (error) {
      ml = { available: false, reason: error.message };
    }

    return {
      drugName: item.drugName,
      batch: item.batch,
      region: item.region,
      stock: item.stock,
      avgDailyDemand: Number(avgDailyDemand.toFixed(1)),
      ...baseline,
      mlShortageProbability: ml.shortageProbability ?? null,
      mlRiskLevel: ml.riskLevel ?? null,
      mlModel: ml.model ?? "Random Forest Classifier",
      mlAvailable: ml.available !== false,
      forecastDemand: ml.forecastDemand ?? null,
      modelFeatures: ml.features ?? null,
      modelError: ml.available === false ? ml.reason : null,
    };
  });
  rows.sort((a, b) => (b.mlShortageProbability ?? 0) - (a.mlShortageProbability ?? 0) || a.daysOfSupply - b.daysOfSupply);
  res.json(rows);
});

router.get("/anomalies", (req, res) => {
  res.json(getDB().anomalies.slice().sort((a, b) => new Date(b.detectedAt) - new Date(a.detectedAt)));
});

router.post("/anomalies/scan", (req, res) => {
  const db = getDB(); const created = [];
  [["vendor", db.vendorInventory], ["distributor", db.distributorInventory], ["client", db.clientInventory]].forEach(([portal, inventory]) => {
    inventory.forEach((item) => {
      const found = detectInventoryAnomalies(item);
      found.forEach((f) => {
        const alreadyOpen = db.anomalies.some((a) => a.batch === item.batch && a.type === f.type && (a.status === "open" || a.status === "investigating"));
        if (!alreadyOpen) {
          const anomaly = { id: nextId("anomalies"), type: f.type, drugName: item.drugName, batch: item.batch, severity: f.severity, detectedAt: new Date().toISOString(), status: "open", source: portal, message: f.message };
          db.anomalies.push(anomaly); created.push(anomaly);
          if (f.type === "counterfeit-flag") getChain().addBlock("QUARANTINE_TRIGGERED", "system:ml-engine", { portal, drugName: item.drugName, batch: item.batch, reason: f.message });
          else getChain().addBlock("ANOMALY_DETECTED", "system:ml-engine", { portal, drugName: item.drugName, batch: item.batch, type: f.type, severity: f.severity });
        }
      });
    });
  });
  if (created.length) save();
  res.json({ created, message: created.length ? `${created.length} new anomaly case(s) raised.` : "No new anomalies detected. All batches compliant." });
});

router.put("/anomalies/:id", (req, res) => {
  const db = getDB(); const anomaly = db.anomalies.find((a) => a.id === Number(req.params.id));
  if (!anomaly) return res.status(404).json({ error: "Anomaly case not found." });
  const { status } = req.body; const allowed = ["open", "investigating", "escalated", "resolved"];
  if (!allowed.includes(status)) return res.status(400).json({ error: `Status must be one of: ${allowed.join(", ")}.` });
  anomaly.status = status; anomaly.updatedAt = new Date().toISOString(); anomaly.updatedBy = req.user.email;
  if (status === "resolved") getChain().addBlock("COMPLIANCE_VERIFIED", req.user.email, { drugName: anomaly.drugName, batch: anomaly.batch, type: anomaly.type, resolution: "Case reviewed and resolved by regulator." });
  else if (status === "escalated") getChain().addBlock("CASE_ESCALATED", req.user.email, { drugName: anomaly.drugName, batch: anomaly.batch, type: anomaly.type });
  save(); res.json(anomaly);
});

router.get("/recalls", (req, res) => res.json(getDB().recalls.slice().sort((a, b) => new Date(b.issuedAt) - new Date(a.issuedAt))));
router.post("/recalls", (req, res) => {
  const { batch, drugName, reason, severity } = req.body;
  if (!batch || !drugName || !reason) return res.status(400).json({ error: "batch, drugName and reason are required to issue a recall." });
  const db = getDB();
  const vendorHolds = db.vendorInventory.filter((i) => i.batch === batch); const distributorHolds = db.distributorInventory.filter((i) => i.batch === batch); const clientHolds = db.clientInventory.filter((i) => i.batch === batch);
  const recall = { id: nextId("recalls"), batch, drugName, reason, severity: ["high", "critical"].includes(severity) ? severity : "high", issuedBy: req.user.email, issuedAt: new Date().toISOString(), status: "active", resolvedAt: null, resolvedBy: null, affectedHolders: { vendor: vendorHolds.length > 0, distributorRegions: [...new Set(distributorHolds.map((i) => i.region))], clients: [...new Set(clientHolds.map((i) => i.clientName))] }, acknowledgedBy: [] };
  db.recalls.push(recall); getChain().addBlock("DRUG_RECALL_ISSUED", req.user.email, { recallId: recall.id, batch, drugName, reason, severity: recall.severity, affectedHolders: recall.affectedHolders }); save(); res.status(201).json(recall);
});
router.post("/recalls/:id/resolve", (req, res) => {
  const db = getDB(); const recall = db.recalls.find((r) => r.id === Number(req.params.id));
  if (!recall) return res.status(404).json({ error: "Recall not found." });
  if (recall.status !== "active") return res.status(400).json({ error: "Only active recalls can be resolved." });
  recall.status = "resolved"; recall.resolvedAt = new Date().toISOString(); recall.resolvedBy = req.user.email;
  getChain().addBlock("DRUG_RECALL_RESOLVED", req.user.email, { recallId: recall.id, batch: recall.batch, drugName: recall.drugName }); save(); res.json(recall);
});

router.get("/audit-report", (req, res) => {
  const db = getDB(); const chainStatus = getChain().verifyChain();
  res.json({ generatedAt: new Date().toISOString(), chainIntegrity: chainStatus, totalTransactionsOnLedger: getChain().getAll().length, stockRequests: db.stockRequests, clientRequests: db.clientRequests, sales: db.sales, anomalies: db.anomalies, recalls: db.recalls, vendorInventorySnapshot: db.vendorInventory, distributorInventorySnapshot: db.distributorInventory, clientInventorySnapshot: db.clientInventory, emergencyMode: db.settings.emergencyMode });
});

module.exports = router;
