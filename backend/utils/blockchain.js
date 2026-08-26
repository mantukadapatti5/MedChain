const crypto = require("crypto");

/**
 * Lightweight hash-chained ledger that simulates the Hyperledger Fabric
 * "Immutable Ledger" + "Smart Contract Triggers" + "Tamper-proof Audit Trail"
 * blocks shown in the Blockchain Layer of the architecture diagram.
 *
 * Every state-changing action across all three portals (order placed,
 * dispatched, received, sale recorded, inventory updated, anomaly raised,
 * quarantine triggered, compliance verification) is written here as a block.
 * Each block hashes the previous block's hash, so any tampering with
 * historical data is detectable via verifyChain().
 */
class Blockchain {
  constructor(existingChain) {
    if (existingChain && existingChain.length) {
      this.chain = existingChain;
    } else {
      this.chain = [this.createGenesisBlock()];
    }
  }

  createGenesisBlock() {
    const block = {
      index: 0,
      timestamp: new Date("2026-01-01T00:00:00Z").toISOString(),
      type: "GENESIS",
      actor: "system",
      data: { message: "Drug Supply Chain Ledger Initialized" },
      prevHash: "0",
    };
    block.hash = this.computeHash(block);
    return block;
  }

  computeHash(block) {
    const payload =
      block.index +
      block.timestamp +
      block.type +
      block.actor +
      JSON.stringify(block.data) +
      block.prevHash;
    return crypto.createHash("sha256").update(payload).digest("hex");
  }

  getLatestBlock() {
    return this.chain[this.chain.length - 1];
  }

  /**
   * type examples: ORDER_PLACED, SMART_CONTRACT_AUTO_PROCURE, ORDER_DISPATCHED,
   * ORDER_RECEIVED, SALE_RECORDED, INVENTORY_UPDATE, ANOMALY_DETECTED,
   * QUARANTINE_TRIGGERED, COMPLIANCE_VERIFIED, COLD_CHAIN_ALERT
   */
  addBlock(type, actor, data) {
    const prevBlock = this.getLatestBlock();
    const block = {
      index: prevBlock.index + 1,
      timestamp: new Date().toISOString(),
      type,
      actor,
      data,
      prevHash: prevBlock.hash,
    };
    block.hash = this.computeHash(block);
    this.chain.push(block);
    return block;
  }

  verifyChain() {
    const genesis = this.chain[0];
    if (!genesis || genesis.hash !== this.computeHash(genesis) || genesis.prevHash !== "0") {
      return { valid: false, brokenAt: 0, reason: "Genesis block invalid or tampered" };
    }

    for (let i = 1; i < this.chain.length; i++) {
      const current = this.chain[i];
      const previous = this.chain[i - 1];

      if (current.hash !== this.computeHash(current)) {
        return { valid: false, brokenAt: current.index, reason: "Hash mismatch (data tampered)" };
      }
      if (current.prevHash !== previous.hash) {
        return { valid: false, brokenAt: current.index, reason: "Chain link broken (prevHash mismatch)" };
      }
    }
    return { valid: true };
  }

  getByBatch(batchNo) {
    // Recursively searches every block's data — including nested arrays like
    // batchesAllocated/batchesUsed — for a matching batch reference, not
    // just a top-level `batch`/`batchNo` field. This is what makes
    // provenance lookup work for every transaction type, including ones
    // added after the ledger's first version, without needing a manual
    // update here every time a new block shape is introduced.
    const matchesBatch = (value) => {
      if (!value || typeof value !== "object") return false;
      if (value.batch === batchNo || value.batchNo === batchNo) return true;
      return Object.values(value).some((v) => {
        if (Array.isArray(v)) return v.some((item) => matchesBatch(item));
        if (v && typeof v === "object") return matchesBatch(v);
        return false;
      });
    };
    return this.chain.filter((b) => matchesBatch(b.data));
  }

  getAll() {
    return this.chain;
  }
}

module.exports = Blockchain;
