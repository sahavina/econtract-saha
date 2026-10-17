import { PERMISSIONS, type Permission } from '@saha/shared';
import {
  Archive,
  BarChart3,
  Bell,
  Building,
  Building2,
  CalendarDays,
  CalendarX2,
  FileCheck2,
  FilePlus2,
  FileX2,
  ListChecks,
  Wallet,
  PenLine,
  ClipboardCheck,
  ClipboardList,
  FilePen,
  FileSignature,
  FileText,
  Handshake,
  History,
  Hourglass,
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
      { title: 'Công việc của tôi', icon: ClipboardList, href: '/tasks', permissions: VIEW_CONTRACT },
      { title: 'Thông báo', icon: Bell },
      { title: 'Lịch hợp đồng', icon: CalendarDays, href: '/calendar', permissions: VIEW_CONTRACT },
    ],
  },
  {
    label: 'Quản lý hợp đồng',
    items: [
      { title: 'Tất cả hợp đồng', icon: FileText, href: '/contracts', permissions: VIEW_CONTRACT },
      { title: 'Hợp đồng của tôi', icon: FileText, href: '/contracts?view=mine', permissions: VIEW_CONTRACT },
      { title: 'Hợp đồng nháp', icon: FilePen, href: '/contracts?view=draft', permissions: VIEW_CONTRACT },
      { title: 'Chờ phê duyệt', icon: Hourglass, href: '/contracts?view=pending_approval', permissions: VIEW_CONTRACT },
      { title: 'Sắp hết hạn', icon: CalendarDays, href: '/contracts?view=expiring', permissions: VIEW_CONTRACT },
      { title: 'Đã lưu trữ', icon: Archive, href: '/contracts?view=archived', permissions: VIEW_CONTRACT },
    ],
  },
  {
    label: 'Soạn thảo',
    items: [
      { title: 'Tạo hợp đồng', icon: FilePen, href: '/contracts/new', permissions: [PERMISSIONS.CONTRACT_CREATE] },
      { title: 'Mẫu hợp đồng', icon: ScrollText, href: '/templates', permissions: [PERMISSIONS.TEMPLATE_VIEW] },
      { title: 'Thư viện điều khoản', icon: ClipboardCheck, href: '/clauses', permissions: [PERMISSIONS.TEMPLATE_VIEW] },
    ],
  },
  {
    label: 'Ký điện tử',
    items: [
      { title: 'Yêu cầu ký', icon: FileSignature, href: '/signatures', permissions: VIEW_CONTRACT },
      { title: 'Chờ tôi ký', icon: PenLine, href: '/signatures?view=mine', permissions: VIEW_CONTRACT },
      { title: 'Đang chờ đối tác', icon: Hourglass, href: '/signatures?view=waiting_partner', permissions: VIEW_CONTRACT },
      { title: 'Đã hoàn tất', icon: FileCheck2, href: '/signatures?view=completed', permissions: VIEW_CONTRACT },
      { title: 'Bị từ chối', icon: FileX2, href: '/signatures?view=rejected', permissions: VIEW_CONTRACT },
      { title: 'Hết hạn yêu cầu ký', icon: CalendarX2, href: '/signatures?view=expired', permissions: VIEW_CONTRACT },
    ],
  },
  {
    label: 'Vòng đời hợp đồng',
    items: [
      { title: 'Phụ lục & gia hạn', icon: FilePlus2, href: '/lifecycle?kind=appendices', permissions: VIEW_CONTRACT },
      { title: 'Nghĩa vụ & tiến độ', icon: ListChecks, href: '/lifecycle?kind=obligations', permissions: VIEW_CONTRACT },
      { title: 'Thanh toán', icon: Wallet, href: '/lifecycle?kind=payments', permissions: VIEW_CONTRACT },
      { title: 'Nghiệm thu', icon: ClipboardCheck, href: '/lifecycle?kind=acceptances', permissions: VIEW_CONTRACT },
      { title: 'Đã thanh lý', icon: FileX2, href: '/contracts?view=liquidated', permissions: VIEW_CONTRACT },
    ],
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
      { title: 'Người dùng', icon: Users, href: '/admin/users', permissions: [PERMISSIONS.USER_VIEW] },
      { title: 'Phòng ban, chi nhánh', icon: Building, href: '/admin/org', permissions: [PERMISSIONS.ORG_MANAGE] },
      { title: 'Vai trò và phân quyền', icon: ShieldCheck, href: '/admin/roles', permissions: [PERMISSIONS.ROLE_MANAGE] },
      { title: 'Quy trình phê duyệt', icon: Workflow, href: '/workflows', permissions: [PERMISSIONS.WORKFLOW_MANAGE] },
      { title: 'Cấu hình', icon: Settings, href: '/admin/settings', permissions: [PERMISSIONS.SETTINGS_MANAGE] },
      { title: 'Nhật ký hoạt động', icon: History, href: '/audit-logs', permissions: [PERMISSIONS.AUDIT_VIEW] },
    ],
  },
];
