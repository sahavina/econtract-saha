import { PERMISSIONS, type Permission } from '@saha/shared';
import {
  Archive,
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  FilePen,
  FileSignature,
  FileText,
  Handshake,
  History,
  LayoutDashboard,
  type LucideIcon,
  ScrollText,
  Settings,
  ShieldCheck,
  Users,
  Workflow,
} from 'lucide-react';

export interface NavItem {
  title: string;
  icon: LucideIcon;
  /** Chưa có href ⇒ phân hệ chưa triển khai, hiển thị mờ kèm nhãn "Sắp có". */
  href?: string;
  permissions?: Permission[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

const VIEW_CONTRACT = [PERMISSIONS.CONTRACT_VIEW_ALL, PERMISSIONS.CONTRACT_VIEW_OWN];

export const NAV: NavGroup[] = [
  {
    label: 'Tổng quan',
    items: [
      { title: 'Dashboard', icon: LayoutDashboard, href: '/', permissions: [PERMISSIONS.DASHBOARD_VIEW] },
      { title: 'Công việc của tôi', icon: ClipboardList },
      { title: 'Thông báo', icon: Bell },
      { title: 'Lịch hợp đồng', icon: CalendarDays },
    ],
  },
  {
    label: 'Quản lý hợp đồng',
    items: [
      { title: 'Tất cả hợp đồng', icon: FileText, href: '/contracts', permissions: VIEW_CONTRACT },
      { title: 'Hợp đồng của tôi', icon: FileText, href: '/contracts?view=mine', permissions: VIEW_CONTRACT },
      { title: 'Hợp đồng nháp', icon: FilePen, href: '/contracts?view=draft', permissions: VIEW_CONTRACT },
      { title: 'Sắp hết hạn', icon: CalendarDays, href: '/contracts?view=expiring', permissions: VIEW_CONTRACT },
      { title: 'Đã lưu trữ', icon: Archive, href: '/contracts?view=archived', permissions: VIEW_CONTRACT },
    ],
  },
  {
    label: 'Soạn thảo',
    items: [
      { title: 'Tạo hợp đồng', icon: FilePen, href: '/contracts/new', permissions: [PERMISSIONS.CONTRACT_CREATE] },
      { title: 'Mẫu hợp đồng', icon: ScrollText },
      { title: 'Thư viện điều khoản', icon: ClipboardCheck },
    ],
  },
  {
    label: 'Ký điện tử',
    items: [{ title: 'Yêu cầu ký', icon: FileSignature }],
  },
  {
    label: 'Đối tác',
    items: [
      { title: 'Khách hàng', icon: Handshake, href: '/partners?type=CUSTOMER', permissions: [PERMISSIONS.PARTNER_VIEW] },
      { title: 'Nhà cung cấp', icon: Building2, href: '/partners?type=SUPPLIER', permissions: [PERMISSIONS.PARTNER_VIEW] },
      { title: 'Tất cả đối tác', icon: Users, href: '/partners', permissions: [PERMISSIONS.PARTNER_VIEW] },
    ],
  },
  {
    label: 'Quản trị',
    items: [
      { title: 'Báo cáo', icon: BarChart3 },
      { title: 'Người dùng', icon: Users },
      { title: 'Vai trò và phân quyền', icon: ShieldCheck },
      { title: 'Quy trình phê duyệt', icon: Workflow },
      { title: 'Cấu hình', icon: Settings },
      { title: 'Nhật ký hoạt động', icon: History, href: '/audit-logs', permissions: [PERMISSIONS.AUDIT_VIEW] },
    ],
  },
];
