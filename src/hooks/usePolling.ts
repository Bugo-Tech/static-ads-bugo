"use client";

import { useEffect, useRef, useCallback } from "react";

interface UsePollingOptions {
  interval?: number;
  enabled?: boolean;
}

export function usePolling(
  callback: () => Promise<void>,
  options: UsePollingOptions = {}
) {
  const { interval = 5000, enabled = true } = options;
  const savedCallback = useRef(callback);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  // Skip ticks while a previous tick is still running (slow networks would
  // otherwise stack overlapping requests) and while the tab is hidden.
  const tick = useCallback(async () => {
    if (inFlightRef.current) return;
    if (typeof document !== "undefined" && document.hidden) return;
    inFlightRef.current = true;
    try {
      await savedCallback.current();
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  const start = useCallback(() => {
    if (intervalRef.current) return;
    intervalRef.current = setInterval(tick, interval);
  }, [interval, tick]);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (enabled) {
      start();
    } else {
      stop();
    }
    return stop;
  }, [enabled, start, stop]);

  // Catch up immediately when the tab becomes visible again.
  useEffect(() => {
    if (!enabled) return;
    const onVisible = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [enabled, tick]);

  return { start, stop };
}
