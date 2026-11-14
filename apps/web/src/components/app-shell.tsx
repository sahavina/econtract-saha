'use client';

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { AppHeader } from '@/components/app-header';
import { AppSidebar } from '@/components/app-sidebar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { useAuth } from '@/lib/auth';

function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center text-muted-foreground">
      <Loader2 className="size-6 animate-spin" />
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === 'anonymous') router.replace('/login');
  }, [status, router]);

  if (status !== 'authenticated') return <FullScreenLoader />;

  return (
    <SidebarProvider>
      <Suspense>
        <AppSidebar />
      </Suspense>
      <SidebarInset className="min-w-0">
        <AppHeader />
        <div className="mx-auto w-full max-w-[1680px] min-w-0 flex-1 p-4 md:p-6 lg:px-8">
          <Suspense fallback={<FullScreenLoader />}>{children}</Suspense>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
