import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  ClipboardList,
  FileText,
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
  Scissors,
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
  { to: '/vendor/dashboard',    icon: <LayoutDashboard className="w-4 h-4" />, label: 'Dashboard'    },
  { to: '/vendor/onboarding',   icon: <UserCheck       className="w-4 h-4" />, label: 'Onboarding'   },
  { to: '/vendor/kyc',          icon: <Fingerprint     className="w-4 h-4" />, label: 'KYC & Docs'   },
  { to: '/vendor/capabilities', icon: <Cpu             className="w-4 h-4" />, label: 'Capabilities' },
  { to: '/vendor/catalog',      icon: <Package         className="w-4 h-4" />, label: 'My Catalog'   },
  { to: '/vendor/orders',       icon: <ClipboardList   className="w-4 h-4" />, label: 'Orders'       },
  { to: '/vendor/settlements',  icon: <DollarSign      className="w-4 h-4" />, label: 'Settlements'  },
];

const APPROVER_NAV: NavItem[] = [
  { to: '/approver/queue',   icon: <CheckSquare className="w-4 h-4" />, label: 'Review Queue'  },
  { to: '/approver/margins', icon: <BarChart2   className="w-4 h-4" />, label: 'Margin Review' },
];

const ADMIN_NAV: NavItem[] = [
  { to: '/admin/dashboard',   icon: <LayoutDashboard className="w-4 h-4" />, label: 'Dashboard'    },
  { to: '/admin/escalations', icon: <AlertOctagon    className="w-4 h-4" />, label: 'Escalations'  },
  { to: '/admin/margins',     icon: <BarChart2       className="w-4 h-4" />, label: 'Margin Mgr'   },
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

function getPortalMeta(variant: SidebarVariant): { label: string; color: string } {
  switch (variant) {
    case 'vendor':   return { label: 'Vendor Portal',   color: '#10B981' };
    case 'approver': return { label: 'Approver Portal', color: '#F59E0B' };
    case 'admin':    return { label: 'Admin Console',   color: '#EF4444' };
    default:         return { label: '',                color: '#4F46E5' };
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
  const { label, color } = getPortalMeta(variant);

  const handleLogout = async () => {
    await logout();
    navigate('/auth', { replace: true });
  };

  // Derive display name: prefer email local part or userId
  const displayName  = user?.email?.split('@')[0] ?? user?.userId ?? 'User';
  const displayEmail = user?.email ?? '';
  const displayId    = user?.userId ?? '';

  return (
    <aside className="flex flex-col w-64 min-h-screen bg-[#0F172A] border-r border-slate-700/60 flex-shrink-0">

      {/* ── Brand strip ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2.5 px-5 h-14 border-b border-slate-700/60">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#4F46E5] flex-shrink-0">
          <Scissors className="w-4 h-4 text-white" strokeWidth={2.5} />
        </div>
        <div>
          <p className="text-white font-bold text-sm leading-none">
            Trim<span className="text-[#6366F1]">Nova</span>
          </p>
          <p className="text-[10px] font-semibold uppercase tracking-widest mt-0.5" style={{ color }}>
            {label}
          </p>
        </div>
      </div>

      {/* ── User info ──────────────────────────────────────────────────────── */}
      {user && (
        <div className="px-4 py-4 border-b border-slate-700/60">
          {/* Avatar circle */}
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
              style={{ backgroundColor: color + '33', border: `1.5px solid ${color}55` }}
            >
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate capitalize">{displayName}</p>
              <p className="text-xs text-slate-500 truncate font-mono">{displayId}</p>
            </div>
          </div>
          <p className="text-xs text-slate-500 truncate mt-2 pl-0.5">{displayEmail}</p>
        </div>
      )}

      {/* ── Nav items ──────────────────────────────────────────────────────── */}
      <nav className="flex-1 px-3 py-4 space-y-0.5" aria-label={`${label} navigation`}>
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

      {/* ── Logout ─────────────────────────────────────────────────────────── */}
      <div className="px-3 py-4 border-t border-slate-700/60">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-semibold
                     text-slate-300 hover:text-white hover:bg-[#EF4444]/20
                     border border-transparent hover:border-[#EF4444]/30
                     transition-all duration-150 group"
        >
          <LogOut className="w-4 h-4 group-hover:text-[#EF4444] transition-colors" />
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
