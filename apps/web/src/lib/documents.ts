import { api } from '@/lib/api';
import type { ContractDocument } from '@/lib/types';

/** Định dạng được backend chấp nhận (kiểm tra lại bằng magic bytes phía server). */
export const DOCUMENT_ACCEPT = '.pdf,.doc,.docx,.xlsx,.png,.jpg,.jpeg';
export const DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function uploadContractDocument(contractId: string, file: File) {
  const fd = new FormData();
  fd.append('file', file);
  return api<ContractDocument>(`/contracts/${contractId}/documents`, { method: 'POST', formData: fd });
}

/** Đặt một tài liệu PDF làm bản gốc của hồ sơ (xem, in, tải theo đúng file khách gửi). */
export function setMainDocument(contractId: string, documentId: string) {
  return api<{ id: string }>(`/contracts/${contractId}/documents/${documentId}/main`, { method: 'POST' });
}

/**
 * Hồ sơ lập từ file: giữ file khách gửi làm bản gốc. PDF dùng luôn bản đã tải lên; Word, Excel được đổi sang PDF
 * (giữ bố cục) rồi tải lên thêm. Ảnh, PDF scan vẫn xem được ở tab Tài liệu nên không đặt bản gốc.
 */
export async function attachMainDocument(contractId: string, file: File, uploaded: ContractDocument) {
  if (/\.pdf$/i.test(file.name)) return setMainDocument(contractId, uploaded.id);
  if (!/\.(docx?|xlsx)$/i.test(file.name)) return null;
  const { convertToPdf } = await import('@/lib/docx');
  const pdf = await uploadContractDocument(contractId, await convertToPdf(file));
  return setMainDocument(contractId, pdf.id);
}

/** SHA-256 (hex) của dữ liệu – dùng để đối chiếu file nhận được với mã băm đã đóng băng khi gửi ký. */
export async function sha256Hex(data: ArrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
