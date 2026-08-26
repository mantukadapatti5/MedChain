import { api, getToken } from "../api/api";

let source = null;
let connecting = false;
const listeners = new Set();

/**
 * Opens (once) a Server-Sent Events connection to the backend and fans out
 * every "something changed" ping to all subscribers. This is what lets, say,
 * a Distributor's screen update within about a second of a Vendor approving
 * a request, instead of waiting for the next poll interval.
 *
 * The real login token never appears in the connection URL — EventSource
 * can't send an Authorization header, so a normal authenticated request
 * first exchanges the real token for a short-lived, single-use ticket, and
 * only that ticket travels in the URL. See backend/utils/sseTickets.js.
 */
async function ensureConnection() {
  if (source || connecting) return;
  if (!getToken()) return;

  connecting = true;
  try {
    const { ticket } = await api.post("/events/ticket");
    source = new EventSource(`/api/events?ticket=${encodeURIComponent(ticket)}`);
    source.onmessage = () => {
      listeners.forEach((fn) => fn());
    };
    source.onerror = () => {
      // browser auto-reconnects EventSource on its own; nothing to do here
    };
  } catch {
    // if the ticket request fails (e.g. briefly offline), usePoll's regular
    // interval still keeps data fresh as a fallback
  } finally {
    connecting = false;
  }
}

export function subscribeLiveSync(callback) {
  ensureConnection();
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
    if (listeners.size === 0 && source) {
      source.close();
      source = null;
    }
  };
}
