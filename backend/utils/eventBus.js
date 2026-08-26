const EventEmitter = require("events");

/**
 * Backs the real-time push layer. Every time the JSON "database" is saved
 * (i.e. any transaction happened anywhere — an order, a sale, a recall, an
 * anomaly), store.js emits "update" here. server.js's SSE endpoint listens
 * and pushes a tiny "something changed" ping to every connected browser tab,
 * across all four portals, so the UI refreshes within a second instead of
 * waiting for the next poll interval.
 */
const bus = new EventEmitter();
bus.setMaxListeners(200); // one per connected browser tab

module.exports = bus;
