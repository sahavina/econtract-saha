'use client';

import { TemplateList } from '@/components/template-list';

/** Đơn đặt hàng → Mẫu đơn đặt hàng: mẫu gắn loại "Đơn đặt hàng". */
export default function OrderTemplatesPage() {
  return <TemplateList kind="ORDER" />;
}
