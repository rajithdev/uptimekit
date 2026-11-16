"use client";
import { cn } from "@/lib/utils";

/**
 * A row of mutually exclusive filter buttons (e.g. 24h / 7d / 30d). Unlike tabs, it controls a
 * filter rather than switching panels, so it uses aria-pressed buttons inside a labelled group.
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: readonly { value: T; label: string }[];
  label: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn("inline-flex h-9 w-fit items-center rounded-lg bg-muted p-[3px] text-muted-foreground", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex h-[calc(100%-1px)] items-center justify-center rounded-md border border-transparent px-2.5 py-1 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none dark:text-muted-foreground dark:hover:text-foreground",
              active && "bg-background text-foreground shadow-sm dark:border-input dark:bg-input/30 dark:text-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
