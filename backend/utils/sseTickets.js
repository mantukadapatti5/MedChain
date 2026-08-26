const crypto = require("crypto");

/**
 * EventSource (the browser API behind Server-Sent Events) cannot send a
 * custom Authorization header — the only way to identify the connection is
 * via the URL. Putting the person's actual login token there is a real
 * problem: it can end up in browser history, proxy logs, or server access
 * logs. Instead, the client first asks for a one-time "ticket" over a
 * normal authenticated request (Authorization header, like every other
 * route), then opens the SSE connection with that ticket instead. Tickets
 * expire in 15 seconds and are deleted the moment they're used, so even if
 * one leaked somewhere, it's already worthless.
 */
const tickets = new Map();
const TICKET_TTL_MS = 15000;

function issueTicket(user) {
  const ticket = crypto.randomBytes(24).toString("hex");
  tickets.set(ticket, { user, expiresAt: Date.now() + TICKET_TTL_MS });
  return ticket;
}

function consumeTicket(ticket) {
  const entry = tickets.get(ticket);
  if (!entry) return null;
  tickets.delete(ticket); // single-use, regardless of outcome
  if (Date.now() > entry.expiresAt) return null;
  return entry.user;
}

// periodic sweep so abandoned tickets don't accumulate forever
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of tickets) {
    if (now > entry.expiresAt) tickets.delete(key);
  }
}, 30000).unref();

module.exports = { issueTicket, consumeTicket };
