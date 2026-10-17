'use client';

import { buildTemplateValues, renderTemplate } from '@saha/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, Eye, Loader2, Pencil, Printer, Save } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ContractEditor } from '@/components/contract-editor';
import { EmptyState } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { ContractDetail } from '@/lib/types';

const AUTOSAVE_MS = 2000;

type SaveState = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved'; at: string } | { kind: 'error'; message: string };

function A4Preview({ contract, html }: { contract: ContractDetail; html: string }) {
  const rendered = useMemo(() => renderTemplate(html, buildTemplateValues(contract)), [contract, html]);
  return (
    <div className="space-y-3">
      {(rendered.missing.length > 0 || rendered.unknown.length > 0) && (
        <div role="status" className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            {rendered.missing.length > 0 && <p>Biến chưa có dữ liệu: {rendered.missing.map((k) => `{{${k}}}`).join(', ')}</p>}
            {rendered.unknown.length > 0 && <p>Biến không hỗ trợ: {rendered.unknown.map((k) => `{{${k}}}`).join(', ')}</p>}
          </div>
        </div>
      )}
      <div className="print-area overflow-x-auto rounded-lg bg-muted/40 p-4">
        {/* HTML đã được backend làm sạch; giá trị biến được escape khi render. */}
        <div className="a4-page">
          <div className="contract-content" dangerouslySetInnerHTML={{ __html: rendered.html }} />
        </div>
      </div>
    </div>
  );
}

export function ContractContentTab({ contract, editable }: { contract: ContractDetail; editable: boolean }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<'edit' | 'preview'>(editable ? 'edit' : 'preview');
  const [draft, setDraft] = useState(contract.contentHtml ?? '');
  const [state, setState] = useState<SaveState>({ kind: 'idle' });
  const [saved, setSaved] = useState(contract.contentHtml ?? '');
  const dirty = draft !== saved;

  const save = useMutation({
    meta: { silent: true },
    mutationFn: (html: string) =>
      api<{ contentHtml: string | null; updatedAt: string }>(`/contracts/${contract.id}`, {
        method: 'PATCH',
        body: { contentHtml: html || null },
      }),
    onMutate: () => setState({ kind: 'saving' }),
    onSuccess: (res, html) => {
      setSaved(html);
      setState({ kind: 'saved', at: res.updatedAt });
      qc.setQueryData<ContractDetail>(['contract', contract.id], (old) =>
        old ? { ...old, contentHtml: res.contentHtml, updatedAt: res.updatedAt } : old,
      );
      qc.invalidateQueries({ queryKey: ['contract', contract.id, 'timeline'] });
    },
    onError: (err) => setState({ kind: 'error', message: err instanceof Error ? err.message : 'Lưu thất bại' }),
  });

  // Tự động lưu bản nháp sau khi ngừng gõ.
  useEffect(() => {
    if (!editable || !dirty) return;
    const t = setTimeout(() => save.mutate(draft), AUTOSAVE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, editable]);

  // Cảnh báo khi rời trang lúc còn thay đổi chưa lưu.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const html = editable ? draft : (contract.contentHtml ?? '');

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {editable && (
          <div className="inline-flex rounded-lg border p-0.5">
            <Button size="sm" variant={mode === 'edit' ? 'secondary' : 'ghost'} onClick={() => setMode('edit')}>
              <Pencil /> Soạn thảo
            </Button>
            <Button size="sm" variant={mode === 'preview' ? 'secondary' : 'ghost'} onClick={() => setMode('preview')}>
              <Eye /> Xem trước A4
            </Button>
          </div>
        )}
        {editable && (
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {state.kind === 'saving' && (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="size-3 animate-spin" /> Đang lưu…
              </span>
            )}
            {state.kind === 'saved' && !dirty && (
              <span className="inline-flex items-center gap-1">
                <Check className="size-3" /> Đã lưu lúc {formatDateTime(state.at)}
              </span>
            )}
            {state.kind === 'error' && <span className="text-destructive">Lỗi lưu: {state.message}</span>}
            {dirty && state.kind !== 'saving' && 'Có thay đổi chưa lưu'}
          </span>
        )}
        <div className="ml-auto flex gap-2">
          {editable && (
            <Button size="sm" variant="outline" disabled={!dirty || save.isPending} onClick={() => save.mutate(draft)}>
              <Save /> Lưu ngay
            </Button>
          )}
          {html && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setMode('preview');
                // Đợi bản xem trước render rồi mở hộp thoại in (chọn "Lưu dưới dạng PDF").
                setTimeout(() => window.print(), 100);
              }}
            >
              <Printer /> In / Lưu PDF
            </Button>
          )}
        </div>
      </div>

      {!editable && !html ? (
        <EmptyState title="Hợp đồng chưa có nội dung" description="Nội dung chỉ được soạn khi hợp đồng ở trạng thái Nháp." />
      ) : mode === 'edit' && editable ? (
        <ContractEditor value={draft} onChange={setDraft} />
      ) : (
        <A4Preview contract={contract} html={html} />
      )}
    </div>
  );
}
