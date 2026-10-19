'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Eye, FileText, Loader2, MessageSquareText, RefreshCw, Send, TextSelect, ThumbsUp, XCircle } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError } from '@/lib/api';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';
import type { FeedbackKind, PublicPreviewView } from '@/lib/types';

const ROLE_LABELS = { PARTY_A: 'Bên A', PARTY_B: 'Bên B', PARTY_C: 'Bên C', RELATED: 'Bên liên quan' } as const;
const MESSAGE_MAX = 4000;

function Shell({ children, org }: { children: React.ReactNode; org?: string }) {
  return (
    <main className="min-h-screen bg-muted/40">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Eye className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">SAHA eContract · Xem trước hợp đồng</p>
            {org && <p className="truncate text-xs text-muted-foreground">Gửi từ {org}</p>}
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-4xl space-y-4 px-3 py-4 sm:px-4 sm:py-6">{children}</div>
    </main>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm break-words">{children || '—'}</dd>
    </div>
  );
}

/** Các mục (Điều/tiêu đề) trong nội dung để khách chọn nhanh điều khoản liên quan. */
function useSections(html: string) {
  return useMemo(() => {
    if (!html || typeof DOMParser === 'undefined') return [];
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const out = new Set<string>();
    doc.querySelectorAll('h1,h2,h3,h4,p,li').forEach((el) => {
      const t = el.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      if (/^(h[1-4])$/i.test(el.tagName) || /^(Điều|ĐIỀU|Mục|MỤC|Khoản)\s+[0-9IVX]+/.test(t)) {
        if (t) out.add(t.slice(0, 120));
      }
    });
    return [...out].slice(0, 100);
  }, [html]);
}

export function PublicPreview() {
  const { token } = useParams<{ token: string }>();
  const qc = useQueryClient();
  const key = ['public-preview', token];
  const view = useQuery({ queryKey: key, queryFn: () => api<PublicPreviewView>(`/public/preview/${token}`), retry: false });

  const [mode, setMode] = useState<FeedbackKind | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [contact, setContact] = useState('');
  const [clauseRef, setClauseRef] = useState('');
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState('');
  const [error, setError] = useState<{ text: string; stale: boolean } | null>(null);
  const [sent, setSent] = useState<FeedbackKind | null>(null);
  const sections = useSections(view.data?.contentHtml ?? '');

  const submit = useMutation({
    meta: { silent: true },
    mutationFn: (kind: FeedbackKind) =>
      api(`/public/preview/${token}/feedback`, {
        method: 'POST',
        body: {
          kind,
          name: name ?? view.data?.link.recipientName ?? '',
          contact,
          clauseRef: kind === 'CHANGE_REQUEST' ? clauseRef : null,
          message,
          revisionSeq: view.data?.version.seq ?? null,
          contentHash: view.data?.version.hash,
          website,
        },
      }),
    onSuccess: (_r, kind) => {
      setError(null);
      setSent(kind);
      setMode(null);
      setClauseRef('');
      setMessage('');
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (err) => {
      const e = err instanceof ApiError ? err : null;
      setError({ text: e?.errors[0]?.message ?? (err instanceof Error ? err.message : 'Có lỗi xảy ra'), stale: e?.status === 409 && /tải lại/i.test(e.message) });
    },
  });

  if (view.isError) {
    return (
      <Shell>
        <Card>
          <CardContent className="flex items-start gap-3 py-8">
            <XCircle className="size-6 shrink-0 text-destructive" />
            <div>
              <p className="font-medium">Không mở được liên kết xem trước</p>
              <p className="text-sm text-muted-foreground">
                {view.error instanceof ApiError ? view.error.message : 'Liên kết không hợp lệ hoặc đã hết hiệu lực.'}
              </p>
            </div>
          </CardContent>
        </Card>
      </Shell>
    );
  }
  if (!view.data) {
    return (
      <Shell>
        <Skeleton className="h-96" />
      </Shell>
    );
  }

  const v = view.data;
  const c = v.contract;
  const yourName = name ?? v.link.recipientName ?? '';
  const pickSelection = () => {
    const t = window.getSelection()?.toString().replace(/\s+/g, ' ').trim();
    if (t) setClauseRef(t.slice(0, 300));
  };
  const canSend = yourName.trim().length >= 2 && contact.trim().length >= 5 && (mode === 'AGREE' || message.trim().length >= 5);

  return (
    <Shell org={v.organization}>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Bản xem trước · chỉ đọc</Badge>
            {v.version.seq && <Badge variant="secondary">Phiên bản #{v.version.seq}</Badge>}
          </div>
          <CardTitle className="text-lg leading-snug">{c.title}</CardTitle>
          <CardDescription>
            Số hợp đồng {c.code} · Liên kết hiệu lực đến {formatDateTime(v.link.expiresAt)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Info label="Loại hợp đồng">{c.contractType}</Info>
            <Info label="Giá trị">{formatMoney(c.value, c.currency)}</Info>
            <Info label="Thuế VAT">{c.vatRate ? `${Number(c.vatRate)}%` : null}</Info>
            <Info label="Ngày dự kiến ký">{c.expectedSignDate && formatDate(c.expectedSignDate)}</Info>
            <Info label="Ngày hiệu lực">{c.effectiveDate && formatDate(c.effectiveDate)}</Info>
            <Info label="Ngày hết hạn">{c.expiryDate && formatDate(c.expiryDate)}</Info>
          </dl>
        </CardContent>
      </Card>

      {v.parties.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {v.parties.map((p, i) => (
            <Card key={i} className="gap-3 py-4">
              <CardHeader className="px-4">
                <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge>{ROLE_LABELS[p.role]}</Badge> {p.name}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4">
                <dl className="grid grid-cols-2 gap-2">
                  <Info label="Mã số thuế / định danh">{p.taxCode}</Info>
                  <Info label="Người đại diện">{p.representative && `${p.representative}${p.position ? ` – ${p.position}` : ''}`}</Info>
                  <div className="col-span-2"><Info label="Địa chỉ">{p.address}</Info></div>
                  {(p.phone || p.email) && <div className="col-span-2"><Info label="Liên hệ">{[p.phone, p.email].filter(Boolean).join(' · ')}</Info></div>}
                  {p.bankAccount && <div className="col-span-2"><Info label="Số tài khoản">{p.bankAccount}</Info></div>}
                </dl>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <section aria-label="Nội dung hợp đồng" className="rounded-lg bg-muted/60 p-2 sm:p-4">
        {v.contentHtml ? (
          <div className="a4-page min-h-0! p-5! sm:p-[20mm]!">
            {/* HTML đã được máy chủ làm sạch khi lưu; giá trị biến được escape khi render. */}
            <div className="contract-content overflow-x-auto" dangerouslySetInnerHTML={{ __html: v.contentHtml }} />
          </div>
        ) : (
          <p className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <FileText className="size-4" /> Hợp đồng chưa có nội dung soạn thảo. Vui lòng liên hệ bên gửi để nhận tài liệu.
          </p>
        )}
      </section>

      {sent && (
        <div role="status" className="flex items-start gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-300">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
          {sent === 'AGREE' ? 'Đã ghi nhận Quý khách đồng ý với nội dung hợp đồng. Cảm ơn Quý khách!' : 'Đã gửi yêu cầu. Bên soạn hợp đồng sẽ xem xét và phản hồi Quý khách.'}
        </div>
      )}

      {!v.acceptsFeedback ? (
        <p className="rounded-md bg-muted px-4 py-3 text-sm">Hợp đồng đã chuyển sang bước ký, không nhận thêm yêu cầu qua liên kết này. Vui lòng liên hệ trực tiếp bên gửi nếu cần trao đổi.</p>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ý kiến của Quý khách</CardTitle>
            <CardDescription>Đề nghị bổ sung/thay đổi nội dung, hoặc xác nhận đồng ý với bản dự thảo này.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <Button variant={mode === 'CHANGE_REQUEST' ? 'default' : 'outline'} onClick={() => { setMode('CHANGE_REQUEST'); setError(null); setSent(null); }}>
                <MessageSquareText /> Yêu cầu bổ sung / thay đổi
              </Button>
              <Button variant={mode === 'AGREE' ? 'default' : 'outline'} onClick={() => { setMode('AGREE'); setError(null); setSent(null); }}>
                <ThumbsUp /> Đồng ý với nội dung
              </Button>
            </div>

            {mode && (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  submit.mutate(mode);
                }}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="fb-name">Họ tên *</Label>
                    <Input id="fb-name" autoComplete="name" maxLength={120} value={yourName} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="fb-contact">Email hoặc điện thoại *</Label>
                    <Input id="fb-contact" autoComplete="email" maxLength={200} value={contact} onChange={(e) => setContact(e.target.value)} />
                  </div>
                </div>
                {mode === 'CHANGE_REQUEST' && (
                  <div className="space-y-1.5">
                    <Label htmlFor="fb-clause">Điều khoản / đoạn liên quan</Label>
                    <div className="flex gap-2">
                      <Input id="fb-clause" list="fb-sections" maxLength={300} placeholder="Ví dụ: Điều 3. Thanh toán" value={clauseRef} onChange={(e) => setClauseRef(e.target.value)} />
                      <Button type="button" variant="outline" size="icon" title="Dùng đoạn đang bôi đen trong hợp đồng" aria-label="Dùng đoạn đang bôi đen trong hợp đồng" onMouseDown={(e) => e.preventDefault()} onClick={pickSelection}>
                        <TextSelect />
                      </Button>
                    </div>
                    <datalist id="fb-sections">
                      {sections.map((s) => <option key={s} value={s} />)}
                    </datalist>
                    <p className="text-xs text-muted-foreground">Chọn từ danh sách, hoặc bôi đen một đoạn trong hợp đồng rồi bấm nút bên cạnh.</p>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="fb-message">{mode === 'CHANGE_REQUEST' ? 'Nội dung yêu cầu *' : 'Ghi chú (không bắt buộc)'}</Label>
                  <Textarea id="fb-message" rows={mode === 'CHANGE_REQUEST' ? 5 : 2} maxLength={MESSAGE_MAX} value={message} onChange={(e) => setMessage(e.target.value)} />
                  <p className="text-right text-xs text-muted-foreground">{message.length}/{MESSAGE_MAX}</p>
                </div>
                {/* Bẫy bot: ẩn với người dùng */}
                <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" value={website} onChange={(e) => setWebsite(e.target.value)} />
                {error && (
                  <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    <span className="flex-1">{error.text}</span>
                    {error.stale && (
                      <Button type="button" size="sm" variant="outline" onClick={() => { setError(null); view.refetch(); }}>
                        <RefreshCw /> Tải bản mới
                      </Button>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={!canSend || submit.isPending}>
                    {submit.isPending ? <Loader2 className="animate-spin" /> : mode === 'AGREE' ? <ThumbsUp /> : <Send />}
                    {mode === 'AGREE' ? 'Xác nhận đồng ý' : 'Gửi yêu cầu'}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setMode(null)}>Hủy</Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      {v.feedback.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ý kiến đã gửi qua liên kết này</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {v.feedback.map((f) => (
                <li key={f.id} className="rounded-md border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={f.kind === 'AGREE' ? 'secondary' : 'outline'}>{f.kind === 'AGREE' ? 'Đồng ý' : 'Yêu cầu thay đổi'}</Badge>
                    <Badge variant={f.status === 'RESOLVED' ? 'default' : 'outline'}>{f.status === 'RESOLVED' ? 'Đã xử lý' : 'Đang chờ xử lý'}</Badge>
                    <span className="text-xs text-muted-foreground">{f.name} · {formatDateTime(f.createdAt)}{f.revisionSeq ? ` · phiên bản #${f.revisionSeq}` : ''}</span>
                  </div>
                  {f.clauseRef && <p className="mt-2 text-xs text-muted-foreground">Liên quan: {f.clauseRef}</p>}
                  {f.message && <p className="mt-1 whitespace-pre-wrap">{f.message}</p>}
                  {f.response && <p className="mt-2 rounded bg-muted px-2 py-1.5 whitespace-pre-wrap"><span className="font-medium">Phản hồi:</span> {f.response}</p>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </Shell>
  );
}
