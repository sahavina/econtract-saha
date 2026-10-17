'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { Lookups } from './types';

export function useLookups() {
  return useQuery({ queryKey: ['contract-lookups'], queryFn: () => api<Lookups>('/contracts/lookups'), staleTime: 5 * 60_000 });
}
