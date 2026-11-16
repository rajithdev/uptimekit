"use client";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type {
  CheckDto,
  DashboardSummaryDto,
  IncidentDetailDto,
  IncidentDto,
  MonitorDto,
  MonitorListItemDto,
  MonitorStatsDto,
  NotificationDto,
  NotificationSettingsDto,
  Paginated,
} from "../api/types";
import { api } from "./api";

/** Live data refreshes on an interval so the dashboard reflects new checks without reloads. */
export const LIVE_REFRESH_MS = 15_000;

const qs = (params: Record<string, string | number | undefined>) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") s.set(k, String(v));
  const str = s.toString();
  return str ? `?${str}` : "";
};

export const keys = {
  dashboard: ["dashboard"] as const,
  monitors: (p: object) => ["monitors", p] as const,
  monitor: (id: string) => ["monitor", id] as const,
  stats: (id: string, range: string) => ["monitor", id, "stats", range] as const,
  checks: (id: string, p: object) => ["monitor", id, "checks", p] as const,
  incidents: (p: object) => ["incidents", p] as const,
  incident: (id: string) => ["incident", id] as const,
  notificationSettings: ["notification-settings"] as const,
  notifications: (p: object) => ["notifications", p] as const,
};

export function useDashboard() {
  return useQuery({
    queryKey: keys.dashboard,
    queryFn: () => api<{ data: DashboardSummaryDto }>("/api/v1/dashboard/summary").then((r) => r.data),
    refetchInterval: LIVE_REFRESH_MS,
  });
}

export interface MonitorListParams {
  page?: number;
  pageSize?: number;
  sort?: string;
  order?: "asc" | "desc";
  status?: string;
  q?: string;
}

export function useMonitors(params: MonitorListParams) {
  return useQuery({
    queryKey: keys.monitors(params),
    queryFn: () => api<Paginated<MonitorListItemDto>>(`/api/v1/monitors${qs({ ...params })}`),
    refetchInterval: LIVE_REFRESH_MS,
    placeholderData: keepPreviousData,
  });
}

export function useMonitor(id: string) {
  return useQuery({
    queryKey: keys.monitor(id),
    queryFn: () => api<{ data: MonitorDto }>(`/api/v1/monitors/${id}`).then((r) => r.data),
    refetchInterval: LIVE_REFRESH_MS,
  });
}

export function useMonitorStats(id: string, range: string) {
  return useQuery({
    queryKey: keys.stats(id, range),
    queryFn: () => api<{ data: MonitorStatsDto }>(`/api/v1/monitors/${id}/stats${qs({ range })}`).then((r) => r.data),
    refetchInterval: LIVE_REFRESH_MS,
    placeholderData: keepPreviousData,
  });
}

export function useChecks(id: string, params: { page: number; pageSize: number; result?: string }) {
  return useQuery({
    queryKey: keys.checks(id, params),
    queryFn: () => api<Paginated<CheckDto>>(`/api/v1/monitors/${id}/checks${qs(params)}`),
    refetchInterval: LIVE_REFRESH_MS,
    placeholderData: keepPreviousData,
  });
}

export function useIncidents(params: { page: number; pageSize: number; status?: string; monitorId?: string }) {
  return useQuery({
    queryKey: keys.incidents(params),
    queryFn: () => api<Paginated<IncidentDto>>(`/api/v1/incidents${qs(params)}`),
    refetchInterval: LIVE_REFRESH_MS,
    placeholderData: keepPreviousData,
  });
}

export function useIncident(id: string) {
  return useQuery({
    queryKey: keys.incident(id),
    queryFn: () => api<{ data: IncidentDetailDto }>(`/api/v1/incidents/${id}`).then((r) => r.data),
    refetchInterval: LIVE_REFRESH_MS,
  });
}

export function useNotificationSettings() {
  return useQuery({
    queryKey: keys.notificationSettings,
    queryFn: () => api<{ data: NotificationSettingsDto }>("/api/v1/notification-settings").then((r) => r.data),
  });
}

export function useNotificationLog(page: number) {
  return useQuery({
    queryKey: keys.notifications({ page }),
    queryFn: () => api<Paginated<NotificationDto>>(`/api/v1/notifications${qs({ page, pageSize: 10 })}`),
    refetchInterval: LIVE_REFRESH_MS,
    placeholderData: keepPreviousData,
  });
}

function useInvalidateMonitors() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["monitors"] });
    void qc.invalidateQueries({ queryKey: ["monitor"] });
    void qc.invalidateQueries({ queryKey: keys.dashboard });
    void qc.invalidateQueries({ queryKey: ["incidents"] });
  };
}

export function usePauseResume() {
  const invalidate = useInvalidateMonitors();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: "pause" | "resume" }) =>
      api<{ data: MonitorDto }>(`/api/v1/monitors/${id}/${action}`, { method: "POST" }).then((r) => r.data),
    onSuccess: (m, v) => {
      toast.success(v.action === "pause" ? `Paused ${m.name}` : `Resumed ${m.name}`);
      invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useDeleteMonitor() {
  const invalidate = useInvalidateMonitors();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/api/v1/monitors/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Monitor deleted");
      invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useSaveMonitor(id?: string) {
  const invalidate = useInvalidateMonitors();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<{ data: MonitorDto }>(id ? `/api/v1/monitors/${id}` : "/api/v1/monitors", { method: id ? "PATCH" : "POST", json: body }).then(
        (r) => r.data,
      ),
    onSuccess: () => invalidate(),
  });
}

export function useSaveNotificationSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<NotificationSettingsDto>) =>
      api<{ data: NotificationSettingsDto }>("/api/v1/notification-settings", { method: "PUT", json: body }).then((r) => r.data),
    onSuccess: (data) => {
      qc.setQueryData(keys.notificationSettings, data);
      toast.success("Notification settings saved");
    },
    onError: (err) => toast.error(err.message),
  });
}
