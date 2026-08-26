const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "drug-scm-demo-secret-change-in-production";

function verifyToken(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "No authentication token provided." });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; // { id, email, name, role }
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired session token." });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access denied. This route requires role(s): ${roles.join(", ")}.`,
      });
    }
    next();
  };
}

module.exports = { verifyToken, requireRole, JWT_SECRET };
