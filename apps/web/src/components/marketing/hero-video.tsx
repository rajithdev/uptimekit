"use client";
import { useEffect, useRef, type ReactNode } from "react";

const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** An edge of a tracked rectangle, as a fraction of the frame: value at t = 0 and change per second. */
type Edge = readonly [at0: number, perSecond: number];

/** A rectangle that moves linearly through the clip (for example a phone screen during a push-in). */
export interface TrackedRect {
  x0: Edge;
  y0: Edge;
  x1: Edge;
  y1: Edge;
  /** Width in CSS px at which the overlay is laid out before being scaled onto the rectangle. */
  designWidth: number;
}

/**
 * Scroll-scrubbed background video for the pinned hero on large screens.
 *
 * - The video only loads at the `lg` breakpoint (phones keep the code-built hero).
 * - Its time follows the scroll progress of the enclosing `.sx-hero` scene: 0 → first frame,
 *   1 → last frame. The file is encoded with a short keyframe interval so seeking stays smooth.
 * - With reduced motion it shows the last frame, matching the hero's finished state.
 * - The box always covers its parent at 16:9, so `children` positioned in % of the box stay
 *   locked to the same spot in the picture at any viewport size.
 * - With `track`, it also writes the rectangle's position at the current time onto the box
 *   (--sx0, --sy0, --sx1, --sy1 as fractions; --ss, the scale from `designWidth`; --ih, the
 *   unscaled height in px) so an overlay can sit exactly on it.
 */
export function HeroVideo({ src, poster, track, children }: { src: string; poster: string; track?: TrackedRect; children?: ReactNode }) {
  const ref = useRef<HTMLVideoElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const video = ref.current;
    const box = boxRef.current;
    const scene = video?.closest<HTMLElement>(".sx-hero");
    if (!video || !box || !scene || !window.matchMedia("(min-width: 64rem)").matches) return;

    const place = (t: number) => {
      if (!track) return;
      const at = (e: Edge) => e[0] + e[1] * t;
      const [x0, y0, x1, y1] = [at(track.x0), at(track.y0), at(track.x1), at(track.y1)];
      const scale = (box.clientWidth * (x1 - x0)) / track.designWidth;
      box.style.setProperty("--sx0", x0.toFixed(5));
      box.style.setProperty("--sy0", y0.toFixed(5));
      box.style.setProperty("--sx1", x1.toFixed(5));
      box.style.setProperty("--sy1", y1.toFixed(5));
      box.style.setProperty("--ss", scale.toFixed(5));
      box.style.setProperty("--ih", `${((box.clientHeight * (y1 - y0)) / scale).toFixed(2)}px`);
    };

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    const seek = () => {
      frame = 0;
      if (!video.duration) return;
      const r = scene.getBoundingClientRect();
      const p = reduce ? 1 : clamp(-r.top / Math.max(1, r.height - window.innerHeight));
      // Stay a hair before the end: seeking exactly to `duration` can show a blank frame.
      const t = Math.min(p * video.duration, video.duration - 0.05);
      if (Math.abs(video.currentTime - t) > 0.01) video.currentTime = t;
    };
    // Move the overlay when the new frame is actually on screen, not when the seek is requested,
    // so it never runs ahead of the picture during fast scrolling.
    const onSeeked = () => place(video.currentTime);
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(seek);
    };

    video.src = src;
    place(0);
    video.addEventListener("loadedmetadata", seek);
    video.addEventListener("seeked", onSeeked);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      video.removeEventListener("loadedmetadata", seek);
      video.removeEventListener("seeked", onSeeked);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [src, track]);

  return (
    <div ref={boxRef} className="absolute top-1/2 left-1/2 aspect-video w-[max(100%,calc((100dvh-4rem)*16/9))] -translate-x-1/2 -translate-y-1/2">
      <video ref={ref} poster={poster} muted playsInline preload="auto" aria-hidden className="absolute inset-0 h-full w-full object-cover" />
      {children}
    </div>
  );
}
