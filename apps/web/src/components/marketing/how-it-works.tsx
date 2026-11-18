import { Check, Mail, X } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { UptimeBars, type DayUptime } from "@/components/charts/uptime-bars";
import { cn } from "@/lib/utils";
import { ScrollScene } from "./scroll-scene";

/** Inline style carrying CSS custom properties (React's CSSProperties type has no `--*` keys). */
const vars = (v: Record<string, string | number>) => v as CSSProperties;

export interface RecordSample {
  name: string;
  days: DayUptime[];
  uptime: string;
  p50: string;
  p95: string;
}

export function SectionIntro({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <ScrollScene className="max-w-2xl">
      <p className="sx-fade font-mono text-xs tracking-[0.14em] text-signal uppercase" style={vars({ "--k": 4 })}>
        {eyebrow}
      </p>
      <h2 className="sx-fade mt-4 text-3xl font-semibold tracking-[-0.03em] text-balance sm:text-[2.6rem] sm:leading-[1.08]" style={vars({ "--at": 0.08, "--k": 4 })}>
        {title}
      </h2>
      <p className="sx-fade mt-4 text-lg leading-relaxed text-pretty text-muted-foreground" style={vars({ "--at": 0.16, "--k": 4 })}>
        {body}
      </p>
    </ScrollScene>
  );
}

const STEPS = [
  { title: "Check", body: "GET or HEAD requests from a background worker, with timeouts, expected status ranges and keyword matching." },
  { title: "Confirm", body: "A failed check is retried quickly. Only consecutive failures open an incident, and recovery needs consecutive successes too." },
  { title: "Alert", body: "One incident per outage, with a down email and a recovery email. Deliveries are retried and every attempt is logged." },
  { title: "Record", body: "24h, 7d and 30d uptime, p50/p95 latency and daily history, computed only from recorded checks. Days without checks stay grey." },
];

const num = (i: number) => String(i + 1).padStart(2, "0");

/**
 * "How it works": on large screens a pinned, scroll-driven story where one signal runs through
 * the four steps; on small screens (and with reduced motion) a card grid whose examples play as
 * each card scrolls into view.
 */
export function HowItWorks({ record }: { record: RecordSample }) {
  const snippets = [<CheckLog key="check" />, <ConfirmRows key="confirm" />, <EmailRows key="alert" />, <RecordSnippet key="record" record={record} />];

  return (
    <>
      {/* Small screens and reduced motion */}
      <ol className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-2 lg:hidden motion-reduce:lg:grid">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex min-w-0 flex-col rounded-2xl border bg-card p-5 sm:p-6">
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-xs text-signal">{num(i)}</span>
              <h3 className="text-lg font-semibold tracking-tight">{s.title}</h3>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
            <ScrollScene className="mt-6 flex-1 rounded-xl border bg-background/60 p-4">{snippets[i]}</ScrollScene>
          </li>
        ))}
      </ol>

      {/* Large screens: pinned story */}
      <ScrollScene
        mode="pin"
        steps={STEPS.length}
        className="relative mt-4 hidden lg:block motion-reduce:lg:hidden"
        style={vars({ height: "360vh", "--p": 0, "--p0": 0, "--p1": 0, "--p2": 0, "--p3": 0, "--a0": 1, "--a1": 0, "--a2": 0, "--a3": 0 })}
      >
        <div className="sticky top-16 flex h-[calc(100dvh-4rem)] items-center">
          <div className="grid w-full grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] items-center gap-16">
            <ol className="relative space-y-8 pl-12" aria-label="Steps">
              <span aria-hidden className="absolute top-3 bottom-3 left-[0.6875rem] w-px bg-border">
                <span className="absolute inset-0 origin-top bg-signal" style={{ transform: "scaleY(var(--p))" }} />
              </span>
              <span
                aria-hidden
                className="absolute left-[0.6875rem] size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-signal"
                style={{ top: "calc(0.75rem + (100% - 1.5rem) * var(--p))", boxShadow: "0 0 0 5px color-mix(in oklab, var(--signal) 22%, transparent), 0 0 18px var(--signal)" }}
              />
              {STEPS.map((s, i) => (
                <li key={s.title} className="sx-step-label" style={vars({ "--a": `var(--a${i})` })}>
                  <div className="flex items-baseline gap-3">
                    <span className="font-mono text-xs text-signal">{num(i)}</span>
                    <h3 className="text-xl font-semibold tracking-tight">{s.title}</h3>
                  </div>
                  <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">{s.body}</p>
                </li>
              ))}
            </ol>

            <div className="relative h-[25rem] overflow-hidden rounded-2xl border bg-card shadow-2xl shadow-black/10 dark:shadow-black/40">
              {STEPS.map((s, i) => (
                <div key={s.title} className="sx-step-panel absolute inset-0 flex flex-col p-8" style={vars({ "--a": `var(--a${i})`, "--p": `var(--p${i})` })}>
                  <div className="flex items-baseline justify-between">
                    <div className="flex items-baseline gap-3">
                      <span className="font-mono text-xs text-signal">{num(i)}</span>
                      <span className="text-lg font-semibold tracking-tight">{s.title}</span>
                    </div>
                    <span className="font-mono text-xs text-muted-foreground">
                      {num(i)} / {num(STEPS.length - 1)}
                    </span>
                  </div>
                  <div className="mt-6 flex flex-1 flex-col justify-center rounded-xl border bg-background/60 p-6">{snippets[i]}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </ScrollScene>
    </>
  );
}

function Seq({ at, k = 8, className, children }: { at: number; k?: number; className?: string; children: ReactNode }) {
  return (
    <div className={cn("sx-fade", className)} style={vars({ "--at": at, "--k": k })}>
      {children}
    </div>
  );
}

const LOG = [
  { code: 200, method: "GET", path: "api.example.com/health", ms: "182 ms" },
  { code: 200, method: "GET", path: "api.example.com/health", ms: "176 ms" },
  { code: 200, method: "HEAD", path: "shop.example.com/", ms: "94 ms" },
  { code: 503, method: "GET", path: "pay.example.com/v1/ping", ms: "expected 2xx" },
];

function CheckLog() {
  return (
    <ul className="space-y-2.5 font-mono text-xs" aria-label="Example check log">
      {LOG.map((l, i) => (
        <li key={i} className="sx-fade grid grid-cols-[2.25rem_2.5rem_minmax(0,1fr)_auto] items-center gap-2" style={vars({ "--at": 0.05 + i * 0.18, "--k": 8 })}>
          <span className={l.code < 400 ? "text-success" : "text-destructive"}>{l.code}</span>
          <span className="text-muted-foreground">{l.method}</span>
          <span className="truncate">{l.path}</span>
          <span className={cn("text-right", l.code < 400 ? "text-muted-foreground" : "text-destructive")}>{l.ms}</span>
        </li>
      ))}
    </ul>
  );
}

function Pill({ ok, at }: { ok: boolean; at: number }) {
  return (
    <span
      className={cn("sx-fade flex size-7 items-center justify-center rounded-md", ok ? "bg-success/12 text-success" : "bg-destructive/15 text-destructive")}
      style={vars({ "--at": at, "--k": 10 })}
      aria-label={ok ? "passed" : "failed"}
    >
      {ok ? <Check className="size-3.5" /> : <X className="size-3.5" />}
    </span>
  );
}

function ConfirmRows() {
  const rows = [
    { checks: [true, true, false, true, true], label: "One failure, then success", verdict: "No alert", cls: "text-muted-foreground" },
    { checks: [true, true, false, false], label: "Two failures in a row", verdict: "Incident opened", cls: "text-destructive" },
  ];
  return (
    <div className="space-y-4">
      {rows.map((r, ri) => (
        <div key={r.label} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <div className="flex gap-1.5">
            {r.checks.map((ok, i) => (
              <Pill key={i} ok={ok} at={ri * 0.45 + i * 0.07} />
            ))}
          </div>
          <Seq at={ri * 0.45 + 0.36} className="text-xs sm:text-right">
            <div className={cn("font-medium", r.cls)}>{r.verdict}</div>
            <div className="text-muted-foreground">{r.label}</div>
          </Seq>
        </div>
      ))}
      <Seq at={0.85}>
        <p className="border-t pt-3 text-xs text-muted-foreground">Default: 2 failures to go down, 2 successes to recover. Adjustable per monitor.</p>
      </Seq>
    </div>
  );
}

function EmailRows() {
  const rows = [
    { tag: "DOWN", cls: "bg-destructive/15 text-destructive", subject: "Payments API is not responding", meta: "HTTP 503 (expected 200-299)", at: 0.1 },
    { tag: "RECOVERED", cls: "bg-success/12 text-success", subject: "Payments API is back up", meta: "Down for 11m 20s", at: 0.5 },
  ];
  return (
    <ul className="divide-y" aria-label="Example alert emails">
      {rows.map((r) => (
        <li key={r.tag} className="sx-fade flex items-start gap-3 py-3 first:pt-0 last:pb-0" style={vars({ "--at": r.at, "--k": 5 })}>
          <Mail className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm">
              <span className={cn("shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold", r.cls)}>{r.tag}</span>
              <span className="truncate font-medium">{r.subject}</span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="truncate">{r.meta}</span>
              <span className="shrink-0">Delivered</span>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function RecordSnippet({ record }: { record: RecordSample }) {
  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between text-xs">
        <span className="font-medium">{record.name}</span>
        <span className="text-muted-foreground">sample data</span>
      </div>
      <div className="sx-wipe" style={vars({ "--at": 0.05, "--k": 1.6 })}>
        <UptimeBars days={record.days} />
      </div>
      <Seq at={0.72} className="mt-4 border-t pt-4">
        <dl className="grid grid-cols-3 gap-3">
          {[
            ["30d uptime", record.uptime],
            ["p50 · 24h", record.p50],
            ["p95 · 24h", record.p95],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-[11px] text-muted-foreground">{label}</dt>
              <dd className="tabular mt-0.5 font-mono text-sm font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </Seq>
    </div>
  );
}
