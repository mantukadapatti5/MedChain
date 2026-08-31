const express = require("express");
const { verifyToken, requireRole } = require("../middleware/auth");
const { loadDatasets } = require("../utils/datasetLoader");

const router = express.Router();
router.use(verifyToken, requireRole("admin"));

router.get("/regional-forecast", (req, res) => {
  const { sales, hospitalDemand, inventory } = loadDatasets();
  const horizon = Math.max(1, Math.min(Number(req.query.days) || 7, 30));
  const rows = hospitalDemand.filter((r) => !req.query.drugName || r.drug_name === req.query.drugName).filter((r) => !req.query.region || r.region === req.query.region).filter((r) => !req.query.hospitalId || String(r.hospital_id) === String(req.query.hospitalId));
  const grouped = new Map();
  rows.forEach((r) => {
    const key = `${r.hospital_id}|${r.drug_name}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(r);
  });
  const results = [...grouped.entries()].map(([key, history]) => {
    const [hospitalId, drugName] = key.split("|");
    const ordered = history.slice().sort((a, b) => new Date(a.date) - new Date(b.date));
    const recent = ordered.slice(-Math.min(4, ordered.length));
    const avgWeekly = recent.length ? recent.reduce((s, r) => s + Number(r.quantity_used || 0), 0) / recent.length : 0;
    const forecastDemand = Math.max(0, Math.round(avgWeekly * (horizon / 7)));
    const hospital = ordered[ordered.length - 1];
    const inv = inventory.filter((r) => r.drug_name === drugName && r.region === hospital.region).reduce((s, r) => s + Number(r.current_stock || 0), 0);
    const dailyRate = forecastDemand / horizon;
    const daysOfSupply = dailyRate ? Number((inv / dailyRate).toFixed(1)) : null;
    return { hospitalId: Number(hospitalId), hospitalName: hospital.hospital_name, region: hospital.region, drugName, currentRegionalStock: inv, forecastDemand, horizonDays: horizon, daysOfSupply, shortageRisk: daysOfSupply == null ? "unknown" : daysOfSupply < 3 ? "critical" : daysOfSupply < 7 ? "high" : daysOfSupply < 14 ? "medium" : "low", historyRecords: ordered.length, method: "Hospital demand history moving-average baseline" };
  }).sort((a, b) => (b.forecastDemand - a.forecastDemand) || ((a.daysOfSupply ?? 9999) - (b.daysOfSupply ?? 9999)));

  const regionalSummary = Object.values(results.reduce((acc, row) => { const x = acc[row.region] ||= { region: row.region, forecastDemand: 0, currentStock: 0, criticalItems: 0, highRiskItems: 0 }; x.forecastDemand += row.forecastDemand; x.currentStock += row.currentRegionalStock; if (row.shortageRisk === "critical") x.criticalItems += 1; if (row.shortageRisk === "high") x.highRiskItems += 1; return acc; }, {})).sort((a, b) => b.forecastDemand - a.forecastDemand);
  res.json({ source: "3_hospital_client_demand.csv + 2_inventory_batch.csv", horizonDays: horizon, results, regionalSummary, salesRowsAvailable: sales.length });
});

router.get("/supplier-ranking", (req, res) => {
  const rows = loadDatasets().suppliers.filter((r) => !req.query.drugName || r.drug_name === req.query.drugName);
  const grouped = {};
  rows.forEach((r) => { const key = r.supplier_id; grouped[key] ||= { supplierId: r.supplier_id, supplierName: r.supplier_name, prices: [], delivery: [], onTime: [], quality: [], rejection: [], orders: 0 }; const x = grouped[key]; x.prices.push(Number(r.price || 0)); x.delivery.push(Number(r.delivery_days || 0)); x.onTime.push(Number(r.on_time_rate || 0)); x.quality.push(Number(r.quality_score || 0)); x.rejection.push(Number(r.rejection_rate || 0)); x.orders += Number(r.orders_completed || 0); });
  const suppliers = Object.values(grouped).map((x) => { const avg = (a) => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0; const price = avg(x.prices); const delivery = avg(x.delivery); const onTime = avg(x.onTime); const quality = avg(x.quality); const rejection = avg(x.rejection); const priceScore = Math.max(0, Math.min(100, 100 - Math.max(0, price - 50))); const deliveryScore = Math.max(0, Math.min(100, 100 - Math.max(0, delivery - 1) * 12)); const score = Number((quality * 0.35 + onTime * 0.3 + deliveryScore * 0.2 + priceScore * 0.1 + (100 - rejection) * 0.05).toFixed(1)); return { supplierId: x.supplierId, supplierName: x.supplierName, averagePrice: Number(price.toFixed(2)), averageDeliveryDays: Number(delivery.toFixed(1)), onTimeRate: Number(onTime.toFixed(1)), qualityScore: Number(quality.toFixed(1)), rejectionRate: Number(rejection.toFixed(1)), ordersCompleted: x.orders, overallScore: score }; }).sort((a, b) => b.overallScore - a.overallScore);
  res.json({ source: "6_supplier_vendor_performance.csv", suppliers });
});

router.get("/shipment-summary", (req, res) => {
  const rows = loadDatasets().shipments;
  const summary = rows.reduce((a, r) => { const status = String(r.status || "Unknown"); a[status] = (a[status] || 0) + 1; return a; }, {});
  res.json({ source: "4_shipment_history.csv", total: rows.length, statusCounts: summary, shipments: rows.slice(0, 100) });
});

router.get("/cold-chain-summary", (req, res) => {
  const rows = loadDatasets().coldChain;
  const breaches = rows.filter((r) => String(r.status).toLowerCase() === "breach");
  res.json({ source: "5_cold_chain.csv", totalReadings: rows.length, breachCount: breaches.length, normalCount: rows.length - breaches.length, breachRate: rows.length ? Number((breaches.length / rows.length * 100).toFixed(1)) : 0, recentBreaches: breaches.slice(-100) });
});

module.exports = router;
