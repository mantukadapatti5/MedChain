/**
 * First-Expiry-First-Out allocation. Given an inventory array (each item is
 * one batch of a drug, with its own expiryDate and stock) and a quantity
 * needed, draws from the batch expiring soonest first, then the next, and
 * so on — mutating stock in place — so near-expiry stock never sits behind
 * a fresher batch when an order is fulfilled.
 *
 * Returns the allocation breakdown so the caller can log exactly which
 * batches were used (useful for the blockchain record and for the
 * distributor-side batch that inherits the original expiry date).
 */
function allocateFEFO(inventory, drugName, qtyNeeded) {
  const candidates = inventory
    .filter((i) => i.drugName === drugName && i.stock > 0)
    .sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));

  const allocated = [];
  let remaining = qtyNeeded;

  for (const item of candidates) {
    if (remaining <= 0) break;
    const take = Math.min(item.stock, remaining);
    if (take <= 0) continue;
    item.stock -= take;
    allocated.push({
      batch: item.batch,
      qty: take,
      expiryDate: item.expiryDate,
      unitPrice: item.unitPrice,
      coldChain: !!item.coldChain,
      manufacturer: item.manufacturer,
      category: item.category,
    });
    remaining -= take;
  }

  return {
    allocated,
    totalAllocated: qtyNeeded - remaining,
    shortfall: Math.max(0, remaining),
    fulfilled: remaining <= 0,
  };
}

module.exports = { allocateFEFO };
