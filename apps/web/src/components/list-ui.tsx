'use client';

/**
 * Khối dựng dùng chung cho các trang danh sách (báo giá, đề nghị thanh toán, phiếu xuất kho, phiếu gửi hàng, đối tác…):
 * khung trắng chứa thanh lọc + bảng, ô tìm có biểu tượng, khoảng ngày gọn, nhãn trạng thái màu, ô tiêu đề có biểu tượng,
 * thẻ hiển thị trên điện thoại.
 */
import { CalendarRange, type LucideIcon, Search } from 'lucide-react';
import Link from 'next/link';
import { EmptyState, ErrorState } from '@/components/page-header';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { TableHead } from '@/components/ui/table';
import { cn } from '@/lib/utils';

export type Tone = 'gray' | 'amber' | 'sky' | 'violet' | 'green' | 'red' | 'orange' | 'indigo' | 'teal';

const TONE: Record<Tone, { pill: string; dot: string }> = {
  gray: { pill: 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300', dot: 'bg-slate-400' },
  amber: { pill: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300', dot: 'bg-amber-500' },
  sky: { pill: 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-300', dot: 'bg-sky-500' },
  violet: { pill: 'border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-300', dot: 'bg-violet-500' },
  green: { pill: 'border-green-300 bg-green-50 text-green-800 dark:border-green-700 dark:bg-green-950 dark:text-green-300', dot: 'bg-green-600' },
  red: { pill: 'border-red-300 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-300', dot: 'bg-red-600' },
  orange: { pill: 'border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-700 dark:bg-orange-950 dark:text-orange-300', dot: 'bg-orange-500' },
  indigo: { pill: 'border-indigo-300 bg-indigo-50 text-indigo-800 dark:border-indigo-700 dark:bg-indigo-950 dark:text-indigo-300', dot: 'bg-indigo-500' },
  teal: { pill: 'border-teal-300 bg-teal-50 text-teal-800 dark:border-teal-700 dark:bg-teal-950 dark:text-teal-300', dot: 'bg-teal-500' },
};

/** Nhãn trạng thái dạng viên thuốc có chấm màu. */
export function StatusPill({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap', TONE[tone].pill, className)}>
      <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', TONE[tone].dot)} />
      {children}
    </span>
  );
}

/** Khung trắng của danh sách: thanh lọc phía trên, bảng/thẻ ở giữa. */
export function ListCard({ toolbar, children, className }: { toolbar?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-hidden rounded-xl border bg-card shadow-[0_1px_3px_0_rgb(15_23_42/0.05)]', className)}>
      {toolbar && <div className="flex flex-wrap items-center gap-2 border-b px-3 py-3">{toolbar}</div>}
      {children}
    </div>
  );
}

/** Ô tìm kiếm có biểu tượng kính lúp, co giãn theo chiều ngang. */
export function SearchBox({ value, onChange, placeholder, ariaLabel }: { value: string; onChange: (v: string) => void; placeholder: string; ariaLabel?: string }) {
  return (
    <div className="relative min-w-0 flex-1 basis-56 md:max-w-sm">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input className="h-9 pl-9" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} aria-label={ariaLabel ?? placeholder} />
    </div>
  );
}

/** Khoảng ngày gọn trong một ô (từ – đến). */
export function DateRange({ from, to, onFrom, onTo, title = 'Lọc theo ngày' }: { from: string; to: string; onFrom: (v: string) => void; onTo: (v: string) => void; title?: string }) {
  return (
    <div className="flex h-9 items-center gap-1.5 rounded-lg border border-input bg-card px-2.5 shadow-xs max-md:w-full" title={title}>
      <CalendarRange className="size-4 shrink-0 text-muted-foreground" />
      <input type="date" aria-label="Từ ngày" className="min-w-0 flex-1 bg-transparent text-sm outline-none md:w-[7.4rem] md:flex-none" value={from} onChange={(e) => onFrom(e.target.value)} />
      <span className="text-muted-foreground">–</span>
      <input type="date" aria-label="Đến ngày" className="min-w-0 flex-1 bg-transparent text-sm outline-none md:w-[7.4rem] md:flex-none" value={to} onChange={(e) => onTo(e.target.value)} />
    </div>
  );
}

/** Ô đầu dòng: biểu tượng + tiêu đề đậm + dòng phụ (mã số). */
export function TitleCell({ icon: Icon, title, sub, href }: { icon: LucideIcon; title: React.ReactNode; sub?: React.ReactNode; href?: string }) {
  const body = (
    <>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-[18px]" />
      </span>
      <span className="min-w-0">
        <span className="line-clamp-2 leading-snug font-semibold text-foreground group-hover:text-primary">{title}</span>
        {sub && <span className="line-clamp-1 block text-xs text-muted-foreground" title={typeof sub === 'string' ? sub : undefined}>{sub}</span>}
      </span>
    </>
  );
  const cls = 'group flex max-w-[20rem] min-w-48 items-center gap-3 whitespace-normal';
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <span className={cls}>{body}</span>
  );
}

/** Tiêu đề cột theo kiểu chung (chữ thường, đậm vừa). */
export function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <TableHead className={cn('h-11 text-[13px] tracking-normal text-foreground/80 normal-case', className)}>{children}</TableHead>;
}

/** Liên kết khi có href, ngược lại khối thường. */
function Wrap({ href, className, children }: { href?: string; className: string; children: React.ReactNode }) {
  return href ? (
    <Link href={href} className={className}>
      {children}
    </Link>
  ) : (
    <div className={className}>{children}</div>
  );
}

/** Thẻ một bản ghi trên điện thoại. */
export function MobileCard({
  href,
  title,
  sub,
  status,
  children,
  actions,
  footer,
}: {
  /** Không có ⇒ thẻ không bấm được (vd danh mục sửa bằng hộp thoại). */
  href?: string;
  title: React.ReactNode;
  sub?: React.ReactNode;
  status?: React.ReactNode;
  children?: React.ReactNode;
  /** Nút gọn bên phải (vd menu "…"). */
  actions?: React.ReactNode;
  /** Hàng nút bên dưới thông tin (khi có nhiều nút). */
  footer?: React.ReactNode;
}) {
  return (
    <li className="px-4 py-3">
      <div className="flex items-start gap-2">
        <Wrap href={href} className="block min-w-0 flex-1 space-y-1.5">
          <span className="flex items-start justify-between gap-2">
            <span className="min-w-0 flex-1">
              <span className="line-clamp-2 leading-snug font-semibold">{title}</span>
              {sub && <span className="block text-xs text-muted-foreground">{sub}</span>}
            </span>
            {status && <span className="shrink-0">{status}</span>}
          </span>
          {children && <span className="block text-sm">{children}</span>}
        </Wrap>
        {actions && <span className="-mr-2 shrink-0">{actions}</span>}
      </div>
      {footer && <div className="-mr-2 -mb-1 flex justify-end">{footer}</div>}
    </li>
  );
}

/** Trạng thái tải / lỗi / rỗng bên trong khung danh sách. */
export function ListState({ query, empty }: { query: { isError: boolean; error: unknown; refetch: () => unknown; data?: { items: unknown[] } }; empty: { title: string; description?: string; action?: React.ReactNode } }) {
  if (query.isError)
    return (
      <div className="p-4">
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </div>
    );
  if (!query.data)
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-11" />
        ))}
      </div>
    );
  if (!query.data.items.length)
    return (
      <div className="p-4">
        <EmptyState {...empty} />
      </div>
    );
  return null;
}

const AVATAR_TONES = ['bg-indigo-100 text-indigo-700', 'bg-sky-100 text-sky-700', 'bg-emerald-100 text-emerald-700', 'bg-violet-100 text-violet-700', 'bg-amber-100 text-amber-700', 'bg-rose-100 text-rose-700'];

/** Ảnh đại diện chữ viết tắt (màu cố định theo tên). */
export function InitialsAvatar({ name, className }: { name: string; className?: string }) {
  const parts = name.trim().split(/\s+/);
  const text = ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  const tone = AVATAR_TONES[Array.from(name).reduce((s, ch) => s + ch.charCodeAt(0), 0) % AVATAR_TONES.length];
  return <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold', tone, className)}>{text}</span>;
}

/** Ô người dùng: ảnh chữ viết tắt + họ tên + dòng phụ. */
export function PersonCell({ name, sub }: { name: string; sub?: React.ReactNode }) {
  return (
    <span className="flex min-w-48 items-center gap-3">
      <InitialsAvatar name={name} />
      <span className="min-w-0">
        <span className="block font-semibold">{name}</span>
        {sub && <span className="line-clamp-1 block text-xs text-muted-foreground">{sub}</span>}
      </span>
    </span>
  );
}
