'use client';

import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ApiError } from '@/lib/api';
import { AuthProvider } from '@/lib/auth';

z.config(z.locales.vi());

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
            refetchOnWindowFocus: false,
          },
        },
        // Lỗi thao tác hiển thị toast thống nhất, trừ khi mutation tự xử lý (meta.silent).
        mutationCache: new MutationCache({
          onError: (err, _v, _c, mutation) => {
            if (mutation.meta?.silent) return;
            toast.error(err instanceof Error ? err.message : 'Thao tác thất bại');
          },
        }),
      }),
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthProvider>{children}</AuthProvider>
        </TooltipProvider>
        <Toaster richColors position="top-right" />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
