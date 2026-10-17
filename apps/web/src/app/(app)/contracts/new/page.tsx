'use client';

import { ContractForm } from '@/components/contract-form';
import { PageHeader } from '@/components/page-header';
import { useAuth } from '@/lib/auth';

export default function NewContractPage() {
  const { can } = useAuth();
  return (
    <>
      <PageHeader
        title="Tạo hợp đồng"
        description="Lưu nháp thông tin chung và các bên. Nội dung, tài liệu, phê duyệt và ký sẽ bổ sung ở các bước tiếp theo."
        crumbs={[{ label: 'Quản lý hợp đồng', href: '/contracts' }, { label: 'Tạo hợp đồng' }]}
      />
      {can('contract.create') ? <ContractForm /> : <p className="text-sm text-muted-foreground">Bạn không có quyền tạo hợp đồng.</p>}
    </>
  );
}
