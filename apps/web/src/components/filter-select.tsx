'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const ALL = '__all__';

/** Select dùng cho bộ lọc: giá trị rỗng = "Tất cả". */
export function FilterSelect({
  value,
  onChange,
  options,
  allLabel,
  className,
  ariaLabel,
  disabled,
}: {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  options: { value: string; label: string }[];
  allLabel: string;
  className?: string;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  return (
    <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? undefined : v)} disabled={disabled}>
      <SelectTrigger className={className ?? 'w-44'} aria-label={ariaLabel ?? allLabel}>
        <SelectValue placeholder={allLabel} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
