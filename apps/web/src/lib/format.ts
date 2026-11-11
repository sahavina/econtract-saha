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
  'contract.purge': 'Xóa vĩnh viễn hợp đồng',
  'contract.revision_restore': 'Khôi phục nội dung về phiên bản cũ',
  'contract.restore': 'Khôi phục hợp đồng',
  'contract.document_upload': 'Tải lên tài liệu',
  'contract.document_delete': 'Xóa tài liệu',
  'order.delivery_update': 'Cập nhật giao hàng',
  'product.create': 'Thêm sản phẩm',
  'product.update': 'Sửa sản phẩm',
  'contract.esign_request': 'Gửi yêu cầu ký số MISA eSign',
  'contract.document_esign': 'Ký số tài liệu (MISA eSign)',
  'esign.account_link': 'Liên kết tài khoản MISA eSign',
  'esign.account_unlink': 'Hủy liên kết tài khoản MISA eSign',
  'integration.esign_config': 'Cấu hình MISA eSign',
  'integration.esign_remove': 'Xóa cấu hình MISA eSign',
  'contract.submit_approval': 'Gửi phê duyệt',
  'contract.approval_approve': 'Phê duyệt',
  'contract.approval_reject': 'Từ chối phê duyệt',
  'contract.approval_request_changes': 'Yêu cầu chỉnh sửa',
  'contract.approval_cancel': 'Rút lại yêu cầu phê duyệt',
  'contract.approval_reopen': 'Mở lại hồ sơ đã phê duyệt để chỉnh sửa',
  'contract.self_approve': 'Tự phê duyệt',
  'contract.signature_request': 'Gửi yêu cầu ký',
  'contract.signature_link': 'Cấp lại liên kết ký',
  'contract.preview_link_create': 'Tạo link xem trước cho khách hàng',
  'contract.preview_link_revoke': 'Thu hồi link xem trước',
  'contract.preview_view': 'Khách hàng mở link xem trước',
  'contract.feedback_submit': 'Khách hàng gửi yêu cầu thay đổi',
  'contract.feedback_agree': 'Khách hàng đồng ý nội dung',
  'contract.feedback_resolve': 'Xử lý yêu cầu của khách hàng',
  'contract.feedback_reopen': 'Mở lại yêu cầu của khách hàng',
  'contract.signed': 'Ký hợp đồng',
  'contract.signature_reject': 'Từ chối ký',
  'contract.signature_cancel': 'Hủy yêu cầu ký',
  'contract.signature_completed': 'Hoàn tất ký hợp đồng',
  'workflow.create': 'Tạo quy trình phê duyệt',
  'workflow.update': 'Cập nhật quy trình phê duyệt',
  'workflow.delete': 'Xóa quy trình phê duyệt',
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
  'contract.appendix_create': 'Lập phụ lục',
  'contract.appendix_update': 'Sửa phụ lục',
  'contract.appendix_apply': 'Phụ lục có hiệu lực',
  'contract.appendix_cancel': 'Hủy phụ lục',
  'contract.obligation_create': 'Thêm nghĩa vụ',
  'contract.obligation_update': 'Cập nhật nghĩa vụ',
  'contract.obligation_delete': 'Xóa nghĩa vụ',
  'contract.payment_create': 'Thêm đợt thanh toán',
  'contract.payment_update': 'Sửa đợt thanh toán',
  'contract.payment_cancel': 'Hủy đợt thanh toán',
  'contract.payment_record': 'Ghi nhận thanh toán',
  'contract.acceptance_create': 'Lập biên bản nghiệm thu',
  'contract.acceptance_delete': 'Xóa biên bản nghiệm thu',
  'contract.liquidate': 'Thanh lý hợp đồng',
  'contract.auto_activate': 'Tự động chuyển Đang hiệu lực',
  'contract.auto_expire': 'Tự động chuyển Hết hiệu lực',
  'user.create': 'Tạo người dùng',
  'user.update': 'Cập nhật người dùng',
  'user.reset_password': 'Đặt lại mật khẩu',
  'user.change_password': 'Đổi mật khẩu',
  'role.create': 'Tạo vai trò',
  'role.update': 'Cập nhật vai trò',
  'role.delete': 'Xóa vai trò',
  'department.create': 'Tạo phòng ban',
  'department.update': 'Cập nhật phòng ban',
  'branch.create': 'Tạo chi nhánh',
  'branch.update': 'Cập nhật chi nhánh',
  'contract_type.create': 'Tạo loại hợp đồng',
  'contract_type.update': 'Cập nhật loại hợp đồng',
  'partner.create': 'Tạo đối tác',
  'partner.update': 'Cập nhật đối tác',
  'partner.delete': 'Xóa đối tác',
  'partner.odoo_import': 'Nhập đối tác từ Odoo',
  'partner.odoo_sync': 'Cập nhật đối tác từ Odoo',
  'partner.odoo_link': 'Ánh xạ đối tác với Odoo',
  'company.update': 'Cập nhật thông tin doanh nghiệp',
  'integration.odoo_config': 'Cấu hình kết nối Odoo',
  'integration.odoo_remove': 'Xóa kết nối Odoo',
  'platform.tenant_create': 'Super Admin tạo doanh nghiệp',
  'platform.tenant_update': 'Super Admin sửa thông tin doanh nghiệp',
  'platform.tenant_status': 'Super Admin đổi trạng thái doanh nghiệp',
  'platform.subscription_create': 'Đổi gói / gia hạn dịch vụ',
  'platform.subscription_update': 'Cập nhật thuê bao',
  'platform.plan_create': 'Tạo gói dịch vụ',
  'platform.plan_update': 'Cập nhật gói dịch vụ',
  'platform.invoice_create': 'Phát hành hóa đơn thuê bao',
  'platform.invoice_paid': 'Ghi nhận thanh toán hóa đơn',
  'platform.invoice_void': 'Hủy hóa đơn thuê bao',
};
