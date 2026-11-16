import type { Metadata } from "next";
import { MonitorsTable } from "@/components/monitors/monitors-table";

export const metadata: Metadata = { title: "Monitors" };

export default function MonitorsPage() {
  return <MonitorsTable />;
}
