import type { Metadata } from "next";
import { DemoShell } from "@/components/demo/demo-shell";

export const metadata: Metadata = {
  title: { default: "Live demo", template: "%s · UptimeKit demo" },
  description: "Explore UptimeKit's monitoring dashboard with sample data — no sign-up required.",
};

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return <DemoShell>{children}</DemoShell>;
}
