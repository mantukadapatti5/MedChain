const { getDB, nextId } = require("./store");

const VALID_TYPES = ["SHORTAGE", "ANOMALY", "RECALL", "COLD_CHAIN", "SHIPMENT", "EXPIRY", "SYSTEM"];
const VALID_SEVERITIES = ["info", "low", "medium", "high", "critical"];

function ensureStore(db) {
  if (!Array.isArray(db.notifications)) db.notifications = [];
  return db.notifications;
}

function createNotification({
  userId = null,
  role = null,
  type = "SYSTEM",
  severity = "info",
  title,
  message,
  relatedDrug = null,
  relatedBatch = null,
  relatedRequestId = null,
  actionPath = null,
  eventKey = null,
}) {
  const db = getDB();
  const notifications = ensureStore(db);
  if (!title || !message) throw new Error("Notification title and message are required.");

  if (eventKey) {
    const existing = notifications.find((n) => n.eventKey === eventKey && (userId == null || Number(n.userId) === Number(userId)) && (role == null || n.role === role));
    if (existing) return existing;
  }

  const normalizedType = VALID_TYPES.includes(type) ? type : "SYSTEM";
  const normalizedSeverity = VALID_SEVERITIES.includes(severity) ? severity : "info";
  const notification = {
    id: nextId("notifications"),
    userId,
    role,
    type: normalizedType,
    severity: normalizedSeverity,
    title,
    message,
    relatedDrug,
    relatedBatch,
    relatedRequestId,
    actionPath,
    eventKey,
    read: false,
    createdAt: new Date().toISOString(),
    readAt: null,
  };

  notifications.push(notification);
  return notification;
}

function listNotifications({ userId, role, type, unreadOnly = false, limit = 100 } = {}) {
  const db = getDB();
  const notifications = ensureStore(db);
  const max = Math.max(1, Math.min(Number(limit) || 100, 500));

  return notifications
    .filter((n) => {
      const recipientMatches = n.userId == null || Number(n.userId) === Number(userId) || (n.role && n.role === role);
      const typeMatches = !type || n.type === type;
      const unreadMatches = !unreadOnly || !n.read;
      return recipientMatches && typeMatches && unreadMatches;
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, max);
}

function markRead(id, { userId, role } = {}) {
  const db = getDB();
  const notifications = ensureStore(db);
  const notification = notifications.find((n) => Number(n.id) === Number(id));
  if (!notification) return null;

  const allowed = notification.userId == null || Number(notification.userId) === Number(userId) || (notification.role && notification.role === role);
  if (!allowed) return null;

  notification.read = true;
  notification.readAt = new Date().toISOString();
  return notification;
}

function markAllRead({ userId, role } = {}) {
  const db = getDB();
  const notifications = ensureStore(db);
  const now = new Date().toISOString();
  let count = 0;

  notifications.forEach((notification) => {
    const allowed = notification.userId == null || Number(notification.userId) === Number(userId) || (notification.role && notification.role === role);
    if (allowed && !notification.read) {
      notification.read = true;
      notification.readAt = now;
      count++;
    }
  });
  return count;
}

function unreadCount({ userId, role } = {}) {
  return listNotifications({ userId, role, unreadOnly: true, limit: 500 }).length;
}

module.exports = {
  VALID_TYPES,
  VALID_SEVERITIES,
  createNotification,
  listNotifications,
  markRead,
  markAllRead,
  unreadCount,
};
