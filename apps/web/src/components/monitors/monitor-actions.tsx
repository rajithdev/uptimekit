"use client";
import { MoreHorizontal, Pause, Pencil, Play, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { MonitorDto } from "@/lib/api/types";
import { useDeleteMonitor, usePauseResume } from "@/lib/client/queries";

export function MonitorActionsMenu({ monitor, onDeleted }: { monitor: MonitorDto; onDeleted?: () => void }) {
  const pauseResume = usePauseResume();
  const del = useDeleteMonitor();
  const [confirm, setConfirm] = useState(false);
  const paused = monitor.status === "PAUSED";
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${monitor.name}`}>
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => pauseResume.mutate({ id: monitor.id, action: paused ? "resume" : "pause" })}>
            {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
            {paused ? "Resume" : "Pause"}
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/monitors/${monitor.id}/edit`}>
              <Pencil className="size-4" /> Edit
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirm(true)}>
            <Trash2 className="size-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Delete ${monitor.name}?`}
        description="This permanently deletes the monitor with its check history, incidents and alert log. This cannot be undone."
        confirmLabel="Delete monitor"
        destructive
        onConfirm={() => del.mutate(monitor.id, { onSuccess: onDeleted })}
      />
    </>
  );
}
