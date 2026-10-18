import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

/** Thông tin pháp nhân của doanh nghiệp mình (Cài đặt → Thông tin doanh nghiệp). */
export interface CompanyProfile {
  name: string;
  taxCode: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  representative: string | null;
  position: string | null;
  bankAccount: string | null;
  /** false: chưa khai báo trong Cài đặt – chỉ có thông tin lúc đăng ký doanh nghiệp. */
  configured: boolean;
}

export function useCompanyProfile(enabled = true) {
  return useQuery({
    queryKey: ['company-profile'],
    queryFn: () => api<CompanyProfile>('/company-profile'),
    enabled,
    staleTime: 5 * 60_000,
    retry: false,
  });
}
