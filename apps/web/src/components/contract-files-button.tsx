'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Paperclip } from 'lucide-react';
import { useState } from 'react';
import { ContractDocumentsTab } from '@/components/contract-documents-tab';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/lib/auth';
import type { ContractListItem } from '@/lib/types';

const LOCKED_STATUS = ['PENDING_APPROVAL', 'PENDING_SIGNATURE'];

/** Đính kèm và xem tài liệu của một hợp đồng/đơn ngay từ danh sách (cùng dữ liệu với tab Tài liệu của hồ sơ). */
export function ContractFilesButton({ contract: c }: { contract: ContractListItem }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const count = c._count?.documents ?? 0;
  const noun = c.kind === 'ORDER' ? 'đơn' : 'hợp đồng';
  const active = !c.deletedAt && !c.archivedAt && !LOCKED_STATUS.includes(c.status) && can('contract.update');

  const close = () => {
    setOpen(false);
    // Cập nhật số tệp trên danh sách.
    qc.invalidateQueries({ queryKey: ['contracts'] });
    qc.invalidateQueries({ queryKey: ['orders'] });
  };

  return (
    <>
      <Button variant="ghost" size="sm" className="px-1.5" aria-label={`Tài liệu ${c.code}: ${count} tệp`} title="Đính kèm, xem tài liệu" onClick={() => setOpen(true)}>
        <Paperclip />
        {count > 0 && <span className="tabular-nums">{count}</span>}
      </Button>
      <Dialog open={open} onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Tài liệu {c.code}</DialogTitle>
            <DialogDescription>
              {c.title}
              {!active && can('contract.update') && ` · ${noun === 'đơn' ? 'Đơn' : 'Hợp đồng'} đang chờ duyệt/ký hoặc đã lưu trữ nên chưa đính kèm được.`}
            </DialogDescription>
          </DialogHeader>
          {open && <ContractDocumentsTab contractId={c.id} canManage={active} canDelete={active && c.signatureStatus !== 'COMPLETED'} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
