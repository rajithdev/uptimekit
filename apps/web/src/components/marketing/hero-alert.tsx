import { BatteryFull, Check, Mail, Signal, Wifi, X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ScrollScene } from "./scroll-scene";

/*
 * Hero illustration: "the moment it goes down". One monitor's checks run, two fail in a row, the
 * DOWN email lands on a phone; two passing checks later the RECOVERED email follows.
 *
 * Everything is driven by the scroll progress --p of the enclosing hero scene (pinned on large
 * screens) or of the stage itself (on small screens). With reduced motion or no JavaScript the
 * hero shows its final state, which tells the whole story at once.
 *
 * UptimeKit alerts by email, so the phone shows Mail notifications with the real subject lines
 * from the worker's templates, not a push notification from an app that does not exist.
 */

// Story beats, as fractions of the hero's scroll.
const T = {
  fail1: 0.2,
  fail2: 0.28, // second consecutive failure: incident opens
  down: 0.32, // DOWN email arrives
  clock: 0.5, // eleven minutes pass
  ok1: 0.56,
  ok2: 0.62, // second consecutive success: recovered
  recovered: 0.66, // RECOVERED email arrives
};

/** 0 → 1 as --p passes `at`, over 1/k of the scroll. */
const ramp = (at: number, k = 12) => `clamp(0, calc((var(--p, 1) - ${at}) * ${k}), 1)`;
/** 1 while --p is between `from` and `to`, 0 outside, with short fades. */
const between = (from: number, to: number, k = 25) => `clamp(0, min(calc((var(--p, 1) - ${from}) * ${k}), calc((${to} - var(--p, 1)) * ${k})), 1)`;

const CHECKS: { ok: boolean; at: number }[] = [
  { ok: true, at: -1 },
  { ok: true, at: -1 },
  { ok: true, at: 0.06 },
  { ok: true, at: 0.12 },
  { ok: false, at: T.fail1 },
  { ok: false, at: T.fail2 },
  { ok: true, at: T.ok1 },
  { ok: true, at: T.ok2 },
  { ok: true, at: 0.76 },
  { ok: true, at: 0.86 },
];

/** Layers stacked in one grid cell, so cross-fading text never shifts the layout. */
function Stack({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("grid [&>*]:col-start-1 [&>*]:row-start-1", className)}>{children}</div>;
}

export function MonitorCard() {
  const downWin = between(T.fail2, T.ok2);
  const retryWin = between(T.fail1, T.fail2);
  return (
    <div className="w-[17.5rem] rounded-2xl border bg-card/95 p-4 shadow-2xl shadow-black/15 backdrop-blur dark:shadow-black/50">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium">Payments API</div>
          <div className="truncate font-mono text-[11px] text-muted-foreground">pay.example.com/v1/ping</div>
        </div>
        <Stack className="shrink-0 justify-items-end text-xs font-medium">
          <span className="rounded-full bg-success/12 px-2 py-0.5 text-success" style={{ opacity: `calc(1 - ${downWin} - ${retryWin})` }}>
            Up
          </span>
          <span className="rounded-full bg-warning/15 px-2 py-0.5 text-warning" style={{ opacity: retryWin }}>
            Retrying
          </span>
          <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-destructive" style={{ opacity: downWin }}>
            Down
          </span>
        </Stack>
      </div>
      <div className="mt-4 flex gap-1" aria-label="Recent checks">
        {CHECKS.map((c, i) => (
          <span
            key={i}
            className={cn("flex size-[1.375rem] items-center justify-center rounded-[5px]", c.ok ? "bg-success/12 text-success" : "bg-destructive/15 text-destructive")}
            style={{ opacity: ramp(c.at, 14), transform: `scale(calc(0.6 + 0.4 * ${ramp(c.at, 14)}))` }}
            aria-label={c.ok ? "passed" : "failed"}
          >
            {c.ok ? <Check className="size-3" /> : <X className="size-3" />}
          </span>
        ))}
      </div>
      <Stack className="mt-3 text-xs">
        <span className="text-muted-foreground" style={{ opacity: between(-1, T.fail1) }}>
          Checking every 30 seconds
        </span>
        <span className="text-warning" style={{ opacity: retryWin }}>
          1 failure · retrying in 10s
        </span>
        <span className="text-destructive" style={{ opacity: downWin }}>
          2 failures in a row · incident opened
        </span>
        <span className="text-success" style={{ opacity: ramp(T.ok2, 25) }}>
          2 passing checks · recovered
        </span>
      </Stack>
    </div>
  );
}

function MailNotification({ subject, preview, time, className }: { subject: string; preview: string; time: ReactNode; className?: string }) {
  return (
    <div className={cn("h-[5.5rem] rounded-[1.25rem] bg-white/14 px-3.5 py-3 text-white shadow-lg shadow-black/20 backdrop-blur-xl", className)}>
      <div className="flex items-center gap-2 text-[11px] text-white/70">
        <span className="flex size-5 items-center justify-center rounded-[5px] bg-sky-500 text-white">
          <Mail className="size-3" />
        </span>
        <span className="font-medium tracking-wide uppercase">Mail</span>
        <span className="ml-auto">{time}</span>
      </div>
      <div className="mt-1.5 truncate text-[13px] font-semibold">UptimeKit</div>
      <div className="truncate text-[13px]">{subject}</div>
      <div className="truncate text-[12px] text-white/60">{preview}</div>
    </div>
  );
}

/** The DOWN email arrives, then the RECOVERED email lands on top and pushes it down. */
export function NotificationStack({ className, cardClassName }: { className?: string; cardClassName?: string }) {
  const down = ramp(T.down);
  const rec = ramp(T.recovered);
  return (
    <div className={cn("relative h-[11.75rem]", className)}>
      <div
        className="absolute inset-x-0 top-0"
        style={{
          opacity: down,
          transform: `translateY(calc((1 - ${down}) * -18px + ${rec} * 6rem)) scale(calc(0.96 + 0.04 * ${down}))`,
        }}
      >
        <MailNotification
          className={cardClassName}
          subject="[DOWN] Payments API is not responding"
          preview="Reason: Unexpected HTTP status 503 (expected 200-299)"
          time={
            <Stack className="justify-items-end">
              <span style={{ opacity: `calc(1 - ${rec})` }}>now</span>
              <span style={{ opacity: rec }}>11m ago</span>
            </Stack>
          }
        />
      </div>
      <div className="absolute inset-x-0 top-0" style={{ opacity: rec, transform: `translateY(calc((1 - ${rec}) * -18px)) scale(calc(0.96 + 0.04 * ${rec}))` }}>
        <MailNotification className={cardClassName} subject="[RECOVERED] Payments API is back up" preview="Downtime: 11m 20s" time="now" />
      </div>
    </div>
  );
}

/** Status bar, clock and notifications: the lock screen shared by the phone and the video hero. */
function LockScreenContent({ island = false }: { island?: boolean }) {
  return (
    <>
      <div className="relative flex items-center justify-between px-7 pt-3.5 text-[12px] font-semibold text-white">
        <Stack>
          <span style={{ opacity: `calc(1 - ${ramp(T.clock)})` }}>9:41</span>
          <span style={{ opacity: ramp(T.clock) }}>9:52</span>
        </Stack>
        {island && <span aria-hidden className="absolute top-2.5 left-1/2 h-[1.6rem] w-[5.5rem] -translate-x-1/2 rounded-full bg-black" />}
        <span className="flex items-center gap-1" aria-hidden>
          <Signal className="size-3.5" />
          <Wifi className="size-3.5" />
          <BatteryFull className="size-4" />
        </span>
      </div>
      <div className="relative mt-8 text-center text-white">
        <div className="text-[13px] font-medium text-white/75">Tuesday 18 November</div>
        <Stack className="justify-items-center">
          <span className="tabular text-[4.25rem] leading-none font-semibold tracking-tight" style={{ opacity: `calc(1 - ${ramp(T.clock)})` }}>
            9:41
          </span>
          <span className="tabular text-[4.25rem] leading-none font-semibold tracking-tight" style={{ opacity: ramp(T.clock) }}>
            9:52
          </span>
        </Stack>
      </div>
      <NotificationStack className="mx-3 mt-8" />
    </>
  );
}

/** Width, in CSS px, at which the video lock screen is laid out before being scaled onto the screen. */
export const VIDEO_SCREEN_DESIGN_WIDTH = 270;

/**
 * The lock screen drawn onto the phone screen in the hero video. HeroVideo tracks the screen and
 * writes its rectangle (--sx0/--sy0/--sx1/--sy1, fractions of the frame), the scale (--ss) and the
 * unscaled height (--ih). It appears when the screen wakes; while the screen glows red the video
 * shows through as the wallpaper, and as the video's screen turns white a dark wallpaper fades in
 * so the text stays readable.
 */
export function VideoLockScreen() {
  return (
    <div
      className="absolute overflow-hidden"
      style={{
        left: "calc(var(--sx0, 0) * 100%)",
        top: "calc(var(--sy0, 0) * 100%)",
        width: "calc((var(--sx1, 0) - var(--sx0, 0)) * 100%)",
        height: "calc((var(--sy1, 0) - var(--sy0, 0)) * 100%)",
        borderRadius: "calc(var(--ss, 1) * 24px)",
        opacity: ramp(T.down - 0.04, 10),
      }}
    >
      <div
        className="relative origin-top-left"
        style={{ width: VIDEO_SCREEN_DESIGN_WIDTH, height: "var(--ih, 500px)", transform: "scale(var(--ss, 1))" }}
      >
        <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-black/25 to-transparent" />
        <div aria-hidden className="absolute inset-0 bg-[#0e0f13]" style={{ opacity: `calc(${ramp(0.6, 7)} * 0.94)` }} />
        <LockScreenContent />
      </div>
    </div>
  );
}

function Phone() {
  return (
    <div className="relative w-[min(17rem,calc((100svh-9rem)*0.44))] sm:w-[min(18.5rem,calc((100svh-9rem)*0.44))]">
      {/* Side buttons */}
      <span aria-hidden className="absolute top-28 -left-[3px] h-12 w-[3px] rounded-l bg-neutral-700" />
      <span aria-hidden className="absolute top-44 -left-[3px] h-12 w-[3px] rounded-l bg-neutral-700" />
      <span aria-hidden className="absolute top-36 -right-[3px] h-16 w-[3px] rounded-r bg-neutral-700" />
      <div className="rounded-[3rem] bg-neutral-900 p-2.5 shadow-2xl ring-1 shadow-black/30 ring-white/10 dark:shadow-black/60">
        <div className="relative aspect-[9/19] overflow-hidden rounded-[2.4rem] bg-[#0b0c10]">
          {/* Wallpaper */}
          <div aria-hidden className="absolute inset-0" style={{ background: "radial-gradient(120% 70% at 50% 110%, color-mix(in oklab, var(--signal) 55%, transparent), transparent 60%), linear-gradient(#15161c, #0b0c10)" }} />
          {/* Red wash while the site is down */}
          <div aria-hidden className="absolute inset-0" style={{ opacity: `calc(${between(T.down, T.ok2)} * 0.55)`, background: "radial-gradient(90% 45% at 50% 0%, oklch(0.6 0.2 25 / 0.55), transparent 70%)" }} />

          <LockScreenContent island />

          {/* Lock-screen controls */}
          <div aria-hidden className="absolute inset-x-0 bottom-0 flex items-end justify-between px-8 pb-9">
            <span className="size-10 rounded-full bg-white/12 backdrop-blur" />
            <span className="size-10 rounded-full bg-white/12 backdrop-blur" />
          </div>
          <span aria-hidden className="absolute bottom-2 left-1/2 h-1 w-28 -translate-x-1/2 rounded-full bg-white/70" />
        </div>
      </div>
    </div>
  );
}

/**
 * The phone with the monitor card overlapping it. On small screens it pins itself briefly and
 * drives its own progress; on large screens the whole hero is pinned and drives it.
 */
export function HeroAlertStage() {
  return (
    <ScrollScene mode="pin" media="(max-width: 63.99rem)" className="h-[210vh] lg:h-auto motion-reduce:h-auto">
      <div className="sticky top-20 lg:static motion-reduce:static">
        <div className="relative mx-auto w-fit pb-16 lg:mr-0 lg:ml-auto lg:pb-0">
          <div role="img" aria-label="Illustration: a monitor fails two checks in a row and a DOWN alert email arrives on a phone; after two passing checks a RECOVERED email follows.">
            <Phone />
            <div className="absolute -bottom-2 -left-6 sm:-left-24 lg:top-[69%] lg:bottom-auto lg:-left-44">
              <MonitorCard />
            </div>
          </div>
        </div>
      </div>
    </ScrollScene>
  );
}
