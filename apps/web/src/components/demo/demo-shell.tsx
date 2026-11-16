"use client";
import { FlaskConical } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/app/logo";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/demo", label: "Dashboard", match: (p: string) => p === "/demo" || p.startsWith("/demo/monitors") },
  { href: "/demo/incidents", label: "Incidents", match: (p: string) => p.startsWith("/demo/incidents") },
];

/** Chrome for the public, read-only demo. Always shows that the data is sample data. */
export function DemoShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-dvh">
      <div role="note" aria-label="Sample data notice" className="border-b border-warning/30 bg-warning/10">
        <div className="mx-auto flex max-w-7xl items-start gap-2 px-4 py-2 text-xs sm:items-center sm:text-sm md:px-8">
          <FlaskConical className="mt-0.5 size-4 shrink-0 text-warning sm:mt-0" aria-hidden />
          <p>
            <span className="font-semibold">Sample data.</span>{" "}
            <span className="text-muted-foreground">
              This is a read-only demo filled with generated example data — not live monitoring of real services.
            </span>
          </p>
        </div>
      </div>
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4 sm:gap-3 md:px-8">
          <Link href="/" aria-label="UptimeKit home">
            <Logo className="hidden sm:inline-flex" />
            <Logo withText={false} className="sm:hidden" />
          </Link>
          <span className="hidden rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning sm:inline">Demo</span>
          <nav className="flex min-w-0 items-center gap-0.5 sm:ml-2 sm:gap-1" aria-label="Demo">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={n.match(pathname) ? "page" : undefined}
                className={cn(
                  "rounded-md px-2 py-1.5 text-sm sm:px-2.5 text-muted-foreground transition-colors hover:text-foreground",
                  n.match(pathname) && "bg-accent font-medium text-foreground",
                )}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <div className="hidden sm:block">
              <ThemeToggle />
            </div>
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/register">
                <span className="sm:hidden">Sign up</span>
                <span className="hidden sm:inline">Monitor your own sites</span>
              </Link>
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
