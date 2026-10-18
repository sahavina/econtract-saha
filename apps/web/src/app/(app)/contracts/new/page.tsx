'use client';

import { FilePen, FileUp } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ContractForm } from '@/components/contract-form';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';

export default function NewContractPage() {
  const { can } = useAuth();
  const fromFile = useSearchParams().get('from') === 'file';
  return (
    <>
      <PageHeader
        title={fromFile ? 'Tạo hợp đồng từ file' : 'Tạo hợp đồng'}
        description={
          fromFile
            ? 'Tải lên bản hợp đồng có sẵn, nhập thông tin chung và các bên; sau đó gửi phê duyệt và ký như hợp đồng soạn trong hệ thống.'
            : 'Lưu nháp thông tin chung và các bên. Nội dung, tài liệu, phê duyệt và ký sẽ bổ sung ở các bước tiếp theo.'
        }
        crumbs={[{ label: 'Quản lý hợp đồng', href: '/contracts' }, { label: fromFile ? 'Tạo hợp đồng từ file' : 'Tạo hợp đồng' }]}
        actions={
          <Button variant="outline" asChild>
            {fromFile ? (
              <Link href="/contracts/new">
                <FilePen /> Soạn trong hệ thống
              </Link>
            ) : (
              <Link href="/contracts/new?from=file">
                <FileUp /> Tạo từ file
              </Link>
            )}
          </Button>
        }
      />
      {can('contract.create') ? (
        // key: đổi chế độ thì dựng lại form, không giữ tệp/giá trị của chế độ trước.
        <ContractForm key={fromFile ? 'file' : 'compose'} fromFile={fromFile} />
      ) : (
        <p className="text-sm text-muted-foreground">Bạn không có quyền tạo hợp đồng.</p>
      )}
    </>
  );
}
