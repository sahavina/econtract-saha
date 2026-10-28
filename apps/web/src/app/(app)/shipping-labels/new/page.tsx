'use client';

import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { ShippingLabelForm } from '@/components/shipping-label-form';

/** Tạo phiếu gửi hàng: trống, hoặc điền sẵn từ đơn (?order=) / phiếu xuất kho (?stockIssue=). */
export default function NewShippingLabelPage() {
  const params = useSearchParams();
  const orderId = params.get('order') ?? '';
  const stockIssueId = params.get('stockIssue') ?? '';
  return (
    <>
      <PageHeader
        title="Tạo phiếu gửi hàng"
        description="Phiếu dán thùng gửi chành xe: người gửi, lưu ý, người nhận và điện thoại; in mỗi thùng một phiếu, lưu để theo dõi chành xe."
        crumbs={[{ label: 'Phiếu gửi hàng', href: '/shipping-labels' }, { label: 'Tạo phiếu' }]}
      />
      {/* key: mở từ đơn / phiếu xuất kho khác thì điền lại từ đầu. */}
      <ShippingLabelForm key={`${orderId}|${stockIssueId}`} orderId={orderId} stockIssueId={stockIssueId} />
    </>
  );
}
