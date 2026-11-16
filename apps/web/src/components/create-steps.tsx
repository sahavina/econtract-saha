import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

const STEPS = [
  { title: 'Thông tin chung', sub: 'Thông tin, các bên, giá trị' },
  { title: 'Nội dung & tài liệu', sub: 'Soạn nội dung, đính kèm' },
  { title: 'Phê duyệt & ký', sub: 'Duyệt nội bộ, ký điện tử' },
  { title: 'Hiệu lực', sub: 'Theo dõi thực hiện' },
];

/**
 * Các bước của một hồ sơ hợp đồng/đơn hàng (chỉ để định hướng, không bấm được):
 * trang tạo mới luôn ở bước 1; các bước sau làm ở trang chi tiết sau khi lưu nháp.
 */
export function CreateSteps({ current = 0, className }: { current?: number; className?: string }) {
  return (
    <ol className={cn('mb-5 grid grid-cols-4 gap-2 rounded-xl border bg-card p-3 shadow-xs sm:p-4', className)} aria-label="Các bước lập hồ sơ">
      {STEPS.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s.title} className="relative flex min-w-0 flex-col items-center gap-1.5 text-center sm:flex-row sm:gap-3 sm:text-left" aria-current={active ? 'step' : undefined}>
            {i > 0 && <span aria-hidden className={cn('absolute top-4 right-[calc(50%+1.25rem)] left-[calc(-50%+1.25rem)] h-px sm:hidden', done || active ? 'bg-primary' : 'bg-border')} />}
            <span
              className={cn(
                'relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold',
                active && 'border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/30',
                done && 'border-primary bg-primary/10 text-primary',
                !active && !done && 'bg-muted text-muted-foreground',
              )}
            >
              {done ? <Check className="size-4" /> : i + 1}
            </span>
            <span className="min-w-0">
              <span className={cn('block text-xs leading-tight font-medium sm:text-sm', active ? 'text-primary' : !done && 'text-muted-foreground')}>{s.title}</span>
              <span className="hidden truncate text-xs text-muted-foreground sm:block">{s.sub}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
