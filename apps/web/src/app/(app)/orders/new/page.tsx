'use client';

import { FilePen, FileUp } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { PartnerContractForm } from '@/components/contract-form';
import { CreateSteps } from '@/components/create-steps';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';

export default function NewOrderPage() {
  const { can } = useAuth();
  const params = useSearchParams();
  const parent = params.get('parent') ?? '';
  const fromFile = params.get('from') === 'file';
  const partner = params.get('partner') ?? '';
  const quote = params.get('quote') ?? '';
  const keep = [parent && `parent=${parent}`, partner && `partner=${partner}`, quote && `quote=${quote}`].filter(Boolean).join('&');
  return (
    <>
      <PageHeader
        title={fromFile ? 'Tạo đơn đặt hàng từ file' : 'Tạo đơn đặt hàng'}
        description={
          fromFile
            ? 'Tải lên đơn của khách (Word, Excel, PDF): hệ thống tự điền thông tin và hàng hóa để bạn kiểm tra lại, rồi lưu nháp, gửi phê duyệt và ký như đơn soạn trong hệ thống.'
            : 'Chọn mẫu đơn hoặc dùng nội dung mặc định, nhập hàng hóa và gắn hợp đồng nguyên tắc. Sau khi lưu nháp, gửi phê duyệt và ký như hợp đồng.'
        }
        crumbs={[{ label: 'Đơn đặt hàng', href: '/orders' }, { label: fromFile ? 'Tạo đơn từ file' : 'Tạo đơn đặt hàng' }]}
        actions={
          <Button variant="outline" asChild>
            {fromFile ? (
              <Link href={`/orders/new${keep ? `?${keep}` : ''}`}>
                <FilePen /> Soạn trong hệ thống
              </Link>
            ) : (
              <Link href={`/orders/new?from=file${keep ? `&${keep}` : ''}`}>
                <FileUp /> Tạo từ file
              </Link>
            )}
          </Button>
        }
      />
      <CreateSteps />
      {can('contract.create') ? (
        // key: đổi chế độ/hợp đồng nguyên tắc/đối tác thì dựng lại form.
        <PartnerContractForm key={`${parent}-${partner}-${quote}-${fromFile}`} kind="ORDER" parentId={parent} partnerId={partner} quoteId={quote} fromFile={fromFile} />
      ) : (
        <p className="text-sm text-muted-foreground">Bạn không có quyền tạo đơn đặt hàng.</p>
      )}
    </>
  );
}
