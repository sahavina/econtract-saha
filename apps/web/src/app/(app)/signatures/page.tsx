'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BadgeCheck, CalendarClock, ExternalLink, FileText, Info, KeyRound, PenLine, Plus, ShieldCheck, Usb, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, useState } from 'react';
import { RejectDialog, SignDialog, prepareSigningPdf } from '@/components/contract-signature-tab';
import { InitialsAvatar, StatusPill, type Tone } from '@/components/list-ui';
import { anchorFor, MisaEsignDialog } from '@/components/misa-esign-dialog';
import { EmptyState, ErrorState, PageHeader } from '@/components/page-header';
import { PdfPagesViewer } from '@/components/pdf-pages-viewer';
import { useSignatureAppearance } from '@/components/signature-appearance-card';
import { SignedDocument, withUnsignedParties } from '@/components/signed-document';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useMisaStatus } from '@/lib/esign';
import { formatDateTime } from '@/lib/format';
import type { ContractDetail, SignatureListItem, SignatureRequestInfo, SignerInfo } from '@/lib/types';
import { cn } from '@/lib/utils';

const TABS = [
  { value: 'mine', label: 'Cần tôi ký', count: true },
  { value: 'waiting_partner', label: 'Chờ đối tác', count: true },
  { value: 'completed', label: 'Hoàn tất', count: true },
  { value: 'rejected', label: 'Bị từ chối', count: false },
  { value: 'expired', label: 'Hết hạn', count: false },
  { value: 'all', label: 'Tất cả', count: false },
] as const;

const REQUEST_STATUS: Record<SignatureListItem['status'], { label: string; tone: Tone }> = {
  IN_PROGRESS: { label: 'Đang ký', tone: 'violet' },
  COMPLETED: { label: 'Hoàn tất', tone: 'green' },
  REJECTED: { label: 'Bị từ chối', tone: 'red' },
  EXPIRED: { label: 'Hết hạn', tone: 'orange' },
  CANCELLED: { label: 'Đã hủy', tone: 'gray' },
};

const ROLE: Record<string, string> = { PARTY_A: 'Bên A', PARTY_B: 'Bên B', PARTY_C: 'Bên C', RELATED: 'Bên liên quan' };

function useSignatures(view: string) {
  return useQuery({ queryKey: ['signatures', view], queryFn: () => api<SignatureListItem[]>('/signatures', { query: { view } }) });
}

/**
 * Trung tâm ký kết: danh sách yêu cầu ký theo nhóm (cần tôi ký, chờ đối tác, hoàn tất…), xem văn bản/bản PDF ký số,
 * người ký, phương thức ký, chứng thư và ký ngay tại chỗ (ký số MISA eSign hoặc ký điện tử nội bộ).
 */
export default function SigningCenterPage() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const view = params.get('view') ?? 'mine';
  const selectedId = params.get('id');
  const list = useSignatures(view);
  const counts = {
    mine: useSignatures('mine').data?.length,
    waiting_partner: useSignatures('waiting_partner').data?.length,
    completed: useSignatures('completed').data?.length,
  } as Record<string, number | undefined>;
  const items = list.data ?? [];
  const selected = items.find((r) => r.id === selectedId) ?? items[0];

  const go = (next: { view?: string; id?: string | null }) => {
    const q = new URLSearchParams(params.toString());
    if (next.view !== undefined) {
      q.set('view', next.view);
      q.delete('id');
    }
    if (next.id !== undefined) {
      if (next.id) q.set('id', next.id);
      else q.delete('id');
    }
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  };

  return (
    <>
      <PageHeader
        title="Trung tâm ký kết"
        description="Xem văn bản, người ký và ký ngay tại một nơi."
        crumbs={[{ label: 'Ký điện tử', href: '/signatures' }, { label: 'Trung tâm ký kết' }]}
        actions={
          <Button asChild>
            <Link href="/contracts?status=APPROVED" title="Chọn hợp đồng đã phê duyệt rồi gửi ký ở tab Ký điện tử">
              <Plus /> Tạo yêu cầu ký
            </Link>
          </Button>
        }
      />
      <div role="tablist" aria-label="Nhóm yêu cầu ký" className="mb-4 flex items-end gap-1 overflow-x-auto border-b [scrollbar-width:thin]">
        {TABS.map((t) => {
          const active = view === t.value;
          const n = t.count ? counts[t.value] : undefined;
          return (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => go({ view: t.value })}
              className={cn(
                'relative flex shrink-0 items-center gap-1.5 px-3 py-3 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground',
                active && 'text-primary after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary hover:text-primary',
              )}
            >
              {t.label}
              {n !== undefined && (
                <span className={cn('rounded-full px-1.5 text-xs tabular-nums', active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>{n}</span>
              )}
            </button>
          );
        })}
      </div>

      {list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : list.isPending ? (
        <Skeleton className="h-[70vh]" />
      ) : !items.length ? (
        <EmptyState title="Không có yêu cầu ký" description={view === 'mine' ? 'Bạn không có lượt ký nào đang chờ.' : 'Chưa có yêu cầu ký trong nhóm này.'} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)] xl:h-[calc(100vh-14rem)] xl:min-h-[560px] xl:grid-cols-[15rem_minmax(0,1fr)_19rem]">
          <RequestList items={items} selectedId={selected?.id} onSelect={(id) => go({ id })} />
          {selected && <Workspace key={selected.id} item={selected} />}
        </div>
      )}
    </>
  );
}

/** Cột trái: các yêu cầu ký trong nhóm. */
function RequestList({ items, selectedId, onSelect }: { items: SignatureListItem[]; selectedId?: string; onSelect: (id: string) => void }) {
  return (
    <aside className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card">
      <p className="border-b px-3 py-2.5 text-sm font-semibold">Hồ sơ ({items.length})</p>
      <ul className="min-h-0 flex-1 divide-y overflow-auto max-lg:max-h-72 lg:max-xl:max-h-[75vh]">
        {items.map((r) => {
          const signed = r.signers.filter((s) => s.status === 'SIGNED').length;
          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onSelect(r.id)}
                className={cn('block w-full px-3 py-2.5 text-left transition-colors hover:bg-muted/60', r.id === selectedId && 'bg-primary/5 shadow-[inset_3px_0_0_var(--primary)]')}
              >
                <span className="line-clamp-2 text-sm font-medium">{r.contract.title}</span>
                <span className="block text-xs text-muted-foreground">{r.contract.code}</span>
                <span className="mt-1 flex items-center justify-between gap-2 text-xs">
                  <StatusPill tone={REQUEST_STATUS[r.status].tone}>{REQUEST_STATUS[r.status].label}</StatusPill>
                  <span className="text-muted-foreground tabular-nums">
                    {signed}/{r.signers.length} đã ký
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

/** Cột giữa + phải cho một yêu cầu ký. */
function Workspace({ item }: { item: SignatureListItem }) {
  const { user } = useAuth();
  const contract = useQuery({ queryKey: ['contract', item.contract.id], queryFn: () => api<ContractDetail>(`/contracts/${item.contract.id}`) });
  const requests = useQuery({
    queryKey: ['contract', item.contract.id, 'signature'],
    queryFn: () => api<SignatureRequestInfo[]>(`/contracts/${item.contract.id}/signature`),
  });
  const request = requests.data?.find((r) => r.id === item.id);
  // Mặc định xem bản PDF ký số nếu có, không thì văn bản ký.
  const [docPick, setDoc] = useState<'pdf' | 'content' | null>(null);
  const doc = docPick ?? (request?.signedDocumentId ? 'pdf' : 'content');

  if (contract.isError || requests.isError) {
    return (
      <div className="lg:col-span-1 xl:col-span-2">
        <ErrorState error={contract.error ?? requests.error} onRetry={() => void Promise.all([contract.refetch(), requests.refetch()])} />
      </div>
    );
  }
  if (!contract.data || !request) return <Skeleton className="h-[60vh] xl:col-span-2" />;

  const c = contract.data;
  const mine = request.status === 'IN_PROGRESS' ? request.signers.find((s) => s.userId === user?.id && s.status === 'PENDING') : undefined;
  const pdfPath = request.signedDocumentId ? `/contracts/${c.id}/documents/${request.signedDocumentId}/download` : null;

  return (
    <>
      <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card max-xl:h-[75vh]">
        <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
          <FileText className="size-4 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold" title={c.title}>
            {c.code} · {c.title}
          </span>
          <div role="tablist" aria-label="Tài liệu" className="inline-flex rounded-md border p-0.5 text-xs">
            {pdfPath && (
              <button type="button" role="tab" aria-selected={doc === 'pdf'} onClick={() => setDoc('pdf')} className={cn('rounded px-2 py-1', doc === 'pdf' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>
                Bản PDF ký số
              </button>
            )}
            <button type="button" role="tab" aria-selected={doc === 'content'} onClick={() => setDoc('content')} className={cn('rounded px-2 py-1', doc === 'content' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>
              Văn bản ký
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1">
          {doc === 'pdf' && pdfPath ? <PdfPagesViewer key={pdfPath} path={pdfPath} /> : <ContentView contract={c} request={request} />}
        </div>
      </section>
      <SidePanel contract={c} request={request} mine={mine} />
    </>
  );
}

/** Văn bản đã đóng băng khi gửi ký kèm khối chữ ký các bên. */
function ContentView({ contract, request }: { contract: ContractDetail; request: SignatureRequestInfo }) {
  const misa = useSignatureAppearance();
  return (
    <div className="h-full overflow-auto">
      <SignedDocument
        snapshot={request.contentSnapshot}
        documentHash={request.documentHash}
        signers={withUnsignedParties(request.signers, contract.parties)}
        showCertificate={request.status === 'COMPLETED'}
        misaAppearance={misa.data}
      />
    </div>
  );
}

function Card({ icon: Icon, title, children }: { icon: typeof Users; title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border bg-card">
      <p className="flex items-center gap-2 border-b px-3 py-2.5 text-sm font-semibold">
        <Icon className="size-4 text-muted-foreground" aria-hidden /> {title}
      </p>
      <div className="p-3">{children}</div>
    </div>
  );
}

function signerPill(s: SignerInfo, isMe: boolean): { label: string; tone: Tone } {
  if (s.status === 'SIGNED') return { label: 'Đã ký', tone: 'green' };
  if (s.status === 'REJECTED') return { label: 'Từ chối', tone: 'red' };
  if (s.status === 'PENDING') return { label: isMe ? 'Chờ bạn ký' : 'Chờ ký', tone: 'amber' };
  if (s.status === 'WAITING') return { label: 'Đợi đến lượt', tone: 'gray' };
  return { label: 'Hết hạn', tone: 'orange' };
}

/** Cột phải: người ký, phương thức ký, chứng thư, nút Từ chối / Tiếp tục ký. */
function SidePanel({ contract, request, mine }: { contract: ContractDetail; request: SignatureRequestInfo; mine?: SignerInfo }) {
  const { user } = useAuth();
  const misa = useMisaStatus(mine?.method === 'MISA_ESIGN');
  const [signing, setSigning] = useState<'password' | 'digital' | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const signers = [...request.signers].sort((a, b) => a.order - b.order);
  const account = misa.data?.account;

  return (
    <aside className="flex min-h-0 flex-col gap-3 overflow-auto lg:max-xl:col-span-2">
      <Card icon={Users} title="Người ký">
        <ol className="space-y-3">
          {signers.map((s, i) => {
            const pill = signerPill(s, s.userId === user?.id);
            return (
              <li key={s.id} className="relative flex items-start gap-2.5">
                {i < signers.length - 1 && <span className="absolute top-9 left-[15px] h-[calc(100%-1.5rem)] border-l border-dashed" aria-hidden />}
                <InitialsAvatar name={s.name} className="size-8 shrink-0 text-xs" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium" title={s.name}>
                    {s.name}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[s.partyRole && ROLE[s.partyRole], s.method === 'MISA_ESIGN' ? 'Ký số MISA' : s.method === 'EMAIL_OTP' ? 'Liên kết + OTP' : 'Ký nội bộ'].filter(Boolean).join(' · ')}
                  </span>
                  {s.signedAt && s.status === 'SIGNED' && <span className="block text-xs text-muted-foreground">Ký lúc {formatDateTime(s.signedAt)}</span>}
                </span>
                <StatusPill tone={pill.tone} className="shrink-0">
                  {pill.label}
                </StatusPill>
              </li>
            );
          })}
        </ol>
        <p className="mt-3 flex items-center gap-1.5 border-t pt-2 text-xs text-muted-foreground">
          <CalendarClock className="size-3.5" aria-hidden /> Hạn ký {formatDateTime(request.expiresAt)} · {request.signingOrder === 'SEQUENTIAL' ? 'Ký lần lượt' : 'Ký đồng thời'}
        </p>
      </Card>

      {mine ? (
        <>
          <Card icon={PenLine} title="Phương thức ký">
            <div role="radiogroup" aria-label="Phương thức ký" className="space-y-2">
              <MethodOption
                active={mine.method === 'MISA_ESIGN'}
                icon={KeyRound}
                title="Ký số từ xa"
                desc="Chứng thư số MISA eSign trên nền tảng đám mây; xác nhận trên ứng dụng MISA eSign."
              />
              <MethodOption active={mine.method === 'INTERNAL_PASSWORD'} icon={PenLine} title="Ký điện tử" desc="Vẽ hoặc gõ chữ ký, xác nhận bằng mật khẩu tài khoản." />
              <MethodOption active={false} icon={Usb} title="USB Token" desc="Chứng thư số trên USB Token cắm vào máy tính." soon />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Phương thức do người gửi chọn khi tạo yêu cầu ký.</p>
          </Card>

          {mine.method === 'MISA_ESIGN' && (
            <Card icon={ShieldCheck} title="Chứng thư số">
              {misa.isPending ? (
                <Skeleton className="h-12" />
              ) : account?.linked && account.certSubject ? (
                <div className="flex items-start gap-2.5">
                  <BadgeCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">MISA eSign</span>
                    <span className="block text-xs break-words text-muted-foreground">{account.certSubject}</span>
                  </span>
                  <StatusPill tone="green" className="shrink-0">
                    Sẵn sàng
                  </StatusPill>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {misa.data?.ready === false
                    ? 'Doanh nghiệp chưa bật ký số MISA eSign (Quản trị → Cấu hình).'
                    : 'Chưa liên kết tài khoản MISA eSign – bấm Tiếp tục ký để đăng nhập và chọn chứng thư.'}
                </p>
              )}
            </Card>
          )}

          <div className="flex items-start gap-2 rounded-xl bg-primary/5 p-3 text-xs">
            <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <span>
              <span className="block font-semibold text-primary">Kiểm tra tài liệu trước khi ký</span>
              Rà soát kỹ nội dung, vị trí ký và thông tin người ký trước khi thực hiện.
            </span>
          </div>

          <div className="mt-auto grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => setRejecting(true)}>
              Từ chối ký
            </Button>
            <Button onClick={() => setSigning(mine.method === 'MISA_ESIGN' ? 'digital' : 'password')} disabled={mine.method === 'MISA_ESIGN' && misa.data?.ready === false}>
              Tiếp tục ký <ArrowRight />
            </Button>
          </div>
        </>
      ) : (
        <Button variant="outline" asChild>
          <Link href={`/contracts/${contract.id}?tab=signature`}>
            <ExternalLink /> Mở hồ sơ
          </Link>
        </Button>
      )}

      {signing === 'password' && <SignDialog contract={contract} request={request} open onClose={() => setSigning(null)} />}
      {signing === 'digital' && mine && (
        <MisaEsignDialog
          contractId={contract.id}
          signature={{ prepare: () => prepareSigningPdf(contract, request) }}
          anchor={anchorFor(mine.partyRole)}
          onClose={() => setSigning(null)}
          onSigned={() => setSigning(null)}
        />
      )}
      {rejecting && <RejectDialog contractId={contract.id} open onClose={() => setRejecting(false)} />}
    </aside>
  );
}

function MethodOption({ active, icon: Icon, title, desc, soon }: { active: boolean; icon: typeof PenLine; title: string; desc: string; soon?: boolean }) {
  return (
    <div
      role="radio"
      aria-checked={active}
      aria-disabled={!active}
      className={cn('flex items-start gap-2.5 rounded-lg border p-2.5', active ? 'border-primary bg-primary/5' : 'opacity-60')}
    >
      <span className={cn('mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-2', active ? 'border-primary' : 'border-muted-foreground/40')} aria-hidden>
        {active && <span className="size-2 rounded-full bg-primary" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <Icon className="size-3.5" aria-hidden /> {title}
          {soon && <span className="rounded bg-muted px-1.5 text-[10px] font-normal text-muted-foreground">Sắp có</span>}
        </span>
        <span className="block text-xs text-muted-foreground">{desc}</span>
      </span>
    </div>
  );
}
