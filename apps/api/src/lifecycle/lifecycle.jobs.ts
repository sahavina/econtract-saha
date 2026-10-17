import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import type { Env } from '../config/env.js';
import { MailService } from '../mail/mail.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { today } from './lifecycle.service.js';

const DAY = 86_400_000;
/** Mốc nhắc trước khi hợp đồng hết hạn (ngày). */
const EXPIRY_REMINDER_DAYS = [30, 7, 1];
/** Nhắc hạn thanh toán / nghĩa vụ trước (ngày). */
const DUE_REMINDER_DAYS = 3;

export interface JobResult {
  activated: number;
  expired: number;
  reminders: number;
}

/**
 * Tác vụ định kỳ của vòng đời hợp đồng (chạy 01:00 hằng ngày và một lần khi khởi động):
 * - Đã ký → Đang hiệu lực khi tới ngày hiệu lực; Đang hiệu lực → Hết hiệu lực khi quá ngày hết hạn.
 * - Email nhắc hợp đồng sắp hết hạn, thanh toán/nghĩa vụ sắp đến hạn hoặc quá hạn (mỗi mốc gửi một lần).
 */
@Injectable()
export class LifecycleJobs implements OnApplicationBootstrap {
  private readonly logger = new Logger('LifecycleJobs');
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly config: ConfigService<Env, true>,
    private readonly notifications: NotificationsService,
  ) {}

  onApplicationBootstrap() {
    if (this.config.get('NODE_ENV', { infer: true }) === 'test') return;
    // Bù các thay đổi trong thời gian máy chủ tắt.
    setTimeout(() => void this.run().catch((e: unknown) => this.logger.error(e)), 5_000);
  }

  @Cron('0 1 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
  async daily() {
    await this.run();
  }

  async run(): Promise<JobResult> {
    if (this.running) return { activated: 0, expired: 0, reminders: 0 };
    this.running = true;
    try {
      const activated = await this.transition(
        'SIGNED',
        'ACTIVE',
        { effectiveDate: { lte: today() } },
        'contract.auto_activate',
      );
      const expired = await this.transition(
        'ACTIVE',
        'EXPIRED',
        { expiryDate: { lt: today() } },
        'contract.auto_expire',
      );
      const reminders = await this.remind();
      if (activated || expired || reminders)
        this.logger.log(`Hiệu lực: ${activated}, hết hạn: ${expired}, nhắc hạn: ${reminders}`);
      return { activated, expired, reminders };
    } finally {
      this.running = false;
    }
  }

  private async transition(
    from: 'SIGNED' | 'ACTIVE',
    to: 'ACTIVE' | 'EXPIRED',
    extra: Prisma.ContractWhereInput,
    action: string,
  ) {
    const rows = await this.prisma.contract.findMany({
      where: { status: from, deletedAt: null, ...extra },
      select: { id: true, tenantId: true, code: true },
    });
    for (const c of rows) {
      await this.prisma.$transaction(async (tx) => {
        const moved = await tx.contract.updateMany({ where: { id: c.id, status: from }, data: { status: to } });
        if (moved.count === 1) {
          await this.audit.logExternal(
            c.tenantId,
            { name: 'Hệ thống' },
            { action, entityType: 'contract', entityId: c.id, data: { code: c.code } },
            tx,
          );
        }
      });
    }
    return rows.length;
  }

  private url(contractId: string, tab = 'overview') {
    return `${this.config.get('APP_URL', { infer: true }).replace(/\/$/, '')}/contracts/${contractId}?tab=${tab}`;
  }

  /** Giữ khóa trước rồi gửi; gửi lỗi thì nhả khóa để lần sau thử lại. */
  private async sendOnce(
    key: string,
    tenantId: string,
    recipient: { id: string; email: string } | null | undefined,
    subject: string,
    text: string,
    link: string,
  ) {
    if (!recipient) return 0;
    const to = recipient.email;
    try {
      await this.prisma.reminderLog.create({ data: { key, tenantId } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return 0;
      throw err;
    }
    try {
      await this.mail.send({ to, subject, text });
      // Kèm thông báo trong ứng dụng (tiêu đề bỏ tiền tố email).
      await this.notifications.notify(tenantId, [recipient.id], {
        type: `reminder.${key.split(':')[0]}`,
        title: subject.replace('[SAHA eContract] ', ''),
        body: text.split('\n')[0],
        link,
      });
      return 1;
    } catch (err) {
      await this.prisma.reminderLog.delete({ where: { key } }).catch(() => undefined);
      this.logger.warn(`Gửi nhắc hạn thất bại (${key}): ${String(err)}`);
      return 0;
    }
  }

  private async remind() {
    const t = today();
    let sent = 0;
    const owner = { select: { id: true, email: true, fullName: true } };

    // Hợp đồng sắp hết hạn.
    for (const days of EXPIRY_REMINDER_DAYS) {
      const target = new Date(t.getTime() + days * DAY);
      const contracts = await this.prisma.contract.findMany({
        where: { status: 'ACTIVE', deletedAt: null, expiryDate: target },
        select: { id: true, tenantId: true, code: true, title: true, owner, createdBy: owner },
      });
      for (const c of contracts) {
        sent += await this.sendOnce(
          `exp:${c.id}:${days}:${target.toISOString().slice(0, 10)}`,
          c.tenantId,
          c.owner ?? c.createdBy,
          `[SAHA eContract] Hợp đồng ${c.code} còn ${days} ngày hết hạn`,
          `Hợp đồng "${c.title}" (${c.code}) sẽ hết hạn sau ${days} ngày. Vui lòng xem xét gia hạn hoặc thanh lý.\n${this.url(c.id, 'lifecycle')}`,
          `/contracts/${c.id}?tab=lifecycle`,
        );
      }
    }

    // Thanh toán sắp đến hạn / quá hạn.
    const soon = new Date(t.getTime() + DUE_REMINDER_DAYS * DAY);
    const payments = await this.prisma.paymentInstallment.findMany({
      where: {
        status: { in: ['PLANNED', 'PARTIAL'] },
        dueDate: { lte: soon },
        contract: { deletedAt: null, status: { notIn: ['LIQUIDATED', 'CANCELLED'] } },
      },
      select: {
        id: true,
        tenantId: true,
        title: true,
        amount: true,
        paidAmount: true,
        dueDate: true,
        contract: { select: { id: true, code: true, currency: true, owner, createdBy: owner } },
      },
    });
    for (const p of payments) {
      const overdue = p.dueDate! < t;
      sent += await this.sendOnce(
        `pay:${p.id}:${overdue ? 'overdue' : 'due'}:${p.dueDate!.toISOString().slice(0, 10)}`,
        p.tenantId,
        p.contract.owner ?? p.contract.createdBy,
        `[SAHA eContract] ${overdue ? 'Quá hạn' : 'Sắp đến hạn'} thanh toán – ${p.contract.code}`,
        `Đợt "${p.title}" của hợp đồng ${p.contract.code}: còn ${p.amount.minus(p.paidAmount).toString()} ${p.contract.currency}, hạn ${p.dueDate!.toISOString().slice(0, 10)}.\n${this.url(p.contract.id, 'lifecycle')}`,
        `/contracts/${p.contract.id}?tab=lifecycle`,
      );
    }

    // Nghĩa vụ sắp đến hạn / quá hạn.
    const obligations = await this.prisma.contractObligation.findMany({
      where: {
        status: { in: ['OPEN', 'IN_PROGRESS'] },
        dueDate: { lte: soon },
        contract: { deletedAt: null, status: { notIn: ['LIQUIDATED', 'CANCELLED'] } },
      },
      select: {
        id: true,
        tenantId: true,
        title: true,
        dueDate: true,
        assignee: owner,
        contract: { select: { id: true, code: true, owner, createdBy: owner } },
      },
    });
    for (const o of obligations) {
      const overdue = o.dueDate! < t;
      sent += await this.sendOnce(
        `obl:${o.id}:${overdue ? 'overdue' : 'due'}:${o.dueDate!.toISOString().slice(0, 10)}`,
        o.tenantId,
        o.assignee ?? o.contract.owner ?? o.contract.createdBy,
        `[SAHA eContract] ${overdue ? 'Quá hạn' : 'Sắp đến hạn'} nghĩa vụ – ${o.contract.code}`,
        `Nghĩa vụ "${o.title}" của hợp đồng ${o.contract.code}, hạn ${o.dueDate!.toISOString().slice(0, 10)}.\n${this.url(o.contract.id, 'lifecycle')}`,
        `/contracts/${o.contract.id}?tab=lifecycle`,
      );
    }
    return sent;
  }
}
