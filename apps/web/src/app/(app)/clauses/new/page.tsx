'use client';

import { ClauseEditorPage } from '@/components/clause-editor-page';
import { useAuth } from '@/lib/auth';

export default function NewClausePage() {
  const { can } = useAuth();
  if (!can('template.manage')) return <p className="text-sm text-muted-foreground">Bạn không có quyền thêm điều khoản.</p>;
  return <ClauseEditorPage />;
}
