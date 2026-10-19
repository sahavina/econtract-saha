'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, GitCompare, History, Loader2, RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, type ConfirmState } from '@/components/confirm-dialog';
import { EmptyState, ErrorState } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { type DiffBlock, diffContent } from '@/lib/content-diff';
import { formatDateTime } from '@/lib/format';

interface RevisionChange {
  field: string;
  label: string;
  before: string | null;
  after: string | null;
}

interface Revision {
  seq: number;
  kind: 'CREATE' | 'BASELINE' | 'EDIT' | 'RESTORE';
  authorName: string | null;
  changes: RevisionChange[];
  contentChanged: boolean;
  restoredFromSeq: number | null;
  startedAt: string;
  updatedAt: string;
}

interface RevisionContent {
  seq: number;
  contentSeq: number;
  contentHtml: string;
}

const KIND_LABEL: Record<Revision['kind'], string> = {
  CREATE: 'Tạo hợp đồng',
  BASELINE: 'Phiên bản gốc',
  EDIT: 'Chỉnh sửa',
  RESTORE: 'Khôi phục',
};

const fetchContent = (contractId: string, seq: number) => api<RevisionContent>(`/contracts/${contractId}/revisions/${seq}`);

function minutesBetween(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60_000);
}

/** Lịch sử chỉnh sửa: thông tin chung, các bên (cũ → mới) và các phiên bản nội dung (xem, so sánh, khôi phục). */
export function ContractRevisionsTab({ contractId, canRestore }: { contractId: string; canRestore: boolean }) {
  const qc = useQueryClient();
  const revisions = useQuery({
    queryKey: ['contract', contractId, 'revisions'],
    queryFn: () => api<Revision[]>(`/contracts/${contractId}/revisions`),
  });
  const [view, setView] = useState<number | null>(null);
  const [compare, setCompare] = useState<{ from: number; to: number } | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  const restore = useMutation({
    mutationFn: (seq: number) => api(`/contracts/${contractId}/revisions/${seq}/restore`, { method: 'POST' }),
    onSuccess: (_, seq) => {
      toast.success(`Đã khôi phục nội dung về phiên bản ${seq}`);
      // Gồm cả lịch sử chỉnh sửa, lịch sử hoạt động, nội dung (cùng tiền tố khóa).
      qc.invalidateQueries({ queryKey: ['contract', contractId] });
    },
  });

  if (revisions.isError) return <ErrorState error={revisions.error} onRetry={() => revisions.refetch()} />;
  if (!revisions.data) return <Skeleton className="h-64" />;
  const list = revisions.data;
  if (!list.length)
    return (
      <EmptyState
        title="Chưa có lịch sử chỉnh sửa"
        description="Hợp đồng tạo trước khi có tính năng này: lần sửa tiếp theo sẽ lưu phiên bản gốc và các thay đổi."
      />
    );
  // Phiên bản có nội dung gần nhất trước mỗi phiên bản (để so sánh "với bản trước").
  const contentSeqs = list.filter((r) => r.contentChanged).map((r) => r.seq);
  const prevContentSeq = (seq: number) => contentSeqs.find((s) => s < seq);
  const latestContentSeq = contentSeqs[0];

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Mỗi phiên bản là một phiên sửa: cùng một người sửa liên tục trong 15 phút được gộp làm một. Khôi phục nội dung tạo phiên bản mới, không xóa lịch sử.
      </p>
      {list.map((r) => {
        const prev = prevContentSeq(r.seq);
        const minutes = minutesBetween(r.startedAt, r.updatedAt);
        return (
          <Card key={r.seq}>
            <CardContent className="space-y-3 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="font-mono">
                  v{r.seq}
                </Badge>
                <span className="font-medium">{KIND_LABEL[r.kind]}</span>
                {r.kind === 'RESTORE' && r.restoredFromSeq && <span className="text-sm text-muted-foreground">từ phiên bản {r.restoredFromSeq}</span>}
                <span className="text-sm text-muted-foreground">
                  · {r.authorName ?? 'Không rõ'} · {formatDateTime(r.startedAt)}
                  {minutes >= 1 && ` (sửa trong ${minutes} phút)`}
                </span>
                {r.seq === list[0].seq && <Badge>Hiện tại</Badge>}
                <div className="ml-auto flex flex-wrap gap-1.5">
                  {r.contentChanged && (
                    <Button variant="outline" size="sm" onClick={() => setView(r.seq)}>
                      <Eye /> Xem nội dung
                    </Button>
                  )}
                  {r.contentChanged && prev !== undefined && (
                    <Button variant="outline" size="sm" onClick={() => setCompare({ from: prev, to: r.seq })}>
                      <GitCompare /> So với bản trước
                    </Button>
                  )}
                  {r.contentChanged && latestContentSeq !== undefined && r.seq !== latestContentSeq && (
                    <Button variant="outline" size="sm" onClick={() => setCompare({ from: r.seq, to: latestContentSeq })}>
                      <GitCompare /> So với hiện tại
                    </Button>
                  )}
                  {canRestore && r.contentChanged && r.seq !== latestContentSeq && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={restore.isPending}
                      onClick={() =>
                        setConfirm({
                          title: `Khôi phục nội dung về phiên bản ${r.seq}?`,
                          description: 'Nội dung hợp đồng hiện tại được thay bằng nội dung của phiên bản này. Lịch sử giữ nguyên; thao tác tạo phiên bản mới nên có thể khôi phục ngược lại.',
                          confirmLabel: 'Khôi phục',
                          onConfirm: () => restore.mutateAsync(r.seq).then(() => undefined),
                        })
                      }
                    >
                      {restore.isPending && restore.variables === r.seq ? <Loader2 className="animate-spin" /> : <RotateCcw />} Khôi phục
                    </Button>
                  )}
                </div>
              </div>
              {r.changes.length > 0 && (
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="w-1/4 px-3 py-1.5 font-medium">Thông tin</th>
                        <th className="px-3 py-1.5 font-medium">Trước</th>
                        <th className="px-3 py-1.5 font-medium">Sau</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {r.changes.map((c) => (
                        <tr key={c.field} className="align-top">
                          <td className="px-3 py-1.5 text-muted-foreground">{c.label}</td>
                          <td className="px-3 py-1.5 text-destructive line-through decoration-destructive/40">{c.before ?? <span className="no-underline">—</span>}</td>
                          <td className="px-3 py-1.5 text-emerald-700 dark:text-emerald-400">{c.after ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {r.contentChanged && r.kind === 'EDIT' && <p className="text-sm text-muted-foreground">Có sửa nội dung hợp đồng.</p>}
              {!r.changes.length && !r.contentChanged && r.kind === 'EDIT' && <p className="text-sm text-muted-foreground">Không có thay đổi.</p>}
            </CardContent>
          </Card>
        );
      })}

      <ViewDialog contractId={contractId} seq={view} onClose={() => setView(null)} />
      <CompareDialog contractId={contractId} pair={compare} onClose={() => setCompare(null)} />
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}

function ViewDialog({ contractId, seq, onClose }: { contractId: string; seq: number | null; onClose: () => void }) {
  const content = useQuery({
    queryKey: ['contract', contractId, 'revision', seq],
    queryFn: () => fetchContent(contractId, seq!),
    enabled: seq !== null,
  });
  return (
    <Dialog open={seq !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Nội dung phiên bản {seq}</DialogTitle>
          <DialogDescription>Chỉ xem; biến dữ liệu ({'{{…}}'}) hiển thị nguyên dạng.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto rounded-md border bg-white px-8 py-6 text-[#111]">
          {content.data ? (
            // Nội dung đã được máy chủ làm sạch khi lưu.
            <div className="contract-content" dangerouslySetInnerHTML={{ __html: content.data.contentHtml || '<p><em>(Nội dung trống)</em></p>' }} />
          ) : (
            <Skeleton className="h-64" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CompareDialog({ contractId, pair, onClose }: { contractId: string; pair: { from: number; to: number } | null; onClose: () => void }) {
  const from = useQuery({
    queryKey: ['contract', contractId, 'revision', pair?.from],
    queryFn: () => fetchContent(contractId, pair!.from),
    enabled: !!pair,
  });
  const to = useQuery({
    queryKey: ['contract', contractId, 'revision', pair?.to],
    queryFn: () => fetchContent(contractId, pair!.to),
    enabled: !!pair,
  });
  const blocks = useMemo(() => (from.data && to.data ? diffContent(from.data.contentHtml, to.data.contentHtml) : null), [from.data, to.data]);
  const changed = blocks?.filter((b) => b.type !== 'same').length ?? 0;

  return (
    <Dialog open={!!pair} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            So sánh nội dung: phiên bản {pair?.from} → {pair?.to}
          </DialogTitle>
          <DialogDescription>
            <span className="rounded bg-emerald-500/15 px-1 text-emerald-800 dark:text-emerald-300">Xanh</span>: thêm vào ·{' '}
            <span className="rounded bg-destructive/10 px-1 text-destructive line-through">Đỏ gạch</span>: bị xóa · đoạn không đổi được thu gọn.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto rounded-md border p-4 text-sm leading-relaxed">
          {!blocks ? <Skeleton className="h-64" /> : changed === 0 ? <p className="text-muted-foreground">Nội dung hai phiên bản giống nhau.</p> : <DiffView blocks={blocks} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Hiện các khối thay đổi kèm 1 khối ngữ cảnh trước/sau; phần không đổi còn lại thu gọn thành một dòng. */
function DiffView({ blocks }: { blocks: DiffBlock[] }) {
  const keep = new Set<number>();
  blocks.forEach((b, i) => {
    if (b.type !== 'same') [i - 1, i, i + 1].forEach((k) => keep.add(k));
  });
  const rows: React.ReactNode[] = [];
  let hidden = 0;
  const flush = (key: string) => {
    if (hidden) rows.push(<p key={key} className="py-1 text-center text-xs text-muted-foreground">… {hidden} đoạn không đổi …</p>);
    hidden = 0;
  };
  blocks.forEach((b, i) => {
    if (!keep.has(i)) {
      hidden++;
      return;
    }
    flush(`h${i}`);
    if (b.type === 'same') rows.push(<p key={i} className="py-1 text-muted-foreground">{b.text}</p>);
    else if (b.type === 'ins') rows.push(<p key={i} className="my-1 rounded bg-emerald-500/15 px-2 py-1 text-emerald-900 dark:text-emerald-200">+ {b.text}</p>);
    else if (b.type === 'del') rows.push(<p key={i} className="my-1 rounded bg-destructive/10 px-2 py-1 text-destructive line-through">− {b.text}</p>);
    else
      rows.push(
        <p key={i} className="my-1 rounded bg-amber-500/10 px-2 py-1">
          {b.parts.map((p, k) =>
            p.type === 'same' ? (
              <span key={k}>{p.text}</span>
            ) : p.type === 'ins' ? (
              <ins key={k} className="rounded bg-emerald-500/25 text-emerald-900 no-underline dark:text-emerald-200">
                {p.text}
              </ins>
            ) : (
              <del key={k} className="rounded bg-destructive/15 text-destructive">
                {p.text}
              </del>
            ),
          )}
        </p>,
      );
  });
  flush('end');
  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <History className="size-3.5" /> {blocks.filter((b) => b.type !== 'same').length} đoạn thay đổi
      </p>
      {rows}
    </div>
  );
}
