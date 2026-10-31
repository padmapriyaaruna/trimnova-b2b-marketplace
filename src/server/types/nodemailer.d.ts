/**
 * Minimal nodemailer type declaration for TrimNova.
 * Replace with @types/nodemailer once network is available.
 */
declare module 'nodemailer' {
  export interface TransportOptions {
    host?: string;
    port?: number;
    auth?: { user?: string; pass?: string };
    secure?: boolean;
    [key: string]: unknown;
  }

  export interface MailOptions {
    from?: string;
    to?: string | string[];
    cc?: string | string[];
    bcc?: string | string[];
    subject?: string;
    text?: string;
    html?: string;
    [key: string]: unknown;
  }

  export interface SentMessageInfo {
    messageId?: string;
    [key: string]: unknown;
  }

  export interface Transporter {
    sendMail(mailOptions: MailOptions): Promise<SentMessageInfo>;
  }

  export function createTransport(options: TransportOptions): Transporter;
}
