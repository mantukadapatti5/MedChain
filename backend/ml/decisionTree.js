/**
 * A regression decision tree (CART algorithm), trained from scratch.
 *
 * At each node, it searches for the feature + threshold split that reduces
 * the variance of the target values the most (the same core idea used by
 * scikit-learn's DecisionTreeRegressor). This is genuine model *fitting* —
 * the tree structure itself is learned from the training data, not
 * hand-written — which is what the Random Forest built on top of this
 * class in randomForest.js is training and testing.
 */
class DecisionTreeRegressor {
  constructor({ maxDepth = 8, minSamplesLeaf = 5, maxFeatures = null, rand = null } = {}) {
    this.maxDepth = maxDepth;
    this.minSamplesLeaf = minSamplesLeaf;
    this.maxFeatures = maxFeatures; // number of features to consider per split (Random Forest-style)
    this.rand = rand; // optional seeded RNG for reproducible training
    this.root = null;
  }

  fit(X, y) {
    const nFeatures = X[0].length;
    const indices = Array.from({ length: X.length }, (_, i) => i);
    this.root = this._buildNode(X, y, indices, 0, nFeatures);
    return this;
  }

  _variance(y, indices) {
    if (indices.length === 0) return 0;
    const mean = indices.reduce((s, i) => s + y[i], 0) / indices.length;
    const sqDiff = indices.reduce((s, i) => s + (y[i] - mean) ** 2, 0);
    return sqDiff / indices.length;
  }

  _mean(y, indices) {
    return indices.reduce((s, i) => s + y[i], 0) / indices.length;
  }

  _buildNode(X, y, indices, depth, nFeatures) {
    if (
      depth >= this.maxDepth ||
      indices.length < this.minSamplesLeaf * 2
    ) {
      return { isLeaf: true, value: this._mean(y, indices), n: indices.length };
    }

    const featurePool = this._featureSubset(nFeatures);
    let best = null; // { featureIndex, threshold, leftIndices, rightIndices, gain }
    const parentVariance = this._variance(y, indices);

    for (const featureIndex of featurePool) {
      const sorted = indices.slice().sort((a, b) => X[a][featureIndex] - X[b][featureIndex]);
      // try midpoints between consecutive distinct values as split candidates
      for (let i = this.minSamplesLeaf; i < sorted.length - this.minSamplesLeaf; i++) {
        const a = X[sorted[i - 1]][featureIndex];
        const b = X[sorted[i]][featureIndex];
        if (a === b) continue;
        const threshold = (a + b) / 2;
        const leftIndices = sorted.slice(0, i);
        const rightIndices = sorted.slice(i);

        const leftVar = this._variance(y, leftIndices);
        const rightVar = this._variance(y, rightIndices);
        const weighted = (leftIndices.length * leftVar + rightIndices.length * rightVar) / indices.length;
        const gain = parentVariance - weighted;

        if (!best || gain > best.gain) {
          best = { featureIndex, threshold, leftIndices, rightIndices, gain };
        }
      }
    }

    if (!best || best.gain <= 0) {
      return { isLeaf: true, value: this._mean(y, indices), n: indices.length };
    }

    return {
      isLeaf: false,
      featureIndex: best.featureIndex,
      threshold: best.threshold,
      left: this._buildNode(X, y, best.leftIndices, depth + 1, nFeatures),
      right: this._buildNode(X, y, best.rightIndices, depth + 1, nFeatures),
    };
  }

  _featureSubset(nFeatures) {
    const all = Array.from({ length: nFeatures }, (_, i) => i);
    if (!this.maxFeatures || this.maxFeatures >= nFeatures) return all;
    // Fisher-Yates partial shuffle to pick a random subset (Random Forest's
    // feature-subsampling trick — decorrelates the trees in the ensemble)
    const rand = this.rand || Math.random;
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    return all.slice(0, this.maxFeatures);
  }

  predictOne(x) {
    let node = this.root;
    while (!node.isLeaf) {
      node = x[node.featureIndex] <= node.threshold ? node.left : node.right;
    }
    return node.value;
  }
}

module.exports = DecisionTreeRegressor;
