const express = require("express");
const { getChain } = require("../utils/store");
const { verifyToken } = require("../middleware/auth");

const router = express.Router();
router.use(verifyToken); // any authenticated role (vendor, distributor, admin) can verify provenance

// GET /api/blockchain/ledger - full immutable ledger (paginated newest-first)
router.get("/ledger", (req, res) => {
  const limit = Number(req.query.limit) || 50;
  const all = getChain().getAll().slice().reverse();
  res.json({ total: all.length, blocks: all.slice(0, limit) });
});

// GET /api/blockchain/verify - tamper-check the whole chain
router.get("/verify", (req, res) => {
  res.json(getChain().verifyChain());
});

// GET /api/blockchain/provenance/:batch - QR-code style drug provenance lookup
router.get("/provenance/:batch", (req, res) => {
  const blocks = getChain().getByBatch(req.params.batch);
  res.json({
    batch: req.params.batch,
    found: blocks.length > 0,
    history: blocks,
  });
});

// GET /api/blockchain/emergency-status - read-only emergency mode flag,
// exposed here (rather than under /admin) so Vendor and Distributor portals
// can also show the crisis banner without needing admin privileges.
router.get("/emergency-status", (req, res) => {
  const { getDB } = require("../utils/store");
  res.json(getDB().settings);
});

// ---------- Drug Recalls (visible/actionable from every portal) ----------
// Any authenticated role can read active recalls and acknowledge one that
// concerns them — issuing/resolving a recall stays admin-only (see
// routes/admin.js), but every portal needs read+acknowledge access so a
// Vendor, Distributor, or Client can actually respond to it.
router.get("/recalls/active", (req, res) => {
  const { getDB } = require("../utils/store");
  const db = getDB();
  res.json(db.recalls.filter((r) => r.status === "active"));
});

router.post("/recalls/:id/acknowledge", (req, res) => {
  const { getDB, save } = require("../utils/store");
  const db = getDB();
  const recall = db.recalls.find((r) => r.id === Number(req.params.id));
  if (!recall) return res.status(404).json({ error: "Recall not found." });

  const already = recall.acknowledgedBy.some((a) => a.email === req.user.email);
  if (!already) {
    recall.acknowledgedBy.push({ role: req.user.role, email: req.user.email, name: req.user.name, acknowledgedAt: new Date().toISOString() });
    getChain().addBlock("RECALL_ACKNOWLEDGED", req.user.email, {
      recallId: recall.id,
      batch: recall.batch,
      drugName: recall.drugName,
      role: req.user.role,
    });
    save();
  }
  res.json(recall);
});

module.exports = router;
