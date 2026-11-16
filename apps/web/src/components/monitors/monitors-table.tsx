"use client";
import { Activity, ArrowDown, ArrowUp, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { EmptyState, ErrorState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Pagination } from "@/components/app/pagination";
import { StatusBadge, uptimeColor } from "@/components/app/status";
import { Sparkline } from "@/components/charts/sparkline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatInterval, formatMs, formatPercent, hostOf, relativeTime } from "@/lib/format";
import { useMonitors } from "@/lib/client/queries";
import { cn } from "@/lib/utils";
import { MonitorActionsMenu } from "./monitor-actions";

type SortKey = "name" | "status" | "lastCheckedAt" | "lastResponseTimeMs" | "createdAt";

function SortHead({ k, sort, order, onSort, children, className }: { k: SortKey; sort: SortKey; order: "asc" | "desc"; onSort: (k: SortKey) => void; children: React.ReactNode; className?: string }) {
  return (
    <TableHead className={className} aria-sort={sort === k ? (order === "asc" ? "ascending" : "descending") : "none"}>
      <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => onSort(k)}>
        {children}
        {sort === k && (order === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </button>
    </TableHead>
  );
}

export function MonitorsTable() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>("all");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [sort, setSort] = useState<SortKey>("createdAt");
  const [order, setOrder] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(q);
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const query = useMonitors({ page, pageSize: 20, sort, order, status: status === "all" ? undefined : status, q: debouncedQ || undefined });
  const filtering = status !== "all" || debouncedQ !== "";

  const sortBy = (key: SortKey) => {
    if (sort === key) setOrder(order === "asc" ? "desc" : "asc");
    else {
      setSort(key);
      setOrder(key === "name" ? "asc" : "desc");
    }
    setPage(1);
  };

  return (
    <>
      <PageHeader
        title="Monitors"
        description="Every endpoint UptimeKit is checking for you."
        actions={
          <Button asChild size="sm">
            <Link href="/monitors/new">
              <Plus className="size-4" /> New monitor
            </Link>
          </Button>
        }
      />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or URL" className="pl-8" aria-label="Search monitors" />
        </div>
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="sm:w-44" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="UP">Operational</SelectItem>
            <SelectItem value="DOWN">Down</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="PAUSED">Paused</SelectItem>
            <SelectItem value="UNKNOWN">Unknown</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {query.error ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : query.data && query.data.data.length === 0 ? (
        filtering ? (
          <EmptyState icon={<Search />} title="No matching monitors" description="Try a different search or status filter." />
        ) : (
          <EmptyState
            icon={<Activity />}
            title="No monitors yet"
            description="Create a monitor to start recording real availability and latency data."
            action={
              <Button asChild>
                <Link href="/monitors/new">
                  <Plus className="size-4" /> New monitor
                </Link>
              </Button>
            }
          />
        )
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <SortHead sort={sort} order={order} onSort={sortBy} k="name" className="pl-4">Monitor</SortHead>
                <SortHead sort={sort} order={order} onSort={sortBy} k="status">Status</SortHead>
                <TableHead className="hidden lg:table-cell">Response · 24h</TableHead>
                <TableHead className="hidden md:table-cell">Uptime · 24h</TableHead>
                <SortHead sort={sort} order={order} onSort={sortBy} k="lastResponseTimeMs" className="hidden sm:table-cell">Last response</SortHead>
                <SortHead sort={sort} order={order} onSort={sortBy} k="lastCheckedAt" className="hidden md:table-cell">Last check</SortHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {!query.data
                ? Array.from({ length: 4 }, (_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={7}>
                        <Skeleton className="h-8 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                : query.data.data.map((m) => (
                    <TableRow key={m.id} className="cursor-pointer" onClick={() => router.push(`/monitors/${m.id}`)}>
                      <TableCell className="max-w-[260px] pl-4">
                        <Link href={`/monitors/${m.id}`} className="block truncate font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                          {m.name}
                        </Link>
                        <div className="truncate font-mono text-xs text-muted-foreground">
                          {m.method} {hostOf(m.url)} · every {formatInterval(m.intervalSeconds)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={m.status} stale={m.isStale} />
                      </TableCell>
                      <TableCell className="hidden w-36 lg:table-cell">
                        <Sparkline values={m.sparkline} label={`${m.name} response time`} />
                      </TableCell>
                      <TableCell className={cn("tabular hidden md:table-cell", uptimeColor(m.stats24h.uptime))}>{formatPercent(m.stats24h.uptime)}</TableCell>
                      <TableCell className="tabular hidden sm:table-cell">{formatMs(m.lastResponseTimeMs)}</TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">{m.status === "PAUSED" ? "Paused" : relativeTime(m.lastCheckedAt)}</TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <MonitorActionsMenu monitor={m} />
                      </TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        </div>
      )}
      {query.data && query.data.data.length > 0 && (
        <Pagination page={page} totalPages={query.data.pagination.totalPages} total={query.data.pagination.total} onPage={setPage} />
      )}
    </>
  );
}
