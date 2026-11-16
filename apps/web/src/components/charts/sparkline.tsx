import { cn } from "@/lib/utils";

/** Tiny dependency-free latency sparkline. Gaps (null) break the line instead of faking data. */
export function Sparkline({ values, className, label }: { values: (number | null)[]; className?: string; label?: string }) {
  const w = 120;
  const h = 32;
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length < 2) {
    return (
      <div className={cn("flex h-8 items-center text-[11px] text-muted-foreground", className)} aria-label={label ? `${label}: not enough data` : undefined}>
        Not enough data
      </div>
    );
  }
  const max = Math.max(...nums);
  const min = Math.min(...nums);
  const span = Math.max(1, max - min);
  const step = w / Math.max(1, values.length - 1);
  const segments: string[] = [];
  let current = "";
  values.forEach((v, i) => {
    if (v === null) {
      if (current) segments.push(current);
      current = "";
      return;
    }
    const x = (i * step).toFixed(1);
    const y = (h - 3 - ((v - min) / span) * (h - 6)).toFixed(1);
    current += current ? ` L${x},${y}` : `M${x},${y}`;
  });
  if (current) segments.push(current);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={cn("h-8 w-full overflow-visible", className)} role="img" aria-label={label ?? "Response time trend"}>
      {segments.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="var(--chart-2)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
}
