import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  ClipboardList,
  FileText,
  Settings,
  DollarSign,
  Users,
  CheckSquare,
  BarChart2,
  Sliders,
  Tag,
  Banknote,
  AlertOctagon,
  UserCheck,
  Fingerprint,
  Cpu,
  LogOut,
} from 'lucide-react';
import GlobalTopBar from './GlobalTopBar';
import { useAuth } from '../../lib/auth';

/* ─── Types ──────────────────────────────────────────────────────────────── */
type SidebarVariant = 'vendor' | 'approver' | 'admin' | undefined;

interface NavItem {
  to:    string;
  icon:  React.ReactNode;
  label: string;
}

interface AppLayoutProps {
  sidebar?: SidebarVariant;
}

/* ─── Sidebar nav definitions ────────────────────────────────────────────── */
const VENDOR_NAV: NavItem[] = [
  { to: '/vendor/dashboard',   icon: <LayoutDashboard className="w-4 h-4" />, label: 'Dashboard'   },
  { to: '/vendor/onboarding',  icon: <UserCheck       className="w-4 h-4" />, label: 'Onboarding'  },
  { to: '/vendor/kyc',         icon: <Fingerprint     className="w-4 h-4" />, label: 'KYC'         },
  { to: '/vendor/capabilities',icon: <Cpu             className="w-4 h-4" />, label: 'Capabilities'},
  { to: '/vendor/catalog',     icon: <Package         className="w-4 h-4" />, label: 'Catalog'     },
  { to: '/vendor/orders',      icon: <ClipboardList   className="w-4 h-4" />, label: 'Orders'      },
  { to: '/vendor/settlements', icon: <DollarSign      className="w-4 h-4" />, label: 'Settlements' },
];

const APPROVER_NAV: NavItem[] = [
  { to: '/approver/queue',   icon: <CheckSquare  className="w-4 h-4" />, label: 'Review Queue' },
  { to: '/approver/margins', icon: <BarChart2    className="w-4 h-4" />, label: 'Margin Review' },
];

const ADMIN_NAV: NavItem[] = [
  { to: '/admin/dashboard',   icon: <LayoutDashboard className="w-4 h-4" />, label: 'Dashboard'    },
  { to: '/admin/escalations', icon: <AlertOctagon    className="w-4 h-4" />, label: 'Escalations'  },
  { to: '/admin/margins',     icon: <BarChart2       className="w-4 h-4" />, label: 'Margins'      },
  { to: '/admin/coupons',     icon: <Tag             className="w-4 h-4" />, label: 'Coupons'      },
  { to: '/admin/settlements', icon: <Banknote        className="w-4 h-4" />, label: 'Settlements'  },
  { to: '/admin/vendors',     icon: <Users           className="w-4 h-4" />, label: 'Vendors'      },
  { to: '/admin/config',      icon: <Sliders         className="w-4 h-4" />, label: 'Platform Cfg' },
];

function getNavItems(variant: SidebarVariant): NavItem[] {
  switch (variant) {
    case 'vendor':   return VENDOR_NAV;
    case 'approver': return APPROVER_NAV;
    case 'admin':    return ADMIN_NAV;
    default:         return [];
  }
}

function getSidebarLabel(variant: SidebarVariant): string {
  switch (variant) {
    case 'vendor':   return 'Vendor Portal';
    case 'approver': return 'Approver Portal';
    case 'admin':    return 'Admin Console';
    default:         return '';
  }
}

/* ─── Sidebar ────────────────────────────────────────────────────────────── */
interface SidebarProps {
  variant: SidebarVariant;
}

function Sidebar({ variant }: SidebarProps) {
  const { user, logout } = useAuth();
  const navigate         = useNavigate();
  const navItems         = getNavItems(variant);
  const label            = getSidebarLabel(variant);

  const handleLogout = () => {
    logout();
    navigate('/auth');
  };

  return (
    <aside className="flex flex-col w-60 min-h-screen bg-[#0F172A] border-r border-white/10 flex-shrink-0">
      {/* Portal label */}
      <div className="px-4 py-4 border-b border-white/10">
        <p className="text-xs font-semibold text-[#4F46E5] uppercase tracking-widest">{label}</p>
        {user && (
          <div className="mt-1.5">
            <p className="text-sm font-semibold text-white truncate">{user.name}</p>
            <p className="text-xs text-slate-500 truncate font-mono">{user.email}</p>
          </div>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-3 py-4 space-y-1" aria-label={`${label} navigation`}>
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `nav-item w-full ${isActive ? 'nav-item-active' : ''}`
            }
          >
            {item.icon}
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Logout */}
      <div className="px-3 py-4 border-t border-white/10">
        <button
          onClick={handleLogout}
          className="nav-item w-full text-slate-400 hover:text-[#EF4444] hover:bg-[#EF4444]/10"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}

/* ─── AppLayout ──────────────────────────────────────────────────────────── */
export default function AppLayout({ sidebar }: AppLayoutProps) {
  const hasSidebar = !!sidebar;

  return (
    <div className="flex flex-col min-h-screen">
      {/* Global top bar */}
      <GlobalTopBar />

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        {hasSidebar && <Sidebar variant={sidebar} />}

        {/* Main content area */}
        <main
          className={`flex-1 overflow-auto bg-[#F4F6FB] ${hasSidebar ? '' : 'w-full'}`}
          id="main-content"
        >
          <div className="p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
