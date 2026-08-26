const fs = require("fs");
const path = require("path");
const { createSeededRandom } = require("./rng");

const DATASET_SEED = 20260101; // fixed seed -> reproducible dataset every run

/**
 * Generates a synthetic but realistically-patterned daily sales history for
 * every drug in the catalog, covering ~19 months (580+ days) per drug —
 * 7 drugs x 580+ days = 4,000+ labeled records, comfortably above the
 * 500-record minimum. This exists because the project has no access to a
 * real hospital sales dataset; every pattern below (seasonality, trend,
 * weekday effects, outbreak spikes) is deliberately constructed so a model
 * has genuine, learnable structure to find, and so held-out test data can
 * meaningfully measure whether it actually learned it.
 */

const DRUGS = [
  { name: "Paracetamol 500mg", category: "Analgesic", base: 45, seasonPeakDay: 15, seasonAmplitude: 0.15, trendPerYear: 0.02, noisePct: 0.12, spikeProneness: 0.2 },
  { name: "Amoxicillin 250mg", category: "Antibiotic", base: 30, seasonPeakDay: 15, seasonAmplitude: 0.45, trendPerYear: 0.03, noisePct: 0.15, spikeProneness: 0.6 },
  { name: "Insulin Glargine 100IU", category: "Hormone", base: 12, seasonPeakDay: 15, seasonAmplitude: 0.05, trendPerYear: 0.08, noisePct: 0.10, spikeProneness: 0.05 },
  { name: "Azithromycin 500mg", category: "Antibiotic", base: 22, seasonPeakDay: 15, seasonAmplitude: 0.5, trendPerYear: 0.03, noisePct: 0.18, spikeProneness: 0.8 },
  { name: "Ceftriaxone 1g Injection", category: "Antibiotic", base: 10, seasonPeakDay: 15, seasonAmplitude: 0.35, trendPerYear: 0.02, noisePct: 0.15, spikeProneness: 0.4 },
  { name: "ORS Sachets", category: "Rehydration", base: 60, seasonPeakDay: 200, seasonAmplitude: 0.55, trendPerYear: 0.01, noisePct: 0.14, spikeProneness: 0.3 },
  { name: "Metformin 500mg", category: "Antidiabetic", base: 35, seasonPeakDay: 15, seasonAmplitude: 0.08, trendPerYear: 0.06, noisePct: 0.10, spikeProneness: 0.05 },
];

const DAYS_PER_DRUG = 580;
const WEEKDAY_MULTIPLIER = [0.65, 1.0, 1.05, 1.05, 1.05, 1.05, 0.8]; // Sun..Sat

function dayOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 0);
  return Math.floor((date - start) / 86400000);
}

// Approximately-Gaussian noise via the sum of uniform draws (central limit
// theorem) - avoids pulling in an external stats library for one function.
function gaussianNoise(scale, rand) {
  let sum = 0;
  for (let i = 0; i < 6; i++) sum += rand();
  return ((sum - 3) / 3) * scale;
}

function generateDataset() {
  const rand = createSeededRandom(DATASET_SEED);
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - DAYS_PER_DRUG);

  const rows = [];

  DRUGS.forEach((drug) => {
    let spikeDaysRemaining = 0;
    let spikeMultiplier = 1;

    for (let t = 0; t < DAYS_PER_DRUG; t++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + t);
      const doy = dayOfYear(date);

      const weeklyFactor = WEEKDAY_MULTIPLIER[date.getDay()];
      const yearlyFactor = 1 + drug.seasonAmplitude * Math.cos((2 * Math.PI * (doy - drug.seasonPeakDay)) / 365);
      const trendFactor = 1 + drug.trendPerYear * (t / 365);

      if (spikeDaysRemaining > 0) {
        spikeDaysRemaining--;
      } else if (rand() < (drug.spikeProneness / 100) * 1.2) {
        spikeDaysRemaining = 3 + Math.floor(rand() * 4);
        spikeMultiplier = 2 + rand() * 2.5;
      } else {
        spikeMultiplier = 1;
      }

      const rawQty = drug.base * weeklyFactor * yearlyFactor * trendFactor * spikeMultiplier;
      const noisy = rawQty + gaussianNoise(drug.base * drug.noisePct, rand);
      const qty = Math.max(0, Math.round(noisy));

      rows.push({
        date: date.toISOString().slice(0, 10),
        drugName: drug.name,
        category: drug.category,
        qty,
      });
    }
  });

  return rows;
}

function main() {
  const rows = generateDataset();
  const outPath = path.join(__dirname, "data", "sales_history.json");
  fs.writeFileSync(outPath, JSON.stringify(rows, null, 0), "utf-8");
  console.log("Generated " + rows.length + " synthetic sales records across " + DRUGS.length + " drugs -> " + outPath);
  console.log("(" + DAYS_PER_DRUG + " days per drug, ~" + (DAYS_PER_DRUG / 30.4).toFixed(1) + " months of history each)");
}

if (require.main === module) {
  main();
}

module.exports = { generateDataset, DRUGS, DAYS_PER_DRUG };
