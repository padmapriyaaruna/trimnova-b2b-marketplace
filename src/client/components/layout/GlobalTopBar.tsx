import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Globe,
  Bell,
  ChevronDown,
  X,
  Scissors,
  Package,
  AlertCircle,
  CheckCircle,
  TrendingUp,
  Clock,
  Zap,
} from 'lucide-react';
import { useAuth } from '../../lib/auth';

/* ─── Types ──────────────────────────────────────────────────────────────── */
export type PortalRole = 'vendor' | 'customer' | 'approver' | 'admin';

interface Region {
  code: string;
  name: string;
  flag: string;
  domain: string;
}

interface DemoNotification {
  id: string;
  type: 'otp' | 'order' | 'stock' | 'approval' | 'settlement';
  title: string;
  body: string;
  timestamp: string;
  read: boolean;
  meta?: Record<string, string | number>;
}

/* ─── Constants ──────────────────────────────────────────────────────────── */
const REGIONS: Region[] = [
  { code: 'IN', name: 'India',          flag: '🇮🇳', domain: 'trimnova.in'  },
  { code: 'BD', name: 'Bangladesh',     flag: '🇧🇩', domain: 'trimnova.com.bd' },
  { code: 'VN', name: 'Vietnam',        flag: '🇻🇳', domain: 'trimnova.vn'  },
  { code: 'CN', name: 'China',          flag: '🇨🇳', domain: 'trimnova.cn'  },
  { code: 'TR', name: 'Turkey',         flag: '🇹🇷', domain: 'trimnova.com.tr' },
  { code: 'PK', name: 'Pakistan',       flag: '🇵🇰', domain: 'trimnova.pk'  },
  { code: 'LK', name: 'Sri Lanka',      flag: '🇱🇰', domain: 'trimnova.lk'  },
  { code: 'GLOBAL', name: 'Global',     flag: '🌐', domain: 'trimnova.com' },
];

const ROLE_TABS: { role: PortalRole; label: string }[] = [
  { role: 'vendor',   label: 'Vendor Login'   },
  { role: 'customer', label: 'Customer Login'  },
  { role: 'approver', label: 'Approver Login'  },
  { role: 'admin',    label: 'Admin Login'     },
];

const NOTIF_ICONS: Record<DemoNotification['type'], React.ReactNode> = {
  otp:        <Zap        className="w-4 h-4 text-amber-500"  />,
  order:      <Package    className="w-4 h-4 text-indigo-400" />,
  stock:      <AlertCircle className="w-4 h-4 text-coral-500" />,
  approval:   <CheckCircle className="w-4 h-4 text-emerald-500" />,
  settlement: <TrendingUp  className="w-4 h-4 text-indigo-400" />,
};

/* ─── Notification Drawer ────────────────────────────────────────────────── */
interface NotifDrawerProps {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLButtonElement>;
}

function NotifDrawer({ open, onClose, anchorRef }: NotifDrawerProps) {
  const [notifications, setNotifications] = useState<DemoNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<number | null>(null);

  const fetchNotifs = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/notifications/demo-events');
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications ?? []);
      }
    } catch {
      /* silent fail — dev polling */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    setLoading(true);
    fetchNotifs();

    if (import.meta.env.DEV) {
      intervalRef.current = window.setInterval(fetchNotifs, 5000);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [open, fetchNotifs]);

  const markAllRead = () =>
    setNotifications(n => n.map(x => ({ ...x, read: true })));

  const unreadCount = notifications.filter(n => !n.read).length;

  if (!open) return null;

  return (
    <div
      className="absolute right-0 top-full mt-2 w-[380px] bg-[#1E293B] border border-white/10 rounded-2xl shadow-modal overflow-hidden animate-slide-down z-50"
      role="dialog"
      aria-label="Notification inbox"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-slate-300" />
          <span className="text-sm font-semibold text-white">Demo Notification & OTP Inbox</span>
          {unreadCount > 0 && (
            <span className="px-1.5 py-0.5 bg-[#EF4444] text-white text-xs font-bold rounded-full">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              Mark all read
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Dev polling indicator */}
      {import.meta.env.DEV && (
        <div className="flex items-center gap-1.5 px-4 py-1.5 bg-amber-500/10 border-b border-amber-500/20">
          <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" />
          <span className="text-xs text-amber-400 font-mono">Live polling every 5s — DEV mode</span>
        </div>
      )}

      {/* Content */}
      <div className="max-h-[480px] overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-slate-500">
            <Bell className="w-10 h-10 opacity-30" />
            <p className="text-sm">No notifications yet</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {notifications.map(notif => (
              <div
                key={notif.id}
                className={`flex items-start gap-3 px-4 py-3 transition-colors cursor-pointer
                  ${notif.read ? 'opacity-60 hover:opacity-80' : 'hover:bg-white/5'}`}
              >
                {/* Icon */}
                <div className="mt-0.5 p-1.5 rounded-lg bg-white/10 flex-shrink-0">
                  {NOTIF_ICONS[notif.type]}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-white truncate">{notif.title}</p>
                    {!notif.read && (
                      <span className="w-2 h-2 bg-[#4F46E5] rounded-full mt-1.5 flex-shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{notif.body}</p>

                  {/* OTP special display */}
                  {notif.type === 'otp' && notif.meta?.otp && (
                    <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/15 border border-amber-500/30 rounded-lg">
                      <Zap className="w-3.5 h-3.5 text-amber-400" />
                      <span className="font-mono text-lg font-bold text-amber-400 tracking-widest">
                        {notif.meta.otp}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 mt-1.5">
                    <Clock className="w-3 h-3 text-slate-500" />
                    <span className="text-xs text-slate-500">
                      {new Date(notif.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-white/10 bg-black/20">
        <p className="text-xs text-slate-500 text-center">
          Demo inbox — events are auto-generated for testing
        </p>
      </div>
    </div>
  );
}

/* ─── GlobalTopBar ───────────────────────────────────────────────────────── */
export default function GlobalTopBar() {
  const navigate        = useNavigate();
  const [searchParams]  = useSearchParams();

  const currentRole = (searchParams.get('role') as PortalRole) ?? 'customer';

  const [activeRegion,    setActiveRegion]    = useState<Region>(REGIONS[0]);
  const [regionOpen,      setRegionOpen]      = useState(false);
  const [notifOpen,       setNotifOpen]       = useState(false);
  const [notifCount,      setNotifCount]      = useState(0);

  const regionRef = useRef<HTMLDivElement>(null);
  const notifBtnRef = useRef<HTMLButtonElement>(null!);

  /* Close dropdowns on outside click */
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (regionRef.current && !regionRef.current.contains(e.target as Node)) {
        setRegionOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  /* Poll unread count badge (lightweight) */
  useEffect(() => {
    async function pollCount() {
      try {
        const res = await fetch('/api/v1/notifications/demo-events?countOnly=true');
        if (res.ok) {
          const d = await res.json();
          setNotifCount(d.unreadCount ?? 0);
        }
      } catch { /* silent */ }
    }

    if (import.meta.env.DEV) {
      pollCount();
      const id = setInterval(pollCount, 5000);
      return () => clearInterval(id);
    }
  }, []);

  const handleRoleSwitch = (role: PortalRole) => {
    navigate(`/auth?role=${role}`);
  };

  return (
    <header className="relative z-40 flex items-center justify-between h-14 px-4 bg-[#1E293B] border-b border-white/10">
      {/* ── Left — Brand + Region ── */}
      <div className="flex items-center gap-4">
        {/* Logo */}
        <a href="/marketplace" className="flex items-center gap-2 select-none">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#4F46E5]">
            <Scissors className="w-4 h-4 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-white font-bold text-base tracking-tight hidden sm:block">
            Trim<span className="text-[#6366F1]">Nova</span>
          </span>
        </a>

        {/* Divider */}
        <div className="hidden sm:block w-px h-5 bg-white/15" />

        {/* Region Badge */}
        <div className="relative" ref={regionRef}>
          <button
            onClick={() => setRegionOpen(v => !v)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-white/10 transition-colors group"
          >
            <Globe className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-200 transition-colors" />
            <span className="hidden md:flex items-center gap-1 text-xs text-slate-400 group-hover:text-slate-200 transition-colors">
              <span className="text-slate-500 font-medium">AUTO-SWITCHED REGION:</span>
              <span className="font-semibold text-white">{activeRegion.name} ({activeRegion.code})</span>
              <span className="text-base leading-none">{activeRegion.flag}</span>
              <span className="text-slate-500">• {activeRegion.domain}</span>
            </span>
            <span className="md:hidden text-base">{activeRegion.flag}</span>
            <ChevronDown
              className={`w-3 h-3 text-slate-400 transition-transform duration-200 ${regionOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {/* Region Dropdown */}
          {regionOpen && (
            <div className="absolute left-0 top-full mt-2 w-64 bg-[#0F172A] border border-white/10 rounded-xl shadow-modal overflow-hidden animate-slide-down">
              <div className="px-3 py-2 border-b border-white/10">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Override Region
                </p>
              </div>
              {REGIONS.map(region => (
                <button
                  key={region.code}
                  onClick={() => {
                    setActiveRegion(region);
                    setRegionOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors
                    ${activeRegion.code === region.code
                      ? 'bg-[#4F46E5]/20 text-white'
                      : 'text-slate-300 hover:bg-white/5 hover:text-white'
                    }`}
                >
                  <span className="text-xl">{region.flag}</span>
                  <div>
                    <p className="text-sm font-medium">{region.name}</p>
                    <p className="text-xs text-slate-500 font-mono">{region.domain}</p>
                  </div>
                  {activeRegion.code === region.code && (
                    <CheckCircle className="w-4 h-4 ml-auto text-[#10B981]" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Right — Role Switcher + Notifications ── */}
      <div className="flex items-center gap-3">
        {/* Role Switcher Segmented Control */}
        <nav className="hidden lg:flex seg-control" role="tablist" aria-label="Portal login switcher">
          {ROLE_TABS.map(({ role, label }) => (
            <button
              key={role}
              role="tab"
              aria-selected={currentRole === role}
              onClick={() => handleRoleSwitch(role)}
              className={`seg-tab ${currentRole === role ? 'seg-tab-active' : ''}`}
            >
              {label}
            </button>
          ))}
        </nav>

        {/* Mobile role switcher (compact) */}
        <div className="lg:hidden">
          <select
            value={currentRole}
            onChange={e => handleRoleSwitch(e.target.value as PortalRole)}
            className="text-xs bg-white/10 text-white border border-white/20 rounded-lg px-2 py-1.5 cursor-pointer"
          >
            {ROLE_TABS.map(({ role, label }) => (
              <option key={role} value={role} className="bg-[#1E293B]">
                {label}
              </option>
            ))}
          </select>
        </div>

        {/* Notifications Bell */}
        <div className="relative">
          <button
            ref={notifBtnRef}
            onClick={() => setNotifOpen(v => !v)}
            className="relative flex items-center justify-center w-9 h-9 rounded-xl hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
            aria-label="Open notification inbox"
          >
            <Bell className="w-4.5 h-4.5" />
            {notifCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 flex items-center justify-center bg-[#EF4444] text-white text-[10px] font-bold rounded-full">
                {notifCount > 9 ? '9+' : notifCount}
              </span>
            )}
          </button>

          <NotifDrawer
            open={notifOpen}
            onClose={() => setNotifOpen(false)}
            anchorRef={notifBtnRef}
          />
        </div>
      </div>
    </header>
  );
}
