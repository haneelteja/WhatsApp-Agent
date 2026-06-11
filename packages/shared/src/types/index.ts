// ─── Enums ────────────────────────────────────────────────────────────────────

export type TenantPlan = 'starter' | 'growth' | 'scale';
export type TenantStatus = 'active' | 'suspended' | 'trial';
export type WhatsAppProvider = 'meta_cloud' | 'interakt' | 'wati' | 'gupshup' | 'twilio';
export type ProductType = 'support_bot' | 'sales_bot' | 'lifecycle_bot';  // legacy alias for product slug
export type ProductSlug = 'support_bot' | 'sales_bot' | 'lifecycle_bot';  // matches products.slug
export type ProductTier = 'base' | 'advanced';
export type ConversationStatus = 'open' | 'escalated' | 'resolved' | 'bot_paused';
export type MessageRole = 'user' | 'assistant' | 'system';
export type EscalationStatus = 'pending' | 'assigned' | 'resolved';
export type KnowledgeBaseStatus = 'draft' | 'review' | 'live' | 'archived';
export type KBSuggestionStatus = 'pending' | 'accepted' | 'dismissed';
export type OrderStatus = 'pending' | 'confirmed' | 'dispatched' | 'delivered' | 'cancelled';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'expired';
export type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed';
export type FollowUpStatus = 'scheduled' | 'sent' | 'failed' | 'cancelled';
export type BillingCycle = 'monthly' | 'annual';
export type TrialStatus = 'active' | 'expired' | 'converted';
export type NotificationScope = 'platform' | 'tenant';

/** Roles for YOUR company's staff (platform_users table) */
export type PlatformRole = 'manager' | 'admin';

/** Roles for client-side users (tenant_users table) */
export type ClientRole = 'client_manager' | 'client_admin' | 'agent';

/** @deprecated Use ClientRole. Kept for backward compat during migration. */
export type UserRole = ClientRole;

export type NotificationEventType =
  | 'trial_expiring_7d'
  | 'trial_expiring_1d'
  | 'trial_expired'
  | 'client_invited'
  | 'client_activated'
  | 'escalation_created'
  | 'escalation_timeout'
  | 'new_client_onboarded'
  | 'daily_report'
  | 'low_confidence_spike'
  | 'bot_error'
  | 'subscription_renewed';

// ─── Platform Types ───────────────────────────────────────────────────────────

export interface PlatformUser {
  id: string;
  user_id: string;           // auth.users.id
  role: PlatformRole;
  name: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Product Catalog ──────────────────────────────────────────────────────────

export interface Product {
  id: string;
  slug: ProductSlug;
  name: string;
  description: string | null;
  default_prompt: string;
  default_model: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Guardrails ───────────────────────────────────────────────────────────────

export interface GuardrailsContentFilters {
  no_personal_data: boolean;
  no_external_links: boolean;
  no_phone_numbers_in_response: boolean;
}

export interface GuardrailsConfig {
  blocked_topics: string[];
  blocked_keywords: string[];
  max_response_length: number;
  tone: 'professional' | 'casual' | 'empathetic' | 'formal';
  content_filters: GuardrailsContentFilters;
  on_blocked_topic: 'escalate' | 'ignore' | 'custom_message';
  on_low_confidence: 'escalate' | 'ignore';
  custom_blocked_message?: string;
}

// ─── Bot Config ───────────────────────────────────────────────────────────────

export interface BotConfig {
  id: string;
  tenant_id: string;
  product_slug: ProductSlug;
  system_prompt: string | null;   // null = use Product.default_prompt
  ai_model: string | null;        // null = use Product.default_model
  confidence_threshold: number;
  escalation_triggers: string[];
  guardrails_json: GuardrailsConfig;
  updated_at: string;
  updated_by: string | null;
}

/** BotConfig resolved with product defaults filled in */
export interface ResolvedBotConfig extends Omit<BotConfig, 'system_prompt' | 'ai_model'> {
  system_prompt: string;   // always populated (falls back to product default)
  ai_model: string;        // always populated
  product: Product;
}

// ─── Free Trials ──────────────────────────────────────────────────────────────

export interface FreeTrial {
  id: string;
  tenant_id: string;
  product_slug: ProductSlug;
  starts_at: string;
  ends_at: string;
  status: TrialStatus;
  allowed_model: string;
  phone_number: string | null;
  notified_7d_at: string | null;
  notified_1d_at: string | null;
  notified_expired_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Notification Config ──────────────────────────────────────────────────────

export interface NotificationRecipient {
  role?: PlatformRole | ClientRole;
  email?: string;
}

export interface NotificationConfig {
  id: string;
  scope: NotificationScope;
  tenant_id: string | null;
  product_slug: ProductSlug | null;
  event_type: NotificationEventType;
  recipients: NotificationRecipient[];
  enabled: boolean;
  updated_by: string | null;
  updated_at: string;
}

// ─── Database Row Types ───────────────────────────────────────────────────────

export interface Tenant {
  id: string;
  name: string;
  plan: TenantPlan;
  provider: WhatsAppProvider;
  status: TenantStatus;
  created_at: string;
  updated_at: string;
}

export interface TenantProduct {
  tenant_id: string;
  product_type: ProductSlug;
  tier: ProductTier;
  active: boolean;
  created_at: string;
}

export interface TenantUser {
  id: string;
  tenant_id: string;
  user_id: string;           // auth.users.id
  role: ClientRole;
  invited_by: string | null;
  created_at: string;
}

export interface WhatsAppNumber {
  id: string;
  tenant_id: string;
  phone_number: string;
  provider: WhatsAppProvider;
  config_json: MetaCloudConfig | TwilioConfig | Record<string, unknown>;
  product_slug: ProductSlug | null;   // which bot this number belongs to
  label: string | null;               // e.g. 'India Support', 'US Sales'
  active: boolean;
  created_at: string;
}

export interface MetaCloudConfig {
  phone_number_id: string;
  access_token: string;
  verify_token: string;
  app_secret?: string;
}

export interface TwilioConfig {
  phone_number_id: string;   // Twilio sandbox number e.g. +14155238886
  access_token: string;      // "AccountSid:AuthToken"
}

export interface Contact {
  id: string;
  tenant_id: string;
  phone: string;
  name: string | null;
  memory_json: ContactMemory;
  created_at: string;
  updated_at: string;
}

export interface ContactMemory {
  preferences: Record<string, string>;
  order_history: string[];
  open_issues: string[];
  last_interaction: string | null;
}

export interface Conversation {
  id: string;
  tenant_id: string;
  contact_id: string;
  product_type: ProductSlug;
  status: ConversationStatus;
  assigned_agent_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  media_url: string | null;
  media_type: 'image' | 'audio' | 'document' | 'video' | null;
  whatsapp_msg_id: string | null;
  confidence_score: number | null;
  timestamp: string;
}

export interface Escalation {
  id: string;
  conversation_id: string;
  trigger_reason: string;
  agent_id: string | null;
  status: EscalationStatus;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeBase {
  id: string;
  tenant_id: string;
  product_type: ProductSlug;
  category: string;
  question: string;
  answer: string;
  embedding: number[] | null;
  status: KnowledgeBaseStatus;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface KBSuggestion {
  id: string;
  tenant_id: string;
  product_type: ProductSlug;
  suggested_q: string;
  suggested_a: string;
  frequency: number;
  status: KBSuggestionStatus;
  created_at: string;
}

export interface Order {
  id: string;
  tenant_id: string;
  contact_id: string;
  conversation_id: string;
  items_json: OrderItem[];
  total: number;
  status: OrderStatus;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  name: string;
  quantity: number;
  price: number;
  sku?: string;
}

export interface Payment {
  id: string;
  order_id: string;
  phonepe_ref: string | null;
  link_url: string | null;
  status: PaymentStatus;
  webhook_received_at: string | null;
  created_at: string;
}

export interface Campaign {
  id: string;
  tenant_id: string;
  name: string;
  trigger_type: 'manual' | 'webhook' | 'crm_event';
  template_id: string;
  status: CampaignStatus;
  created_at: string;
  updated_at: string;
}

export interface FollowUpSequence {
  id: string;
  campaign_id: string;
  contact_id: string;
  step: number;
  scheduled_at: string;
  sent_at: string | null;
  status: FollowUpStatus;
}

export interface UsageEvent {
  id: string;
  tenant_id: string;
  product_type: ProductSlug;
  event_type: 'conversation_started' | 'message_sent' | 'ai_token_used' | 'escalation' | 'kb_query';
  token_count: number | null;
  created_at: string;
}

export interface Subscription {
  tenant_id: string;
  product_type: ProductSlug;
  tier: TenantPlan;
  billing_cycle: BillingCycle;
  next_billing_date: string;
}

export interface AgentSession {
  id: string;
  conversation_id: string;
  agent_id: string;
  started_at: string;
  ended_at: string | null;
  resolution_note: string | null;
}

// ─── Enriched view types (joins) ─────────────────────────────────────────────

export interface ConversationWithContact extends Conversation {
  contact: Contact;
  last_message?: Message;
  escalation?: Escalation;
}

export interface ConversationWithMessages extends Conversation {
  contact: Contact;
  messages: Message[];
  escalation?: Escalation;
  agent_session?: AgentSession;
}

export interface TenantWithProducts extends Tenant {
  products: TenantProduct[];
  whatsapp_numbers: WhatsAppNumber[];
  bot_configs: BotConfig[];
  active_trial?: FreeTrial;
}

export interface PlatformClientSummary extends Tenant {
  products: TenantProduct[];
  active_trial: FreeTrial | null;
  conversation_count_30d: number;
  message_count_30d: number;
  escalation_count_30d: number;
}
