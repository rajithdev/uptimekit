import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  icon,
  valueClassName,
  loading,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  valueClassName?: string;
  loading?: boolean;
}) {
  return (
    <Card className="gap-0 p-4 shadow-none">
      <div className="flex items-center justify-between text-xs font-medium tracking-wide text-muted-foreground uppercase">
        <span>{label}</span>
        {icon && <span className="text-muted-foreground/70 [&_svg]:size-4">{icon}</span>}
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-7 w-20" />
      ) : (
        <div className={cn("tabular mt-2 text-2xl font-semibold tracking-tight", valueClassName)}>{value}</div>
      )}
      {hint && <div className="mt-1 truncate text-xs text-muted-foreground">{hint}</div>}
    </Card>
  );
}
