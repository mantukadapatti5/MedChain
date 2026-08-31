const express = require("express");
const { verifyToken, requireRole } = require("../middleware/auth");
const { loadDatasets, datasetSummary } = require("../utils/datasetLoader");

const router = express.Router();
router.use(verifyToken, requireRole("admin"));

function page(rows, req) {
  const limit = Math.max(1, Math.min(Number(req.query.limit) || 100, 500));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  return { total: rows.length, limit, offset, rows: rows.slice(offset, offset + limit) };
}

router.get("/summary", (req, res) => {
  try { res.json(datasetSummary()); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

router.get("/sales", (req, res) => {
  const data = loadDatasets().sales.filter((r) => !req.query.drugName || r.drug_name === req.query.drugName).filter((r) => !req.query.region || r.region === req.query.region).filter((r) => !req.query.hospital || r.hospital_name === req.query.hospital);
  res.json(page(data, req));
});

router.get("/inventory", (req, res) => {
  const data = loadDatasets().inventory.filter((r) => !req.query.drugName || r.drug_name === req.query.drugName).filter((r) => !req.query.region || r.region === req.query.region).filter((r) => !req.query.batchId || r.batch_id === req.query.batchId);
  res.json(page(data, req));
});

router.get("/hospital-demand", (req, res) => {
  const data = loadDatasets().hospitalDemand.filter((r) => !req.query.drugName || r.drug_name === req.query.drugName).filter((r) => !req.query.region || r.region === req.query.region).filter((r) => !req.query.hospitalId || String(r.hospital_id) === String(req.query.hospitalId));
  res.json(page(data, req));
});

router.get("/shipments", (req, res) => {
  const data = loadDatasets().shipments.filter((r) => !req.query.shipmentId || r.shipment_id === req.query.shipmentId).filter((r) => !req.query.status || r.status === req.query.status).filter((r) => !req.query.drugName || r.drug_name === req.query.drugName);
  res.json(page(data, req));
});

router.get("/cold-chain", (req, res) => {
  const data = loadDatasets().coldChain.filter((r) => !req.query.shipmentId || r.shipment_id === req.query.shipmentId).filter((r) => !req.query.batchId || r.batch_id === req.query.batchId).filter((r) => !req.query.status || r.status === req.query.status);
  res.json(page(data, req));
});

router.get("/suppliers", (req, res) => {
  const data = loadDatasets().suppliers.filter((r) => !req.query.supplierId || r.supplier_id === req.query.supplierId).filter((r) => !req.query.drugName || r.drug_name === req.query.drugName).filter((r) => !req.query.supplierName || r.supplier_name === req.query.supplierName);
  res.json(page(data, req));
});

module.exports = router;
