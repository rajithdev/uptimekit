import type { EmailMessage } from "./provider";

export interface AlertContext {
  type: "INCIDENT_OPENED" | "INCIDENT_RESOLVED";
  monitorName: string;
  monitorUrl: string;
  monitorId: string;
  incidentId: string;
  cause: string;
  startedAt: Date;
  resolvedAt: Date | null;
  durationSeconds: number | null;
  appUrl: string;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (sec || parts.length === 0) parts.push(`${sec}s`);
  return parts.join(" ");
}

/** Strip CR/LF so user-controlled monitor names can never inject email headers. */
function headerSafe(s: string): string {
  return s.replace(/[\r\n]+/g, " ").slice(0, 150);
}

export function renderAlertEmail(ctx: AlertContext, to: string): EmailMessage {
  const down = ctx.type === "INCIDENT_OPENED";
  const link = `${ctx.appUrl.replace(/\/$/, "")}/monitors/${encodeURIComponent(ctx.monitorId)}`;
  const subject = headerSafe(down ? `[DOWN] ${ctx.monitorName} is not responding` : `[RECOVERED] ${ctx.monitorName} is back up`);

  const rows: [string, string][] = [
    ["Monitor", ctx.monitorName],
    ["URL", ctx.monitorUrl],
    [down ? "Reason" : "Original cause", ctx.cause],
    ["Started", ctx.startedAt.toUTCString()],
  ];
  if (!down && ctx.resolvedAt) rows.push(["Resolved", ctx.resolvedAt.toUTCString()]);
  if (!down && ctx.durationSeconds !== null) rows.push(["Downtime", formatDuration(ctx.durationSeconds)]);

  const text = [
    down ? `${ctx.monitorName} is DOWN.` : `${ctx.monitorName} has RECOVERED.`,
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    `View details: ${link}`,
    "",
    "You are receiving this because alerts are enabled for this monitor in UptimeKit.",
  ].join("\n");

  const accent = down ? "#dc2626" : "#16a34a";
  const html = `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#18181b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e4e4e7;border-radius:10px;overflow:hidden">
<tr><td style="background:${accent};height:4px"></td></tr>
<tr><td style="padding:24px 28px 8px"><div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:${accent};font-weight:600">${down ? "Incident opened" : "Incident resolved"}</div>
<h1 style="margin:8px 0 0;font-size:20px">${escapeHtml(ctx.monitorName)} ${down ? "is down" : "is back up"}</h1></td></tr>
<tr><td style="padding:12px 28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">
${rows.map(([k, v]) => `<tr><td style="padding:6px 0;color:#71717a;width:130px;vertical-align:top">${escapeHtml(k)}</td><td style="padding:6px 0;word-break:break-all">${escapeHtml(v)}</td></tr>`).join("")}
</table></td></tr>
<tr><td style="padding:8px 28px 28px"><a href="${escapeHtml(link)}" style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;font-size:14px">View monitor</a></td></tr>
</table><p style="font-size:12px;color:#a1a1aa">Sent by UptimeKit</p></td></tr></table></body></html>`;

  return { to, subject, text, html };
}
