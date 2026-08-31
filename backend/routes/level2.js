const express = require("express");
const { getDB, getChain, save, nextId } = require("../utils/store");
const { verifyToken, requireRole } = require("../middleware/auth");
const { predictNextPeriod } = require("../ml/predict");
const { predict: predictShortage } = require("../ml/predictShortage");
const { shortageRisk } = require("../utils/mlEngine");

const router = express.Router();
router.use(verifyToken, requireRole("admin"));

// ---------- What-if scenario simulator ----------
router.get("/scenarios", (req, res) => {
  res.json((getDB().scenarioRuns || []).slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 50));
});

router.post("/scenarios", (req, res) => {
  const db = getDB();
  const { drugName, batch, demandIncreasePercent = 0, daysAhead = 7 } = req.body;
  const increase = Number(demandIncreasePercent);
  const safeDays = Math.max(1, Math.min(Number(daysAhead) || 7, 30));
  if (!drugName || !Number.isFinite(increase) || increase < -90 || increase > 500) {
    return res.status(400).json({ error: "drugName is required and demandIncreasePercent must be between -90 and 500." });
  }

  const inventory = db.distributorInventory.filter((i) => i.drugName === drugName && (!batch || i.batch === batch));
  const item = inventory.sort((a, b) => b.stock - a.stock)[0];
  if (!item) return res.status(404).json({ error: "No matching distributor inventory found for this drug/batch." });

  const history = db.sales.filter((s) => s.drugName === drugName).sort((a, b) => new Date(a.date) - new Date(b.date));
  const forecast = predictNextPeriod(drugName, history, safeDays);
  if (!forecast.available) return res.status(400).json({ error: forecast.reason || "Demand model is not available. Train the model first." });

  const multiplier = 1 + increase / 100;
  const baselineDemand = Number(forecast.forecastNextPeriod || 0);
  const scenarioDemand = Math.max(0, Math.round(baselineDemand * multiplier));
  const qtyHistory = history.map((s) => Number(s.qty || 0));
  const avgDaily = qtyHistory.length ? qtyHistory.reduce((a, b) => a + b, 0) / 21 : Math.max(1, baselineDemand / safeDays);
  const baselineRisk = shortageRisk(Number(item.stock || 0), Math.max(avgDaily, baselineDemand / safeDays));
  let classifier = null;
  try {
    classifier = predictShortage({
      stock: Number(item.stock || 0),
      history: qtyHistory,
      forecastDemand: scenarioDemand,
      leadTimeDays: Number(item.leadTimeDays || item.leadTime || 3),
    });
  } catch (error) {
    return res.status(400).json({ error: `Shortage model unavailable: ${error.message}` });
  }

  const result = {
    id: nextId("scenarioRuns"),
    drugName,
    batch: item.batch,
    region: item.region || null,
    currentStock: Number(item.stock || 0),
    demandIncreasePercent: increase,
    daysAhead: safeDays,
    baselineForecast: baselineDemand,
    scenarioForecast: scenarioDemand,
    additionalDemandUnits: Math.max(0, scenarioDemand - baselineDemand),
    baselineRisk: baselineRisk.level,
    baselineDaysOfSupply: baselineRisk.daysOfSupply,
    scenarioShortageProbability: classifier.shortageProbability ?? null,
    scenarioRiskLevel: classifier.riskLevel ?? null,
    model: "Random Forest demand forecast + Random Forest shortage classifier",
    createdAt: new Date().toISOString(),
    createdBy: req.user.email,
  };

  if (!Array.isArray(db.scenarioRuns)) db.scenarioRuns = [];
  db.scenarioRuns.push(result);
  getChain().addBlock("WHAT_IF_SCENARIO_RUN", req.user.email, result);
  save();
  res.status(201).json(result);
});

// ---------- Automatic stock redistribution ----------
router.get("/redistribution/recommendations", (req, res) => {
  const db = getDB();
  const inventory = db.distributorInventory || [];
  const grouped = {};
  inventory.forEach((item) => {
    const key = `${item.drugName}`;
    if (!grouped[key]) grouped[key] = {};
    const region = item.region || "Unassigned";
    grouped[key][region] = (grouped[key][region] || 0) + Number(item.stock || 0);
  });

  const recommendations = [];
  Object.entries(grouped).forEach(([drugName, regions]) => {
    const total = Object.values(regions).reduce((a, b) => a + b, 0);
    const average = Object.keys(regions).length ? total / Object.keys(regions).length : 0;
    const source = Object.entries(regions).sort((a, b) => b[1] - a[1])[0];
    const target = Object.entries(regions).sort((a, b) => a[1] - b[1])[0];
    if (!source || !target || source[0] === target[0]) return;
    if (source[1] <= average * 1.25 || target[1] >= average * 0.75) return;
    const suggestedQty = Math.max(1, Math.floor((source[1] - average) * 0.5));
    recommendations.push({
      id: `${drugName}:${source[0]}:${target[0]}`,
      drugName,
      fromRegion: source[0],
      toRegion: target[0],
      fromStock: source[1],
      toStock: target[1],
      suggestedQty,
      reason: `${source[0]} has surplus stock while ${target[0]} has the lowest regional stock.`,
    });
  });
  res.json(recommendations);
});

router.post("/redistribution/execute", (req, res) => {
  const db = getDB();
  const { drugName, fromRegion, toRegion, qty } = req.body;
  const quantity = Number(qty);
  if (!drugName || !fromRegion || !toRegion || !Number.isFinite(quantity) || quantity <= 0 || fromRegion === toRegion) {
    return res.status(400).json({ error: "drugName, fromRegion, toRegion and a positive qty are required." });
  }

  let remaining = quantity;
  const sources = db.distributorInventory.filter((i) => i.drugName === drugName && i.region === fromRegion && i.stock > 0).sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
  const targets = db.distributorInventory.filter((i) => i.drugName === drugName && i.region === toRegion);
  const target = targets[0];
  if (!target) return res.status(404).json({ error: "Destination inventory record not found for this medicine and region." });

  const movedBatches = [];
  for (const source of sources) {
    if (remaining <= 0) break;
    const moved = Math.min(source.stock, remaining);
    source.stock -= moved;
    remaining -= moved;
    movedBatches.push({ batch: source.batch, qty: moved, expiryDate: source.expiryDate });
  }
  if (remaining > 0) return res.status(400).json({ error: `Only ${quantity - remaining} units are available in ${fromRegion}; transfer not completed.` });

  target.stock += quantity;
  if (!Array.isArray(db.redistributionTransfers)) db.redistributionTransfers = [];
  const transfer = {
    id: nextId("redistributionTransfers"),
    drugName,
    fromRegion,
    toRegion,
    qty: quantity,
    movedBatches,
    createdAt: new Date().toISOString(),
    createdBy: req.user.email,
  };
  db.redistributionTransfers.push(transfer);
  getChain().addBlock("STOCK_REDISTRIBUTED", req.user.email, transfer);
  save();
  res.status(201).json(transfer);
});

// ---------- Multi-vendor comparison + supplier performance ----------
router.get("/suppliers", (req, res) => {
  const db = getDB();
  const configured = Array.isArray(db.vendors) ? db.vendors : [];
  const performance = Array.isArray(db.supplierPerformance) ? db.supplierPerformance : [];
  const names = [...new Set([...configured.map((v) => v.name || v.vendorName), ...performance.map((p) => p.vendorName || p.name)].filter(Boolean))];
  const suppliers = names.map((name, index) => {
    const v = configured.find((x) => (x.name || x.vendorName) === name) || {};
    const p = performance.find((x) => (x.vendorName || x.name) === name) || {};
    const quality = Number(p.qualityScore ?? v.qualityScore ?? 90);
    const onTime = Number(p.onTimeRate ?? p.onTimeDelivery ?? v.onTimeRate ?? 90);
    const delivery = Number(p.averageDeliveryDays ?? v.averageDeliveryDays ?? 3);
    const price = Number(v.averagePrice ?? p.averagePrice ?? 100 + index * 3);
    const rejection = Number(p.rejectionRate ?? v.rejectionRate ?? 2);
    const priceScore = Math.max(0, Math.min(100, 100 - Math.max(0, price - 90) * 2));
    const deliveryScore = Math.max(0, Math.min(100, 100 - Math.max(0, delivery - 1) * 12));
    const score = Number((quality * 0.35 + onTime * 0.30 + deliveryScore * 0.20 + priceScore * 0.10 + (100 - rejection) * 0.05).toFixed(1));
    return { id: v.id || name, name, price, qualityScore: quality, onTimeRate: onTime, averageDeliveryDays: delivery, rejectionRate: rejection, overallScore: score };
  }).sort((a, b) => b.overallScore - a.overallScore);
  res.json(suppliers);
});

router.post("/procurement-selection", (req, res) => {
  const db = getDB();
  const { drugName, qty, region, supplierName, reason } = req.body;
  if (!drugName || !supplierName || !qty) return res.status(400).json({ error: "drugName, qty and supplierName are required." });
  if (!Array.isArray(db.procurementSelections)) db.procurementSelections = [];
  const selection = { id: nextId("procurementSelections"), drugName, qty: Number(qty), region: region || null, supplierName, reason: reason || "Selected by supplier performance score", createdAt: new Date().toISOString(), createdBy: req.user.email };
  db.procurementSelections.push(selection);
  getChain().addBlock("SUPPLIER_SELECTED", req.user.email, selection);
  save();
  res.status(201).json(selection);
});

// ---------- QR / batch verification ----------
router.get("/batch/:batch/verify", (req, res) => {
  const db = getDB();
  const batch = req.params.batch;
  const matches = [
    ...(db.vendorInventory || []),
    ...(db.distributorInventory || []),
    ...(db.clientInventory || []),
  ].filter((item) => item.batch === batch);
  const history = getChain().getByBatch(batch);
  const first = matches[0] || null;
  const recall = (db.recalls || []).find((r) => r.batch === batch && r.status === "active");
  res.json({
    batch,
    found: matches.length > 0 || history.length > 0,
    drugName: first?.drugName || history[0]?.data?.drugName || null,
    manufacturer: first?.manufacturer || null,
    expiryDate: first?.expiryDate || null,
    holders: [...new Set(matches.map((m) => m.clientName || m.region || "Vendor"))],
    activeRecall: recall || null,
    blockchainVerified: history.length > 0,
    blockchainEvents: history.length,
    history,
  });
});

module.exports = router;
