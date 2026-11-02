'use client';

import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { PaymentRequestForm } from '@/components/payment-request-form';

export default function NewPaymentRequestPage() {
  const contractId = useSearchParams().get('contract') ?? '';
  return (
    <>
      <PageHeader
        title="Lập đề nghị thanh toán"
        description="Lập giấy đề nghị thanh toán gửi khách hàng: tự điền từ đơn đặt hàng hoặc hợp đồng, sửa nội dung, lưu vào danh sách rồi in PDF hoặc tải Word."
        crumbs={[{ label: 'Đề nghị thanh toán', href: '/payment-requests' }, { label: 'Lập đề nghị' }]}
      />
      {/* key: mở từ hồ sơ khác thì điền lại từ đầu. */}
      <PaymentRequestForm key={contractId} contractId={contractId} />
    </>
  );
}
