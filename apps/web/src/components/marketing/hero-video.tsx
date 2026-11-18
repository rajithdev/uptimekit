"use client";
import { useEffect, useRef, type ReactNode } from "react";

const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Quadratic in clip time t (seconds): a·t² + b·t + c, giving a fraction of the frame. */
type Curve = readonly [a: number, b: number, c: number];
type Corner = readonly [x: Curve, y: Curve];

/**
 * A four-cornered shape that moves through the clip, such as a phone screen seen in slight
 * perspective during a push-in. Corners are top-left, top-right, bottom-right, bottom-left.
 */
export interface TrackedQuad {
  tl: Corner;
  tr: Corner;
  br: Corner;
  bl: Corner;
  /** Size in CSS px at which the overlay is laid out before being warped onto the shape. */
  designWidth: number;
  designHeight: number;
  /** Grow the shape by this many px on every side so no light seam of the picture shows. */
  bleed?: number;
}

const at = (c: Curve, t: number) => (c[0] * t + c[1]) * t + c[2];

/**
 * CSS matrix3d that maps the rectangle (0,0)–(w,h) onto the quad p0..p3 (TL, TR, BR, BL),
 * via the standard square-to-quad projective mapping.
 */
function quadMatrix(w: number, h: number, p: [[number, number], [number, number], [number, number], [number, number]]) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = p;
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = (dx3 * dy2 - dx2 * dy3) / den;
  const k = (dx1 * dy3 - dx3 * dy1) / den;
  const a = x1 - x0 + g * x1, b = x3 - x0 + k * x3;
  const d = y1 - y0 + g * y1, e = y3 - y0 + k * y3;
  const m = [a / w, d / w, 0, g / w, b / h, e / h, 0, k / h, 0, 0, 1, 0, x0, y0, 0, 1];
  return `matrix3d(${m.map((v) => +v.toFixed(8)).join(",")})`;
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
 * - With `track`, it writes `--quad` on the box: a matrix3d that warps an element laid out at
 *   designWidth × designHeight (origin top-left) onto the tracked shape in the frame on screen.
 */
export function HeroVideo({ src, poster, track, children }: { src: string; poster: string; track?: TrackedQuad; children?: ReactNode }) {
  const ref = useRef<HTMLVideoElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const video = ref.current;
    const box = boxRef.current;
    const scene = video?.closest<HTMLElement>(".sx-hero");
    if (!video || !box || !scene || !window.matchMedia("(min-width: 64rem)").matches) return;

    const place = (t: number) => {
      if (!track) return;
      const W = box.clientWidth, H = box.clientHeight;
      const corner = ([x, y]: Corner): [number, number] => [at(x, t) * W, at(y, t) * H];
      const pts: [[number, number], [number, number], [number, number], [number, number]] = [corner(track.tl), corner(track.tr), corner(track.br), corner(track.bl)];
      const bleed = track.bleed ?? 0;
      if (bleed) {
        const cx = pts.reduce((s, p) => s + p[0], 0) / 4, cy = pts.reduce((s, p) => s + p[1], 0) / 4;
        for (const p of pts) {
          const len = Math.hypot(p[0] - cx, p[1] - cy) || 1;
          p[0] += ((p[0] - cx) / len) * bleed * Math.SQRT2;
          p[1] += ((p[1] - cy) / len) * bleed * Math.SQRT2;
        }
      }
      box.style.setProperty("--quad", quadMatrix(track.designWidth, track.designHeight, pts));
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
    const onResize = () => {
      place(video.currentTime);
      schedule();
    };

    video.src = src;
    place(0);
    video.addEventListener("loadedmetadata", seek);
    video.addEventListener("seeked", onSeeked);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(frame);
      video.removeEventListener("loadedmetadata", seek);
      video.removeEventListener("seeked", onSeeked);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", onResize);
    };
  }, [src, track]);

  return (
    <div ref={boxRef} className="absolute top-1/2 left-1/2 aspect-video w-[max(100%,calc((100dvh-4rem)*16/9))] -translate-x-1/2 -translate-y-1/2">
      <video ref={ref} poster={poster} muted playsInline preload="auto" aria-hidden className="absolute inset-0 h-full w-full object-cover" />
      {children}
    </div>
  );
}
