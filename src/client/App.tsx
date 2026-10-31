import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import AppLayout from './components/layout/AppLayout';

/* ─── Error Boundary ─────────────────────────────────────────────────────── */
interface EBState { hasError: boolean; error?: Error }
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, EBState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: Error): EBState {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-screen gap-4 bg-[#F4F6FB] p-6">
          <div className="w-16 h-16 bg-[#EF4444]/10 rounded-2xl flex items-center justify-center">
            <span className="text-3xl">⚠️</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900">Something went wrong</h1>
          <p className="text-sm text-slate-500 text-center max-w-sm">
            {this.state.error?.message ?? 'An unexpected error occurred. Please refresh the page.'}
          </p>
          <button
            onClick={() => { this.setState({ hasError: false }); window.location.href = '/auth'; }}
            className="px-6 py-2 bg-[#4F46E5] text-white rounded-xl font-semibold text-sm hover:bg-[#4338CA] transition-colors"
          >
            Go to Login
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ─── Lazy-loaded pages ──────────────────────────────────────────────────── */
const AuthPage                = lazy(() => import('./pages/auth/AuthPage'));
const CustomerStorefront      = lazy(() => import('./pages/marketplace/CustomerStorefront'));
const ProductDetailPage       = lazy(() => import('./pages/marketplace/ProductDetailPage'));
const CartPage                = lazy(() => import('./pages/marketplace/CartPage'));
const CustomerOrdersPage      = lazy(() => import('./pages/marketplace/CustomerOrdersPage'));
const CustomerOrderDetailPage = lazy(() => import('./pages/marketplace/CustomerOrderDetailPage'));
const RmaPortalPage           = lazy(() => import('./pages/marketplace/RmaPortalPage'));

const VendorPortal            = lazy(() => import('./pages/vendor/VendorPortal'));
const VendorDashboard         = lazy(() => import('./pages/vendor/VendorDashboard'));
const VendorOnboardingWizard  = lazy(() => import('./pages/vendor/VendorOnboardingWizard'));
const VendorKycPage           = lazy(() => import('./pages/vendor/VendorKycPage'));
const VendorCapabilities      = lazy(() => import('./pages/vendor/VendorCapabilities'));
const VendorCatalogManager    = lazy(() => import('./pages/vendor/VendorCatalogManager'));
const VendorOrderInbox        = lazy(() => import('./pages/vendor/VendorOrderInbox'));
const VendorSettlements       = lazy(() => import('./pages/vendor/VendorSettlements'));

const ApproverPortal          = lazy(() => import('./pages/approver/ApproverPortal'));
const ApproverQueue           = lazy(() => import('./pages/approver/ApproverQueue'));
const MarginReviewConsole     = lazy(() => import('./pages/approver/MarginReviewConsole'));

const AdminConsole            = lazy(() => import('./pages/admin/AdminConsole'));
const AdminDashboard          = lazy(() => import('./pages/admin/AdminDashboard'));
const EscalationDocket        = lazy(() => import('./pages/admin/EscalationDocket'));
const MarginManager           = lazy(() => import('./pages/admin/MarginManager'));
const CouponManager           = lazy(() => import('./pages/admin/CouponManager'));
const SettlementManager       = lazy(() => import('./pages/admin/SettlementManager'));
const AdminVendorList         = lazy(() => import('./pages/admin/AdminVendorList'));
const PlatformConfig          = lazy(() => import('./pages/admin/PlatformConfig'));

/* ─── Route guards ───────────────────────────────────────────────────────── */
interface RequireRoleProps {
  role: string | string[];
  children: React.ReactNode;
}

function RequireRole({ role, children }: RequireRoleProps) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#F4F6FB]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-[#4F46E5] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500 font-medium">Loading…</p>
        </div>
      </div>
    );
  }

  const allowed = Array.isArray(role) ? role : [role];
  if (!user || !allowed.includes(user.role)) {
    const roleParam = allowed[0]?.toLowerCase() ?? 'customer';
    return (
      <Navigate
        to={`/auth?role=${roleParam}`}
        state={{ from: location }}
        replace
      />
    );
  }

  return <>{children}</>;
}

/* ─── Page loading fallback ──────────────────────────────────────────────── */
function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-[#4F46E5] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

/* ─── App ────────────────────────────────────────────────────────────────── */
export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Root redirect → auth */}
            <Route path="/" element={<Navigate to="/auth" replace />} />

          {/* Auth */}
          <Route path="/auth" element={<AuthPage />} />

          {/* Public marketplace wrapped in layout */}
          <Route element={<AppLayout />}>
            <Route path="/marketplace"                element={<CustomerStorefront />} />
            <Route path="/marketplace/products/:id"   element={<ProductDetailPage />} />
            <Route path="/marketplace/cart"           element={<CartPage />} />
            <Route path="/marketplace/orders"         element={<CustomerOrdersPage />} />
            <Route path="/marketplace/orders/:id"     element={<CustomerOrderDetailPage />} />
            <Route path="/marketplace/rma"            element={<RmaPortalPage />} />
          </Route>

          {/* Vendor portal */}
          <Route
            path="/vendor"
            element={
              <RequireRole role="VENDOR">
                <AppLayout sidebar="vendor" />
              </RequireRole>
            }
          >
            <Route index element={<Navigate to="/vendor/dashboard" replace />} />
            <Route path="dashboard"    element={<VendorDashboard />} />
            <Route path="onboarding"   element={<VendorOnboardingWizard />} />
            <Route path="kyc"          element={<VendorKycPage />} />
            <Route path="capabilities" element={<VendorCapabilities />} />
            <Route path="catalog"      element={<VendorCatalogManager />} />
            <Route path="orders"       element={<VendorOrderInbox />} />
            <Route path="settlements"  element={<VendorSettlements />} />
          </Route>

          {/* Approver portal */}
          <Route
            path="/approver"
            element={
              <RequireRole role="APPROVER">
                <AppLayout sidebar="approver" />
              </RequireRole>
            }
          >
            <Route index element={<Navigate to="/approver/queue" replace />} />
            <Route path="queue"   element={<ApproverQueue />} />
            <Route path="margins" element={<MarginReviewConsole />} />
          </Route>

          {/* Admin console */}
          <Route
            path="/admin"
            element={
              <RequireRole role={['ADMIN', 'SUPERUSER']}>
                <AppLayout sidebar="admin" />
              </RequireRole>
            }
          >
            <Route index element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="dashboard"   element={<AdminDashboard />} />
            <Route path="escalations" element={<EscalationDocket />} />
            <Route path="margins"     element={<MarginManager />} />
            <Route path="coupons"     element={<CouponManager />} />
            <Route path="settlements" element={<SettlementManager />} />
            <Route path="vendors"     element={<AdminVendorList />} />
            <Route path="config"      element={<PlatformConfig />} />
          </Route>

          {/* 404 */}
          <Route
            path="*"
            element={
              <div className="flex flex-col items-center justify-center h-screen gap-4 bg-[#F4F6FB]">
                <span className="text-8xl font-black text-[#4F46E5]/20">404</span>
                <p className="text-lg font-semibold text-slate-700">Page not found</p>
                <a href="/marketplace" className="btn-primary">Go to Marketplace</a>
              </div>
            }
          />
        </Routes>
        </Suspense>
      </AuthProvider>
    </ErrorBoundary>
  );
}
