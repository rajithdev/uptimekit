import { cn } from "@/lib/utils";

export function Logo({ className, withText = true }: { className?: string; withText?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <svg viewBox="0 0 32 32" className="size-6" aria-hidden>
        <rect width="32" height="32" rx="8" className="fill-foreground" />
        <path d="M6 17h5l2.5-6 4 11 3-7H26" fill="none" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="stroke-background" />
      </svg>
      {withText && <span>UptimeKit</span>}
    </span>
  );
}
