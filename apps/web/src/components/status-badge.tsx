import { CLAUSE_STATUS_LABELS, CONTRACT_STATUS_LABELS, type ContractStatus, TEMPLATE_STATUS_LABELS } from '@saha/shared';
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
