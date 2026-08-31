const express = require("express");
const { getDB, getChain, save, nextId } = require("../utils/store");
const { verifyToken, requireRole } = require("../middleware/auth");
const { loadDatasets } = require("../utils/datasetLoader");
const { predictNextPeriod } = require("../ml/predict");
const { predict: predictShortage } = require("../ml/predictShortage");

const router = express.Router();
router.use(verifyToken, requireRole("admin"));

router.post("/scenario", (req, res) => {
  const { sales, inventory } = loadDatasets();
  const { drugName, demandIncreasePercent = 0, daysAhead = 7 } = req.body;
  const increase = Number(demandIncreasePercent);
  const horizon = Math.max(1, Math.min(Number(daysAhead) || 7, 30));
  if (!drugName || !Number.isFinite(increase) || increase < -90 || increase > 500) return res.status(400).json({ error: "drugName and demandIncreasePercent (-90 to 500) are required." });

  const stockRows = inventory.filter((r) => r.drug_name === drugName);
  if (!stockRows.length) return res.status(404).json({ error: "Medicine not found in inventory dataset." });
  const stock = stockRows.reduce((sum, r) => sum + Number(r.current_stock || 0), 0);
  const lead = stockRows.reduce((sum, r) => sum + Number(r.lead_time_days || 3), 0) / stockRows.length || 3;
  const rows = sales.filter((r) => r.drug_name === drugName).sort((a, b) => new Date(a.date) - new Date(b.date));
  const history = rows.map((r) => ({ date: r.date, qty: Number(r.quantity_sold || 0) }));
  const forecast = predictNextPeriod(drugName, history, horizon);
  if (!forecast.available) return res.status(400).json({ error: forecast.reason });
  const baseline = Number(forecast.forecastNextPeriod || 0);
  const scenario = Math.max(0, Math.round(baseline * (1 + increase / 100)));
  const baseClassifier = predictShortage({ stock, history: history.map((r) => r.qty), forecastDemand: baseline, leadTimeDays: lead });
  const scenarioClassifier = predictShortage({ stock, history: history.map((r) => r.qty), forecastDemand: scenario, leadTimeDays: lead });

  const result = {
    id: nextId("scenarioRuns"), source: "CSV dataset",
    drugName, demandIncreasePercent: increase, daysAhead: horizon,
    currentStock: stock, baselineForecast: baseline, scenarioForecast: scenario,
    additionalDemandUnits: Math.max(0, scenario - baseline),
    baselineShortageProbability: baseClassifier.shortageProbability,
    baselineRiskLevel: baseClassifier.riskLevel,
    scenarioShortageProbability: scenarioClassifier.shortageProbability,
    scenarioRiskLevel: scenarioClassifier.riskLevel,
    generatedAt: new Date().toISOString(), createdBy: req.user.email,
  };
  const db = getDB();
  if (!Array.isArray(db.scenarioRuns)) db.scenarioRuns = [];
  db.scenarioRuns.push(result);
  getChain().addBlock("WHAT_IF_DATASET_SCENARIO", req.user.email, result);
  save();
  res.status(201).json(result);
});

router.get("/redistribution-recommendations", (req, res) => {
  const inventory = loadDatasets().inventory;
  const grouped = {};
  inventory.forEach((r) => {
    const drug = r.drug_name; const region = r.region || "Unassigned";
    grouped[drug] ||= {};
    grouped[drug][region] = (grouped[drug][region] || 0) + Number(r.current_stock || 0);
  });
  const recommendations = [];
  Object.entries(grouped).forEach(([drugName, regions]) => {
    const entries = Object.entries(regions);
    if (entries.length < 2) return;
    const total = entries.reduce((s, [,v]) => s + v, 0); const avg = total / entries.length;
    const source = entries.slice().sort((a,b) => b[1] - a[1])[0];
    const target = entries.slice().sort((a,b) => a[1] - b[1])[0];
    if (source[1] <= avg * 1.25 || target[1] >= avg * 0.75) return;
    recommendations.push({ id: `${drugName}:${source[0]}:${target[0]}`, source: "2_inventory_batch.csv", drugName, fromRegion: source[0], toRegion: target[0], fromStock: source[1], toStock: target[1], suggestedQty: Math.max(1, Math.floor((source[1] - avg) * 0.5)), reason: `${source[0]} has surplus stock while ${target[0]} has the lowest stock.` });
  });
  res.json(recommendations);
});

module.exports = router;
