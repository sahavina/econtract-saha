'use client';

import { isStrongPassword, PASSWORD_RULE_MESSAGE } from '@saha/shared';
import { useMutation } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/** Tự đổi mật khẩu; các phiên đăng nhập khác bị đăng xuất. */
export function ChangePasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { logout } = useAuth();
  const router = useRouter();
  const reset = () => {
    setCurrent('');
    setNext('');
    setConfirm('');
    setError(null);
  };
  const change = useMutation({
    meta: { silent: true },
    mutationFn: () => api<undefined>('/users/me/password', { method: 'POST', body: { currentPassword: current, newPassword: next } }),
    onSuccess: () => {
      toast.success('Đã đổi mật khẩu, vui lòng đăng nhập lại');
      reset();
      onClose();
      // Mọi phiên (kể cả phiên này) đã bị thu hồi ở máy chủ.
      void logout().finally(() => router.replace('/login'));
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Đổi mật khẩu thất bại'),
  });
  const submit = () => {
    if (!isStrongPassword(next)) return setError(PASSWORD_RULE_MESSAGE);
    if (next !== confirm) return setError('Mật khẩu nhập lại không khớp');
    setError(null);
    change.mutate();
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Đổi mật khẩu</DialogTitle>
          <DialogDescription>{PASSWORD_RULE_MESSAGE}. Bạn sẽ cần đăng nhập lại trên mọi thiết bị.</DialogDescription>
        </DialogHeader>
        <form
          id="change-pw"
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="pw-current">Mật khẩu hiện tại</Label>
            <Input id="pw-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pw-new">Mật khẩu mới</Label>
            <Input id="pw-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pw-confirm">Nhập lại mật khẩu mới</Label>
            <Input id="pw-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" form="change-pw" disabled={!current || !next || change.isPending}>
            {change.isPending && <Loader2 className="animate-spin" />} Đổi mật khẩu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
