"use client";
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

/**
 * How a scene maps its position in the viewport to progress `--p` (0..1):
 * - "view": 0 when its top is at 90% of the viewport height, 1 when its top reaches 30%.
 * - "exit": 0 while its top is at the top of the viewport, 1 once it has scrolled fully out.
 * - "pin":  0 when its top reaches the top of the viewport, 1 when its bottom reaches the bottom
 *           (use with a tall wrapper around a `sticky` child).
 * - "through": 0 when its top enters at the bottom of the viewport, 1 when its bottom reaches the
 *           middle (for tall elements that should play while they scroll past).
 */
type Mode = "view" | "exit" | "pin" | "through";

const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Writes scroll progress into CSS custom properties on its own element, so descendants animate in
 * CSS (see the `.sx-*` classes in globals.css) without React re-rendering on scroll.
 *
 * With `steps`, it also writes per-step `--p0..--pN` (local progress) and `--a0..--aN` (how
 * visible each step is).
 *
 * With `media`, the scene only writes while that media query matches, and otherwise clears its
 * properties so descendants inherit an outer scene's progress instead.
 *
 * Without JavaScript, or with reduced motion, nothing is written and every `.sx-*` element shows
 * its finished state.
 */
export function ScrollScene({
  as: Tag = "div",
  mode = "view",
  steps = 0,
  media,
  className,
  style,
  children,
  "aria-label": ariaLabel,
}: {
  as?: "div" | "section" | "ol" | "li";
  mode?: Mode;
  steps?: number;
  media?: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  "aria-label"?: string;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const active = media ? window.matchMedia(media) : null;
    let frame = 0;
    let cleared = false;
    const update = () => {
      frame = 0;
      if (active && !active.matches) {
        if (!cleared) {
          for (const name of [...el.style]) if (name.startsWith("--")) el.style.removeProperty(name);
          cleared = true;
        }
        return;
      }
      cleared = false;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const raw =
        mode === "pin"
          ? -r.top / Math.max(1, r.height - vh)
          : mode === "exit"
            ? -r.top / Math.max(1, r.height)
            : mode === "through"
              ? (vh - r.top) / Math.max(1, r.height + vh * 0.5)
              : (vh * 0.9 - r.top) / (vh * 0.6);
      const p = clamp(raw);
      el.style.setProperty("--p", p.toFixed(4));
      if (steps > 0) {
        const x = p * steps;
        // Each step fades out just before its boundary and the next fades in just after it,
        // so two steps never overlap.
        const fade = 0.1;
        for (let i = 0; i < steps; i++) {
          el.style.setProperty(`--p${i}`, clamp((x - i) / 0.8).toFixed(4));
          const into = i === 0 ? Infinity : x - i;
          const out = i === steps - 1 ? Infinity : i + 1 - x;
          el.style.setProperty(`--a${i}`, clamp(Math.min(into, out) / fade).toFixed(4));
        }
        el.dataset.step = String(Math.min(steps - 1, Math.floor(x)));
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [mode, steps, media]);

  return (
    <Tag ref={ref as never} className={className} style={style} aria-label={ariaLabel}>
      {children}
    </Tag>
  );
}
