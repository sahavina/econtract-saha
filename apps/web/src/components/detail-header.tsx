import { ChevronRight, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { Fragment } from 'react';
import type { Crumb } from '@/components/page-header';

/**
 * Đầu trang chi tiết (báo giá, đề nghị thanh toán, phiếu kho, phiếu gửi hàng…): đường dẫn, khối trắng gồm biểu tượng,
 * tiêu đề, trạng thái, dòng thông tin phụ, nút thao tác và dải ô tóm tắt – cùng kiểu với trang chi tiết hợp đồng.
 */
export function DetailHeader({
  crumbs,
  icon: Icon,
  title,
  status,
  meta,
  actions,
  facts,
  children,
}: {
  crumbs: Crumb[];
  icon: LucideIcon;
  title: React.ReactNode;
  status?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  /** Ô tóm tắt dưới tiêu đề (tối đa 4). */
  facts?: { label: string; value: React.ReactNode }[];
  /** Dòng ghi chú thêm dưới dải tóm tắt (vd đã gửi, đã chuyển thành đơn). */
  children?: React.ReactNode;
}) {
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-3 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        {crumbs.map((c, i) => (
          <Fragment key={i}>
            {i > 0 && <ChevronRight className="size-3.5" />}
            {c.href ? (
              <Link href={c.href} className="hover:text-foreground">
                {c.label}
              </Link>
            ) : (
              <span className="text-foreground">{c.label}</span>
            )}
          </Fragment>
        ))}
      </nav>
      <div className="mb-5 overflow-hidden rounded-xl border bg-card shadow-[0_1px_3px_0_rgb(15_23_42/0.05)]">
        <div className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 gap-3 sm:gap-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:size-12">
              <Icon className="size-6" />
            </span>
            <div className="min-w-0">
              <h1 className="text-xl leading-tight font-semibold tracking-tight break-words sm:text-2xl">{title}</h1>
              {(status || meta) && (
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  {status}
                  {meta}
                </div>
              )}
            </div>
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
        {!!facts?.length && (
          <dl className="grid grid-cols-2 border-t lg:grid-cols-4 [&>div]:p-4 [&>div]:sm:px-5 [&>div:nth-child(odd)]:border-r lg:[&>div]:border-r lg:[&>div:last-child]:border-r-0 max-lg:[&>div:nth-child(-n+2)]:border-b">
            {facts.map((f) => (
              <div key={f.label} className="min-w-0">
                <dt className="text-xs text-muted-foreground">{f.label}</dt>
                <dd className="mt-1 line-clamp-2 text-sm font-semibold break-words">{f.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {children && <div className="border-t bg-muted/30 px-4 py-2.5 text-sm text-muted-foreground sm:px-5">{children}</div>}
      </div>
    </>
  );
}
