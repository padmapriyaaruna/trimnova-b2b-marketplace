import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  KeyboardEvent,
  ChangeEvent,
} from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Scissors,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Phone,
  User,
  ShieldCheck,
  AlertTriangle,
  CheckCircle,
  XCircle,
  ArrowRight,
  RefreshCw,
  ExternalLink,
  KeyRound,
  Fingerprint,
  ChevronDown,
} from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { apiClient } from '../../lib/api';

/* ─── Types ──────────────────────────────────────────────────────────────── */
type AuthRole   = 'vendor' | 'customer' | 'approver' | 'admin';
type RegStep    = 1 | 2 | 3 | 4 | 5;

interface PasswordStrength {
  minLength:  boolean;
  mixedCase:  boolean;
  hasNumber:  boolean;
  hasSpecial: boolean;
}

interface CountryCode {
  code: string;
  dial: string;
  flag: string;
}

/* ─── Constants ──────────────────────────────────────────────────────────── */
const ROLE_TABS: { role: AuthRole; label: string }[] = [
  { role: 'vendor',   label: 'Vendor'   },
  { role: 'customer', label: 'Customer' },
  { role: 'approver', label: 'Approver' },
  { role: 'admin',    label: 'Admin'    },
];

const COUNTRY_CODES: CountryCode[] = [
  { code: 'IN', dial: '+91', flag: '🇮🇳' },
  { code: 'US', dial: '+1',  flag: '🇺🇸' },
  { code: 'GB', dial: '+44', flag: '🇬🇧' },
  { code: 'BD', dial: '+880',flag: '🇧🇩' },
  { code: 'CN', dial: '+86', flag: '🇨🇳' },
  { code: 'VN', dial: '+84', flag: '🇻🇳' },
  { code: 'TR', dial: '+90', flag: '🇹🇷' },
  { code: 'PK', dial: '+92', flag: '🇵🇰' },
  { code: 'LK', dial: '+94', flag: '🇱🇰' },
];

const REG_STEPS = [
  { n: 1, label: 'Email'    },
  { n: 2, label: 'User ID'  },
  { n: 3, label: 'Phone'    },
  { n: 4, label: 'OTP'      },
  { n: 5, label: 'Password' },
];

function checkPasswordStrength(pw: string): PasswordStrength {
  return {
    minLength:  pw.length >= 8,
    mixedCase:  /[a-z]/.test(pw) && /[A-Z]/.test(pw),
    hasNumber:  /[0-9]/.test(pw),
    hasSpecial: /[^A-Za-z0-9]/.test(pw),
  };
}

/* ─── Step Progress Indicator ────────────────────────────────────────────── */
interface StepProgressProps {
  current: RegStep;
}

function StepProgress({ current }: StepProgressProps) {
  return (
    <div className="flex items-center gap-2 mb-6">
      {REG_STEPS.map((s, idx) => {
        const state =
          current > s.n ? 'done' :
          current === s.n ? 'active' : 'pending';

        return (
          <React.Fragment key={s.n}>
            <div className="flex flex-col items-center gap-1">
              <div className={`step-pill step-pill-${state}`}>
                {state === 'done'
                  ? <CheckCircle className="w-4 h-4" />
                  : <span>{s.n}</span>
                }
              </div>
              <span className={`text-[10px] font-medium ${state === 'active' ? 'text-[#4F46E5]' : 'text-slate-400'}`}>
                {s.label}
              </span>
            </div>
            {idx < REG_STEPS.length - 1 && (
              <div
                className={`flex-1 h-0.5 rounded-full mb-4 transition-colors duration-500
                  ${current > s.n ? 'bg-[#10B981]' : 'bg-slate-200'}`}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* ─── OTP Input ──────────────────────────────────────────────────────────── */
interface OtpInputProps {
  value: string[];
  onChange: (v: string[]) => void;
}

function OtpInput({ value, onChange }: OtpInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const handleChange = (idx: number, ch: string) => {
    if (!/^\d?$/.test(ch)) return;
    const next = [...value];
    next[idx] = ch;
    onChange(next);
    if (ch && idx < 5) refs.current[idx + 1]?.focus();
  };

  const handleKeyDown = (idx: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !value[idx] && idx > 0) {
      refs.current[idx - 1]?.focus();
    }
    if (e.key === 'ArrowLeft' && idx > 0) refs.current[idx - 1]?.focus();
    if (e.key === 'ArrowRight' && idx < 5) refs.current[idx + 1]?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (text.length > 0) {
      const next = Array(6).fill('');
      text.split('').forEach((c, i) => { next[i] = c; });
      onChange(next);
      refs.current[Math.min(text.length, 5)]?.focus();
      e.preventDefault();
    }
  };

  return (
    <div className="flex items-center gap-2">
      {Array(6).fill(0).map((_, i) => (
        <input
          key={i}
          ref={el => { refs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={value[i] ?? ''}
          onChange={e => handleChange(i, e.target.value)}
          onKeyDown={e => handleKeyDown(i, e)}
          onPaste={handlePaste}
          className="otp-pill"
          aria-label={`OTP digit ${i + 1}`}
        />
      ))}
    </div>
  );
}

/* ─── Password Strength Pills ────────────────────────────────────────────── */
function PasswordPills({ strength }: { strength: PasswordStrength }) {
  const pills: [keyof PasswordStrength, string][] = [
    ['minLength',  'Min 8 Characters'     ],
    ['mixedCase',  'Uppercase & Lowercase'],
    ['hasNumber',  'Number'               ],
    ['hasSpecial', 'Special Character'    ],
  ];

  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {pills.map(([key, label]) => (
        <span key={key} className={`pw-pill ${strength[key] ? 'pw-pill-ok' : 'pw-pill-fail'}`}>
          {strength[key]
            ? <CheckCircle className="w-3 h-3" />
            : <XCircle     className="w-3 h-3" />
          }
          {label}
        </span>
      ))}
    </div>
  );
}

/* ─── TOTP input (Admin) ─────────────────────────────────────────────────── */
function TotpInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div>
      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider block mb-2">
        TOTP Code
      </label>
      <OtpInput value={value} onChange={onChange} />
    </div>
  );
}

/* ─── Sign In Card ───────────────────────────────────────────────────────── */
interface SignInCardProps {
  activeRole: AuthRole;
  onRoleChange: (r: AuthRole) => void;
}

function SignInCard({ activeRole, onRoleChange }: SignInCardProps) {
  const { login }   = useAuth();
  const navigate    = useNavigate();

  const [identifier, setIdentifier] = useState('');
  const [password,   setPassword]   = useState('');
  const [showPw,     setShowPw]      = useState(false);
  const [superId,    setSuperId]     = useState('');
  const [masterKey,  setMasterKey]   = useState('');
  const [totp,       setTotp]        = useState<string[]>(Array(6).fill(''));
  const [error,      setError]       = useState('');
  const [loading,    setLoading]     = useState(false);

  const isAdmin = activeRole === 'admin';

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isAdmin) {
        await login(superId, masterKey, activeRole, totp.join(''), '');
      } else {
        await login(identifier, password, activeRole);
      }

      const dest: Record<AuthRole, string> = {
        vendor:   '/vendor/dashboard',
        customer: '/marketplace',
        approver: '/approver/queue',
        admin:    '/admin/dashboard',
      };
      navigate(dest[activeRole], { replace: true });
    } catch (err: any) {
      setError(err?.response?.data?.error ?? err?.message ?? 'Sign in failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card-elevated p-8 w-full">
      {/* Logo */}
      <div className="flex items-center gap-2 mb-6">
        <div className="w-10 h-10 bg-[#4F46E5] rounded-xl flex items-center justify-center">
          <Scissors className="w-5 h-5 text-white" strokeWidth={2.5} />
        </div>
        <div>
          <p className="text-xl font-black text-slate-900 tracking-tight">
            Trim<span className="text-[#4F46E5]">Nova</span>
          </p>
          <p className="text-xs text-slate-500">Garment Trims Marketplace</p>
        </div>
      </div>

      <h1 className="text-2xl font-bold text-slate-900 mb-1">Welcome Back</h1>
      <p className="text-sm text-slate-500 mb-6">Sign in to continue to your portal</p>

      {/* Role Tab Switcher */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl mb-6" role="tablist">
        {ROLE_TABS.map(({ role, label }) => (
          <button
            key={role}
            role="tab"
            aria-selected={activeRole === role}
            onClick={() => onRoleChange(role)}
            className={`flex-1 py-2 px-2 text-xs font-semibold rounded-lg transition-all duration-150
              ${activeRole === role
                ? 'bg-white text-[#4F46E5] shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
              }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 p-3 bg-[#EF4444]/10 border border-[#EF4444]/20 rounded-xl mb-4 animate-fade-in">
          <XCircle className="w-4 h-4 text-[#EF4444] mt-0.5 flex-shrink-0" />
          <p className="text-sm text-[#EF4444]">{error}</p>
        </div>
      )}

      <form onSubmit={handleSignIn} className="space-y-4">
        {isAdmin ? (
          /* Admin Superuser Access */
          <div className="space-y-4">
            <div className="flex items-center gap-2 px-4 py-3 bg-[#4F46E5]/5 border border-[#4F46E5]/20 rounded-xl mb-2">
              <ShieldCheck className="w-4 h-4 text-[#4F46E5]" />
              <p className="text-sm font-semibold text-[#4F46E5]">Admin Superuser Access</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
                Superuser ID
              </label>
              <div className="relative">
                <Fingerprint className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={superId}
                  onChange={e => setSuperId(e.target.value)}
                  placeholder="SU-XXXXXXXX"
                  className="input-field pl-9 font-mono"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
                Security Master Passkey
              </label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type={showPw ? 'text' : 'password'}
                  value={masterKey}
                  onChange={e => setMasterKey(e.target.value)}
                  placeholder="Master passkey"
                  className="input-field pl-9 pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <TotpInput value={totp} onChange={setTotp} />
          </div>
        ) : (
          /* Standard roles */
          <>
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
                Email / User ID
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={identifier}
                  onChange={e => setIdentifier(e.target.value)}
                  placeholder="email@company.com or user-id"
                  className="input-field pl-9"
                  required
                  autoComplete="username"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Password
                </label>
                <a href="#" className="text-xs text-[#4F46E5] hover:underline">
                  Forgot Password?
                </a>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="input-field pl-9 pr-10"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </>
        )}

        <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
          {loading
            ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            : <>Sign In <ArrowRight className="w-4 h-4" /></>
          }
        </button>
      </form>
    </div>
  );
}

/* ─── Registration Wizard Card ───────────────────────────────────────────── */
interface RegistrationCardProps {
  activeRole: AuthRole;
  onSwitchToSignIn: () => void;
}

function RegistrationCard({ activeRole, onSwitchToSignIn }: RegistrationCardProps) {
  const [step,         setStep]         = useState<RegStep>(1);
  const [email,        setEmail]        = useState('');
  const [userId,       setUserId]       = useState('');
  const [countryCode,  setCountryCode]  = useState<CountryCode>(COUNTRY_CODES[0]);
  const [phone,        setPhone]        = useState('');
  const [otp,          setOtp]          = useState<string[]>(Array(6).fill(''));
  const [password,     setPassword]     = useState('');
  const [confirmPw,    setConfirmPw]    = useState('');
  const [showPw,       setShowPw]       = useState(false);
  const [showConfirm,  setShowConfirm]  = useState(false);
  const [inviteCode,   setInviteCode]   = useState('');
  const [regType,      setRegType]      = useState<'standard' | 'invite'>('standard');

  const [emailDupAlert, setEmailDupAlert] = useState(false);
  const [userIdDupAlert,setUserIdDupAlert]= useState(false);
  const [otpSent,       setOtpSent]       = useState(false);
  const [otpCountdown,  setOtpCountdown]  = useState(0);
  const [otpAttempts,   setOtpAttempts]   = useState(3);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState('');
  const [ccOpen,        setCcOpen]        = useState(false);

  const strength = checkPasswordStrength(password);
  const isStrong = Object.values(strength).every(Boolean);

  /* OTP countdown timer */
  useEffect(() => {
    if (otpCountdown <= 0) return;
    const id = setTimeout(() => setOtpCountdown(v => v - 1), 1000);
    return () => clearTimeout(id);
  }, [otpCountdown]);

  const checkEmailDuplicate = async (val: string) => {
    if (!val || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) return;
    try {
      const res = await apiClient.post('/auth/register/check-duplicate', { field: 'email', value: val });
      if (res.data.exists) setEmailDupAlert(true);
    } catch { /* silent */ }
  };

  const checkUserIdDuplicate = async (val: string) => {
    if (!val || val.length < 3) return;
    try {
      const res = await apiClient.post('/auth/register/check-duplicate', { field: 'userId', value: val });
      if (res.data.exists) setUserIdDupAlert(true);
    } catch { /* silent */ }
  };

  const sendOtp = async () => {
    setLoading(true);
    try {
      await apiClient.post('/auth/register/send-otp', {
        phone: `${countryCode.dial}${phone}`,
      });
      setOtpSent(true);
      setOtpCountdown(60);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    setLoading(true);
    setError('');
    try {
      await apiClient.post('/auth/register/verify-otp', {
        phone: `${countryCode.dial}${phone}`,
        otp:   otp.join(''),
      });
      setStep(5);
    } catch (err: any) {
      setOtpAttempts(v => v - 1);
      setError(err?.response?.data?.message ?? 'Invalid OTP code');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!isStrong) { setError('Please meet all password requirements'); return; }
    if (password !== confirmPw) { setError('Passwords do not match'); return; }

    setLoading(true);
    setError('');
    try {
      await apiClient.post('/auth/register', {
        email,
        userId,
        phone:    `${countryCode.dial}${phone}`,
        password,
        role:     activeRole.toUpperCase(),
        inviteCode: regType === 'invite' ? inviteCode : undefined,
      });
      onSwitchToSignIn();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const nextStep = async () => {
    setError('');
    if (step === 1 && emailDupAlert)  return;
    if (step === 2 && userIdDupAlert) return;
    if (step < 5) setStep(s => (s + 1) as RegStep);
  };

  return (
    <div className="card-elevated p-8 w-full">
      <h2 className="text-2xl font-bold text-slate-900 mb-1">Create Account</h2>
      <p className="text-sm text-slate-500 mb-6">
        {activeRole === 'approver' ? 'Join as Approver' : `Register as ${activeRole.charAt(0).toUpperCase() + activeRole.slice(1)}`}
      </p>

      {/* Approver type toggle */}
      {activeRole === 'approver' && (
        <div className="flex gap-2 mb-5">
          {(['standard', 'invite'] as const).map(type => (
            <button
              key={type}
              onClick={() => setRegType(type)}
              className={`flex-1 py-2 text-xs font-semibold rounded-xl border transition-all duration-150
                ${regType === type
                  ? 'bg-[#4F46E5] text-white border-transparent'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-[#4F46E5]/40'
                }`}
            >
              {type === 'standard' ? 'Standard Registration' : 'New Approver Onboarding (Invitation Code)'}
            </button>
          ))}
        </div>
      )}

      <StepProgress current={step} />

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 p-3 bg-[#EF4444]/10 border border-[#EF4444]/20 rounded-xl mb-4 animate-fade-in">
          <XCircle className="w-4 h-4 text-[#EF4444] mt-0.5 flex-shrink-0" />
          <p className="text-sm text-[#EF4444]">{error}</p>
        </div>
      )}

      {/* ─── Step 1: Email ─── */}
      {step === 1 && (
        <div className="space-y-4 animate-fade-in">
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
              Corporate Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setEmailDupAlert(false); }}
                onBlur={e => checkEmailDuplicate(e.target.value)}
                placeholder="you@company.com"
                className={`input-field pl-9 ${emailDupAlert ? 'input-error' : ''}`}
              />
            </div>
          </div>

          {/* Duplicate alert */}
          {emailDupAlert && (
            <div className="p-3 bg-[#F59E0B]/10 border border-[#F59E0B]/30 rounded-xl animate-slide-down">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-[#F59E0B] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold text-[#F59E0B]">⚠ ACCOUNT ALERT</p>
                  <p className="text-xs text-slate-600 mt-0.5">
                    This Email ID is already registered in our database. Please sign in or use a different ID.
                  </p>
                  <button
                    onClick={onSwitchToSignIn}
                    className="mt-2 flex items-center gap-1 text-xs font-semibold text-[#4F46E5] hover:underline"
                  >
                    Switch to Sign In <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          )}

          <button
            disabled={!email || emailDupAlert}
            onClick={nextStep}
            className="btn-primary w-full"
          >
            Continue <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ─── Step 2: User ID ─── */}
      {step === 2 && (
        <div className="space-y-4 animate-fade-in">
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
              Preferred User ID
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={userId}
                onChange={e => { setUserId(e.target.value.toLowerCase().replace(/\s/g, '-')); setUserIdDupAlert(false); }}
                onBlur={e => checkUserIdDuplicate(e.target.value)}
                placeholder="my-user-id"
                className={`input-field pl-9 font-mono ${userIdDupAlert ? 'input-error' : ''}`}
              />
            </div>
            <p className="text-xs text-slate-400 mt-1.5">
              Letters, numbers, hyphens only. Used for login.
            </p>
          </div>

          {userIdDupAlert && (
            <div className="p-3 bg-[#F59E0B]/10 border border-[#F59E0B]/30 rounded-xl animate-slide-down">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-[#F59E0B] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold text-[#F59E0B]">⚠ ACCOUNT ALERT</p>
                  <p className="text-xs text-slate-600 mt-0.5">
                    This User ID is already registered. Please choose a different ID.
                  </p>
                </div>
              </div>
            </div>
          )}

          <button
            disabled={!userId || userIdDupAlert || userId.length < 3}
            onClick={nextStep}
            className="btn-primary w-full"
          >
            Continue <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ─── Step 3: Phone ─── */}
      {step === 3 && (
        <div className="space-y-4 animate-fade-in">
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
              Mobile Number
            </label>
            <div className="flex gap-2">
              {/* Country code selector */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setCcOpen(v => !v)}
                  className="flex items-center gap-1 h-full px-3 py-3 bg-white border border-slate-200 rounded-xl text-sm hover:border-[#4F46E5] transition-colors min-w-[90px]"
                >
                  <span className="text-lg">{countryCode.flag}</span>
                  <span className="font-mono text-slate-700">{countryCode.dial}</span>
                  <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${ccOpen ? 'rotate-180' : ''}`} />
                </button>
                {ccOpen && (
                  <div className="absolute left-0 top-full mt-1 w-52 bg-white border border-slate-200 rounded-xl shadow-modal z-20 max-h-56 overflow-y-auto animate-slide-down">
                    {COUNTRY_CODES.map(cc => (
                      <button
                        key={cc.code}
                        onClick={() => { setCountryCode(cc); setCcOpen(false); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 text-left"
                      >
                        <span className="text-lg">{cc.flag}</span>
                        <span className="font-semibold text-slate-700">{cc.code}</span>
                        <span className="font-mono text-slate-400 ml-auto">{cc.dial}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="relative flex-1">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="9876543210"
                  className="input-field pl-9 font-mono"
                />
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-1.5">OTP will be sent to this number</p>
          </div>

          <button
            disabled={phone.length < 7}
            onClick={nextStep}
            className="btn-primary w-full"
          >
            Continue <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ─── Step 4: OTP ─── */}
      {step === 4 && (
        <div className="space-y-5 animate-fade-in">
          <div>
            <p className="text-sm text-slate-600 mb-1">
              OTP sent to <span className="font-semibold text-slate-900">{countryCode.dial} {phone}</span>
            </p>
            {otpAttempts < 3 && (
              <p className="text-xs text-[#F59E0B] font-medium">
                {otpAttempts} attempt{otpAttempts !== 1 ? 's' : ''} remaining
              </p>
            )}
          </div>

          {!otpSent ? (
            <button
              disabled={loading}
              onClick={sendOtp}
              className="btn-primary w-full"
            >
              {loading
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : 'Send OTP'
              }
            </button>
          ) : (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-3">
                  Enter 6-Digit OTP
                </label>
                <OtpInput value={otp} onChange={setOtp} />
              </div>

              {/* Resend */}
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-400">
                  {otpCountdown > 0
                    ? `Resend in ${otpCountdown}s`
                    : "Didn't receive it?"
                  }
                </p>
                {otpCountdown === 0 && (
                  <button
                    onClick={sendOtp}
                    className="flex items-center gap-1 text-xs font-semibold text-[#4F46E5] hover:underline"
                  >
                    <RefreshCw className="w-3 h-3" /> Resend OTP
                  </button>
                )}
              </div>

              <button
                disabled={otp.join('').length < 6 || loading || otpAttempts <= 0}
                onClick={verifyOtp}
                className="btn-primary w-full"
              >
                {loading
                  ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <>Verify OTP <ArrowRight className="w-4 h-4" /></>
                }
              </button>
            </>
          )}
        </div>
      )}

      {/* ─── Step 5: Password ─── */}
      {step === 5 && (
        <div className="space-y-4 animate-fade-in">
          {/* Approver invite code */}
          {activeRole === 'approver' && regType === 'invite' && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
                Invitation Code
              </label>
              <input
                type="text"
                value={inviteCode}
                onChange={e => setInviteCode(e.target.value.toUpperCase())}
                placeholder="INV-XXXXXXXX"
                className="input-field font-mono"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
              Set Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Create a strong password"
                className="input-field pl-9 pr-10"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <PasswordPills strength={strength} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
              Confirm Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirmPw}
                onChange={e => setConfirmPw(e.target.value)}
                placeholder="Re-enter password"
                className={`input-field pl-9 pr-10 ${
                  confirmPw && confirmPw !== password ? 'input-error' : ''
                }`}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {confirmPw && confirmPw !== password && (
              <p className="text-xs text-[#EF4444] mt-1.5">Passwords do not match</p>
            )}
          </div>

          <button
            disabled={!isStrong || !confirmPw || password !== confirmPw || loading}
            onClick={handleRegister}
            className="btn-primary w-full"
          >
            {loading
              ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <>Create Account <ArrowRight className="w-4 h-4" /></>
            }
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── AuthPage ───────────────────────────────────────────────────────────── */
export default function AuthPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const roleParam = (searchParams.get('role') as AuthRole) ?? 'customer';

  const [activeRole, setActiveRole] = useState<AuthRole>(roleParam);

  useEffect(() => {
    setActiveRole((searchParams.get('role') as AuthRole) ?? 'customer');
  }, [searchParams]);

  const handleRoleChange = (r: AuthRole) => {
    setActiveRole(r);
    setSearchParams({ role: r });
  };

  const switchToSignIn = () => {
    /* no-op: sign-in is always visible */
  };

  return (
    <div className="min-h-screen bg-[#F4F6FB] flex flex-col">
      {/* Slim top brand bar */}
      <div className="flex items-center justify-between h-14 px-6 bg-[#0F172A] border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#4F46E5] rounded-lg flex items-center justify-center">
            <Scissors className="w-4 h-4 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-white font-bold text-base tracking-tight">
            Trim<span className="text-[#6366F1]">Nova</span>
          </span>
        </div>
        <div className="flex gap-1 p-1 bg-white/10 rounded-xl">
          {ROLE_TABS.map(({ role, label }) => (
            <button
              key={role}
              onClick={() => handleRoleChange(role)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150
                ${activeRole === role
                  ? 'bg-[#4F46E5] text-white'
                  : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Two column layout */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <SignInCard
            activeRole={activeRole}
            onRoleChange={handleRoleChange}
          />
          <RegistrationCard
            activeRole={activeRole}
            onSwitchToSignIn={switchToSignIn}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="py-4 text-center">
        <p className="text-xs text-slate-400">
          © {new Date().getFullYear()} TrimNova Technologies Pvt. Ltd. · All rights reserved.
        </p>
      </div>
    </div>
  );
}
