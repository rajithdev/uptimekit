"use client";
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * Renders children only in the browser. The demo views format timestamps in the visitor's
 * timezone and relative to "now", which would differ from the server render.
 */
export function Hydrated({ children, fallback }: { children: React.ReactNode; fallback: React.ReactNode }) {
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return hydrated ? children : fallback;
}
