import { Suspense } from 'react';
import { PrintContract } from './print-contract';

export const metadata = { title: 'In hợp đồng', robots: { index: false, follow: false } };

// Trang in: dữ liệu chỉ có sau khi đăng nhập ở trình duyệt ⇒ bọc Suspense cho tham số động.
export default function PrintContractPage() {
  return (
    <Suspense fallback={null}>
      <PrintContract />
    </Suspense>
  );
}
