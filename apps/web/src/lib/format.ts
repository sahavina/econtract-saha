const moneyFmt = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });
const compactFmt = new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 });
const dateFmt = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatMoney(value: string | number | null | undefined, currency = 'VND') {
  if (value === null || value === undefined || value === '') return '—';
  return `${moneyFmt.format(Number(value))} ${currency === 'VND' ? '₫' : currency}`;
}

export function formatCompact(value: number) {
  return compactFmt.format(value);
}

/** Ngày dạng @db.Date được trả về "YYYY-MM-DDT00:00:00.000Z" – định dạng theo UTC để không lệch ngày. */
export function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  const d = new Date(value);
  return dateFmt.format(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';
  return dateTimeFmt.format(new Date(value));
}

/** Chuyển ngày từ API sang giá trị cho <input type="date">. */
export function toDateInput(value: string | null | undefined) {
  return value ? value.slice(0, 10) : '';
}

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  'auth.login': 'Đăng nhập',
  'contract.create': 'Tạo hợp đồng',
  'contract.update': 'Chỉnh sửa hợp đồng',
  'contract.duplicate': 'Sao chép hợp đồng',
  'contract.archive': 'Lưu trữ hợp đồng',
  'contract.unarchive': 'Bỏ lưu trữ hợp đồng',
  'contract.delete': 'Chuyển vào thùng rác',
  'contract.restore': 'Khôi phục hợp đồng',
  'contract.document_upload': 'Tải lên tài liệu',
  'contract.document_delete': 'Xóa tài liệu',
  'template.create': 'Tạo mẫu hợp đồng',
  'template.update': 'Cập nhật mẫu hợp đồng',
  'template.activate': 'Kích hoạt mẫu',
  'template.archive': 'Lưu trữ mẫu',
  'template.delete': 'Xóa mẫu',
  'clause.create': 'Tạo điều khoản',
  'clause.update': 'Cập nhật điều khoản',
  'clause.submit': 'Gửi duyệt điều khoản',
  'clause.approve': 'Duyệt điều khoản',
  'clause.reject': 'Từ chối điều khoản',
  'clause.archive': 'Lưu trữ điều khoản',
  'clause.delete': 'Xóa điều khoản',
  'partner.create': 'Tạo đối tác',
  'partner.update': 'Cập nhật đối tác',
  'partner.delete': 'Xóa đối tác',
};
