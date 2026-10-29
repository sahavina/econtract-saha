'use client';

import { extractVariables, TEMPLATE_VARIABLE_KEYS, TEMPLATE_VARIABLES } from '@saha/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Archive, CheckCircle2, Eye, Loader2, Save, Trash2 } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, type ConfirmState } from '@/components/confirm-dialog';
import { ContractEditor } from '@/components/contract-editor';
import { FilterSelect } from '@/components/filter-select';
import { ErrorState, PageHeader } from '@/components/page-header';
import { TemplateStatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import { useLookups } from '@/lib/queries';
import type { TemplateDetail } from '@/lib/types';

interface Draft {
  name: string;
  contractTypeId: string;
  description: string;
  departmentIds: string[];
  requiredVariables: string[];
  contentHtml: string;
}

const toDraft = (t: TemplateDetail): Draft => ({
  name: t.name,
  contractTypeId: t.contractTypeId ?? '',
  description: t.description ?? '',
  departmentIds: t.departmentIds,
  requiredVariables: t.requiredVariables,
  contentHtml: t.contentHtml,
});

const toggle = (list: string[], v: string, on: boolean) => (on ? [...new Set([...list, v])] : list.filter((x) => x !== v));

function VersionDialog({ templateId, version, onClose }: { templateId: string; version: number | null; onClose: () => void }) {
  const q = useQuery({
    queryKey: ['template', templateId, 'version', version],
    queryFn: () => api<{ contentHtml: string; createdAt: string }>(`/templates/${templateId}/versions/${version}`),
    enabled: version !== null,
  });
  return (
    <Dialog open={version !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Phiên bản {version}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[70vh] overflow-y-auto rounded-lg bg-muted/40 p-4">
          {q.data ? (
            <div className="a4-page">
              {/* Nội dung đã được backend làm sạch. */}
              <div className="contract-content" dangerouslySetInnerHTML={{ __html: q.data.contentHtml }} />
            </div>
          ) : (
            <Skeleton className="h-96" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TemplateEditor({ template }: { template: TemplateDetail }) {
  const { can } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const lookups = useLookups();
  const [draft, setDraft] = useState<Draft>(() => toDraft(template));
  const [saved, setSaved] = useState<Draft>(() => toDraft(template));
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [viewVersion, setViewVersion] = useState<number | null>(null);

  const editable = can('template.manage') && template.status !== 'ARCHIVED';
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const contentChanged = draft.contentHtml !== saved.contentHtml;
  const used = extractVariables(draft.contentHtml);
  const unknown = used.filter((k) => !TEMPLATE_VARIABLE_KEYS.has(k));
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['template', template.id] });
    qc.invalidateQueries({ queryKey: ['templates'] });
  };

  const save = useMutation({
    mutationFn: () =>
      api<TemplateDetail>(`/templates/${template.id}`, {
        method: 'PATCH',
        body: { ...draft, contractTypeId: draft.contractTypeId || null, description: draft.description || null },
      }),
    onSuccess: (t) => {
      const next = { ...draft, contentHtml: t.contentHtml };
      setDraft(next);
      setSaved(next);
      refresh();
      toast.success(t.version !== template.version ? `Đã lưu – phiên bản mới v${t.version}` : 'Đã lưu mẫu');
    },
  });

  const action = useMutation({
    mutationFn: (op: 'activate' | 'archive' | 'delete') =>
      op === 'delete'
        ? api<undefined>(`/templates/${template.id}`, { method: 'DELETE' })
        : api<TemplateDetail>(`/templates/${template.id}/${op}`, { method: 'POST' }),
    onSuccess: (_r, op) => {
      refresh();
      if (op === 'delete') {
        toast.success('Đã xóa mẫu');
        router.push('/templates');
      } else toast.success(op === 'activate' ? 'Mẫu đã được kích hoạt' : 'Đã lưu trữ mẫu');
    },
  });

  const onSave = () => {
    if (template.status === 'ACTIVE' && contentChanged) {
      setConfirm({
        title: `Lưu thành phiên bản v${template.version + 1}?`,
        description: 'Mẫu đang được sử dụng. Hợp đồng đã lập từ phiên bản cũ giữ nguyên nội dung; hợp đồng mới sẽ dùng phiên bản mới.',
        confirmLabel: 'Lưu phiên bản mới',
        onConfirm: () => save.mutateAsync().then(() => undefined),
      });
    } else save.mutate();
  };

  return (
    <>
      <PageHeader
        crumbs={[
          // Mẫu gắn loại "Đơn đặt hàng" thuộc danh sách Mẫu đơn đặt hàng.
          lookups.data?.contractTypes.find((t) => t.id === template.contractTypeId)?.kind === 'ORDER'
            ? { label: 'Mẫu đơn đặt hàng', href: '/order-templates' }
            : { label: 'Mẫu hợp đồng', href: '/templates' },
          { label: template.code },
        ]}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {template.name} <TemplateStatusBadge status={template.status} />
          </span>
        }
        description={`${template.code} · Phiên bản v${template.version} · ${template._count.contracts} hợp đồng đã dùng`}
        actions={
          can('template.manage') && (
            <>
              {editable && (
                <Button onClick={onSave} disabled={!dirty || save.isPending}>
                  {save.isPending ? <Loader2 className="animate-spin" /> : <Save />} Lưu
                </Button>
              )}
              {template.status !== 'ACTIVE' && (
                <Button
                  variant="outline"
                  disabled={dirty || action.isPending}
                  title={dirty ? 'Hãy lưu thay đổi trước khi kích hoạt' : undefined}
                  onClick={() => action.mutate('activate')}
                >
                  <CheckCircle2 /> Kích hoạt
                </Button>
              )}
              {template.status === 'ACTIVE' && (
                <Button variant="outline" onClick={() => setConfirm({ title: 'Lưu trữ mẫu này?', description: 'Mẫu sẽ không còn được chọn khi tạo hợp đồng mới.', onConfirm: () => action.mutateAsync('archive').then(() => undefined) })}>
                  <Archive /> Lưu trữ
                </Button>
              )}
              {template.status !== 'ACTIVE' && (
                <Button
                  variant="destructive"
                  onClick={() => setConfirm({ title: `Xóa mẫu ${template.code}?`, destructive: true, confirmLabel: 'Xóa', onConfirm: () => action.mutateAsync('delete').then(() => undefined) })}
                >
                  <Trash2 /> Xóa
                </Button>
              )}
            </>
          )
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-3">
          {unknown.length > 0 && (
            <div role="alert" className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              Biến không hỗ trợ (không thể kích hoạt): {unknown.map((k) => `{{${k}}}`).join(', ')}
            </div>
          )}
          {editable ? (
            <ContractEditor value={draft.contentHtml} onChange={(html) => set({ contentHtml: html })} enableClauses />
          ) : (
            <div className="rounded-lg bg-muted/40 p-4">
              <div className="a4-page">
                <div className="contract-content" dangerouslySetInnerHTML={{ __html: template.contentHtml }} />
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Thông tin mẫu</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="tpl-name">Tên mẫu</Label>
                <Input id="tpl-name" disabled={!editable} value={draft.name} onChange={(e) => set({ name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Loại hợp đồng</Label>
                <FilterSelect
                  className="w-full"
                  allLabel="— Không gắn loại —"
                  disabled={!editable}
                  value={draft.contractTypeId || undefined}
                  onChange={(v) => set({ contractTypeId: v ?? '' })}
                  options={(lookups.data?.contractTypes ?? []).map((t) => ({ value: t.id, label: t.name }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tpl-desc">Mô tả</Label>
                <Textarea id="tpl-desc" rows={2} disabled={!editable} value={draft.description} onChange={(e) => set({ description: e.target.value })} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Phòng ban được sử dụng</CardTitle>
              <CardDescription>Không chọn = mọi phòng ban.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {(lookups.data?.departments ?? []).map((d) => (
                <label key={d.id} className="flex items-center gap-2 text-sm">
                  <Checkbox disabled={!editable} checked={draft.departmentIds.includes(d.id)} onCheckedChange={(v) => set({ departmentIds: toggle(draft.departmentIds, d.id, !!v) })} />
                  {d.name}
                </label>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Biến bắt buộc</CardTitle>
              <CardDescription>Cảnh báo khi hợp đồng lập từ mẫu thiếu dữ liệu này. Biến in đậm đang có trong nội dung.</CardDescription>
            </CardHeader>
            <CardContent className="max-h-80 space-y-3 overflow-y-auto">
              {TEMPLATE_VARIABLES.map((g) => (
                <div key={g.group}>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">{g.group}</p>
                  {g.items.map((v) => (
                    <label key={v.key} className="flex items-center gap-2 py-0.5 text-sm">
                      <Checkbox
                        disabled={!editable}
                        checked={draft.requiredVariables.includes(v.key)}
                        onCheckedChange={(c) => set({ requiredVariables: toggle(draft.requiredVariables, v.key, !!c) })}
                      />
                      <span className={used.includes(v.key) ? 'font-semibold' : ''}>{v.label}</span>
                    </label>
                  ))}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Lịch sử phiên bản</CardTitle>
              <CardDescription>Ảnh chụp nội dung khi kích hoạt hoặc khi sửa mẫu đang sử dụng.</CardDescription>
            </CardHeader>
            <CardContent>
              {template.versions.length === 0 ? (
                <p className="text-sm text-muted-foreground">Chưa có phiên bản phát hành.</p>
              ) : (
                <ul className="divide-y">
                  {template.versions.map((v) => (
                    <li key={v.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                      <div>
                        <span className="font-medium">v{v.version}</span>
                        <span className="block text-xs text-muted-foreground">
                          {v.createdBy.fullName} · {formatDateTime(v.createdAt)}
                        </span>
                      </div>
                      <Button variant="ghost" size="icon-sm" aria-label={`Xem phiên bản ${v.version}`} onClick={() => setViewVersion(v.version)}>
                        <Eye />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <VersionDialog templateId={template.id} version={viewVersion} onClose={() => setViewVersion(null)} />
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}

export default function TemplateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery({ queryKey: ['template', id], queryFn: () => api<TemplateDetail>(`/templates/${id}`) });
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data) return <Skeleton className="h-96" />;
  return <TemplateEditor key={q.data.id} template={q.data} />;
}
