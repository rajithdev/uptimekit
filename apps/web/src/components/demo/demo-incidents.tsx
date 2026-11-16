"use client";
import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/app/page-header";
import { IncidentStateBadge } from "@/components/monitors/incident-list";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SegmentedControl } from "@/components/app/segmented-control";
import type { IncidentDto } from "@/lib/api/types";
import { formatDateTime, formatDuration } from "@/lib/format";

export function DemoIncidents({ incidents, now }: { incidents: IncidentDto[]; now: number }) {
  const [status, setStatus] = useState("all");
  const rows = incidents.filter((i) => (status === "open" ? i.resolvedAt === null : status === "resolved" ? i.resolvedAt !== null : true));
  return (
    <>
      <PageHeader title="Incidents" description="Confirmed outages, from first failed check to confirmed recovery — sample data." />
      <SegmentedControl label="Incident status" value={status} onChange={setStatus} options={[{ value: "all", label: "All" }, { value: "open", label: "Ongoing" }, { value: "resolved", label: "Resolved" }]} className="mb-4" />
      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-4">State</TableHead>
              <TableHead>Monitor</TableHead>
              <TableHead className="hidden md:table-cell">Cause</TableHead>
              <TableHead className="hidden sm:table-cell">Started</TableHead>
              <TableHead className="text-right">Duration</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((i) => (
              <TableRow key={i.id}>
                <TableCell className="pl-4">
                  <IncidentStateBadge open={i.resolvedAt === null} />
                </TableCell>
                <TableCell className="max-w-[180px]">
                  <Link href={`/demo/monitors/${i.monitorId}#incidents`} className="block truncate font-medium hover:underline">
                    {i.monitor.name}
                  </Link>
                </TableCell>
                <TableCell className="hidden max-w-[320px] truncate text-muted-foreground md:table-cell">{i.cause}</TableCell>
                <TableCell className="tabular hidden text-muted-foreground sm:table-cell">{formatDateTime(i.startedAt)}</TableCell>
                <TableCell className="tabular text-right">
                  {i.resolvedAt ? formatDuration(i.durationSeconds) : <span className="text-destructive">{formatDuration((now - new Date(i.startedAt).getTime()) / 1000)}+</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
