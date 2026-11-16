"use client";
import { useState } from "react";
import { NotificationStatusBadge } from "@/components/monitors/notification-status";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { useNotificationLog, useNotificationSettings, useSaveNotificationSettings } from "@/lib/client/queries";
import { ErrorState } from "./empty-state";
import { PageHeader } from "./page-header";
import { Pagination } from "./pagination";

function ToggleRow({ id, label, description, checked, disabled, onChange }: { id: string; label: string; description: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div>
        <Label htmlFor={id}>{label}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}

function AlertEmailForm({ initial, accountEmail, pending, onSave }: { initial: string; accountEmail: string; pending: boolean; onSave: (v: string | null) => void }) {
  const [email, setEmail] = useState(initial);
  return (
    <form
      className="space-y-2 pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(email.trim() || null);
      }}
    >
      <Label htmlFor="alertEmail">Send alerts to</Label>
      <div className="flex gap-2">
        <Input id="alertEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={accountEmail} />
        <Button type="submit" variant="outline" disabled={pending}>
          Save
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Leave empty to use your account email ({accountEmail}).</p>
    </form>
  );
}

export function NotificationSettingsView() {
  const settings = useNotificationSettings();
  const save = useSaveNotificationSettings();
  const [page, setPage] = useState(1);
  const log = useNotificationLog(page);

  const s = settings.data;
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Notifications" description="Choose when UptimeKit emails you about outages." />
      {settings.error && <ErrorState error={settings.error} />}
      <div className="space-y-6">
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Email alerts</CardTitle>
            <CardDescription>Alerts are sent once per incident event and retried automatically if delivery fails.</CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            {!s ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <>
                <ToggleRow id="emailEnabled" label="Email notifications" description="Master switch for all email alerts." checked={s.emailEnabled} onChange={(v) => save.mutate({ emailEnabled: v })} />
                <ToggleRow id="notifyOnDown" label="Downtime alerts" description="When an outage is confirmed." checked={s.notifyOnDown} disabled={!s.emailEnabled} onChange={(v) => save.mutate({ notifyOnDown: v })} />
                <ToggleRow id="notifyOnRecovery" label="Recovery alerts" description="When a monitor recovers, with the outage duration." checked={s.notifyOnRecovery} disabled={!s.emailEnabled} onChange={(v) => save.mutate({ notifyOnRecovery: v })} />
                <AlertEmailForm key={s.alertEmail ?? ""} initial={s.alertEmail ?? ""} accountEmail={s.accountEmail} pending={save.isPending} onSave={(v) => save.mutate({ alertEmail: v })} />
              </>
            )}
          </CardContent>
        </Card>

        <div>
          <h2 className="mb-1 text-sm font-medium">Delivery log</h2>
          <p className="mb-3 text-xs text-muted-foreground">Every alert UptimeKit generated, with its delivery status.</p>
          <div className="rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4">Alert</TableHead>
                  <TableHead>Monitor</TableHead>
                  <TableHead className="hidden md:table-cell">Recipient</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden sm:table-cell">Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!log.data ? (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <Skeleton className="h-16 w-full" />
                    </TableCell>
                  </TableRow>
                ) : log.data.data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                      No alerts sent yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  log.data.data.map((n) => (
                    <TableRow key={n.id}>
                      <TableCell className="pl-4">{n.type === "INCIDENT_OPENED" ? "Downtime" : "Recovery"}</TableCell>
                      <TableCell className="max-w-[160px] truncate">{n.monitor.name}</TableCell>
                      <TableCell className="hidden max-w-[200px] truncate text-muted-foreground md:table-cell">{n.recipient}</TableCell>
                      <TableCell title={n.lastError ?? undefined}>
                        <NotificationStatusBadge status={n.status} />
                        {n.attempts > 1 && <span className="ml-1 text-xs text-muted-foreground">×{n.attempts}</span>}
                      </TableCell>
                      <TableCell className="tabular hidden text-muted-foreground sm:table-cell">{formatDateTime(n.sentAt ?? n.createdAt)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {log.data && log.data.pagination.total > 10 && <Pagination page={page} totalPages={log.data.pagination.totalPages} total={log.data.pagination.total} onPage={setPage} />}
        </div>
      </div>
    </div>
  );
}
