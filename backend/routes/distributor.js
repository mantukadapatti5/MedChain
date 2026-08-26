const express = require("express");
const { getDB, getChain, save, nextId } = require("../utils/store");
const { verifyToken, requireRole } = require("../middleware/auth");
const { checkColdChain, evaluateQuantityMismatch, computeProvenanceChecksum } = require("../utils/mlEngine");
const { allocateFEFO } = require("../utils/fefo");
const { applySafeInventoryUpdate } = require("../utils/inventoryGuard");

const router = express.Router();
router.use(verifyToken, requireRole("distributor", "admin"));

// ---------- Dashboard ----------
router.get("/dashboard", (req, res) => {
  const db = getDB();
  const totalSalesAmount = db.sales.reduce((s, x) => s + x.amount, 0);
  const lowStock = db.distributorInventory.filter((i) => i.stock <= i.reorderPoint);

  res.json({
    pendingRequests: db.stockRequests.filter((r) => r.status === "pending").length,
    inTransit: db.stockRequests.filter((r) => r.status === "dispatched").length,
    totalSalesAmount: Number(totalSalesAmount.toFixed(2)),
    totalSalesCount: db.sales.length,
    lowStockCount: lowStock.length,
    activeQueue: db.stockRequests.filter((r) => r.status !== "received" && r.status !== "rejected"),
    supplierPerformance: db.supplierPerformance,
    regions: db.regions,
    emergencyMode: db.settings.emergencyMode,
  });
});

// ---------- Stock Requests (Distributor -> Vendor) ----------
router.get("/stock-requests", (req, res) => {
  res.json(getDB().stockRequests);
});

router.post("/stock-requests", (req, res) => {
  const { drugName, qty, region, priority } = req.body;
  if (!drugName || !qty || !region) {
    return res.status(400).json({ error: "drugName, qty and region are required to raise a stock request." });
  }
  const allowedPriority = ["routine", "urgent", "critical"];
  const finalPriority = allowedPriority.includes(priority) ? priority : "routine";

  const db = getDB();
  const request = {
    id: nextId("stockRequests"),
    drugName,
    qtyRequested: Number(qty),
    region,
    priority: finalPriority,
    status: "pending",
    requestedBy: "distributor",
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
  db.stockRequests.push(request);
  getChain().addBlock("STOCK_REQUEST_RAISED", req.user.email, {
    portal: "distributor",
    requestId: request.id,
    drugName,
    qty: request.qtyRequested,
    region,
    priority: finalPriority,
  });
  save();
  res.status(201).json(request);
});

// Simulated GPS ping while in transit
router.post("/stock-requests/:id/gps-ping", (req, res) => {
  const db = getDB();
  const request = db.stockRequests.find((r) => r.id === Number(req.params.id));
  if (!request) return res.status(404).json({ error: "Stock request not found." });
  if (request.status !== "dispatched") {
    return res.status(400).json({ error: "GPS pings can only be added to in-transit shipments." });
  }
  const { lat, lng, label } = req.body;
  const ping = {
    lat: lat != null ? Number(lat) : 12.9716 + Math.random() * 0.5,
    lng: lng != null ? Number(lng) : 77.5946 + Math.random() * 0.5,
    timestamp: new Date().toISOString(),
    label: label || "In Transit",
  };
  request.gpsLog.push(ping);
  save();
  res.json(request);
});

// Simulated cold chain sensor reading while in transit
router.post("/stock-requests/:id/cold-chain-reading", (req, res) => {
  const db = getDB();
  const request = db.stockRequests.find((r) => r.id === Number(req.params.id));
  if (!request) return res.status(404).json({ error: "Stock request not found." });

  const temp = req.body.temp != null ? Number(req.body.temp) : Number((4 + Math.random() * 6).toFixed(1));
  const humidity = req.body.humidity != null ? Number(req.body.humidity) : Number((35 + Math.random() * 30).toFixed(0));
  const result = checkColdChain({ temp, humidity });
  const reading = { temp, humidity, timestamp: new Date().toISOString(), alert: result.breached };
  request.coldChainLog.push(reading);

  if (result.breached) {
    const anomaly = {
      id: nextId("anomalies"),
      type: "cold-chain-breach",
      drugName: request.drugName,
      batch: (request.batchesAllocated[0] || {}).batch || "N/A",
      severity: "high",
      detectedAt: reading.timestamp,
      status: "open",
      source: "distributor",
      message: result.alerts.join("; "),
    };
    db.anomalies.push(anomaly);
    getChain().addBlock("COLD_CHAIN_ALERT", "system:iot-sensor", { portal: "distributor", requestId: request.id, drugName: request.drugName, ...reading });
  }
  save();
  res.json({ request, breached: result.breached, alerts: result.alerts });
});

// Distributor confirms what actually arrived — this is where quantity
// tampering/shrinkage gets caught, by comparing against what the vendor
// recorded as dispatched.
router.post("/stock-requests/:id/receive", (req, res) => {
  const db = getDB();
  const request = db.stockRequests.find((r) => r.id === Number(req.params.id));
  if (!request) return res.status(404).json({ error: "Stock request not found." });
  if (request.status !== "dispatched") {
    return res.status(400).json({ error: `Request must be dispatched before it can be received. Current status: ${request.status}.` });
  }

  const qtyReceived = req.body.qtyReceived != null ? Number(req.body.qtyReceived) : request.qtyDispatched;
  request.qtyReceived = qtyReceived;
  request.status = "received";
  request.receivedAt = new Date().toISOString();

  // Add received batches into distributor inventory for the target region,
  // preserving each batch's original expiry date so FEFO stays correct
  // downstream when the distributor later sells it out.
  const proportionReceived = request.qtyDispatched > 0 ? qtyReceived / request.qtyDispatched : 0;
  request.batchesAllocated.forEach((b) => {
    const qtyForThisBatch = Math.round(b.qty * proportionReceived);
    if (qtyForThisBatch <= 0) return;
    let invItem = db.distributorInventory.find((i) => i.batch === b.batch && i.region === request.region);
    if (invItem) {
      invItem.stock += qtyForThisBatch;
    } else {
      db.distributorInventory.push({
        id: nextId("distributorInventory"),
        drugName: request.drugName,
        category: "General",
        batch: b.batch,
        manufacturer: b.manufacturer || "Sunrise Pharma",
        region: request.region,
        stock: qtyForThisBatch,
        reorderPoint: 50,
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
      source: "distributor",
      message: `Stock request #${request.id}: ${request.qtyDispatched} units dispatched but only ${qtyReceived} confirmed received (${mismatch.diffPercent}% ${mismatch.direction}).`,
    };
    db.anomalies.push(anomaly);
    getChain().addBlock("QUANTITY_MISMATCH_DETECTED", req.user.email, {
      portal: "distributor",
      requestId: request.id,
      drugName: request.drugName,
      qtyDispatched: request.qtyDispatched,
      qtyReceived,
      diffPercent: mismatch.diffPercent,
      direction: mismatch.direction,
    });
  }

  getChain().addBlock("ORDER_RECEIVED", req.user.email, {
    portal: "distributor",
    requestId: request.id,
    drugName: request.drugName,
    qtyReceived,
  });
  save();
  res.json({ request, mismatch });
});

// ---------- Inventory (region-tagged batches) ----------
router.get("/inventory", (req, res) => {
  res.json(getDB().distributorInventory);
});

router.post("/inventory", (req, res) => {
  const { drugName, category, batch, manufacturer, region, stock, reorderPoint, unitPrice, expiryDate, coldChain } = req.body;
  if (!drugName || !batch || stock == null || !expiryDate || !region) {
    return res.status(400).json({ error: "drugName, batch, region, stock and expiryDate are required." });
  }
  const db = getDB();
  const item = {
    id: nextId("distributorInventory"),
    drugName,
    category: category || "General",
    batch,
    manufacturer: manufacturer || "Sunrise Pharma",
    region,
    stock: Number(stock),
    reorderPoint: Number(reorderPoint) || 50,
    unitPrice: Number(unitPrice) || 0,
    expiryDate,
    coldChain: !!coldChain,
    provenanceChecksum: computeProvenanceChecksum(batch, manufacturer),
  };
  db.distributorInventory.push(item);
  getChain().addBlock("INVENTORY_UPDATE", req.user.email, { portal: "distributor", action: "batch-created", drugName, batch, region, stock: item.stock });
  save();
  res.status(201).json(item);
});

router.put("/inventory/:id", (req, res) => {
  const db = getDB();
  const item = db.distributorInventory.find((i) => i.id === Number(req.params.id));
  if (!item) return res.status(404).json({ error: "Inventory item not found." });
  const before = item.stock;

  const validationError = applySafeInventoryUpdate(item, req.body);
  if (validationError) return res.status(400).json({ error: validationError });

  getChain().addBlock("INVENTORY_UPDATE", req.user.email, { portal: "distributor", action: "stock-adjusted", drugName: item.drugName, batch: item.batch, stockBefore: before, stockAfter: item.stock });
  save();
  res.json(item);
});

// ---------- Sales (FEFO-aware) ----------
router.get("/sales", (req, res) => {
  res.json(getDB().sales);
});

router.post("/sales", (req, res) => {
  const { drugName, qty, unitPrice, buyer, region } = req.body;
  if (!drugName || !qty || !buyer) {
    return res.status(400).json({ error: "drugName, qty and buyer are required." });
  }
  const db = getDB();
  const pool = region ? db.distributorInventory.filter((i) => i.region === region) : db.distributorInventory;
  const { allocated, totalAllocated, shortfall } = allocateFEFO(pool, drugName, Number(qty));

  if (totalAllocated === 0) {
    return res.status(400).json({ error: `No available stock for ${drugName}${region ? ` in ${region}` : ""}.` });
  }
  if (shortfall > 0) {
    return res.status(400).json({ error: `Insufficient stock. Only ${totalAllocated} of ${qty} requested units available; sale not recorded.` });
  }

  const avgUnitPrice = unitPrice ? Number(unitPrice) : allocated.reduce((s, a) => s + a.unitPrice * a.qty, 0) / totalAllocated;
  const sale = {
    id: nextId("sales"),
    drugName,
    batch: allocated.map((a) => a.batch).join(", "),
    qty: totalAllocated,
    unitPrice: Number(avgUnitPrice.toFixed(2)),
    amount: Number((avgUnitPrice * totalAllocated).toFixed(2)),
    buyer,
    date: new Date().toISOString(),
  };
  db.sales.push(sale);
  getChain().addBlock("SALE_RECORDED", req.user.email, {
    portal: "distributor",
    saleId: sale.id,
    drugName,
    qty: totalAllocated,
    buyer,
    batchesUsed: allocated.map((a) => ({ batch: a.batch, qty: a.qty })),
  });
  save();
  res.status(201).json(sale);
});

// ---------- Supplier Performance ----------
router.get("/supplier-performance", (req, res) => {
  res.json(getDB().supplierPerformance);
});

const PRIORITY_WEIGHT = { critical: 3, urgent: 2, routine: 1 };

// ---------- Clients Directory (the ~50 medicals/institutions) ----------
router.get("/clients", (req, res) => {
  const db = getDB();
  res.json(db.clients.map(({ passwordHash, ...safe }) => safe));
});

router.post("/clients", (req, res) => {
  const { name, type, region, contactPerson, phone, email, password } = req.body;
  if (!name || !type || !region || !email || !password) {
    return res.status(400).json({ error: "name, type, region, email and password are required to onboard a client." });
  }
  const db = getDB();
  if (db.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(400).json({ error: "An account with this email already exists." });
  }
  const { hashPassword } = require("../utils/security");
  const userId = nextId("users");
  db.users.push({ id: userId, name, email, passwordHash: hashPassword(password), role: "client", licenseVerified: false });

  const client = {
    id: nextId("clients"),
    userId,
    name,
    type,
    region,
    contactPerson: contactPerson || "",
    phone: phone || "",
    email,
    licenseVerified: false,
    onboardedAt: new Date().toISOString(),
  };
  db.clients.push(client);
  getChain().addBlock("CLIENT_ONBOARDED", req.user.email, { portal: "distributor", clientName: name, type, region });
  save();
  res.status(201).json(client);
});

// ---------- Client Requests (Client -> Distributor, last-mile leg) ----------
router.get("/client-requests", (req, res) => {
  const db = getDB();
  const sorted = db.clientRequests.slice().sort((a, b) => {
    const w = (PRIORITY_WEIGHT[b.priority] || 0) - (PRIORITY_WEIGHT[a.priority] || 0);
    if (w !== 0) return w;
    return new Date(a.createdAt) - new Date(b.createdAt);
  });
  res.json(sorted);
});

router.post("/client-requests/:id/approve", (req, res) => {
  const db = getDB();
  const request = db.clientRequests.find((r) => r.id === Number(req.params.id));
  if (!request) return res.status(404).json({ error: "Client request not found." });
  if (request.status !== "pending") {
    return res.status(400).json({ error: `Only pending requests can be approved. Current status: ${request.status}.` });
  }

  const pool = db.distributorInventory.filter((i) => i.region === request.region);
  const { allocated, totalAllocated, shortfall } = allocateFEFO(pool, request.drugName, request.qtyRequested);
  if (totalAllocated === 0) {
    return res.status(400).json({ error: `No available stock for ${request.drugName} in ${request.region}.` });
  }

  request.status = "dispatched";
  request.approvedAt = new Date().toISOString();
  request.dispatchedAt = request.approvedAt;
  request.qtyDispatched = totalAllocated;
  request.batchesAllocated = allocated;
  request.gpsLog.push({ lat: 12.9716, lng: 77.5946, timestamp: request.dispatchedAt, label: "Departed Distributor Hub" });

  const isColdChain = allocated.some((a) => a.coldChain);
  if (isColdChain) {
    request.coldChainLog.push({ temp: 4.9, humidity: 41, timestamp: request.dispatchedAt, alert: false });
  }

  getChain().addBlock("CLIENT_REQUEST_APPROVED", req.user.email, {
    portal: "distributor",
    requestId: request.id,
    clientName: request.clientName,
    drugName: request.drugName,
    region: request.region,
    qtyRequested: request.qtyRequested,
    qtyDispatched: totalAllocated,
    shortfall,
    batchesAllocated: allocated.map((a) => ({ batch: a.batch, qty: a.qty, expiryDate: a.expiryDate })),
  });
  getChain().addBlock("CLIENT_ORDER_DISPATCHED", req.user.email, {
    portal: "distributor",
    requestId: request.id,
    clientName: request.clientName,
    drugName: request.drugName,
    qty: totalAllocated,
  });

  save();
  res.json({ request, shortfall, message: shortfall > 0 ? `Partially fulfilled: ${totalAllocated}/${request.qtyRequested} units (insufficient regional stock).` : "Request approved and dispatched via FEFO allocation." });
});

router.post("/client-requests/:id/reject", (req, res) => {
  const db = getDB();
  const request = db.clientRequests.find((r) => r.id === Number(req.params.id));
  if (!request) return res.status(404).json({ error: "Client request not found." });
  if (request.status !== "pending") {
    return res.status(400).json({ error: `Only pending requests can be rejected. Current status: ${request.status}.` });
  }
  request.status = "rejected";
  request.rejectionReason = req.body.reason || "Not specified";
  getChain().addBlock("CLIENT_REQUEST_REJECTED", req.user.email, { portal: "distributor", requestId: request.id, clientName: request.clientName, reason: request.rejectionReason });
  save();
  res.json(request);
});

router.post("/client-requests/:id/gps-ping", (req, res) => {
  const db = getDB();
  const request = db.clientRequests.find((r) => r.id === Number(req.params.id));
  if (!request) return res.status(404).json({ error: "Client request not found." });
  if (request.status !== "dispatched") {
    return res.status(400).json({ error: "GPS pings can only be added to in-transit shipments." });
  }
  const { lat, lng, label } = req.body;
  request.gpsLog.push({
    lat: lat != null ? Number(lat) : 12.9716 + Math.random() * 0.5,
    lng: lng != null ? Number(lng) : 77.5946 + Math.random() * 0.5,
    timestamp: new Date().toISOString(),
    label: label || "In Transit to Client",
  });
  save();
  res.json(request);
});

router.post("/client-requests/:id/cold-chain-reading", (req, res) => {
  const db = getDB();
  const request = db.clientRequests.find((r) => r.id === Number(req.params.id));
  if (!request) return res.status(404).json({ error: "Client request not found." });

  const temp = req.body.temp != null ? Number(req.body.temp) : Number((4 + Math.random() * 6).toFixed(1));
  const humidity = req.body.humidity != null ? Number(req.body.humidity) : Number((35 + Math.random() * 30).toFixed(0));
  const result = checkColdChain({ temp, humidity });
  const reading = { temp, humidity, timestamp: new Date().toISOString(), alert: result.breached };
  request.coldChainLog.push(reading);

  if (result.breached) {
    const anomaly = {
      id: nextId("anomalies"),
      type: "cold-chain-breach",
      drugName: request.drugName,
      batch: (request.batchesAllocated[0] || {}).batch || "N/A",
      severity: "high",
      detectedAt: reading.timestamp,
      status: "open",
      source: "distributor",
      message: result.alerts.join("; "),
    };
    db.anomalies.push(anomaly);
    getChain().addBlock("COLD_CHAIN_ALERT", "system:iot-sensor", { portal: "distributor", requestId: request.id, clientName: request.clientName, drugName: request.drugName, ...reading });
  }
  save();
  res.json({ request, breached: result.breached, alerts: result.alerts });
});

module.exports = router;
