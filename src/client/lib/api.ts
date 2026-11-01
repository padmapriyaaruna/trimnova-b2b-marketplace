import axios, { AxiosInstance, InternalAxiosRequestConfig, AxiosResponse } from 'axios';

/* ─── Constants ──────────────────────────────────────────────────────────── */
const BASE_URL     = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';
const TOKEN_KEY    = 'trimnova_token';
const TIMEOUT_MS   = 30_000;

/* ─── Axios instance ─────────────────────────────────────────────────────── */
export const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: TIMEOUT_MS,
  headers: {
    'Content-Type': 'application/json',
    'Accept':       'application/json',
    'X-Client':     'trimnova-web',
  },
});

/* ─── Request interceptor — attach Bearer token ──────────────────────────── */
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token && config.headers) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  error => Promise.reject(error),
);

/* ─── Response interceptor — handle 401 ─────────────────────────────────── */
apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  error => {
    if (error.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      const currentPath = window.location.pathname;
      if (!currentPath.startsWith('/auth')) {
        window.location.href = '/auth';
      }
    }
    return Promise.reject(error);
  },
);

/* ─── Helper: extract data ───────────────────────────────────────────────── */
function data<T>(res: AxiosResponse<{ data: T }>): T {
  return res.data.data;
}

/* ─── Types ──────────────────────────────────────────────────────────────── */
export interface AuthLoginPayload {
  identifier: string;  // email or userId
  password:   string;
  role:       string;
  totpCode?:  string;
  passkey?:   string;  // admin-only: Security Master Passkey
}

export interface AuthLoginResponse {
  token: string;
  user:  UserProfile;
}

export interface UserProfile {
  id:        string;
  userId:    string;
  email:     string;
  name:      string;
  role:      string;
  planTier?: string;
  avatarUrl?: string;
}

export interface RegisterCheckPayload {
  field: 'email' | 'userId';
  value: string;
}

export interface RegisterCheckResponse {
  exists: boolean;
}

export interface SendOtpPayload {
  phone: string;
}

export interface VerifyOtpPayload {
  phone: string;
  otp:   string;
}

export interface RegisterPayload {
  email:       string;
  userId:      string;
  phone:       string;
  password:    string;
  role:        string;
  inviteCode?: string;
}

export interface PaginatedResponse<T> {
  items:      T[];
  total:      number;
  page:       number;
  pageSize:   number;
  totalPages: number;
}

export interface Product {
  id:          string;
  sku:         string;
  name:        string;
  description: string;
  category:    string;
  price:       string;       // Decimal as string
  mrp:         string;
  moq:         number;
  stock:       number;
  imageUrls:   string[];
  vendorId:    string;
  vendorName?: string;
  tags:        string[];
  isActive:    boolean;
  createdAt:   string;
}

export interface CartItem {
  id:        string;
  productId: string;
  product:   Product;
  qty:       number;
  unitPrice: string;
  lineTotal: string;
}

export interface Cart {
  id:        string;
  items:     CartItem[];
  subtotal:  string;
  discount:  string;
  total:     string;
  couponCode?: string;
}

export interface Order {
  id:             string;
  orderNumber:    string;
  status:         string;
  customerId:     string;
  customerName?:  string;
  items:          OrderItem[];
  subtotal:       string;
  discount:       string;
  total:          string;
  createdAt:      string;
  updatedAt:      string;
  shippingAddress?: Address;
}

export interface OrderItem {
  id:        string;
  productId: string;
  product:   Pick<Product, 'id' | 'name' | 'sku' | 'imageUrls'>;
  qty:       number;
  unitPrice: string;
  lineTotal: string;
}

export interface Address {
  line1:    string;
  line2?:   string;
  city:     string;
  state:    string;
  pincode:  string;
  country:  string;
}

export interface Notification {
  id:        string;
  type:      string;
  title:     string;
  body:      string;
  timestamp: string;
  read:      boolean;
  meta?:     Record<string, string | number>;
}

export interface VendorOnboardingStatus {
  vendorId:       string;
  profileStep:    number;
  kycStatus:      string;
  planTier:       string;
  isApproved:     boolean;
  onboardingDone: boolean;
}

export interface Settlement {
  id:            string;
  vendorId:      string;
  period:        string;
  grossSales:    string;
  platformFee:   string;
  netPayout:     string;
  status:        string;
  payoutDate?:   string;
  utrNumber?:    string;
}

export interface Coupon {
  id:              string;
  code:            string;
  description:     string;
  discountType:    'PERCENT' | 'FLAT';
  discountValue:   string;
  minOrderValue:   string;
  maxDiscount?:    string;
  usageLimit:      number;
  usedCount:       number;
  isActive:        boolean;
  expiresAt?:      string;
}

export interface Escalation {
  id:          string;
  type:        string;
  severity:    string;
  title:       string;
  description: string;
  status:      string;
  raisedBy:    string;
  assignedTo?: string;
  createdAt:   string;
  resolvedAt?: string;
}

/* ─── Auth API ───────────────────────────────────────────────────────────── */
export const authApi = {
  login(payload: AuthLoginPayload): Promise<AuthLoginResponse> {
    // Admin logins use the dedicated admin-login endpoint with passkey + TOTP
    if (payload.role === 'ADMIN') {
      return apiClient.post('/auth/admin-login', {
        email:    payload.identifier,
        password: payload.password,
        passkey:  payload.passkey ?? '',
        totp:     payload.totpCode ?? '000000',
      }).then(res => res.data);
    }
    return apiClient.post('/auth/login', payload).then(res => res.data);
  },

  logout(): Promise<void> {
    return apiClient.post('/auth/logout').then(() => undefined);
  },

  me(): Promise<UserProfile> {
    return apiClient.get('/auth/me').then(res => res.data.user);
  },

  checkDuplicate(payload: RegisterCheckPayload): Promise<RegisterCheckResponse> {
    return apiClient.post('/auth/register/check-duplicate', payload).then(res => res.data);
  },

  sendOtp(payload: SendOtpPayload): Promise<{ message: string }> {
    return apiClient.post('/auth/register/send-otp', payload).then(res => res.data);
  },

  verifyOtp(payload: VerifyOtpPayload): Promise<{ verified: boolean }> {
    return apiClient.post('/auth/register/verify-otp', payload).then(res => res.data);
  },

  register(payload: RegisterPayload): Promise<AuthLoginResponse> {
    return apiClient.post('/auth/register', payload).then(res => res.data);
  },

  forgotPassword(email: string): Promise<{ message: string }> {
    return apiClient.post('/auth/forgot-password', { email }).then(res => res.data);
  },
};

/* ─── Products API ───────────────────────────────────────────────────────── */
export const productsApi = {
  list(params?: {
    page?: number;
    pageSize?: number;
    search?: string;
    category?: string;
    vendorId?: string;
    sort?: string;
  }): Promise<PaginatedResponse<Product>> {
    return apiClient.get('/products', { params }).then(res => res.data);
  },

  get(id: string): Promise<Product> {
    return apiClient.get(`/products/${id}`).then(res => res.data.product);
  },

  /* Vendor catalog management */
  create(payload: Partial<Product>): Promise<Product> {
    return apiClient.post('/vendor/products', payload).then(res => res.data.product);
  },

  update(id: string, payload: Partial<Product>): Promise<Product> {
    return apiClient.put(`/vendor/products/${id}`, payload).then(res => res.data.product);
  },

  delete(id: string): Promise<void> {
    return apiClient.delete(`/vendor/products/${id}`).then(() => undefined);
  },

  uploadImage(id: string, file: File): Promise<{ url: string }> {
    const form = new FormData();
    form.append('image', file);
    return apiClient
      .post(`/vendor/products/${id}/images`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then(res => res.data);
  },
};

/* ─── Cart API ───────────────────────────────────────────────────────────── */
export const cartApi = {
  get(): Promise<Cart> {
    return apiClient.get('/cart').then(res => res.data.cart);
  },

  addItem(productId: string, qty: number): Promise<Cart> {
    return apiClient.post('/cart/items', { productId, qty }).then(res => res.data.cart);
  },

  updateItem(itemId: string, qty: number): Promise<Cart> {
    return apiClient.put(`/cart/items/${itemId}`, { qty }).then(res => res.data.cart);
  },

  removeItem(itemId: string): Promise<Cart> {
    return apiClient.delete(`/cart/items/${itemId}`).then(res => res.data.cart);
  },

  applyCoupon(code: string): Promise<Cart> {
    return apiClient.post('/cart/coupon', { code }).then(res => res.data.cart);
  },

  removeCoupon(): Promise<Cart> {
    return apiClient.delete('/cart/coupon').then(res => res.data.cart);
  },

  checkout(payload: { addressId?: string; address?: Address }): Promise<Order> {
    return apiClient.post('/cart/checkout', payload).then(res => res.data.order);
  },
};

/* ─── Orders API ─────────────────────────────────────────────────────────── */
export const ordersApi = {
  list(params?: { page?: number; status?: string }): Promise<PaginatedResponse<Order>> {
    return apiClient.get('/orders', { params }).then(res => res.data);
  },

  get(id: string): Promise<Order> {
    return apiClient.get(`/orders/${id}`).then(res => res.data.order);
  },

  /* Vendor */
  vendorList(params?: { page?: number; status?: string }): Promise<PaginatedResponse<Order>> {
    return apiClient.get('/vendor/orders', { params }).then(res => res.data);
  },

  vendorUpdateStatus(id: string, status: string, note?: string): Promise<Order> {
    return apiClient.put(`/vendor/orders/${id}/status`, { status, note }).then(res => res.data.order);
  },
};

/* ─── RMA API ────────────────────────────────────────────────────────────── */
export const rmaApi = {
  list(): Promise<PaginatedResponse<any>> {
    return apiClient.get('/rma').then(res => res.data);
  },

  create(payload: { orderId: string; reason: string; items: string[] }): Promise<any> {
    return apiClient.post('/rma', payload).then(res => res.data.rma);
  },

  get(id: string): Promise<any> {
    return apiClient.get(`/rma/${id}`).then(res => res.data.rma);
  },
};

/* ─── Vendor API ─────────────────────────────────────────────────────────── */
export const vendorApi = {
  onboardingStatus(): Promise<VendorOnboardingStatus> {
    return apiClient.get('/vendor/onboarding/status').then(res => res.data);
  },

  submitKyc(payload: FormData): Promise<any> {
    return apiClient.post('/vendor/kyc', payload, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(res => res.data);
  },

  updateCapabilities(payload: any): Promise<any> {
    return apiClient.put('/vendor/capabilities', payload).then(res => res.data);
  },

  dashboard(): Promise<any> {
    return apiClient.get('/vendor/dashboard').then(res => res.data);
  },

  settlements(params?: { page?: number }): Promise<PaginatedResponse<Settlement>> {
    return apiClient.get('/vendor/settlements', { params }).then(res => res.data);
  },
};

/* ─── Approver API ───────────────────────────────────────────────────────── */
export const approverApi = {
  queue(params?: { page?: number; type?: string }): Promise<PaginatedResponse<any>> {
    return apiClient.get('/approver/queue', { params }).then(res => res.data);
  },

  review(id: string, payload: { decision: 'APPROVE' | 'REJECT' | 'ON_HOLD'; note?: string }): Promise<any> {
    return apiClient.post(`/approver/queue/${id}/review`, payload).then(res => res.data);
  },

  margins(params?: { page?: number }): Promise<PaginatedResponse<any>> {
    return apiClient.get('/approver/margins', { params }).then(res => res.data);
  },
};

/* ─── Admin API ──────────────────────────────────────────────────────────── */
export const adminApi = {
  dashboard(): Promise<any> {
    return apiClient.get('/admin/dashboard').then(res => res.data);
  },

  vendors(params?: { page?: number; status?: string }): Promise<PaginatedResponse<any>> {
    return apiClient.get('/admin/vendors', { params }).then(res => res.data);
  },

  escalations(params?: { page?: number; severity?: string }): Promise<PaginatedResponse<Escalation>> {
    return apiClient.get('/admin/escalations', { params }).then(res => res.data);
  },

  resolveEscalation(id: string, payload: { resolution: string }): Promise<any> {
    return apiClient.post(`/admin/escalations/${id}/resolve`, payload).then(res => res.data);
  },

  margins(params?: { page?: number }): Promise<PaginatedResponse<any>> {
    return apiClient.get('/admin/margins', { params }).then(res => res.data);
  },

  updateMargin(id: string, payload: { marginPct: string }): Promise<any> {
    return apiClient.put(`/admin/margins/${id}`, payload).then(res => res.data);
  },

  coupons(params?: { page?: number }): Promise<PaginatedResponse<Coupon>> {
    return apiClient.get('/admin/coupons', { params }).then(res => res.data);
  },

  createCoupon(payload: Partial<Coupon>): Promise<Coupon> {
    return apiClient.post('/admin/coupons', payload).then(res => res.data.coupon);
  },

  updateCoupon(id: string, payload: Partial<Coupon>): Promise<Coupon> {
    return apiClient.put(`/admin/coupons/${id}`, payload).then(res => res.data.coupon);
  },

  deleteCoupon(id: string): Promise<void> {
    return apiClient.delete(`/admin/coupons/${id}`).then(() => undefined);
  },

  settlements(params?: { page?: number; status?: string }): Promise<PaginatedResponse<Settlement>> {
    return apiClient.get('/admin/settlements', { params }).then(res => res.data);
  },

  processSettlement(id: string, payload: { utrNumber: string }): Promise<Settlement> {
    return apiClient.post(`/admin/settlements/${id}/process`, payload).then(res => res.data.settlement);
  },

  platformConfig(): Promise<any> {
    return apiClient.get('/admin/config').then(res => res.data.config);
  },

  updatePlatformConfig(payload: any): Promise<any> {
    return apiClient.put('/admin/config', payload).then(res => res.data.config);
  },
};

/* ─── Notifications API ──────────────────────────────────────────────────── */
export const notificationsApi = {
  demoEvents(countOnly?: boolean): Promise<{ notifications: Notification[]; unreadCount: number }> {
    return apiClient
      .get('/notifications/demo-events', { params: countOnly ? { countOnly: 'true' } : {} })
      .then(res => res.data);
  },

  markRead(ids: string[]): Promise<void> {
    return apiClient.post('/notifications/mark-read', { ids }).then(() => undefined);
  },
};

export default apiClient;
