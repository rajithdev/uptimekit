import { ArrowRight, ArrowUpRight, ChevronDown } from "lucide-react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { Logo } from "@/components/app/logo";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { HeroAlertStage, MonitorCard, VIDEO_SCREEN_DESIGN_WIDTH, VideoLockScreen } from "@/components/marketing/hero-alert";
import { HeroVideo, type TrackedRect } from "@/components/marketing/hero-video";
import { HeroPanel } from "@/components/marketing/hero-panel";
import { HowItWorks, SectionIntro } from "@/components/marketing/how-it-works";
import { ScrollScene } from "@/components/marketing/scroll-scene";
import { Button } from "@/components/ui/button";
import { buildDemoDataset } from "@/lib/demo/fixtures";
import { formatMs, formatPercent } from "@/lib/format";
import { optionalUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const GITHUB_URL = "https://github.com/rajithdev/uptimekit";

/**
 * The phone screen in /hero/night-desk.mp4 (Higgsfield Seedance 2.5, 10 s, 1920×1080), measured
 * from the clip's white-screen frames: each edge moves linearly during the push-in (fit error
 * under 0.3% of the frame). Values are fractions of the frame at t = 0 s and change per second.
 */
const PHONE_SCREEN: TrackedRect = {
  x0: [0.5564, 0.00154],
  y0: [0.2214, -0.00874],
  x1: [0.7133, 0.00644],
  y1: [0.7309, 0.00809],
  designWidth: VIDEO_SCREEN_DESIGN_WIDTH,
};

const PIPELINE = [
  { label: "Scheduler", detail: "Claims due monitors from Postgres with SKIP LOCKED, so you can run as many replicas as you need." },
  { label: "Queue", detail: "BullMQ on Redis hands each check to the next free worker." },
  { label: "Checker", detail: "Pinned, validated sockets. Private, loopback and metadata ranges are blocked at connect time, defeating DNS rebinding and redirect tricks." },
  { label: "State machine", detail: "Changes a monitor's status only after failures or recoveries are confirmed." },
  { label: "Alerts", detail: "An outbox sends down and recovery email with retries and logs every delivery." },
];

export default async function LandingPage() {
  const user = await optionalUser();
  const demo = buildDemoDataset();
  const steady = demo.monitors.find((m) => m.name === "Documentation") ?? demo.monitors[0]!;
  const steadyStats = demo.stats[steady.id]?.["30d"];
  // Percentiles come from raw checks, which only the 24h window keeps (as in the real API).
  const steadyLatency = demo.stats[steady.id]?.["24h"].latency;
  const primaryHref = user ? "/dashboard" : "/register";
  const primaryLabel = user ? "Open dashboard" : "Start monitoring";

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:px-6">
          <Link href="/" aria-label="UptimeKit home" className="rounded-md">
            <Logo />
          </Link>
          <nav className="ml-8 hidden items-center gap-6 text-sm text-muted-foreground md:flex" aria-label="Main">
            <a href="#how-it-works" className="transition-colors hover:text-foreground">
              How it works
            </a>
            <a href="#under-the-hood" className="transition-colors hover:text-foreground">
              Under the hood
            </a>
            <Link href="/demo" className="transition-colors hover:text-foreground">
              Live demo
            </Link>
            <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="transition-colors hover:text-foreground">
              GitHub
            </a>
          </nav>
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <div className="hidden sm:block">
              <ThemeToggle />
            </div>
            {user ? (
              <Button asChild size="sm">
                <Link href="/dashboard">Open dashboard</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/login">Sign in</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href="/register">Get started</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        {/* Hero: pinned on large screens while the outage plays out on the phone */}
        <ScrollScene
          as="section"
          mode="pin"
          media="(min-width: 64rem)"
          className="sx-hero dark relative overflow-x-clip bg-background text-foreground lg:h-[260vh] motion-reduce:lg:h-auto"
          style={{ "--p": 0 } as CSSProperties}
        >
          <div className="relative lg:sticky lg:top-16 lg:flex lg:h-[calc(100dvh-4rem)] lg:items-center lg:overflow-hidden motion-reduce:lg:static">
            {/* Large screens: scroll-scrubbed video (Higgsfield, Seedance 2.5) with the alert UI on top */}
            <div className="absolute inset-0 hidden overflow-hidden lg:block">
              <HeroVideo src="/hero/night-desk.mp4" poster="/hero/night-desk-poster.jpg" track={PHONE_SCREEN}>
                <div
                  role="img"
                  aria-label="A phone on a desk at night lights up red as a DOWN alert email arrives after two failed checks; after two passing checks a RECOVERED email follows."
                  className="absolute inset-0"
                >
                  <VideoLockScreen />
                  <div className="absolute top-[71%] left-[47%]">
                    <MonitorCard />
                  </div>
                </div>
              </HeroVideo>
              <div aria-hidden className="absolute inset-y-0 left-0 w-[62%] bg-gradient-to-r from-background via-background/70 to-transparent" />
            </div>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 -z-10 lg:hidden"
              style={{ background: "radial-gradient(50% 50% at 75% 50%, color-mix(in oklab, var(--signal) 9%, transparent), transparent 70%)" }}
            />
            <div className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-14 px-4 pt-12 pb-20 sm:px-6 sm:pt-16 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-10 lg:py-0">
              <div className="relative min-w-0 lg:max-w-[30rem]">
                <p className="inline-flex items-center gap-2.5 font-mono text-xs tracking-[0.14em] text-muted-foreground uppercase">
                  <span className="relative inline-flex size-2" aria-hidden>
                    <span className="absolute inline-flex size-full rounded-full bg-signal opacity-60 motion-safe:animate-ping [animation-duration:2.4s]" />
                    <span className="relative inline-flex size-2 rounded-full bg-signal" />
                  </span>
                  Open source · Self-hostable
                </p>
                <h1 className="mt-6 text-[2.75rem] leading-[1.02] font-semibold tracking-[-0.04em] text-balance sm:text-6xl lg:text-[3.6rem] xl:text-[4rem]">
                  Know the moment your site or API goes down.
                </h1>
                <p className="mt-6 max-w-xl text-lg leading-relaxed text-pretty text-muted-foreground">
                  UptimeKit checks your endpoints around the clock, confirms real outages before it alerts anyone, and turns every check into uptime and latency history you can trust.
                </p>
                <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                  <Button asChild size="lg" className="h-11 px-6 text-[15px]">
                    <Link href={primaryHref}>
                      {primaryLabel} <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                  <Button asChild size="lg" variant="outline" className="h-11 px-6 text-[15px]">
                    <Link href="/demo">View live demo</Link>
                  </Button>
                </div>
                <p className="mt-4 text-sm text-muted-foreground">The demo needs no sign-up and uses clearly labelled sample data.</p>
              </div>
              <div className="lg:hidden">
                <HeroAlertStage />
              </div>
            </div>
            <div
              aria-hidden
              className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 items-center gap-2 font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase lg:flex motion-reduce:lg:hidden"
              style={{ opacity: "clamp(0, calc(1 - var(--p, 1) * 12), 1)" }}
            >
              <ChevronDown className="size-3.5 motion-safe:animate-bounce" /> Scroll to see an outage
            </div>
          </div>
        </ScrollScene>

        {/* Dashboard */}
        <section className="border-t">
          <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16 lg:py-28">
            <div className="min-w-0">
              <SectionIntro
                eyebrow="The dashboard"
                title="Every monitor, every check, one screen."
                body="Status, 24-hour uptime, response times and 30 days of daily history for every endpoint you watch."
              />
              <Link href="/demo" className="mt-6 inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline">
                Explore the live demo <ArrowRight className="size-4" />
              </Link>
            </div>
            <ScrollScene className="min-w-0 lg:pb-10">
              <HeroPanel data={demo} />
            </ScrollScene>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="scroll-mt-16 border-t">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
            <SectionIntro
              eyebrow="How it works"
              title="From one request to a record you can trust."
              body="Every monitor runs the same loop. Each step is built to avoid the two failures that matter: missing a real outage, and paging you for a fake one."
            />
            <HowItWorks
              record={{
                name: steady.name,
                days: steadyStats?.daily ?? [],
                uptime: formatPercent(steadyStats?.uptime, 2),
                p50: formatMs(steadyLatency?.p50),
                p95: formatMs(steadyLatency?.p95),
              }}
            />
          </div>
        </section>

        {/* Under the hood */}
        <section id="under-the-hood" className="scroll-mt-16 border-t bg-muted/25 dark:bg-black/20">
          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-14 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:gap-20 lg:py-28">
            <div className="min-w-0">
              <SectionIntro
                eyebrow="Under the hood"
                title="Built like infrastructure, not a cron job."
                body="A Postgres-driven scheduler, a Redis queue and workers you can scale out. MIT licensed, so you can read every line and run it on your own servers."
              />
              <div className="mt-8 overflow-hidden rounded-xl border bg-card">
                <div className="flex items-center justify-between border-b px-4 py-2 text-xs text-muted-foreground">
                  <span>Self-host with Docker</span>
                  <span className="font-mono">bash</span>
                </div>
                <pre className="overflow-x-auto px-4 py-4 font-mono text-[13px] leading-6">
                  <code>
                    <span className="text-muted-foreground">$ </span>git clone {GITHUB_URL}.git{"\n"}
                    <span className="text-muted-foreground">$ </span>cd uptimekit && cp .env.example .env{"\n"}
                    <span className="text-muted-foreground">$ </span>docker compose --profile app up -d --build --wait
                  </code>
                </pre>
              </div>
              <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline">
                Read the source on GitHub <ArrowUpRight className="size-4" />
              </a>
            </div>
            <ol className="relative self-center" aria-label="How a check flows">
              {PIPELINE.map((p, i) => (
                <ScrollScene as="li" key={p.label} className="relative grid grid-cols-[2.25rem_minmax(0,1fr)] gap-4 pb-8 last:pb-0">
                  {i < PIPELINE.length - 1 && (
                    <span aria-hidden className="absolute top-9 bottom-1 left-[1.075rem] w-px bg-border">
                      <span className="sx-grow-y absolute inset-0 bg-signal" style={{ "--at": 0.3, "--k": 2 } as CSSProperties} />
                    </span>
                  )}
                  <span className="relative flex size-9 items-center justify-center rounded-full border bg-card font-mono text-xs text-muted-foreground">
                    <span aria-hidden className="sx-show absolute -inset-px rounded-full border border-signal bg-signal/10" style={{ "--at": 0.1, "--k": 5 } as CSSProperties} />
                    <span className="relative">{String(i + 1).padStart(2, "0")}</span>
                  </span>
                  <div className="sx-fade pt-1.5" style={{ "--at": 0.05, "--k": 4 } as CSSProperties}>
                    <h3 className="font-medium">{p.label}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{p.detail}</p>
                  </div>
                </ScrollScene>
              ))}
            </ol>
          </div>
        </section>

        {/* Closing call to action */}
        <section className="border-t">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
            <div className="flex flex-col items-start justify-between gap-8 rounded-3xl border bg-card px-6 py-10 sm:px-10 sm:py-12 lg:flex-row lg:items-center">
              <div>
                <h2 className="text-3xl font-semibold tracking-[-0.03em] text-balance sm:text-4xl">Start with your most important endpoint.</h2>
                <p className="mt-3 text-muted-foreground">Create an account and add a monitor. The first check runs within seconds.</p>
              </div>
              <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                <Button asChild size="lg" className="h-11 px-6 text-[15px]">
                  <Link href={user ? "/monitors/new" : "/register"}>
                    Add a monitor <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="h-11 px-6 text-[15px]">
                  <Link href="/demo">View live demo</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <Logo />
            <p className="mt-2 text-sm text-muted-foreground">Open-source uptime monitoring · MIT licensed</p>
          </div>
          <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground" aria-label="Footer">
            <Link href="/demo" className="hover:text-foreground">
              Live demo
            </Link>
            <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="hover:text-foreground">
              GitHub
            </a>
            {user ? (
              <Link href="/dashboard" className="hover:text-foreground">
                Dashboard
              </Link>
            ) : (
              <Link href="/login" className="hover:text-foreground">
                Sign in
              </Link>
            )}
            <ThemeToggle />
          </nav>
        </div>
      </footer>
    </div>
  );
}
