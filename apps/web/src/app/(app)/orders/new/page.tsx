'use client';

import { useSearchParams } from 'next/navigation';
import { ContractForm } from '@/components/contract-form';
import { PageHeader } from '@/components/page-header';
import { useAuth } from '@/lib/auth';

export default function NewOrderPage() {
  const { can } = useAuth();
  const parent = useSearchParams().get('parent') ?? '';
  return (
    <>
      <PageHeader
        title="Tạo đơn đặt hàng"
        description="Chọn mẫu đơn hoặc dùng nội dung mặc định, nhập hàng hóa và gắn hợp đồng nguyên tắc. Sau khi lưu nháp, gửi phê duyệt và ký như hợp đồng."
        crumbs={[{ label: 'Đơn đặt hàng', href: '/orders' }, { label: 'Tạo đơn đặt hàng' }]}
      />
      {can('contract.create') ? (
        <ContractForm key={parent} kind="ORDER" parentId={parent} />
      ) : (
        <p className="text-sm text-muted-foreground">Bạn không có quyền tạo đơn đặt hàng.</p>
      )}
    </>
  );
}
