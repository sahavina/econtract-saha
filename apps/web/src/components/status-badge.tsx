import { CLAUSE_STATUS_LABELS, CONTRACT_STATUS_LABELS, type ContractStatus, TEMPLATE_STATUS_LABELS } from '@saha/shared';
import { cn } from '@/lib/utils';

/** Mỗi trạng thái hợp đồng một màu riêng (nền, chữ, viền, chấm) để nhìn danh sách phân biệt ngay. */
const TONE: Record<ContractStatus, { badge: string; dot: string }> = {
  DRAFT: { badge: 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300', dot: 'bg-slate-400' },
  PENDING_APPROVAL: { badge: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300', dot: 'bg-amber-500' },
  APPROVED: { badge: 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-300', dot: 'bg-sky-500' },
  PENDING_SIGNATURE: { badge: 'border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-300', dot: 'bg-violet-500' },
  SIGNED: { badge: 'border-teal-300 bg-teal-50 text-teal-800 dark:border-teal-700 dark:bg-teal-950 dark:text-teal-300', dot: 'bg-teal-500' },
  ACTIVE: { badge: 'border-green-300 bg-green-50 text-green-800 dark:border-green-700 dark:bg-green-950 dark:text-green-300', dot: 'bg-green-600' },
  EXPIRED: { badge: 'border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-700 dark:bg-orange-950 dark:text-orange-300', dot: 'bg-orange-500' },
  LIQUIDATED: { badge: 'border-indigo-300 bg-indigo-50 text-indigo-800 dark:border-indigo-700 dark:bg-indigo-950 dark:text-indigo-300', dot: 'bg-indigo-500' },
  CANCELLED: { badge: 'border-red-300 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-300', dot: 'bg-red-600' },
  ARCHIVED: { badge: 'border-stone-300 bg-stone-100 text-stone-600 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-300', dot: 'bg-stone-500' },
};

/** Nền cả dòng trong danh sách theo trạng thái (nhạt hơn nhãn, đậm hơn khi rê chuột). */
const ROW_TONE: Record<ContractStatus, string> = {
  DRAFT: 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 [&>td:first-child]:shadow-[inset_4px_0_0_var(--color-slate-400)]',
  PENDING_APPROVAL: 'bg-amber-100 hover:bg-amber-200 dark:bg-amber-950 dark:hover:bg-amber-900 [&>td:first-child]:shadow-[inset_4px_0_0_var(--color-amber-500)]',
  APPROVED: 'bg-sky-100 hover:bg-sky-200 dark:bg-sky-950 dark:hover:bg-sky-900 [&>td:first-child]:shadow-[inset_4px_0_0_var(--color-sky-500)]',
  PENDING_SIGNATURE: 'bg-violet-100 hover:bg-violet-200 dark:bg-violet-950 dark:hover:bg-violet-900 [&>td:first-child]:shadow-[inset_4px_0_0_var(--color-violet-500)]',
  SIGNED: 'bg-teal-100 hover:bg-teal-200 dark:bg-teal-950 dark:hover:bg-teal-900 [&>td:first-child]:shadow-[inset_4px_0_0_var(--color-teal-500)]',
  ACTIVE: 'bg-green-100 hover:bg-green-200 dark:bg-green-950 dark:hover:bg-green-900 [&>td:first-child]:shadow-[inset_4px_0_0_var(--color-green-600)]',
  EXPIRED: 'bg-orange-100 hover:bg-orange-200 dark:bg-orange-950 dark:hover:bg-orange-900 [&>td:first-child]:shadow-[inset_4px_0_0_var(--color-orange-500)]',
  LIQUIDATED: 'bg-indigo-100 hover:bg-indigo-200 dark:bg-indigo-950 dark:hover:bg-indigo-900 [&>td:first-child]:shadow-[inset_4px_0_0_var(--color-indigo-500)]',
  CANCELLED: 'bg-red-100 hover:bg-red-200 dark:bg-red-950 dark:hover:bg-red-900 [&>td:first-child]:shadow-[inset_4px_0_0_var(--color-red-600)]',
  ARCHIVED: 'bg-stone-200 hover:bg-stone-300 dark:bg-stone-900 dark:hover:bg-stone-800 [&>td:first-child]:shadow-[inset_4px_0_0_var(--color-stone-500)]',
};

export const contractRowTone = (status: ContractStatus) => ROW_TONE[status];

/** Chỉ vạch màu bên trái dòng theo trạng thái (danh sách nền trắng). */
export const contractRowAccent = (status: ContractStatus) => ROW_TONE[status].split(' ').filter((c) => c.startsWith('[&>td:first-child]')).join(' ');

export function ContractStatusBadge({ status, className }: { status: ContractStatus; className?: string }) {
  const tone = TONE[status];
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap', tone.badge, className)}>
      <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', tone.dot)} />
      {CONTRACT_STATUS_LABELS[status]}
    </span>
  );
}

const TEMPLATE_TONE: Record<keyof typeof TEMPLATE_STATUS_LABELS, string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  ACTIVE: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  ARCHIVED: 'bg-slate-500/15 text-slate-700 dark:text-slate-300',
};

export function TemplateStatusBadge({ status }: { status: keyof typeof TEMPLATE_STATUS_LABELS }) {
  return (
    <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap', TEMPLATE_TONE[status])}>
      {TEMPLATE_STATUS_LABELS[status]}
    </span>
  );
}

const CLAUSE_TONE: Record<keyof typeof CLAUSE_STATUS_LABELS, string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  PENDING_APPROVAL: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  APPROVED: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  REJECTED: 'bg-rose-500/15 text-rose-700 dark:text-rose-400',
  ARCHIVED: 'bg-slate-500/15 text-slate-700 dark:text-slate-300',
};

export function ClauseStatusBadge({ status }: { status: keyof typeof CLAUSE_STATUS_LABELS }) {
  return (
    <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap', CLAUSE_TONE[status])}>
      {CLAUSE_STATUS_LABELS[status]}
    </span>
  );
}

/** Màu vạch trạng thái (biến màu Tailwind) – dùng cho thẻ hợp đồng trên điện thoại. */
export const contractAccentColor = (status: ContractStatus) => ROW_TONE[status].match(/var\(--color-[a-z]+-\d+\)/)?.[0] ?? 'transparent';
