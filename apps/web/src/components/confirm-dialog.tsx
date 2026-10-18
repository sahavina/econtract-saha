'use client';

import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface ConfirmState {
  title: string;
  description?: string;
  confirmLabel?: string;
  destructive?: boolean;
  /** Xác nhận lần hai cho thao tác không hoàn tác được: phải gõ đúng chuỗi này mới bấm được nút xác nhận. */
  typeToConfirm?: string;
  onConfirm: () => void | Promise<void>;
}

/** Modal xác nhận cho hành động quan trọng. Truyền `state = null` để đóng. */
export function ConfirmDialog({ state, onClose }: { state: ConfirmState | null; onClose: () => void }) {
  return (
    <AlertDialog open={!!state} onOpenChange={(open) => !open && onClose()}>
      {/* Nội dung bị gỡ khi đóng ⇒ ô gõ xác nhận tự làm mới cho lần mở sau. */}
      <AlertDialogContent>{state && <ConfirmContent state={state} onClose={onClose} />}</AlertDialogContent>
    </AlertDialog>
  );
}

function ConfirmContent({ state, onClose }: { state: ConfirmState; onClose: () => void }) {
  const [typed, setTyped] = useState('');
  const locked = !!state.typeToConfirm && typed.trim() !== state.typeToConfirm;
  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>{state.title}</AlertDialogTitle>
        {state.description && <AlertDialogDescription>{state.description}</AlertDialogDescription>}
      </AlertDialogHeader>
      {state.typeToConfirm && (
        <div className="space-y-1.5">
          <Label htmlFor="type-to-confirm">
            Gõ <span className="font-mono font-semibold">{state.typeToConfirm}</span> để xác nhận
          </Label>
          <Input id="type-to-confirm" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
        </div>
      )}
      <AlertDialogFooter>
        <AlertDialogCancel>Hủy</AlertDialogCancel>
        <AlertDialogAction
          variant={state.destructive ? 'destructive' : 'default'}
          disabled={locked}
          onClick={async () => {
            await state.onConfirm();
            onClose();
          }}
        >
          {state.confirmLabel ?? 'Xác nhận'}
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
  );
}
