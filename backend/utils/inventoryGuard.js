/**
 * Only these fields may be changed after a batch is created. Everything
 * that identifies the batch — its batch number, manufacturer, drug name,
 * and the provenance checksum used to detect counterfeits — is
 * intentionally left out, so a stock-level edit can never double as a way
 * to quietly rewrite a batch's identity or fake its authenticity check.
 */
const EDITABLE_FIELDS = ["stock", "reorderPoint", "unitPrice", "expiryDate", "coldChain", "category"];

const NUMERIC_FIELDS = ["stock", "reorderPoint", "unitPrice"];

/**
 * Applies only the allowed fields from `body` onto `item`, validating that
 * any numeric field present is a finite, non-negative number. Returns an
 * error message string if the input is invalid, or null on success.
 */
function applySafeInventoryUpdate(item, body) {
  for (const field of NUMERIC_FIELDS) {
    if (body[field] !== undefined) {
      const num = Number(body[field]);
      if (!Number.isFinite(num) || num < 0) {
        return `${field} must be a valid number that is zero or greater.`;
      }
    }
  }

  EDITABLE_FIELDS.forEach((field) => {
    if (body[field] === undefined) return;
    item[field] = NUMERIC_FIELDS.includes(field) ? Number(body[field]) : body[field];
  });

  return null;
}

module.exports = { applySafeInventoryUpdate, EDITABLE_FIELDS };
