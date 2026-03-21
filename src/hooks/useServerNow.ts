// src/hooks/useServerNow.ts
// Ticking server-adjusted time hook.
//
// Re-evaluates getServerNow() on a configurable interval so time-derived
// UI (effectiveStatus, canLog, challenge bucketing) updates while the app
// stays open across challenge boundaries.

import { useState, useEffect } from "react";
import { getServerNow } from "@/lib/serverTime";

/**
 * Returns a Date that ticks forward at the given interval (default 30s).
 * Uses server-adjusted time via getServerNow().
 */
export function useServerNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => getServerNow());

  useEffect(() => {
    const id = setInterval(() => setNow(getServerNow()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
