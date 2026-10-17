import { CONTRACT_STATUS_LABELS, type ContractStatus } from '@saha/shared';
import { cn } from '@/lib/utils';

const TONE: Record<ContractStatus, string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  PENDING_APPROVAL: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  APPROVED: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
  PENDING_SIGNATURE: 'bg-violet-500/15 text-violet-700 dark:text-violet-400',
  SIGNED: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  ACTIVE: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  EXPIRED: 'bg-rose-500/15 text-rose-700 dark:text-rose-400',
  LIQUIDATED: 'bg-slate-500/15 text-slate-700 dark:text-slate-300',
  CANCELLED: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  ARCHIVED: 'bg-slate-500/15 text-slate-700 dark:text-slate-300',
};

export function ContractStatusBadge({ status, className }: { status: ContractStatus; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap', TONE[status], className)}>
      {CONTRACT_STATUS_LABELS[status]}
    </span>
  );
}
