"use client";
import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { EmptyState, ErrorState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Pagination } from "@/components/app/pagination";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDateTime, formatDuration } from "@/lib/format";
import { useIncidents } from "@/lib/client/queries";
import { useNow } from "@/lib/client/use-now";
import { IncidentStateBadge } from "./incident-list";

export function IncidentsView() {
  const router = useRouter();
  const search = useSearchParams();
  const monitorId = search.get("monitorId") ?? undefined;
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const q = useIncidents({ page, pageSize: 20, status, monitorId });
  const now = useNow();

  return (
    <>
      <PageHeader
        title="Incidents"
        description="Confirmed outages, from first failed check to confirmed recovery."
        actions={
          monitorId ? (
            <Button variant="outline" size="sm" asChild>
              <Link href="/incidents">Clear monitor filter</Link>
            </Button>
          ) : null
        }
      />
      <Tabs
        value={status}
        onValueChange={(v) => {
          setStatus(v);
          setPage(1);
        }}
        className="mb-4"
      >
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="open">Ongoing</TabsTrigger>
          <TabsTrigger value="resolved">Resolved</TabsTrigger>
        </TabsList>
      </Tabs>
      {q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data && q.data.data.length === 0 ? (
        <EmptyState icon={<ShieldCheck />} title={status === "open" ? "No ongoing incidents" : "No incidents"} description="When a monitor fails its confirmation checks, the outage appears here." />
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">State</TableHead>
                <TableHead>Monitor</TableHead>
                <TableHead className="hidden md:table-cell">Cause</TableHead>
                <TableHead>Started</TableHead>
                <TableHead className="text-right">Duration</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!q.data ? (
                <TableRow>
                  <TableCell colSpan={5}>
                    <Skeleton className="h-24 w-full" />
                  </TableCell>
                </TableRow>
              ) : (
                q.data.data.map((i) => (
                  <TableRow key={i.id} className="cursor-pointer" onClick={() => router.push(`/incidents/${i.id}`)}>
                    <TableCell className="pl-4">
                      <IncidentStateBadge open={i.resolvedAt === null} />
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      <Link href={`/incidents/${i.id}`} className="block truncate font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                        {i.monitor.name}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden max-w-[320px] truncate text-muted-foreground md:table-cell">{i.cause}</TableCell>
                    <TableCell className="tabular text-muted-foreground">{formatDateTime(i.startedAt)}</TableCell>
                    <TableCell className="tabular text-right">
                      {i.resolvedAt ? formatDuration(i.durationSeconds) : <span className="text-destructive">{formatDuration((now - new Date(i.startedAt).getTime()) / 1000)}+</span>}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
      {q.data && q.data.data.length > 0 && <Pagination page={page} totalPages={q.data.pagination.totalPages} total={q.data.pagination.total} onPage={setPage} />}
    </>
  );
}
