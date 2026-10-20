'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { ContractForm } from '@/components/contract-form';
import { ErrorState, PageHeader } from '@/components/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import type { ContractDetail } from '@/lib/types';

export default function EditContractPage() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery({ queryKey: ['contract', id], queryFn: () => api<ContractDetail>(`/contracts/${id}`) });

  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data) return <Skeleton className="h-96" />;

  const c = q.data;
  const editable = c.status === 'DRAFT' && !c.archivedAt && !c.deletedAt;
  const isOrder = c.kind === 'ORDER';
  return (
    <>
      <PageHeader
        title={`Sửa ${isOrder ? 'đơn hàng' : 'hợp đồng'} ${c.code}`}
        crumbs={[isOrder ? { label: 'Đơn đặt hàng', href: '/orders' } : { label: 'Quản lý hợp đồng', href: '/contracts' }, { label: c.code, href: `/contracts/${c.id}` }, { label: 'Chỉnh sửa' }]}
      />
      {editable ? <ContractForm contract={c} /> : <p className="text-sm text-muted-foreground">Chỉ được chỉnh sửa {isOrder ? 'đơn hàng' : 'hợp đồng'} ở trạng thái Nháp.</p>}
    </>
  );
}
