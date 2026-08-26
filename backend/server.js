const express = require("express");
const cors = require("cors");
const { load } = require("./utils/store");
const eventBus = require("./utils/eventBus");
const { verifyToken } = require("./middleware/auth");
const { issueTicket, consumeTicket } = require("./utils/sseTickets");

load(); // initialize JSON "database" + blockchain ledger

const authRoutes = require("./routes/auth");
const vendorRoutes = require("./routes/vendor");
const distributorRoutes = require("./routes/distributor");
const adminRoutes = require("./routes/admin");
const blockchainRoutes = require("./routes/blockchain");
const clientRoutes = require("./routes/client");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// simple request log — useful while wiring up portal-to-portal flows
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "drug-scm-backend", time: new Date().toISOString() });
});

// ---------- Real-time push (Server-Sent Events) ----------
// EventSource can't send an Authorization header, so a normal authenticated
// request first exchanges the person's real login token for a short-lived,
// single-use ticket (see utils/sseTickets.js) — that ticket, never the real
// token, is what travels in the SSE connection's URL.
app.post("/api/events/ticket", verifyToken, (req, res) => {
  res.json({ ticket: issueTicket(req.user) });
});

// Every browser tab across all four portals opens one of these connections.
// Whenever anything changes (see utils/store.js -> save()), every connected
// tab gets a ping within a second and refreshes its own data — this is what
// makes cross-portal updates genuinely real-time instead of "wait up to N
// seconds for the next poll."
app.get("/api/events", (req, res) => {
  const user = consumeTicket(req.query.ticket || "");
  if (!user) {
    return res.status(401).end();
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write("retry: 3000\n\n");

  const ping = () => res.write(`data: update\n\n`);
  eventBus.on("update", ping);

  // heartbeat so proxies/browsers don't time out an idle connection
  const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 20000);

  req.on("close", () => {
    eventBus.off("update", ping);
    clearInterval(heartbeat);
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/vendor", vendorRoutes);
app.use("/api/distributor", distributorRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/blockchain", blockchainRoutes);
app.use("/api/client", clientRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

// centralized error handler — every route action is wrapped so a bad
// request never crashes the process or leaves a portal hanging
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error. Please try again." });
});

app.listen(PORT, () => {
  console.log(`\n🔐  Drug Supply Chain API running on http://localhost:${PORT}`);
  console.log(`📦  Portals: /api/vendor  /api/distributor  /api/admin`);
  console.log(`⛓️   Blockchain ledger:  /api/blockchain/ledger\n`);
});
