import { api } from '@/lib/api';
import type { ContractDocument } from '@/lib/types';

/** Định dạng được backend chấp nhận (kiểm tra lại bằng magic bytes phía server). */
export const DOCUMENT_ACCEPT = '.pdf,.docx,.xlsx,.png,.jpg,.jpeg';
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

/** SHA-256 (hex) của dữ liệu – dùng để đối chiếu file nhận được với mã băm đã đóng băng khi gửi ký. */
export async function sha256Hex(data: ArrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
