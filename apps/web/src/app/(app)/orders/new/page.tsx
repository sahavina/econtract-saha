'use client';

import { useSearchParams } from 'next/navigation';
import { PartnerContractForm } from '@/components/contract-form';
import { PageHeader } from '@/components/page-header';
import { useAuth } from '@/lib/auth';

export default function NewOrderPage() {
  const { can } = useAuth();
  const params = useSearchParams();
  const parent = params.get('parent') ?? '';
  const fromFile = params.get('from') === 'file';
  const partner = params.get('partner') ?? '';
  const quote = params.get('quote') ?? '';
  const keep = [parent && `parent=${parent}`, partner && `partner=${partner}`, quote && `quote=${quote}`].filter(Boolean).join('&');
  const title = fromFile ? 'Tạo đơn đặt hàng từ file' : 'Tạo đơn đặt hàng';
  const crumbs = [{ label: 'Đơn đặt hàng', href: '/orders' }, { label: title }];
  if (!can('contract.create')) {
    return (
      <>
        <PageHeader title={title} crumbs={crumbs} />
        <p className="text-sm text-muted-foreground">Bạn không có quyền tạo đơn đặt hàng.</p>
      </>
    );
  }
  return (
    // key: đổi chế độ/hợp đồng nguyên tắc/đối tác thì dựng lại form.
    <PartnerContractForm
      key={`${parent}-${partner}-${quote}-${fromFile}`}
      kind="ORDER"
      parentId={parent}
      partnerId={partner}
      quoteId={quote}
      fromFile={fromFile}
      header={{
        title,
        description: fromFile
          ? 'Tải lên đơn của khách (Word, Excel, PDF): hệ thống tự điền thông tin và hàng hóa để bạn kiểm tra lại'
          : 'Nhập hàng hóa, gắn hợp đồng nguyên tắc; sau khi lưu, gửi phê duyệt và ký như hợp đồng',
        crumbs,
      }}
      switchMode={
        fromFile
          ? { href: `/orders/new${keep ? `?${keep}` : ''}`, label: 'Soạn trong hệ thống →' }
          : { href: `/orders/new?from=file${keep ? `&${keep}` : ''}`, label: 'Đã có file đơn? Tạo từ file →' }
      }
    />
  );
}
