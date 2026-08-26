const crypto = require("crypto");

const SALT = "drug-scm-static-salt-v1"; // demo project; use per-user salts + bcrypt in production

function hashPassword(plain) {
  return crypto.createHash("sha256").update(SALT + plain).digest("hex");
}

function verifyPassword(plain, hash) {
  return hashPassword(plain) === hash;
}

module.exports = { hashPassword, verifyPassword };
