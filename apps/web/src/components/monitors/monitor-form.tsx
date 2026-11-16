"use client";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { MonitorDto } from "@/lib/api/types";
import { ApiClientError } from "@/lib/client/api";
import { useSaveMonitor } from "@/lib/client/queries";
import { cn } from "@/lib/utils";

interface FormState {
  name: string;
  url: string;
  method: "GET" | "HEAD";
  intervalSeconds: string;
  timeoutMs: string;
  expectedStatusCodes: string;
  keyword: string;
  followRedirects: boolean;
  failureThreshold: string;
  recoveryThreshold: string;
  retryIntervalSeconds: string;
  notificationsEnabled: boolean;
}

const INTERVAL_PRESETS = [
  { label: "30s", value: 30 },
  { label: "1m", value: 60 },
  { label: "5m", value: 300 },
  { label: "15m", value: 900 },
  { label: "1h", value: 3600 },
];

function initialState(m?: MonitorDto): FormState {
  return {
    name: m?.name ?? "",
    url: m?.url ?? "https://",
    method: m?.method ?? "GET",
    intervalSeconds: String(m?.intervalSeconds ?? 60),
    timeoutMs: String(m?.timeoutMs ?? 10000),
    expectedStatusCodes: m?.expectedStatusCodes ?? "200-299",
    keyword: m?.keyword ?? "",
    followRedirects: m?.followRedirects ?? true,
    failureThreshold: String(m?.failureThreshold ?? 2),
    recoveryThreshold: String(m?.recoveryThreshold ?? 2),
    retryIntervalSeconds: String(m?.retryIntervalSeconds ?? 20),
    notificationsEnabled: m?.notificationsEnabled ?? true,
  };
}

function Field({ id, label, hint, error, children, className }: { id: string; label: string; hint?: React.ReactNode; error?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

export function MonitorForm({ monitor }: { monitor?: MonitorDto }) {
  const router = useRouter();
  const save = useSaveMonitor(monitor?.id);
  const [f, setF] = useState<FormState>(() => initialState(monitor));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));
  const err = (k: string) => errors[k];
  const aria = (k: string) => (errors[k] ? { "aria-invalid": true, "aria-describedby": `${k}-error` } : {});

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    const body = {
      name: f.name,
      url: f.url,
      method: f.method,
      intervalSeconds: Number(f.intervalSeconds),
      timeoutMs: Number(f.timeoutMs),
      expectedStatusCodes: f.expectedStatusCodes,
      keyword: f.method === "GET" && f.keyword.trim() ? f.keyword.trim() : null,
      followRedirects: f.followRedirects,
      failureThreshold: Number(f.failureThreshold),
      recoveryThreshold: Number(f.recoveryThreshold),
      retryIntervalSeconds: Number(f.retryIntervalSeconds),
      notificationsEnabled: f.notificationsEnabled,
    };
    try {
      const saved = await save.mutateAsync(body);
      toast.success(monitor ? "Monitor updated" : "Monitor created — first check is queued");
      router.push(`/monitors/${saved.id}`);
    } catch (error) {
      if (error instanceof ApiClientError && error.details.length) {
        setErrors(error.fieldErrors());
        toast.error("Please fix the highlighted fields");
      } else {
        toast.error(error instanceof Error ? error.message : "Could not save monitor");
      }
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Endpoint</CardTitle>
          <CardDescription>What should UptimeKit check? Only public http(s) endpoints are allowed.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <Field id="name" label="Name" error={err("name")} className="sm:col-span-2">
            <Input id="name" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Marketing site" maxLength={100} required {...aria("name")} />
          </Field>
          <Field id="url" label="URL" error={err("url")} className="sm:col-span-2" hint="Private, loopback and cloud-metadata addresses are rejected.">
            <Input id="url" value={f.url} onChange={(e) => set("url", e.target.value)} placeholder="https://example.com/health" className="font-mono" inputMode="url" required {...aria("url")} />
          </Field>
          <Field id="method" label="Method" error={err("method")}>
            <Select value={f.method} onValueChange={(v) => set("method", v as "GET" | "HEAD")}>
              <SelectTrigger id="method" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="GET">GET</SelectItem>
                <SelectItem value="HEAD">HEAD</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field id="expectedStatusCodes" label="Expected status codes" error={err("expectedStatusCodes")} hint="Codes or ranges, e.g. 200-299 or 200,301">
            <Input id="expectedStatusCodes" value={f.expectedStatusCodes} onChange={(e) => set("expectedStatusCodes", e.target.value)} className="font-mono" {...aria("expectedStatusCodes")} />
          </Field>
          <Field id="keyword" label="Response must contain (optional)" error={err("keyword")} hint={f.method === "HEAD" ? "Keyword matching requires GET." : "Case-sensitive match within the first 1 MiB of the body."} className="sm:col-span-2">
            <Input id="keyword" value={f.keyword} onChange={(e) => set("keyword", e.target.value)} disabled={f.method === "HEAD"} placeholder='"status":"ok"' className="font-mono" maxLength={200} {...aria("keyword")} />
          </Field>
          <div className="flex items-center justify-between gap-4 rounded-lg border p-3 sm:col-span-2">
            <div>
              <Label htmlFor="followRedirects">Follow redirects</Label>
              <p className="text-xs text-muted-foreground">Up to 5 hops; every hop is re-validated against the network policy.</p>
            </div>
            <Switch id="followRedirects" checked={f.followRedirects} onCheckedChange={(v) => set("followRedirects", v)} />
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Schedule</CardTitle>
          <CardDescription>How often to check, and how long to wait for a response.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <Field id="intervalSeconds" label="Check interval (seconds)" error={err("intervalSeconds")}>
            <Input id="intervalSeconds" type="number" min={5} max={86400} value={f.intervalSeconds} onChange={(e) => set("intervalSeconds", e.target.value)} {...aria("intervalSeconds")} />
            <div className="flex flex-wrap gap-1.5">
              {INTERVAL_PRESETS.map((p) => (
                <button
                  type="button"
                  key={p.value}
                  onClick={() => set("intervalSeconds", String(p.value))}
                  className={cn(
                    "rounded-md border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground",
                    Number(f.intervalSeconds) === p.value && "border-foreground/40 text-foreground",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </Field>
          <Field id="timeoutMs" label="Timeout (ms)" error={err("timeoutMs")} hint="1,000 – 60,000 ms, shorter than the interval.">
            <Input id="timeoutMs" type="number" min={1000} max={60000} step={500} value={f.timeoutMs} onChange={(e) => set("timeoutMs", e.target.value)} {...aria("timeoutMs")} />
          </Field>
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Confirmation & alerts</CardTitle>
          <CardDescription>Avoid false alarms: status only changes after consecutive confirming checks.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-3">
          <Field id="failureThreshold" label="Failures before DOWN" error={err("failureThreshold")}>
            <Input id="failureThreshold" type="number" min={1} max={10} value={f.failureThreshold} onChange={(e) => set("failureThreshold", e.target.value)} {...aria("failureThreshold")} />
          </Field>
          <Field id="recoveryThreshold" label="Successes before UP" error={err("recoveryThreshold")}>
            <Input id="recoveryThreshold" type="number" min={1} max={10} value={f.recoveryThreshold} onChange={(e) => set("recoveryThreshold", e.target.value)} {...aria("recoveryThreshold")} />
          </Field>
          <Field id="retryIntervalSeconds" label="Confirmation retry (s)" error={err("retryIntervalSeconds")} hint="Faster re-check while confirming.">
            <Input id="retryIntervalSeconds" type="number" min={5} max={3600} value={f.retryIntervalSeconds} onChange={(e) => set("retryIntervalSeconds", e.target.value)} {...aria("retryIntervalSeconds")} />
          </Field>
          <div className="flex items-center justify-between gap-4 rounded-lg border p-3 sm:col-span-3">
            <div>
              <Label htmlFor="notificationsEnabled">Email alerts for this monitor</Label>
              <p className="text-xs text-muted-foreground">Downtime and recovery emails, subject to your notification settings.</p>
            </div>
            <Switch id="notificationsEnabled" checked={f.notificationsEnabled} onCheckedChange={(v) => set("notificationsEnabled", v)} />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" asChild>
          <Link href={monitor ? `/monitors/${monitor.id}` : "/monitors"}>Cancel</Link>
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending && <Loader2 className="size-4 animate-spin" />}
          {monitor ? "Save changes" : "Create monitor"}
        </Button>
      </div>
    </form>
  );
}
