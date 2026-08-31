const express = require("express");
const { getDB, getChain, save, nextId } = require("../utils/store");
const { buildRegionalForecast, summarizeRegions } = require("../utils/regionalForecast");

const router = express.Router();

// Mounted under /api/level2 and protected by the parent Level 2 router/server.
router.get("/", (req, res) => {
  try {
    const report = buildRegionalForecast(getDB(), {
      drugName: req.query.drugName || undefined,
      region: req.query.region || undefined,
      clientId: req.query.clientId || undefined,
      days: req.query.days || 7,
    });
    res.json({ ...report, regionalSummary: summarizeRegions(report) });
  } catch (error) {
    res.status(400).json({ error: error.message || "Unable to build regional forecast." });
  }
});

module.exports = router;
