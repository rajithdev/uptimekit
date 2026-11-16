import { cn } from "@/lib/utils";
import type { NotificationDto } from "@/lib/api/types";

const STYLES: Record<NotificationDto["status"], string> = {
  SENT: "bg-success/10 text-success ring-success/25",
  PENDING: "bg-info/10 text-info ring-info/25",
  FAILED: "bg-destructive/10 text-destructive ring-destructive/30",
  SKIPPED: "bg-muted/60 text-muted-foreground ring-border",
};

export function NotificationStatusBadge({ status }: { status: NotificationDto["status"] }) {
  return <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", STYLES[status])}>{status.charAt(0) + status.slice(1).toLowerCase()}</span>;
}
