import { AppShell } from '@/components/app-shell';

// Khu vực ứng dụng xác thực phía client (access token trong bộ nhớ) nên không có
// static shell để điều hướng tức thì – loại khỏi kiểm tra instant navigation.
export const instant = false;

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
