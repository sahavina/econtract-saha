import { Check } from 'lucide-react';
import { Fragment } from 'react';
import { cn } from '@/lib/utils';

const STEPS = ['Thông tin chung', 'Nội dung & tài liệu', 'Phê duyệt & ký', 'Xác nhận'];

/**
 * Các bước lập hồ sơ (chỉ để định hướng, không bấm được): trang tạo mới luôn ở bước 1;
 * nội dung, phê duyệt và ký làm ở trang chi tiết sau khi lưu.
 */
export function CreateSteps({ current = 0, className }: { current?: number; className?: string }) {
  return (
    <ol className={cn('mb-6 flex items-center gap-2 px-1 sm:gap-3 lg:px-16', className)} aria-label="Các bước lập hồ sơ">
      {STEPS.map((title, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <Fragment key={title}>
            {i > 0 && <li aria-hidden className={cn('h-px min-w-3 flex-1', done || active ? 'bg-primary/60' : 'bg-border')} />}
            <li className="flex shrink-0 items-center gap-2.5" aria-current={active ? 'step' : undefined}>
              <span
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold',
                  active && 'border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/30',
                  done && 'border-primary bg-primary/10 text-primary',
                  !active && !done && 'border-muted-foreground/40 bg-card text-muted-foreground',
                )}
              >
                {done ? <Check className="size-4" /> : i + 1}
              </span>
              <span className={cn('text-sm whitespace-nowrap', active ? 'font-semibold text-primary' : 'hidden text-muted-foreground sm:inline')}>{title}</span>
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}
