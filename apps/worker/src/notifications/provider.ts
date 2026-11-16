import nodemailer from "nodemailer";
import type { Logger } from "../logger";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<{ messageId: string | null }>;
}

/** SMTP provider — Mailpit in development; any SMTP relay (SES, Postmark, Resend…) in production. */
export class SmtpEmailProvider implements EmailProvider {
  readonly name = "smtp";
  private readonly transport: nodemailer.Transporter;

  constructor(
    private readonly from: string,
    options: { host: string; port: number; secure: boolean; user?: string; password?: string },
  ) {
    this.transport = nodemailer.createTransport({
      host: options.host,
      port: options.port,
      secure: options.secure,
      auth: options.user ? { user: options.user, pass: options.password ?? "" } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }

  async send(message: EmailMessage) {
    const info = await this.transport.sendMail({ from: this.from, ...message });
    return { messageId: info.messageId ?? null };
  }
}

/**
 * Resend HTTPS API provider. Needed where outbound SMTP is blocked (e.g. Railway's Hobby plan
 * disables SMTP ports); delivery semantics are identical to SMTP — a thrown error makes BullMQ
 * retry with backoff, and the outbox row records attempts and the last error.
 */
export class ResendEmailProvider implements EmailProvider {
  readonly name = "resend";

  constructor(
    private readonly from: string,
    private readonly apiKey: string,
    private readonly baseUrl = "https://api.resend.com",
    private readonly timeoutMs = 15_000,
  ) {
    if (!apiKey) throw new Error("RESEND_API_KEY is required for EMAIL_PROVIDER=resend");
  }

  async send(message: EmailMessage) {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/emails`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: this.from, to: [message.to], subject: message.subject, text: message.text, html: message.html }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const body = (await res.json().catch(() => null)) as { id?: string; name?: string; message?: string } | null;
    if (!res.ok) {
      // Resend error bodies never contain the API key; keep only the documented fields.
      const detail = [body?.name, body?.message].filter(Boolean).join(": ") || res.statusText;
      throw new Error(`Resend API ${res.status}: ${detail}`.slice(0, 300));
    }
    return { messageId: body?.id ?? null };
  }
}

/** Logs a one-line summary instead of sending. Useful when no SMTP server is available. */
export class ConsoleEmailProvider implements EmailProvider {
  readonly name = "console";
  constructor(private readonly logger: Logger) {}
  async send(message: EmailMessage) {
    this.logger.info({ to: message.to, subject: message.subject }, "email (console provider, not sent)");
    return { messageId: null };
  }
}
