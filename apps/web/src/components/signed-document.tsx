import { DEFAULT_SIGNATURE_APPEARANCE, type SignatureStamp } from '@saha/shared';
import { SignatureMarkView } from '@/components/signature-pad';
import { type SignatureAppearanceInfo, SignaturePreview } from '@/components/signature-appearance-card';
import { formatDateTime } from '@/lib/format';
import type { PartyRole, SignerStatus } from '@/lib/types';

export const ROLE_LABELS: Record<PartyRole, string> = { PARTY_A: 'BÊN A', PARTY_B: 'BÊN B', PARTY_C: 'BÊN C', RELATED: 'BÊN LIÊN QUAN' };

export interface DocSigner {
  id: string;
  name: string;
  title: string | null;
  partyRole: PartyRole | null;
  status: SignerStatus;
  signedAt: string | null;
  signatureImage: string | null;
  email?: string;
  method?: string;
  ip?: string | null;
  signedHash?: string | null;
  evidence?: { stamp?: SignatureStamp } | null;
}

/** Tên chủ chứng thư của người ký số MISA (lưu dạng "text:Ký số MISA eSign – <tên>"). */
export function misaOwner(s: Pick<DocSigner, 'signatureImage' | 'name'>): string {
  const t = s.signatureImage?.startsWith('text:') ? s.signatureImage.slice(5) : '';
  return t.split('Ký số MISA eSign – ')[1]?.trim() || s.name;
}

export const isMisaSigned = (s: Pick<DocSigner, 'method' | 'status'>) => s.method === 'MISA_ESIGN' && s.status === 'SIGNED';

/**
 * Văn bản hợp đồng đã đóng băng để ký (A4) + khối chữ ký các bên + chứng thư ký điện tử.
 * `snapshot` là HTML do backend dựng từ nội dung đã làm sạch.
 */
export function SignedDocument({
  snapshot,
  documentHash,
  signers,
  showCertificate = true,
  misaAppearance,
}: {
  snapshot: string;
  documentHash: string;
  signers: DocSigner[];
  showCertificate?: boolean;
  /** Cấu hình hiển thị chữ ký số (người ký số MISA vẽ theo cấu hình); không có ⇒ hiện dòng chữ như chữ ký thường. */
  misaAppearance?: SignatureAppearanceInfo;
}) {
  // Khối chữ ký theo thứ tự Bên A, B, C, bên liên quan.
  const rank = (r: PartyRole | null) => (r ? ['PARTY_A', 'PARTY_B', 'PARTY_C', 'RELATED'].indexOf(r) : 9);
  const ordered = [...signers].sort((a, b) => rank(a.partyRole) - rank(b.partyRole));
  const signed = ordered.filter((s) => s.status === 'SIGNED');
  return (
    <div className="print-area overflow-x-auto rounded-lg bg-muted/40 p-4">
      <div className="a4-page">
        <div className="contract-content" dangerouslySetInnerHTML={{ __html: snapshot }} />

        <div className="mt-10 grid grid-cols-2 gap-8 text-center text-sm">
          {ordered.map((s) => (
            <div key={s.id}>
              <p className="font-bold">{s.partyRole ? ROLE_LABELS[s.partyRole] : 'NGƯỜI KÝ'}</p>
              {s.title && <p className="italic">{s.title}</p>}
              <div className="flex min-h-20 items-center justify-center">
                {(misaAppearance || s.evidence?.stamp) && isMisaSigned(s) && s.signedAt ? (
                  <SignaturePreview
                    appearance={misaAppearance?.appearance ?? DEFAULT_SIGNATURE_APPEARANCE}
                    logo={misaAppearance?.logo ?? null}
                    owner={misaOwner(s)}
                    signedAt={new Date(s.signedAt)}
                    stamp={s.evidence?.stamp}
                    framed={false}
                    scale={1.1}
                  />
                ) : s.status === 'SIGNED' ? (
                  <SignatureMarkView value={s.signatureImage} />
                ) : (
                  <span className="text-xs text-gray-400">{s.status === 'REJECTED' ? 'Đã từ chối ký' : 'Chưa ký'}</span>
                )}
              </div>
              <p className="font-semibold">{s.name}</p>
              {s.signedAt && s.status === 'SIGNED' && <p className="text-xs text-gray-500">Ký điện tử lúc {formatDateTime(s.signedAt)}</p>}
            </div>
          ))}
        </div>

        {showCertificate && signed.length > 0 && (
          <div className="mt-10 border-t pt-4 text-xs">
            <p className="mb-2 font-bold">CHỨNG THƯ KÝ ĐIỆN TỬ</p>
            <p className="mb-2 break-all">
              Mã băm SHA-256 của văn bản: <code>{documentHash}</code>
            </p>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {['Người ký', 'Email', 'Phương thức', 'Thời điểm', 'IP', 'Khớp mã băm'].map((h) => (
                    <th key={h} className="border border-gray-300 bg-gray-100 px-1.5 py-1 text-left">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {signed.map((s) => (
                  <tr key={s.id}>
                    <td className="border border-gray-300 px-1.5 py-1">{s.name}</td>
                    <td className="border border-gray-300 px-1.5 py-1">{s.email ?? '—'}</td>
                    <td className="border border-gray-300 px-1.5 py-1">{s.method === 'EMAIL_OTP' ? 'OTP qua email' : s.method === 'INTERNAL_PASSWORD' ? 'Tài khoản + mật khẩu' : s.method === 'MISA_ESIGN' ? 'Chữ ký số MISA eSign' : '—'}</td>
                    <td className="border border-gray-300 px-1.5 py-1">{formatDateTime(s.signedAt)}</td>
                    <td className="border border-gray-300 px-1.5 py-1">{s.ip ?? '—'}</td>
                    <td className="border border-gray-300 px-1.5 py-1">{s.signedHash ? (s.signedHash === documentHash ? 'Có' : 'Không') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
