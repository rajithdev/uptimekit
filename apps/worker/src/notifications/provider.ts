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

/** Logs a one-line summary instead of sending. Useful when no SMTP server is available. */
export class ConsoleEmailProvider implements EmailProvider {
  readonly name = "console";
  constructor(private readonly logger: Logger) {}
  async send(message: EmailMessage) {
    this.logger.info({ to: message.to, subject: message.subject }, "email (console provider, not sent)");
    return { messageId: null };
  }
}
