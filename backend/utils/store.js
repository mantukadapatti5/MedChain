const fs = require("fs");
const path = require("path");
const Blockchain = require("./blockchain");
const eventBus = require("./eventBus");

const DB_PATH = path.join(__dirname, "..", "data", "db.json");

let db = null;
let chain = null;

function load() {
  const raw = fs.readFileSync(DB_PATH, "utf-8");
  db = JSON.parse(raw);
  chain = new Blockchain(db.blockchain);
  return db;
}

function save() {
  db.blockchain = chain.getAll();
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
  eventBus.emit("update"); // pushes to every connected SSE client in real time
}

function getDB() {
  if (!db) load();
  return db;
}

function getChain() {
  if (!chain) load();
  return chain;
}

function nextId(collectionName) {
  const items = getDB()[collectionName] || [];
  const max = items.reduce((m, i) => Math.max(m, i.id || 0), 0);
  return max + 1;
}

module.exports = { load, save, getDB, getChain, nextId, DB_PATH };
