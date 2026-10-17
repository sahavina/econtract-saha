'use client';

import { FileSignature } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';
import { useAuth } from '@/lib/auth';
import { NAV, type NavItem } from './nav-config';

function isActive(href: string, pathname: string, search: URLSearchParams) {
  const [path, qs] = href.split('?');
  if (path !== pathname) return false;
  const want = new URLSearchParams(qs ?? '');
  // Mục không có query chỉ active khi URL không có view/type.
  if (!qs) return !search.get('view') && !search.get('type');
  return [...want.entries()].every(([k, v]) => search.get(k) === v);
}

export function AppSidebar() {
  const { user, can } = useAuth();
  const pathname = usePathname();
  const search = useSearchParams();

  const visible = (item: NavItem) =>
    item.platformOnly ? !!user?.isPlatformAdmin : !item.permissions || can(...item.permissions);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <FileSignature className="size-4" />
                </div>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-semibold">SAHA eContract</span>
                  <span className="truncate text-xs text-muted-foreground">{user?.tenant.name}</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {NAV.map((group) => {
          const items = group.items.filter(visible);
          if (!items.length) return null;
          return (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarMenu>
                {items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    {item.href ? (
                      <SidebarMenuButton asChild tooltip={item.title} isActive={isActive(item.href, pathname, search)}>
                        <Link href={item.href}>
                          <item.icon />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    ) : (
                      <SidebarMenuButton disabled tooltip={`${item.title} – sắp có`} className="opacity-50">
                        <item.icon />
                        <span>{item.title}</span>
                        <Badge variant="outline" className="ml-auto text-[10px]">
                          Sắp có
                        </Badge>
                      </SidebarMenuButton>
                    )}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroup>
          );
        })}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
