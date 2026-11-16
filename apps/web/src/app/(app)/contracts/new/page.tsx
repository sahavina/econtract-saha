'use client';

import { useSearchParams } from 'next/navigation';
import { PartnerContractForm } from '@/components/contract-form';
import { PageHeader } from '@/components/page-header';
import { useAuth } from '@/lib/auth';

export default function NewContractPage() {
  const { can } = useAuth();
  const params = useSearchParams();
  const fromFile = params.get('from') === 'file';
  const partner = params.get('partner') ?? '';
  const title = fromFile ? 'Tạo hợp đồng từ file' : 'Tạo hợp đồng mới';
  const crumbs = [{ label: 'Hợp đồng', href: '/contracts' }, { label: title }];
  if (!can('contract.create')) {
    return (
      <>
        <PageHeader title={title} crumbs={crumbs} />
        <p className="text-sm text-muted-foreground">Bạn không có quyền tạo hợp đồng.</p>
      </>
    );
  }
  return (
    // key: đổi chế độ/đối tác thì dựng lại form, không giữ tệp/giá trị của chế độ trước.
    <PartnerContractForm
      key={`${partner}-${fromFile}`}
      partnerId={partner}
      fromFile={fromFile}
      header={{
        title,
        description: fromFile ? 'Tải lên bản hợp đồng có sẵn, kiểm tra thông tin rồi gửi phê duyệt và ký' : 'Thiết lập thông tin và quy trình ký kết',
        crumbs,
      }}
      switchMode={
        fromFile
          ? { href: `/contracts/new${partner ? `?partner=${partner}` : ''}`, label: 'Soạn trong hệ thống →' }
          : { href: `/contracts/new?from=file${partner ? `&partner=${partner}` : ''}`, label: 'Đã có file hợp đồng? Tạo từ file →' }
      }
    />
  );
}
