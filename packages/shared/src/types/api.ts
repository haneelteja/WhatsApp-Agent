// ─── API request / response shapes ───────────────────────────────────────────

export interface ApiSuccess<T = unknown> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: string;
  code?: string;
}

export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiError;

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  tenantId: string;
  role: 'admin' | 'supervisor' | 'agent';
  name: string;
}

// ─── Webhook context ─────────────────────────────────────────────────────────

export interface TenantWebhookContext {
  tenantId: string;
  phoneNumberId: string;
  provider: 'meta_cloud' | 'interakt' | 'wati' | 'gupshup';
  accessToken: string;
  verifyToken: string;
}
