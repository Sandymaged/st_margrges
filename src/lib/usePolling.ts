import { useEffect, useRef } from 'react';

/**
 * Runs `fetchFn` immediately and then every `intervalMs`, until unmounted or
 * `enabled` becomes false. Replaces Firestore's onSnapshot real-time
 * listeners with simple polling against Supabase (Postgres has no
 * client-side realtime subscription in this app's architecture).
 */
export function usePolling(fetchFn: () => void | Promise<void>, intervalMs: number, enabled = true) {
  const fetchRef = useRef(fetchFn);
  fetchRef.current = fetchFn;

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    const run = () => {
      if (!cancelled) void fetchRef.current();
    };

    run();
    const id = setInterval(run, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [intervalMs, enabled]);
}
