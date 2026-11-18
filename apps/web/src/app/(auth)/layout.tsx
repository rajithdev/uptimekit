import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/app/logo";
import { UptimeBars } from "@/components/charts/uptime-bars";
import { buildDemoDataset } from "@/lib/demo/fixtures";
import { optionalUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const POINTS = [
  "Real HTTP(S) checks from a background worker",
  "Outages confirmed before anyone is alerted",
  "Down and recovery email, with a full delivery log",
];

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (await optionalUser()) redirect("/dashboard");
  const demo = buildDemoDataset();
  const sample = demo.monitors.find((m) => m.health === "down") ?? demo.monitors[0]!;
  const daily = demo.stats[sample.id]?.["30d"].daily ?? [];

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-col px-4 py-6 sm:px-8">
        <Link href="/" aria-label="UptimeKit home" className="self-start rounded-md">
          <Logo />
        </Link>
        <div className="flex flex-1 items-center justify-center py-12">
          <div className="w-full max-w-sm">{children}</div>
        </div>
        <p className="text-center text-xs text-muted-foreground lg:text-left">
          Just looking?{" "}
          <Link href="/demo" className="font-medium text-foreground underline-offset-4 hover:underline">
            Explore the live demo
          </Link>{" "}
          with sample data.
        </p>
      </div>

      <aside className="relative hidden overflow-hidden border-l bg-card lg:flex lg:flex-col lg:justify-center lg:px-14 xl:px-20">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(60% 50% at 70% 20%, color-mix(in oklab, var(--signal) 8%, transparent), transparent 70%)" }}
        />
        <div className="relative max-w-md">
          <p className="font-mono text-xs tracking-[0.14em] text-signal uppercase">UptimeKit</p>
          <h2 className="mt-4 text-4xl leading-[1.08] font-semibold tracking-[-0.03em] text-balance">Know the moment your site or API goes down.</h2>
          <ul className="mt-8 space-y-3 text-sm text-muted-foreground">
            {POINTS.map((p) => (
              <li key={p} className="flex items-center gap-3">
                <span className="size-1.5 shrink-0 rounded-full bg-signal" aria-hidden />
                {p}
              </li>
            ))}
          </ul>
          <div className="mt-10 rounded-xl border bg-background/60 p-4">
            <div className="mb-3 flex items-baseline justify-between text-xs">
              <span className="font-medium">{sample.name}</span>
              <span className="text-muted-foreground">sample data · last 30 days</span>
            </div>
            <UptimeBars days={daily} />
          </div>
        </div>
      </aside>
    </div>
  );
}
