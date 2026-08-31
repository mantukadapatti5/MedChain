const { createSeededRandom } = require("./rng");

// Lightweight Isolation Forest implementation for MedChain's Node.js stack.
// It is intentionally dependency-free so the model can run in the existing
// backend without introducing a second ML runtime.

class IsolationTree {
  constructor({ maxDepth = 8, minSize = 2, rand = Math.random } = {}) {
    this.maxDepth = maxDepth;
    this.minSize = minSize;
    this.rand = rand;
  }

  fit(rows, depth = 0) {
    if (!rows.length || depth >= this.maxDepth || rows.length <= this.minSize) {
      return { size: rows.length };
    }

    const nFeatures = rows[0].length;
    const feature = Math.floor(this.rand() * nFeatures);
    const values = rows.map((r) => r[feature]);
    const min = Math.min(...values);
    const max = Math.max(...values);

    if (!Number.isFinite(min) || min === max) return { size: rows.length };

    const split = min + this.rand() * (max - min);
    const left = rows.filter((r) => r[feature] < split);
    const right = rows.filter((r) => r[feature] >= split);

    if (!left.length || !right.length) return { size: rows.length };

    return {
      feature,
      split,
      left: this.fit(left, depth + 1),
      right: this.fit(right, depth + 1),
    };
  }
}

function harmonic(n) {
  if (n <= 1) return 0;
  let h = 0;
  for (let i = 1; i <= n; i++) h += 1 / i;
  return h;
}

function cFactor(n) {
  if (n <= 1) return 1;
  return 2 * harmonic(n - 1) - (2 * (n - 1)) / n;
}

function pathLength(node, row, depth = 0) {
  if (!node) return depth;
  if (node.size != null) return depth + cFactor(node.size);
  if (row[node.feature] < node.split) return pathLength(node.left, row, depth + 1);
  return pathLength(node.right, row, depth + 1);
}

class IsolationForest {
  constructor({ nTrees = 80, sampleSize = 32, maxDepth = 8, contamination = 0.12, seed = 314159 } = {}) {
    this.nTrees = nTrees;
    this.sampleSize = sampleSize;
    this.maxDepth = maxDepth;
    this.contamination = contamination;
    this.seed = seed;
    this.trees = [];
    this.threshold = 0.6;
  }

  fit(X) {
    if (!Array.isArray(X) || X.length < 3) {
      throw new Error("Isolation Forest requires at least 3 records.");
    }
    const rand = createSeededRandom(this.seed);
    const size = Math.min(this.sampleSize, X.length);
    this.trees = [];

    for (let i = 0; i < this.nTrees; i++) {
      const sample = [];
      for (let j = 0; j < size; j++) {
        sample.push(X[Math.floor(rand() * X.length)]);
      }
      const tree = new IsolationTree({ maxDepth: this.maxDepth, rand });
      this.trees.push(tree.fit(sample));
    }

    const scores = X.map((row) => this.scoreOne(row));
    const sorted = scores.slice().sort((a, b) => b - a);
    const cutoffIndex = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * this.contamination) - 1));
    this.threshold = sorted[cutoffIndex] ?? 0.6;
    return this;
  }

  scoreOne(row) {
    if (!this.trees.length) return 0;
    const avgPath = this.trees.reduce((sum, tree) => sum + pathLength(tree, row), 0) / this.trees.length;
    const normalizer = cFactor(Math.min(this.sampleSize, 32));
    if (!normalizer) return 0;
    return Number(Math.pow(2, -avgPath / normalizer).toFixed(4));
  }

  score(X) {
    return X.map((row) => this.scoreOne(row));
  }

  predict(X) {
    return this.score(X).map((score) => score >= this.threshold);
  }
}

module.exports = IsolationForest;
