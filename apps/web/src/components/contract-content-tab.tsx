'use client';

import { buildTemplateValues, renderTemplate, variableLabel } from '@saha/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, Eye, FileCheck2, Loader2, Pencil, Printer, Save } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ContractEditor } from '@/components/contract-editor';
import { MainDocumentFrame } from '@/components/document-preview-dialog';
import { EmptyState } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { ContractDetail, ContractDocument } from '@/lib/types';

const AUTOSAVE_MS = 2000;

type SaveState = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved'; at: string } | { kind: 'error'; message: string };

/** Nút mở trang Sửa hợp đồng để bổ sung dữ liệu còn thiếu (thông tin chung / các bên). */
function FillButton({ contractId, variant }: { contractId: string; variant: 'destructive' | 'outline' }) {
  return (
    <Button asChild size="sm" variant={variant} className="shrink-0">
      <Link href={`/contracts/${contractId}/edit`}>
        <Pencil /> Bổ sung ngay
      </Link>
    </Button>
  );
}

function A4Preview({ contract, html, editable }: { contract: ContractDetail; html: string; editable: boolean }) {
  const rendered = useMemo(() => renderTemplate(html, buildTemplateValues(contract)), [contract, html]);
  // Biến bắt buộc của mẫu: chưa có dữ liệu (dù có hay không có trong nội dung).
  const values = useMemo(() => buildTemplateValues(contract), [contract]);
  const requiredMissing = (contract.template?.requiredVariables ?? []).filter((k) => !values[k]);
  const optionalMissing = rendered.missing.filter((k) => !requiredMissing.includes(k));
  return (
    <div className="space-y-3">
      {requiredMissing.length > 0 && (
        <div role="alert" className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p className="flex-1">
            Thiếu dữ liệu bắt buộc theo mẫu {contract.template?.name}: <strong>{requiredMissing.map(variableLabel).join(', ')}</strong>. Cần bổ sung trước khi gửi
            duyệt/ký.
          </p>
          {editable && <FillButton contractId={contract.id} variant="destructive" />}
        </div>
      )}
      {(optionalMissing.length > 0 || rendered.unknown.length > 0) && (
        <div role="status" className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div className="flex-1">
            {optionalMissing.length > 0 && <p>Chưa có dữ liệu (để trống trong hợp đồng): {optionalMissing.map(variableLabel).join(', ')}</p>}
            {rendered.unknown.length > 0 && <p>Biến không hỗ trợ: {rendered.unknown.map((k) => `{{${k}}}`).join(', ')}</p>}
          </div>
          {editable && optionalMissing.length > 0 && requiredMissing.length === 0 && <FillButton contractId={contract.id} variant="outline" />}
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
  const docs = useQuery({ queryKey: ['contract', contract.id, 'documents'], queryFn: () => api<ContractDocument[]>(`/contracts/${contract.id}/documents`) });
  const mainDoc = docs.data?.find((d) => d.kind === 'MAIN');
  // Có bản gốc (lập từ file) thì mặc định xem bản gốc, giữ đúng định dạng file khách gửi.
  const [view, setView] = useState<'original' | 'content' | null>(null);
  const showOriginal = !!mainDoc && (view ?? 'original') === 'original';
  const [mode, setMode] = useState<'edit' | 'preview'>(editable ? 'edit' : 'preview');
  const [draft, setDraft] = useState(contract.contentHtml ?? '');
  const [state, setState] = useState<SaveState>({ kind: 'idle' });
  const [saved, setSaved] = useState(contract.contentHtml ?? '');
  const dirty = draft !== saved;

  const openPrint = async () => {
    const url = `/print/contracts/${contract.id}`;
    if (!dirty) {
      window.open(url, '_blank', 'noopener');
      return;
    }
    // Mở tab ngay trong thao tác bấm (tránh bị chặn popup), lưu xong mới điều hướng tới trang in.
    const win = window.open('', '_blank');
    try {
      await save.mutateAsync(draft);
      if (win) {
        win.opener = null;
        win.location.href = url;
      }
    } catch {
      win?.close();
    }
  };

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
      qc.invalidateQueries({ queryKey: ['contract', contract.id, 'revisions'] });
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
      {mainDoc && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border p-0.5">
            <Button size="sm" variant={showOriginal ? 'secondary' : 'ghost'} onClick={() => setView('original')}>
              <FileCheck2 /> Bản gốc
            </Button>
            <Button size="sm" variant={showOriginal ? 'ghost' : 'secondary'} onClick={() => setView('content')}>
              <Pencil /> Nội dung sửa được
            </Button>
          </div>
          <span className="text-xs text-muted-foreground">
            {showOriginal ? `${mainDoc.fileName} – giữ nguyên định dạng file tải lên; dùng nút in, tải trên khung xem.` : 'Nội dung chép từ file để sửa trong hệ thống; định dạng có thể khác bản gốc.'}
          </span>
        </div>
      )}
      {showOriginal ? (
        <MainDocumentFrame contractId={contract.id} doc={mainDoc} />
      ) : (
      <>
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
            // Mở trang in riêng ở tab mới; nội dung chưa lưu được lưu trước để bản in khớp bản đang soạn.
            <Button size="sm" variant="outline" disabled={save.isPending} onClick={openPrint}>
              <Printer /> In / Tải PDF
            </Button>
          )}
        </div>
      </div>

      {contract.template && (
        <p className="text-xs text-muted-foreground">
          Lập từ mẫu <span className="font-medium">{contract.template.name}</span> (phiên bản {contract.templateVersion}).
        </p>
      )}
      {!editable && !html ? (
        <EmptyState title="Hợp đồng chưa có nội dung" description="Nội dung chỉ được soạn khi hợp đồng ở trạng thái Nháp." />
      ) : mode === 'edit' && editable ? (
        <ContractEditor value={draft} onChange={setDraft} enableClauses />
      ) : (
        <A4Preview contract={contract} html={html} editable={editable} />
      )}
      </>
      )}
    </div>
  );
}
