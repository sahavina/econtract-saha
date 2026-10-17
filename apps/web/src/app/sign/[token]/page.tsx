import { Suspense } from 'react';
import { PublicSign } from './public-sign';

export const metadata = { title: 'Ký hợp đồng', robots: { index: false, follow: false } };

// Trang ký công khai: token nằm trong URL ⇒ nội dung chỉ có lúc chạy, bọc Suspense để streaming.
export default function PublicSignPage() {
  return (
    <Suspense fallback={null}>
      <PublicSign />
    </Suspense>
  );
}
