/**
 * A seeded pseudo-random number generator (mulberry32 algorithm).
 *
 * Without this, Math.random() gives different results every run - which
 * means the synthetic dataset and the Random Forest's bootstrap sampling
 * would both change every time `npm run train-model` runs, and the
 * accuracy metrics reported to the person using this project would drift
 * unpredictably (including, as testing found, sometimes producing
 * misleadingly bad results purely from unlucky randomness, not anything
 * wrong with the model itself). Seeding makes training reproducible: the
 * same seed always produces the same dataset and the same trained model,
 * so the metrics in training_report.json are stable and trustworthy.
 */
function createSeededRandom(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

module.exports = { createSeededRandom };
