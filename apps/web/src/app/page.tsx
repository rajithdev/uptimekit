import { ArrowRight, BellRing, Eye, Gauge, GitBranch, LineChart, Lock, Radar, ServerCog, ShieldCheck, Timer } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/app/logo";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { Button } from "@/components/ui/button";
import { optionalUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const FEATURES = [
  { icon: Radar, title: "Real HTTP(S) checks", body: "GET or HEAD requests from a background worker with timeouts, expected status ranges and keyword matching." },
  { icon: ShieldCheck, title: "No false alarms", body: "Consecutive-failure and recovery thresholds with fast confirmation retries before anyone gets paged." },
  { icon: BellRing, title: "Incidents & email alerts", body: "One incident per outage, downtime and recovery emails with retries, and a full delivery log." },
  { icon: LineChart, title: "Response analytics", body: "Latency trends, p50/p95, 24h/7d/30d uptime and daily history — computed only from recorded checks." },
  { icon: Lock, title: "SSRF-hardened", body: "Private, loopback and metadata ranges are blocked at connect time, defeating DNS rebinding and redirect tricks." },
  { icon: ServerCog, title: "Built to scale out", body: "Postgres-driven scheduling with SKIP LOCKED claims and BullMQ workers you can run as many replicas of as you need." },
];

const PIPELINE = [
  { icon: Timer, label: "Scheduler", detail: "claims due monitors" },
  { icon: GitBranch, label: "Queue", detail: "BullMQ on Redis" },
  { icon: Radar, label: "Checker", detail: "pinned, validated sockets" },
  { icon: Gauge, label: "State machine", detail: "confirm before alerting" },
  { icon: BellRing, label: "Alerts", detail: "outbox → email" },
];

export default async function LandingPage() {
  const user = await optionalUser();
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
          <Logo />
          <nav className="ml-auto flex items-center gap-1">
            <Link href="/demo" className="px-3 text-sm text-muted-foreground hover:text-foreground">
              Live demo
            </Link>
            <a href="https://github.com/rajithdev/uptimekit" className="hidden px-3 text-sm text-muted-foreground hover:text-foreground sm:inline" target="_blank" rel="noreferrer">
              GitHub
            </a>
            <ThemeToggle />
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
          </nav>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden border-b">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,var(--color-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-border)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_70%)] bg-[size:48px_48px]" />
          <div className="mx-auto max-w-6xl px-4 py-20 text-center sm:py-28">
            <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground">
              <span className="size-1.5 rounded-full bg-success" /> Open source · self-hostable
            </div>
            <h1 className="mx-auto max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl">Know the moment your site or API goes down.</h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-pretty text-muted-foreground">
              UptimeKit checks your endpoints around the clock, confirms real outages before alerting, and turns every check into uptime and latency history you can trust.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button asChild size="lg">
                <Link href="/demo">
                  <Eye className="size-4" /> View live demo
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href={user ? "/dashboard" : "/register"}>
                  {user ? "Open dashboard" : "Start monitoring"} <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="ghost">
                <a href="https://github.com/rajithdev/uptimekit" target="_blank" rel="noreferrer">
                  View source
                </a>
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">No sign-up needed — the demo uses clearly labelled sample data.</p>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-20">
          <h2 className="text-center text-sm font-medium tracking-wider text-muted-foreground uppercase">How a check flows</h2>
          <ol className="mt-8 grid gap-3 sm:grid-cols-5">
            {PIPELINE.map((p, i) => (
              <li key={p.label} className="relative rounded-xl border bg-card p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p.icon className="size-5 text-muted-foreground" />
                  <span className="font-mono text-xs text-muted-foreground">0{i + 1}</span>
                </div>
                <div className="font-medium">{p.label}</div>
                <div className="text-sm text-muted-foreground">{p.detail}</div>
              </li>
            ))}
          </ol>
        </section>

        <section className="border-t bg-muted/20">
          <div className="mx-auto grid max-w-6xl gap-px px-4 py-20 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="p-6">
                <f.icon className="mb-4 size-5" />
                <h3 className="font-medium">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-20 text-center">
          <h2 className="text-3xl font-semibold tracking-tight">Start with your most important endpoint.</h2>
          <p className="mt-3 text-muted-foreground">Create an account and add a monitor — the first check runs within seconds.</p>
          <Button asChild size="lg" className="mt-8">
            <Link href={user ? "/monitors/new" : "/register"}>
              Add a monitor <ArrowRight className="size-4" />
            </Link>
          </Button>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-6 text-sm text-muted-foreground sm:flex-row">
          <Logo className="text-foreground" />
          <span>MIT licensed · Built with Next.js, PostgreSQL, Redis & BullMQ</span>
        </div>
      </footer>
    </div>
  );
}
