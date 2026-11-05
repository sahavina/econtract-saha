'use client';

import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { QuoteForm } from '@/components/quote-form';
import { useAuth } from '@/lib/auth';

export default function NewQuotePage() {
  const { can } = useAuth();
  const partner = useSearchParams().get('partner') ?? '';
  return (
    <>
      <PageHeader
        title="Lập báo giá"
        description="Chọn khách hàng và hàng hóa, nhập đơn giá và điều kiện. Số báo giá tự sinh khi lưu."
        crumbs={[{ label: 'Báo giá', href: '/quotes' }, { label: 'Lập báo giá' }]}
      />
      {can('quote.manage') ? <QuoteForm key={partner} partnerParam={partner} /> : <p className="text-sm text-muted-foreground">Bạn không có quyền lập báo giá.</p>}
    </>
  );
}
