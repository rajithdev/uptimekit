"use client";
import { useEffect, useState } from "react";

/** Current time that re-renders on an interval (keeps "x minutes ago" and ongoing durations live). */
export function useNow(intervalMs = 15_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
