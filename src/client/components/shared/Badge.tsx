import React from 'react';
import { CheckCircle, XCircle, Clock, AlertTriangle, Star, Shield, User } from 'lucide-react';

/* ─── Types ──────────────────────────────────────────────────────────────── */
export type StatusVariant  = 'APPROVED' | 'REJECTED' | 'ON_HOLD' | 'PENDING' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'ACTIVE' | 'INACTIVE';
export type PlanVariant    = 'ELITE' | 'GOLD' | 'BASIC' | 'FREE';
export type GeneralVariant = 'indigo' | 'emerald' | 'amber' | 'coral' | 'slate' | 'violet';

type BadgeSize = 'sm' | 'md' | 'lg';

/* ─── Status Badge ───────────────────────────────────────────────────────── */
const STATUS_CONFIG: Record<StatusVariant, {
  label:   string;
  classes: string;
  icon:    React.ReactNode;
}> = {
  APPROVED:   { label: 'Approved',   classes: 'bg-[#10B981]/10 text-[#10B981] border-[#10B981]/20',  icon: <CheckCircle className="w-3 h-3" /> },
  ACTIVE:     { label: 'Active',     classes: 'bg-[#10B981]/10 text-[#10B981] border-[#10B981]/20',  icon: <CheckCircle className="w-3 h-3" /> },
  DELIVERED:  { label: 'Delivered',  classes: 'bg-[#10B981]/10 text-[#10B981] border-[#10B981]/20',  icon: <CheckCircle className="w-3 h-3" /> },
  REJECTED:   { label: 'Rejected',   classes: 'bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/20',  icon: <XCircle    className="w-3 h-3" /> },
  CANCELLED:  { label: 'Cancelled',  classes: 'bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/20',  icon: <XCircle    className="w-3 h-3" /> },
  INACTIVE:   { label: 'Inactive',   classes: 'bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/20',  icon: <XCircle    className="w-3 h-3" /> },
  ON_HOLD:    { label: 'On Hold',    classes: 'bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/20',  icon: <AlertTriangle className="w-3 h-3" /> },
  PROCESSING: { label: 'Processing', classes: 'bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/20',  icon: <Clock      className="w-3 h-3" /> },
  SHIPPED:    { label: 'Shipped',    classes: 'bg-blue-500/10  text-blue-600  border-blue-500/20',    icon: <Clock      className="w-3 h-3" /> },
  PENDING:    { label: 'Pending',    classes: 'bg-slate-100    text-slate-500  border-slate-200',     icon: <Clock      className="w-3 h-3" /> },
};

interface StatusBadgeProps {
  status:    StatusVariant;
  size?:     BadgeSize;
  showIcon?: boolean;
  className?: string;
}

export function StatusBadge({
  status,
  size      = 'md',
  showIcon  = true,
  className = '',
}: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG['PENDING'];

  const sizeClasses: Record<BadgeSize, string> = {
    sm: 'px-1.5 py-0.5 text-[10px] gap-1',
    md: 'px-2.5 py-1   text-xs     gap-1.5',
    lg: 'px-3   py-1.5 text-sm     gap-2',
  };

  return (
    <span
      className={`
        inline-flex items-center font-semibold rounded-full border
        ${config.classes}
        ${sizeClasses[size]}
        ${className}
      `}
    >
      {showIcon && config.icon}
      {config.label}
    </span>
  );
}

/* ─── Plan Badge ─────────────────────────────────────────────────────────── */
const PLAN_CONFIG: Record<PlanVariant, {
  label:   string;
  classes: string;
  icon:    React.ReactNode;
}> = {
  ELITE: { label: 'Elite', classes: 'bg-[#4F46E5]/10 text-[#4F46E5] border-[#4F46E5]/20', icon: <Shield className="w-3 h-3" /> },
  GOLD:  { label: 'Gold',  classes: 'bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/20', icon: <Star   className="w-3 h-3" /> },
  BASIC: { label: 'Basic', classes: 'bg-slate-100    text-slate-500  border-slate-200',    icon: <User   className="w-3 h-3" /> },
  FREE:  { label: 'Free',  classes: 'bg-slate-100    text-slate-400  border-slate-200',    icon: <User   className="w-3 h-3" /> },
};

interface PlanBadgeProps {
  plan:      PlanVariant;
  size?:     BadgeSize;
  showIcon?: boolean;
  className?: string;
}

export function PlanBadge({
  plan,
  size      = 'md',
  showIcon  = true,
  className = '',
}: PlanBadgeProps) {
  const config = PLAN_CONFIG[plan] ?? PLAN_CONFIG['BASIC'];

  const sizeClasses: Record<BadgeSize, string> = {
    sm: 'px-1.5 py-0.5 text-[10px] gap-1',
    md: 'px-2.5 py-1   text-xs     gap-1.5',
    lg: 'px-3   py-1.5 text-sm     gap-2',
  };

  return (
    <span
      className={`
        inline-flex items-center font-semibold rounded-full border
        ${config.classes}
        ${sizeClasses[size]}
        ${className}
      `}
    >
      {showIcon && config.icon}
      {config.label}
    </span>
  );
}

/* ─── General Badge ──────────────────────────────────────────────────────── */
const GENERAL_CONFIG: Record<GeneralVariant, string> = {
  indigo:  'bg-[#4F46E5]/10 text-[#4F46E5] border-[#4F46E5]/20',
  emerald: 'bg-[#10B981]/10 text-[#10B981] border-[#10B981]/20',
  amber:   'bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/20',
  coral:   'bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/20',
  slate:   'bg-slate-100    text-slate-500  border-slate-200',
  violet:  'bg-violet-100   text-violet-600 border-violet-200',
};

interface BadgeProps {
  children:  React.ReactNode;
  variant?:  GeneralVariant;
  size?:     BadgeSize;
  icon?:     React.ReactNode;
  dot?:      boolean;
  className?: string;
}

export function Badge({
  children,
  variant   = 'slate',
  size      = 'md',
  icon,
  dot       = false,
  className = '',
}: BadgeProps) {
  const colorClasses = GENERAL_CONFIG[variant];

  const sizeClasses: Record<BadgeSize, string> = {
    sm: 'px-1.5 py-0.5 text-[10px] gap-1',
    md: 'px-2.5 py-1   text-xs     gap-1.5',
    lg: 'px-3   py-1.5 text-sm     gap-2',
  };

  const dotColors: Record<GeneralVariant, string> = {
    indigo:  'bg-[#4F46E5]',
    emerald: 'bg-[#10B981]',
    amber:   'bg-[#F59E0B]',
    coral:   'bg-[#EF4444]',
    slate:   'bg-slate-400',
    violet:  'bg-violet-500',
  };

  return (
    <span
      className={`
        inline-flex items-center font-semibold rounded-full border
        ${colorClasses}
        ${sizeClasses[size]}
        ${className}
      `}
    >
      {dot && (
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColors[variant]}`} />
      )}
      {icon}
      {children}
    </span>
  );
}

/* ─── Mono ID Chip ───────────────────────────────────────────────────────── */
interface IdChipProps {
  value:     string;
  prefix?:   string;
  className?: string;
}

export function IdChip({ value, prefix, className = '' }: IdChipProps) {
  return (
    <span className={`id-chip ${className}`}>
      {prefix && <span className="text-slate-400 mr-1">{prefix}</span>}
      {value}
    </span>
  );
}

/* ─── Default export (the general Badge) ────────────────────────────────── */
export default Badge;
