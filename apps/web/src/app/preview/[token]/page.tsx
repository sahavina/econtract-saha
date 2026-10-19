import { Suspense } from 'react';
import { PublicPreview } from './public-preview';

export const metadata = { title: 'Xem trước hợp đồng', robots: { index: false, follow: false } };

// Trang xem trước công khai cho khách hàng: token nằm trong URL ⇒ nội dung chỉ có lúc chạy, bọc Suspense để streaming.
export default function PublicPreviewPage() {
  return (
    <Suspense fallback={null}>
      <PublicPreview />
    </Suspense>
  );
}
