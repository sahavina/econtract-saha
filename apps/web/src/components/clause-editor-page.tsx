'use client';

import { CLAUSE_CATEGORIES, CLAUSE_CATEGORY_LABELS, type ClauseCategory } from '@saha/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Archive, Check, Loader2, Save, Send, Trash2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, type ConfirmState } from '@/components/confirm-dialog';
import { ContractEditor } from '@/components/contract-editor';
import { PageHeader } from '@/components/page-header';
import { ClauseStatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import type { ClauseDetail } from '@/lib/types';

interface Draft {
  code: string;
  title: string;
  category: ClauseCategory;
  contentHtml: string;
}

/** Tạo mới (clause = undefined) hoặc xem/sửa/duyệt một điều khoản. */
export function ClauseEditorPage({ clause }: { clause?: ClauseDetail }) {
  const { can, user } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const initial: Draft = clause
    ? { code: clause.code, title: clause.title, category: clause.category, contentHtml: clause.contentHtml }
    : { code: '', title: '', category: 'OTHER', contentHtml: '' };
  const [draft, setDraft] = useState<Draft>(initial);
  const [saved, setSaved] = useState<Draft>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  const isNew = !clause;
  const manage = can('template.manage');
  const editable = manage && (isNew || ['DRAFT', 'REJECTED', 'APPROVED'].includes(clause.status));
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const canApprove = !!clause && can('clause.approve') && clause.status === 'PENDING_APPROVAL';
  const isAuthor = clause?.createdBy.id === user?.id;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['clauses'] });
    if (clause) qc.invalidateQueries({ queryKey: ['clause', clause.id] });
  };

  const save = useMutation({
    meta: { silent: true },
    mutationFn: () =>
      isNew
        ? api<ClauseDetail>('/clauses', { method: 'POST', body: draft })
        : api<ClauseDetail>(`/clauses/${clause.id}`, {
            method: 'PATCH',
            body: { title: draft.title, category: draft.category, contentHtml: draft.contentHtml },
          }),
    onSuccess: (c) => {
      setErrors({});
      refresh();
      if (isNew) {
        toast.success('Đã tạo điều khoản nháp');
        router.replace(`/clauses/${c.id}`);
        return;
      }
      const next = { ...draft, contentHtml: c.contentHtml };
      setDraft(next);
      setSaved(next);
      toast.success(c.version !== clause.version ? `Đã tạo phiên bản v${c.version} (cần duyệt lại)` : 'Đã lưu điều khoản');
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        setErrors(Object.fromEntries(err.errors.map((e) => [e.field, e.message])));
        if (err.status === 409) setErrors({ code: 'Mã điều khoản đã tồn tại' });
      }
      toast.error(err instanceof Error ? err.message : 'Lưu thất bại');
    },
  });

  const action = useMutation({
    mutationFn: ({ op, note }: { op: 'submit' | 'approve' | 'reject' | 'archive' | 'delete'; note?: string }) =>
      op === 'delete'
        ? api<undefined>(`/clauses/${clause!.id}`, { method: 'DELETE' })
        : api(`/clauses/${clause!.id}/${op}`, { method: 'POST', body: op === 'reject' ? { note } : undefined }),
    onSuccess: (_r, { op }) => {
      refresh();
      const msg = { submit: 'Đã gửi duyệt', approve: 'Đã phê duyệt điều khoản', reject: 'Đã từ chối điều khoản', archive: 'Đã lưu trữ', delete: 'Đã xóa điều khoản' }[op];
      toast.success(msg);
      if (op === 'delete') router.push('/clauses');
    },
  });

  const onSave = () => {
    if (clause?.status === 'APPROVED') {
      setConfirm({
        title: `Tạo phiên bản v${clause.version + 1}?`,
        description: 'Điều khoản đã duyệt sẽ chuyển về Nháp và cần phê duyệt lại trước khi dùng. Phiên bản đã duyệt cũ vẫn lưu trong lịch sử.',
        confirmLabel: 'Tạo phiên bản mới',
        onConfirm: () => save.mutateAsync().then(() => undefined),
      });
    } else save.mutate();
  };

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Thư viện điều khoản', href: '/clauses' }, { label: clause?.code ?? 'Thêm mới' }]}
        title={
          clause ? (
            <span className="flex flex-wrap items-center gap-2">
              {clause.title} <ClauseStatusBadge status={clause.status} />
            </span>
          ) : (
            'Thêm điều khoản'
          )
        }
        description={clause && `${clause.code} · v${clause.version} · Soạn bởi ${clause.createdBy.fullName}${clause.approvedBy ? ` · Duyệt bởi ${clause.approvedBy.fullName}` : ''}`}
        actions={
          <>
            {editable && (
              <Button onClick={onSave} disabled={(!isNew && !dirty) || save.isPending}>
                {save.isPending ? <Loader2 className="animate-spin" /> : <Save />} {isNew ? 'Tạo nháp' : 'Lưu'}
              </Button>
            )}
            {clause && manage && (clause.status === 'DRAFT' || clause.status === 'REJECTED') && (
              <Button variant="outline" disabled={dirty || action.isPending} title={dirty ? 'Hãy lưu trước khi gửi duyệt' : undefined} onClick={() => action.mutate({ op: 'submit' })}>
                <Send /> Gửi duyệt
              </Button>
            )}
            {canApprove && (
              <>
                <Button disabled={isAuthor || action.isPending} title={isAuthor ? 'Không được tự duyệt điều khoản do mình soạn' : undefined} onClick={() => action.mutate({ op: 'approve' })}>
                  <Check /> Phê duyệt
                </Button>
                <Button variant="outline" disabled={action.isPending} onClick={() => setRejecting(true)}>
                  <X /> Từ chối
                </Button>
              </>
            )}
            {clause && manage && clause.status === 'APPROVED' && (
              <Button variant="outline" onClick={() => setConfirm({ title: 'Lưu trữ điều khoản?', description: 'Điều khoản sẽ không còn chèn được vào hợp đồng mới.', onConfirm: () => action.mutateAsync({ op: 'archive' }).then(() => undefined) })}>
                <Archive /> Lưu trữ
              </Button>
            )}
            {clause && manage && (clause.status === 'DRAFT' || clause.status === 'REJECTED') && (
              <Button variant="destructive" onClick={() => setConfirm({ title: `Xóa điều khoản ${clause.code}?`, destructive: true, confirmLabel: 'Xóa', onConfirm: () => action.mutateAsync({ op: 'delete' }).then(() => undefined) })}>
                <Trash2 /> Xóa
              </Button>
            )}
          </>
        }
      />

      {clause?.status === 'REJECTED' && clause.reviewNote && (
        <div role="alert" className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Lý do từ chối: {clause.reviewNote}
        </div>
      )}
      {clause?.status === 'PENDING_APPROVAL' && (
        <div role="status" className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          Điều khoản đang chờ phê duyệt nên tạm khóa chỉnh sửa.
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-3">
          <div className="grid gap-3 md:grid-cols-[180px_1fr_200px]">
            <div className="space-y-1.5">
              <Label htmlFor="cl-code">Mã điều khoản *</Label>
              <Input id="cl-code" disabled={!isNew} value={draft.code} onChange={(e) => set({ code: e.target.value })} aria-invalid={!!errors.code} />
              {errors.code && <p className="text-xs text-destructive">{errors.code}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cl-title">Tiêu đề *</Label>
              <Input id="cl-title" disabled={!editable} value={draft.title} onChange={(e) => set({ title: e.target.value })} aria-invalid={!!errors.title} />
              {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Nhóm</Label>
              <Select value={draft.category} onValueChange={(v) => set({ category: v as ClauseCategory })} disabled={!editable}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CLAUSE_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CLAUSE_CATEGORY_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {errors.contentHtml && <p className="text-xs text-destructive">{errors.contentHtml}</p>}
          {editable ? (
            <ContractEditor value={draft.contentHtml} onChange={(html) => set({ contentHtml: html })} />
          ) : (
            <div className="rounded-lg border px-8 py-6">
              {/* Nội dung đã được backend làm sạch. */}
              <div className="contract-content" dangerouslySetInnerHTML={{ __html: clause?.contentHtml ?? '' }} />
            </div>
          )}
        </div>

        {clause && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Phiên bản đã duyệt</CardTitle>
              <CardDescription>Lưu lại mỗi lần điều khoản được phê duyệt.</CardDescription>
            </CardHeader>
            <CardContent>
              {clause.versions.length === 0 ? (
                <p className="text-sm text-muted-foreground">Chưa có phiên bản được duyệt.</p>
              ) : (
                <ul className="space-y-3">
                  {clause.versions.map((v) => (
                    <li key={v.id} className="rounded-md border p-3 text-sm">
                      <p className="font-medium">
                        v{v.version} · {v.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Duyệt bởi {v.createdBy.fullName} · {formatDateTime(v.createdAt)}
                      </p>
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-primary">Xem nội dung</summary>
                        <div className="contract-content mt-2 text-xs" dangerouslySetInnerHTML={{ __html: v.contentHtml }} />
                      </details>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={rejecting} onOpenChange={setRejecting}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Từ chối điều khoản</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="reject-note">Lý do từ chối *</Label>
            <Textarea id="reject-note" rows={4} value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(false)}>
              Hủy
            </Button>
            <Button
              variant="destructive"
              disabled={!rejectNote.trim() || action.isPending}
              onClick={() =>
                action.mutate(
                  { op: 'reject', note: rejectNote.trim() },
                  {
                    onSuccess: () => {
                      setRejecting(false);
                      setRejectNote('');
                    },
                  },
                )
              }
            >
              Từ chối
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}
