'use client';

import { buildTemplateValues, renderTemplate } from '@saha/shared';
import { Download, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { api, downloadFile } from '@/lib/api';
import { downloadContractPdf } from '@/lib/contract-pdf';
import type { ContractDetail, ContractDocument, SignatureRequestInfo } from '@/lib/types';

/**
 * Tải file của một hợp đồng/đơn ngay từ danh sách, chọn bản có giá trị nhất:
 * PDF ký số MISA ⇒ bản ký điện tử đã hoàn tất (kèm chữ ký, chứng thư) ⇒ bản gốc (hồ sơ lập từ file) ⇒ nội dung hiện tại.
 */
export function ContractDownloadButton({ id, code }: { id: string; code: string }) {
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      const contract = await api<ContractDetail>(`/contracts/${id}`);
      const requests = await api<SignatureRequestInfo[]>(`/contracts/${id}/signature`).catch(() => [] as SignatureRequestInfo[]);
      const completed = requests.find((r) => r.status === 'COMPLETED');
      const main = completed ? undefined : (await api<ContractDocument[]>(`/contracts/${id}/documents`).catch(() => [] as ContractDocument[])).find((d) => d.kind === 'MAIN');
      if (completed?.signedDocumentId) {
        await downloadFile(`/contracts/${id}/documents/${completed.signedDocumentId}/download`);
      } else if (completed) {
        await downloadContractPdf({
          fileName: `${contract.code} - ban da ky`,
          title: `${contract.code} – ${contract.title} (bản đã ký)`,
          html: completed.contentSnapshot,
          signed: { documentHash: completed.documentHash, signers: completed.signers },
        });
      } else if (main) {
        await downloadFile(`/contracts/${id}/documents/${main.id}/download`);
      } else if (contract.contentHtml?.trim()) {
        await downloadContractPdf({
          fileName: contract.code,
          title: `${contract.code} – ${contract.title}`,
          html: renderTemplate(contract.contentHtml, buildTemplateValues(contract)).html,
        });
      } else {
        toast.error(`${contract.code} chưa có nội dung để xuất PDF – xem tab Tài liệu của hồ sơ.`);
      }
    } catch (e) {
      toast.error(`Không tải được ${code}: ${e instanceof Error ? e.message : 'lỗi không xác định'}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant="ghost" size="icon-sm" aria-label={`Tải PDF ${code}`} title="Tải PDF (bản đã ký nếu có)" disabled={busy} onClick={download}>
      {busy ? <Loader2 className="animate-spin" /> : <Download />}
    </Button>
  );
}
