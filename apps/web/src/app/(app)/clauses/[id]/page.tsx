'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { ClauseEditorPage } from '@/components/clause-editor-page';
import { ErrorState } from '@/components/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import type { ClauseDetail } from '@/lib/types';

export default function ClauseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery({ queryKey: ['clause', id], queryFn: () => api<ClauseDetail>(`/clauses/${id}`) });
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data) return <Skeleton className="h-96" />;
  // key theo phiên bản + trạng thái để nạp lại dữ liệu sau mỗi lần chuyển trạng thái.
  return <ClauseEditorPage key={`${q.data.id}-${q.data.version}-${q.data.status}`} clause={q.data} />;
}
