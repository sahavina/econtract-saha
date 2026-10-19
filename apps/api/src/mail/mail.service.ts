import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';
import type { Env } from '../config/env.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Gửi email qua SMTP (SMTP_HOST). Khi chưa cấu hình SMTP (chỉ được phép ngoài production),
 * nội dung email được ghi ra log server để phát triển/kiểm thử.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger('Mail');
  private readonly transporter: Transporter | null;
  private readonly from: string;

  constructor(config: ConfigService<Env, true>) {
    const host = config.get('SMTP_HOST', { infer: true });
    this.from = config.get('MAIL_FROM', { infer: true });
    this.transporter = host
      ? nodemailer.createTransport({
          host,
          port: config.get('SMTP_PORT', { infer: true }),
          secure: config.get('SMTP_PORT', { infer: true }) === 465,
          auth: config.get('SMTP_USER', { infer: true })
            ? { user: config.get('SMTP_USER', { infer: true }), pass: config.get('SMTP_PASS', { infer: true }) }
            : undefined,
        })
      : null;
    if (!this.transporter)
      this.logger.warn('Chưa cấu hình SMTP_HOST – email sẽ chỉ được ghi ra log (môi trường phát triển).');
  }

  /** Đã cấu hình SMTP (email gửi thật), false = chỉ ghi ra log. */
  get enabled(): boolean {
    return this.transporter !== null;
  }

  async send(message: MailMessage): Promise<void> {
    if (!this.transporter) {
      this.logger.log(`[DEV EMAIL] To: ${message.to} | ${message.subject}\n${message.text}`);
      return;
    }
    await this.transporter.sendMail({ from: this.from, ...message });
  }
}
