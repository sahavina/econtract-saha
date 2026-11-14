'use client';

import { FileSignature } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
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
  // Mục không có query chỉ active khi URL không có view/type/from/category.
  if (!qs) return !search.get('view') && !search.get('type') && !search.get('from') && !search.get('category');
  return [...want.entries()].every(([k, v]) => search.get(k) === v);
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function AppSidebar() {
  const { user, can } = useAuth();
  const pathname = usePathname();
  const search = useSearchParams();

  const visible = (item: NavItem) =>
    item.platformOnly ? !!user?.isPlatformAdmin : !item.permissions || can(...item.permissions);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border py-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild className="hover:bg-sidebar-accent/60">
              <Link href="/">
                <div className="flex aspect-square size-9 items-center justify-center rounded-lg bg-gradient-to-br from-sky-400 to-blue-700 text-white shadow-md shadow-blue-950/40 ring-1 ring-white/15">
                  <FileSignature className="size-[18px]" />
                </div>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate text-[15px] font-semibold tracking-tight text-white">SAHA eContract</span>
                  <span className="truncate text-xs text-sidebar-foreground/70">{user?.tenant.name}</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="gap-0 py-2">
        {NAV.map((group) => {
          const items = group.items.filter(visible);
          if (!items.length) return null;
          return (
            <SidebarGroup key={group.label} className="py-1.5">
              <SidebarGroupLabel className="text-[11px] font-semibold tracking-wider text-sidebar-foreground/50 uppercase">{group.label}</SidebarGroupLabel>
              <SidebarMenu className="gap-0.5">
                {items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    {item.href ? (
                      <SidebarMenuButton
                        asChild
                        tooltip={item.title}
                        isActive={isActive(item.href, pathname, search)}
                        className="text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-white data-[active=true]:bg-sidebar-primary data-[active=true]:font-medium data-[active=true]:text-sidebar-primary-foreground data-[active=true]:shadow-sm data-[active=true]:shadow-blue-950/30"
                      >
                        <Link href={item.href}>
                          <item.icon />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    ) : (
                      <SidebarMenuButton disabled tooltip={`${item.title} – sắp có`} className="opacity-50">
                        <item.icon />
                        <span>{item.title}</span>
                        <Badge variant="outline" className="ml-auto border-sidebar-border text-[10px] text-sidebar-foreground/70">
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
      <SidebarFooter className="border-t border-sidebar-border">
        <div className="flex items-center gap-2.5 rounded-md px-1.5 py-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-xs font-semibold text-white">
            {initials(user?.fullName ?? '?')}
          </div>
          <div className="grid min-w-0 flex-1 leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm font-medium text-white">{user?.fullName}</span>
            <span className="truncate text-xs text-sidebar-foreground/60">{user?.roles.map((r) => r.name).join(', ')}</span>
          </div>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
