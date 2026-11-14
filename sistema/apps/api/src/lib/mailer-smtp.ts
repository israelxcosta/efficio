// SMTP delivery through the office's own mailbox (production on the VPS: smtp.hostinger.com, port 465
// with implicit TLS). Kept apart from mailer.ts and loaded with a dynamic import by setup.ts so the
// browser demo never bundles nodemailer. The certificate is always verified, STARTTLS is mandatory
// when the port is not implicit TLS, timeouts are short (a stuck server must not hold requests), and
// neither the password nor the SMTP dialogue reaches the logs.

import { oneLine, type Mailer } from './mailer';

export interface SmtpMailerOptions {
  from: string;
  host: string;
  port: number;
  /** true = implicit TLS (465); false = plain connection upgraded with a mandatory STARTTLS (587). */
  secure: boolean;
  user: string;
  password: string;
}

/** Connection options handed to nodemailer (exported for tests). */
export function smtpTransportOptions(o: SmtpMailerOptions) {
  return {
    host: o.host,
    port: o.port,
    secure: o.secure,
    requireTLS: !o.secure,
    auth: { user: o.user, pass: o.password },
    tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' as const, servername: o.host },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    // Never let message fields pull local files or URLs, and keep the SMTP dialogue out of the logs.
    disableFileAccess: true,
    disableUrlAccess: true,
    logger: false,
    debug: false,
  };
}

export type SmtpTransportOptions = ReturnType<typeof smtpTransportOptions>;

/** The part of a nodemailer transport the mailer uses (tests inject a fake one). */
export interface SmtpTransport {
  sendMail(message: { from: string; to: string; subject: string; text: string }): Promise<unknown>;
}

export type SmtpTransportFactory = (options: SmtpTransportOptions) => SmtpTransport;

/** Safe summary of a delivery failure: nodemailer's code and the SMTP reply code, nothing else. */
function deliveryError(error: unknown): Error {
  const e = (error ?? {}) as { code?: unknown; responseCode?: unknown };
  const parts = [typeof e.code === 'string' ? e.code : null, typeof e.responseCode === 'number' ? String(e.responseCode) : null];
  const detail = parts.filter(Boolean).join(' ');
  return new Error(`Falha ao enviar e-mail por SMTP${detail ? ` (${detail})` : ''}`);
}

export async function createSmtpMailer(options: SmtpMailerOptions, factory?: SmtpTransportFactory): Promise<Mailer> {
  let create = factory;
  if (!create) {
    const nodemailer = await import('nodemailer');
    create = (o) => nodemailer.createTransport(o);
  }
  const transport = create(smtpTransportOptions(options));
  return {
    name: 'smtp',
    delivers: true,
    async send(message) {
      try {
        await transport.sendMail({ from: options.from, to: message.to, subject: oneLine(message.subject), text: message.text });
      } catch (error) {
        throw deliveryError(error);
      }
    },
  };
}
