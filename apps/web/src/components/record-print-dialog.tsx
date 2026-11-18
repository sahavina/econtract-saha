'use client';

import { useQuery } from '@tanstack/react-query';
import { FileText, Printer } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { api, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { TemplateListItem } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * Mẫu biên bản (giao hàng, xác nhận đơn đặt hàng…): mã bắt đầu "BB" hoặc tên có "biên bản".
 * In từ hồ sơ có sẵn, không dùng làm nội dung khi lập hợp đồng/đơn.
 */
export const isRecordTemplate = (t: Pick<TemplateListItem, 'code' | 'name'>) => /^BB/i.test(t.code) || /biên bản/i.test(t.name);

/** Chọn mẫu biên bản rồi mở bản in của hồ sơ theo mẫu đó (tự điền thông tin đơn, hàng hóa, các bên). */
export function RecordPrintDialog({ contractId, onClose }: { contractId: string; onClose: () => void }) {
  const router = useRouter();
  const { can } = useAuth();
  const templates = useQuery({
    queryKey: ['templates', 'usable'],
    queryFn: () => api<Paginated<TemplateListItem>>('/templates', { query: { usable: true, pageSize: 100 } }),
  });
  const records = (templates.data?.items ?? []).filter(isRecordTemplate);
  const [picked, setPicked] = useState<string | null>(null);
  const selected = picked ?? records[0]?.id ?? null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>In biên bản</DialogTitle>
          <DialogDescription>Chọn mẫu biên bản; thông tin hồ sơ, các bên, hàng hóa được điền tự động. Ngày lập là ngày in.</DialogDescription>
        </DialogHeader>
        {templates.isPending ? (
          <Skeleton className="h-24" />
        ) : templates.isError ? (
          <p role="alert" className="text-sm text-destructive">
            Không tải được danh sách mẫu.
          </p>
        ) : records.length === 0 ? (
          <p className="rounded-md bg-muted px-3 py-2 text-sm">
            Chưa có mẫu biên bản đang sử dụng. Tạo mẫu trong Mẫu hợp đồng với mã bắt đầu bằng “BB” hoặc tên có “Biên bản”.
            {can('template.manage') && (
              <Link href="/templates" className="ml-1 text-primary underline-offset-2 hover:underline">
                Mở Mẫu hợp đồng
              </Link>
            )}
          </p>
        ) : (
          <ul role="radiogroup" aria-label="Mẫu biên bản" className="space-y-1.5">
            {records.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected === t.id}
                  onClick={() => setPicked(t.id)}
                  className={cn(
                    'flex w-full items-start gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors',
                    selected === t.id ? 'border-primary bg-primary/5' : 'hover:bg-muted',
                  )}
                >
                  <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span>
                    <span className="font-medium">{t.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {t.code} · phiên bản {t.version}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Đóng
          </Button>
          <Button disabled={!selected} onClick={() => selected && router.push(`/print/contracts/${contractId}?template=${selected}`)}>
            <Printer /> Mở bản in
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
