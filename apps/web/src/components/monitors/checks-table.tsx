"use client";
import { useState } from "react";
import { ErrorState } from "@/components/app/empty-state";
import { Pagination } from "@/components/app/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime, formatMs } from "@/lib/format";
import type { CheckDto } from "@/lib/api/types";
import { useChecks } from "@/lib/client/queries";
import { cn } from "@/lib/utils";

export function CheckRows({ checks }: { checks: CheckDto[] }) {
  return (
    <>
      {checks.map((c) => (
        <TableRow key={c.id}>
          <TableCell className="pl-4">
            <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", c.result === "UP" ? "text-success" : "text-destructive")}>
              <span className={cn("size-1.5 rounded-full", c.result === "UP" ? "bg-success" : "bg-destructive")} />
              {c.result === "UP" ? "Up" : "Down"}
            </span>
          </TableCell>
          <TableCell className="tabular text-muted-foreground">{formatDateTime(c.checkedAt)}</TableCell>
          <TableCell className="tabular">{c.statusCode ?? "—"}</TableCell>
          <TableCell className="tabular">{formatMs(c.responseTimeMs)}</TableCell>
          <TableCell className="max-w-[320px] truncate text-xs text-muted-foreground" title={c.errorMessage ?? undefined}>
            {c.errorType ? <span className="mr-1 font-mono text-[11px] text-foreground/80">{c.errorType}</span> : null}
            {c.errorMessage ?? ""}
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

export function ChecksTable({ monitorId }: { monitorId: string }) {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState("all");
  const q = useChecks(monitorId, { page, pageSize: 15, result: result === "all" ? undefined : result });
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium">Check history</h2>
        <Select
          value={result}
          onValueChange={(v) => {
            setResult(v);
            setPage(1);
          }}
        >
          <SelectTrigger size="sm" className="w-36" aria-label="Filter checks by result">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All checks</SelectItem>
            <SelectItem value="UP">Successful</SelectItem>
            <SelectItem value="DOWN">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {q.error ? (
        <ErrorState error={q.error} />
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">Result</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Response</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!q.data ? (
                <TableRow>
                  <TableCell colSpan={5}>
                    <Skeleton className="h-24 w-full" />
                  </TableCell>
                </TableRow>
              ) : q.data.data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                    No checks recorded yet. The worker runs the first check shortly after a monitor is created.
                  </TableCell>
                </TableRow>
              ) : (
                <CheckRows checks={q.data.data} />
              )}
            </TableBody>
          </Table>
        </div>
      )}
      {q.data && q.data.pagination.total > 0 && <Pagination page={page} totalPages={q.data.pagination.totalPages} total={q.data.pagination.total} onPage={setPage} />}
    </div>
  );
}
