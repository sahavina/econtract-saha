import type { LucideIcon } from 'lucide-react';
import { StatusPill } from '@/components/list-ui';

/** Khung mục cấu hình: biểu tượng + tiêu đề + mô tả, nút/nhãn bên phải, thân bên dưới. */
export function SettingsSection({
  id,
  icon: Icon,
  title,
  description,
  action,
  children,
}: {
  id?: string;
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 overflow-hidden rounded-xl border bg-card shadow-[0_1px_3px_0_rgb(15_23_42/0.05),0_1px_2px_-1px_rgb(15_23_42/0.04)]">
      <header className="flex flex-wrap items-center gap-3 border-b px-5 py-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-[18px]" aria-hidden />
        </span>
        <div className="min-w-0 flex-1 basis-56">
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

/** Nhãn trạng thái kết nối của một tích hợp (Email/Odoo/MISA). */
export function IntegrationStatus({ configured, enabled, fallback }: { configured: boolean; enabled?: boolean; fallback?: string }) {
  if (!configured) return fallback ? <StatusPill tone="indigo">{fallback}</StatusPill> : <StatusPill tone="amber">Chưa cấu hình</StatusPill>;
  return enabled ? <StatusPill tone="green">Đang bật</StatusPill> : <StatusPill tone="gray">Đã tắt</StatusPill>;
}
