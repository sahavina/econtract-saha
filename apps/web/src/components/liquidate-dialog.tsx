'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError } from '@/lib/api';

/** Thanh lý hợp đồng; nếu còn thanh toán/nghĩa vụ dang dở, máy chủ trả cảnh báo để người dùng xác nhận. */
export function LiquidateDialog({ contractId, code, open, onClose }: { contractId: string; code: string; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [warnings, setWarnings] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const liquidate = useMutation({
    meta: { silent: true },
    mutationFn: (force: boolean) => api<undefined>(`/contracts/${contractId}/liquidate`, { method: 'POST', body: { liquidationDate: date, note, force } }),
    onSuccess: () => {
      toast.success(`Đã thanh lý hợp đồng ${code}`);
      qc.invalidateQueries({ queryKey: ['contract', contractId] });
      qc.invalidateQueries({ queryKey: ['contracts'] });
      setWarnings(null);
      onClose();
    },
    onError: (err) => {
      if (err instanceof ApiError && Array.isArray(err.body.warnings)) {
        setWarnings(err.body.warnings as string[]);
        setError(null);
      } else setError(err instanceof ApiError ? err.errors.map((e) => e.message).join('; ') || err.message : 'Thanh lý thất bại');
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setWarnings(null);
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Thanh lý hợp đồng {code}</DialogTitle>
          <DialogDescription>Sau khi thanh lý, hợp đồng không thể cập nhật phụ lục, nghĩa vụ hay thanh toán.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="liq-date">Ngày thanh lý</Label>
          <Input id="liq-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="liq-note">Nội dung / biên bản thanh lý *</Label>
          <Textarea id="liq-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {warnings && (
          <div role="alert" className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
            <p className="mb-1 flex items-center gap-1.5 font-medium">
              <AlertTriangle className="size-4" /> Hợp đồng còn việc chưa hoàn tất:
            </p>
            <ul className="list-disc pl-6">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        )}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button variant="destructive" disabled={!note.trim() || liquidate.isPending} onClick={() => liquidate.mutate(!!warnings)}>
            {liquidate.isPending && <Loader2 className="animate-spin" />} {warnings ? 'Vẫn thanh lý' : 'Thanh lý'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
