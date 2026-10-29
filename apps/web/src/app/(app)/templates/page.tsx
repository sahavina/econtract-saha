'use client';

import { TemplateList } from '@/components/template-list';

/** Soạn thảo → Mẫu hợp đồng (không gồm mẫu đơn đặt hàng). */
export default function TemplatesPage() {
  return <TemplateList kind="CONTRACT" />;
}
