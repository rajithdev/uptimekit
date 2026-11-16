import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { MonitorForm } from "@/components/monitors/monitor-form";

export const metadata: Metadata = { title: "New monitor" };

export default function NewMonitorPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="New monitor" description="Checks run from the UptimeKit worker — no browser needs to stay open." />
      <MonitorForm />
    </div>
  );
}
