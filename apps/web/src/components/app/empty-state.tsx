import { cn } from "@/lib/utils";

export function EmptyState({ icon, title, description, action, className }: { icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-14 text-center", className)}>
      {icon && <div className="mb-4 rounded-full border bg-muted/40 p-3 text-muted-foreground [&_svg]:size-5">{icon}</div>}
      <h3 className="text-sm font-medium">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
      <span className="font-medium text-destructive">Couldn&apos;t load data.</span>{" "}
      <span className="text-muted-foreground">{error.message}</span>
      {onRetry && (
        <button onClick={onRetry} className="ml-2 underline underline-offset-4 hover:text-foreground">
          Retry
        </button>
      )}
    </div>
  );
}
