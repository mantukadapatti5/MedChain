const express = require("express");
const { getDB, save } = require("../utils/store");
const { verifyToken } = require("../middleware/auth");
const {
  listNotifications,
  markRead,
  markAllRead,
  unreadCount,
} = require("../utils/notifications");

const router = express.Router();

router.use(verifyToken);

router.get("/", (req, res) => {
  const { type, unreadOnly, limit } = req.query;
  const userId = req.user?.id ?? req.user?.userId;
  const role = req.user?.role;
  res.json({
    notifications: listNotifications({
      userId,
      role,
      type: type || undefined,
      unreadOnly: unreadOnly === "true",
      limit: limit || 100,
    }),
    unreadCount: unreadCount({ userId, role }),
  });
});

router.patch("/:id/read", (req, res) => {
  const userId = req.user?.id ?? req.user?.userId;
  const role = req.user?.role;
  const notification = markRead(req.params.id, { userId, role });
  if (!notification) return res.status(404).json({ error: "Notification not found." });
  save();
  res.json(notification);
});

router.post("/read-all", (req, res) => {
  const userId = req.user?.id ?? req.user?.userId;
  const role = req.user?.role;
  const count = markAllRead({ userId, role });
  save();
  res.json({ updated: count });
});

// Admin-only helper for creating a system/demo alert. Normal domain events
// should call createNotification() directly from their service layer.
router.post("/system", (req, res) => {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "Admin role required." });
  const { createNotification } = require("../utils/notifications");
  const notification = createNotification({
    role: req.body.role || null,
    type: req.body.type || "SYSTEM",
    severity: req.body.severity || "info",
    title: req.body.title,
    message: req.body.message,
    relatedDrug: req.body.relatedDrug || null,
    relatedBatch: req.body.relatedBatch || null,
    relatedRequestId: req.body.relatedRequestId || null,
    actionPath: req.body.actionPath || null,
  });
  save();
  res.status(201).json(notification);
});

module.exports = router;
