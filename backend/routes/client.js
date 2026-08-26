const express = require("express");
const { getDB, getChain, save, nextId } = require("../utils/store");
const { verifyToken, requireRole } = require("../middleware/auth");
const { evaluateQuantityMismatch, computeProvenanceChecksum, detectInventoryAnomalies } = require("../utils/mlEngine");
const { allocateFEFO } = require("../utils/fefo");

const router = express.Router();
router.use(verifyToken, requireRole("client", "admin"));

// A client only ever sees/acts on its own institution's data.
function myClient(req, db) {
  return db.clients.find((c) => c.userId === req.user.id);
}

// ---------- Dashboard ----------
router.get("/dashboard", (req, res) => {
  const db = getDB();
  const client = myClient(req, db);
  if (!client) return res.status(404).json({ error: "No client profile linked to this account." });

  const myRequests = db.clientRequests.filter((r) => r.clientId === client.id);
  const myInventory = db.clientInventory.filter((i) => i.clientId === client.id);
  const nearExpiry = myInventory.filter((i) => detectInventoryAnomalies(i).some((a) => a.type === "near-expiry" || a.type === "expired"));

  res.json({
    client,
    pendingRequests: myRequests.filter((r) => r.status === "pending").length,
    inTransit: myRequests.filter((r) => r.status === "dispatched").length,
    totalReceived: myRequests.filter((r) => r.status === "received").length,
    onHandStockUnits: myInventory.reduce((s, i) => s + i.stock, 0),
    nearExpiryCount: nearExpiry.length,
    recentRequests: myRequests.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5),
  });
});

// ---------- My Requests ----------
router.get("/requests", (req, res) => {
  const db = getDB();
  const client = myClient(req, db);
  if (!client) return res.status(404).json({ error: "No client profile linked to this account." });
  const mine = db.clientRequests.filter((r) => r.clientId === client.id);
  res.json(mine.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

router.post("/requests", (req, res) => {
  const db = getDB();
  const client = myClient(req, db);
  if (!client) return res.status(404).json({ error: "No client profile linked to this account." });

  const { drugName, qty, priority } = req.body;
  if (!drugName || !qty) {
    return res.status(400).json({ error: "drugName and qty are required." });
  }
  const allowedPriority = ["routine", "urgent", "critical"];
  const finalPriority = allowedPriority.includes(priority) ? priority : "routine";

  const request = {
    id: nextId("clientRequests"),
    clientId: client.id,
    clientName: client.name,
    drugName,
    qtyRequested: Number(qty),
    region: client.region,
    priority: finalPriority,
    status: "pending",
    createdAt: new Date().toISOString(),
    approvedAt: null,
    dispatchedAt: null,
    receivedAt: null,
    qtyDispatched: null,
    qtyReceived: null,
    batchesAllocated: [],
    gpsLog: [],
    coldChainLog: [],
    rejectionReason: null,
  };
  db.clientRequests.push(request);
  getChain().addBlock("CLIENT_REQUEST_RAISED", req.user.email, {
    portal: "client",
    requestId: request.id,
    clientName: client.name,
    drugName,
    qty: request.qtyRequested,
    region: client.region,
    priority: finalPriority,
  });
  save();
  res.status(201).json(request);
});

// ---------- Receiving (this is where a mismatch gets caught) ----------
router.post("/requests/:id/receive", (req, res) => {
  const db = getDB();
  const client = myClient(req, db);
  if (!client) return res.status(404).json({ error: "No client profile linked to this account." });

  const request = db.clientRequests.find((r) => r.id === Number(req.params.id) && r.clientId === client.id);
  if (!request) return res.status(404).json({ error: "Request not found for this client." });
  if (request.status !== "dispatched") {
    return res.status(400).json({ error: "Request must be dispatched before it can be received. Current status: " + request.status + "." });
  }

  const qtyReceived = req.body.qtyReceived != null ? Number(req.body.qtyReceived) : request.qtyDispatched;
  request.qtyReceived = qtyReceived;
  request.status = "received";
  request.receivedAt = new Date().toISOString();

  // Add what actually arrived into the client's OWN on-hand stock — this is
  // what makes "real-time stock visibility at hospitals" a real thing
  // instead of just a request-history log. Preserves each batch's original
  // expiry date so FEFO stays correct when the client later dispenses it.
  const proportionReceived = request.qtyDispatched > 0 ? qtyReceived / request.qtyDispatched : 0;
  request.batchesAllocated.forEach((b) => {
    const qtyForThisBatch = Math.round(b.qty * proportionReceived);
    if (qtyForThisBatch <= 0) return;
    let invItem = db.clientInventory.find((i) => i.clientId === client.id && i.batch === b.batch);
    if (invItem) {
      invItem.stock += qtyForThisBatch;
    } else {
      db.clientInventory.push({
        id: nextId("clientInventory"),
        clientId: client.id,
        clientName: client.name,
        drugName: request.drugName,
        batch: b.batch,
        manufacturer: b.manufacturer || "Sunrise Pharma",
        stock: qtyForThisBatch,
        reorderPoint: 10,
        unitPrice: b.unitPrice,
        expiryDate: b.expiryDate,
        coldChain: !!b.coldChain,
        provenanceChecksum: computeProvenanceChecksum(b.batch, b.manufacturer || "Sunrise Pharma"),
      });
    }
  });

  const mismatch = evaluateQuantityMismatch(request.qtyDispatched, qtyReceived);
  if (mismatch.mismatch) {
    const anomaly = {
      id: nextId("anomalies"),
      type: "quantity-mismatch",
      drugName: request.drugName,
      batch: (request.batchesAllocated[0] || {}).batch || "N/A",
      severity: mismatch.severity,
      detectedAt: request.receivedAt,
      status: "open",
      source: "client",
      message: "Client request #" + request.id + " (" + client.name + "): " + request.qtyDispatched + " units dispatched but only " + qtyReceived + " confirmed received (" + mismatch.diffPercent + "% " + mismatch.direction + ").",
    };
    db.anomalies.push(anomaly);
    getChain().addBlock("CLIENT_QUANTITY_MISMATCH_DETECTED", req.user.email, {
      portal: "client",
      requestId: request.id,
      clientName: client.name,
      drugName: request.drugName,
      qtyDispatched: request.qtyDispatched,
      qtyReceived,
      diffPercent: mismatch.diffPercent,
      direction: mismatch.direction,
    });
  }

  getChain().addBlock("CLIENT_ORDER_RECEIVED", req.user.email, {
    portal: "client",
    requestId: request.id,
    clientName: client.name,
    drugName: request.drugName,
    qtyReceived,
  });
  save();
  res.json({ request, mismatch });
});

// ---------- My Inventory (on-hand stock actually on the shelf) ----------
router.get("/inventory", (req, res) => {
  const db = getDB();
  const client = myClient(req, db);
  if (!client) return res.status(404).json({ error: "No client profile linked to this account." });
  const mine = db.clientInventory.filter((i) => i.clientId === client.id);
  res.json(mine.map((i) => ({ ...i, flags: detectInventoryAnomalies(i) })));
});

// Record medicine actually being dispensed/administered — this is what
// makes the on-hand stock figure real over time instead of only ever going
// up. Draws via FEFO across the client's own batches.
router.post("/usage", (req, res) => {
  const db = getDB();
  const client = myClient(req, db);
  if (!client) return res.status(404).json({ error: "No client profile linked to this account." });

  const { drugName, qty, note } = req.body;
  if (!drugName || !qty) {
    return res.status(400).json({ error: "drugName and qty are required." });
  }

  const pool = db.clientInventory.filter((i) => i.clientId === client.id);
  const { allocated, totalAllocated, shortfall } = allocateFEFO(pool, drugName, Number(qty));
  if (totalAllocated === 0) {
    return res.status(400).json({ error: `No on-hand stock of ${drugName} to record usage against.` });
  }
  if (shortfall > 0) {
    return res.status(400).json({ error: `Only ${totalAllocated} of ${qty} units on hand; usage not recorded.` });
  }

  const usage = {
    id: nextId("clientUsageLog"),
    clientId: client.id,
    clientName: client.name,
    drugName,
    qty: totalAllocated,
    note: note || "",
    batchesUsed: allocated.map((a) => ({ batch: a.batch, qty: a.qty })),
    recordedAt: new Date().toISOString(),
  };
  db.clientUsageLog.push(usage);
  getChain().addBlock("CLIENT_USAGE_RECORDED", req.user.email, {
    portal: "client",
    clientName: client.name,
    drugName,
    qty: totalAllocated,
    batchesUsed: usage.batchesUsed,
  });
  save();
  res.status(201).json(usage);
});

// ---------- Provenance lookup (verify what arrived is genuine) ----------
router.get("/provenance/:batch", (req, res) => {
  const blocks = getChain().getByBatch(req.params.batch);
  res.json({ batch: req.params.batch, found: blocks.length > 0, history: blocks });
});

module.exports = router;
