import { useCallback, useEffect, useRef, useState } from "react";
import { subscribeLiveSync } from "./liveSync";

/**
 * Fetches data and keeps it fresh two ways:
 *  1. Instantly, whenever the server pushes a change via SSE (see liveSync.js)
 *  2. As a fallback, on a slow interval in case the SSE connection drops
 * Together this is what makes an action in one portal (e.g. Vendor approves
 * a request) show up in another portal (e.g. Distributor's queue) within
 * about a second, not "whenever the next poll happens to fire."
 */
export function usePoll(fetcher, { intervalMs = 15000, deps = [] } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const timerRef = useRef(null);
  const mountedRef = useRef(true);

  const run = useCallback(async (silent) => {
    if (!silent) setLoading(true);
    try {
      const result = await fetcher();
      if (mountedRef.current) {
        setData(result);
        setError("");
      }
    } catch (err) {
      if (mountedRef.current) setError(err.message);
    } finally {
      if (mountedRef.current && !silent) setLoading(false);
    }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    mountedRef.current = true;
    run(false);

    // safety-net polling (slower now that SSE carries the real-time load)
    timerRef.current = setInterval(() => run(true), intervalMs);

    // instant refresh the moment the server says something changed
    const unsubscribe = subscribeLiveSync(() => run(true));

    return () => {
      mountedRef.current = false;
      clearInterval(timerRef.current);
      unsubscribe();
    };
  }, [run, intervalMs]);

  const refresh = useCallback(() => run(true), [run]);

  return { data, error, loading, refresh, setData };
}
