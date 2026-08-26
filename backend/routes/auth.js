const express = require("express");
const jwt = require("jsonwebtoken");
const { getDB } = require("../utils/store");
const { verifyPassword } = require("../utils/security");
const { JWT_SECRET, verifyToken } = require("../middleware/auth");

const router = express.Router();

// POST /api/auth/login
router.post("/login", (req, res) => {
  const { email, password, role } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  const db = getDB();
  const user = db.users.find(
    (u) => u.email.toLowerCase() === String(email).toLowerCase()
  );

  if (!user) {
    return res.status(401).json({ error: "No account found for this email." });
  }

  if (role && user.role !== role) {
    return res.status(403).json({
      error: `This account is registered as "${user.role}", not "${role}". Please use the correct portal.`,
    });
  }

  if (!verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ error: "Incorrect password. Please try again." });
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    JWT_SECRET,
    { expiresIn: "12h" }
  );

  return res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
});

// GET /api/auth/me
router.get("/me", verifyToken, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
