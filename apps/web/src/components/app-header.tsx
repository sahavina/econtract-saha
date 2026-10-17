'use client';

import { LogOut, Monitor, Moon, Search, Sun } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { type FormEvent, useState } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useAuth } from '@/lib/auth';

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function AppHeader() {
  const { user, logout, can } = useAuth();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const [q, setQ] = useState('');

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    router.push(term ? `/contracts?q=${encodeURIComponent(term)}` : '/contracts');
  };

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      {can('contract.view_all', 'contract.view_own') && (
        <form onSubmit={onSearch} className="relative w-full max-w-md" role="search">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm hợp đồng theo mã, tên, đối tác…"
            className="pl-8"
            aria-label="Tìm kiếm hợp đồng"
          />
        </form>
      )}
      <div className="ml-auto flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-9 gap-2 px-2">
              <Avatar className="size-7">
                <AvatarFallback className="text-xs">{user ? initials(user.fullName) : '?'}</AvatarFallback>
              </Avatar>
              <span className="hidden text-sm font-medium md:inline">{user?.fullName}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel>
              <div className="font-medium">{user?.fullName}</div>
              <div className="text-xs font-normal text-muted-foreground">{user?.email}</div>
              <div className="mt-1 text-xs font-normal text-muted-foreground">
                {user?.roles.map((r) => r.name).join(', ')}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">Giao diện</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
              <DropdownMenuRadioItem value="light">
                <Sun /> Sáng
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">
                <Moon /> Tối
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">
                <Monitor /> Theo hệ thống
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={async () => {
                await logout();
                router.replace('/login');
              }}
            >
              <LogOut /> Đăng xuất
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
