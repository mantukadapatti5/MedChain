const fs = require("fs");
const path = require("path");

const DATASET_DIR = path.join(__dirname, "..", "data", "dataset");
const FILES = {
  sales: "1_sales_demand_history.csv",
  inventory: "2_inventory_batch.csv",
  hospitalDemand: "3_hospital_client_demand.csv",
  shipments: "4_shipment_history.csv",
  coldChain: "5_cold_chain.csv",
  suppliers: "6_supplier_vendor_performance.csv",
};

function parseCSVLine(line) {
  const values = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { value += '"'; i += 1; }
      else quoted = !quoted;
    } else if (ch === "," && !quoted) { values.push(value.trim()); value = ""; }
    else value += ch;
  }
  values.push(value.trim());
  return values;
}

function cast(value) {
  if (value === "") return null;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value;
}

function readCSV(filename) {
  const filePath = path.join(DATASET_DIR, filename);
  if (!fs.existsSync(filePath)) throw new Error(`Dataset not found: ${filename}`);
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = parseCSVLine(line);
    return headers.reduce((row, header, index) => { row[header] = cast(cells[index] ?? ""); return row; }, {});
  });
}

let cache = null;
let cacheStamp = 0;

function loadDatasets({ force = false } = {}) {
  const stamp = Object.values(FILES).reduce((max, filename) => {
    const stat = fs.statSync(path.join(DATASET_DIR, filename));
    return Math.max(max, stat.mtimeMs);
  }, 0);
  if (!force && cache && stamp === cacheStamp) return cache;
  cache = Object.fromEntries(Object.entries(FILES).map(([key, filename]) => [key, readCSV(filename)]));
  cacheStamp = stamp;
  return cache;
}

function datasetSummary() {
  const data = loadDatasets();
  return Object.fromEntries(Object.entries(data).map(([key, rows]) => [key, { rows: rows.length, columns: Object.keys(rows[0] || {}) }]));
}

module.exports = { DATASET_DIR, FILES, loadDatasets, datasetSummary, readCSV };
