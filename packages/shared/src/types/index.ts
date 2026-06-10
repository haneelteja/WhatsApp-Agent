// ─── Enums ────────────────────────────────────────────────────────────────────

export type TenantPlan = 'starter' | 'growth' | 'scale';
export type TenantStatus = 'active' | 'suspended' | 'trial';
export type WhatsAppProvider = 'meta_cloud' | 'interakt' | 'wati' | 'gupshup' | 'twilio';
export type ProductType = 'support_bot' | 'sales_bot' | 'lifecycle_bot';
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
export type UserRole = 'admin' | 'supervisor' | 'agent';
export type BillingCycle = 'monthly' | 'annual';

// ─── Database Row Types ───────────────────────────────────────────────────────

export interface Tenant {
  id: string;
  name: string;
  plan: TenantPlan;
  provider: WhatsAppProvider;
  status: TenantStatus;
  created_at: string;
}

export interface TenantProduct {
  tenant_id: string;
  product_type: ProductType;
  tier: ProductTier;
  active: boolean;
}

export interface WhatsAppNumber {
  id: string;
  tenant_id: string;
  phone_number: string;
  provider: WhatsAppProvider;
  config_json: MetaCloudConfig | Record<string, unknown>;
  created_at: string;
}

export interface MetaCloudConfig {
  phone_number_id: string;
  access_token: string;
  verify_token: string;
  app_secret: string;
}

export interface Contact {
  id: string;
  tenant_id: string;
  phone: string;
  name: string | null;
  memory_json: ContactMemory;
  created_at: string;
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
  product_type: ProductType;
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
}

export interface KnowledgeBase {
  id: string;
  tenant_id: string;
  product_type: ProductType;
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
  product_type: ProductType;
  event_type: 'conversation_started' | 'message_sent' | 'ai_token_used' | 'escalation' | 'kb_query';
  token_count: number | null;
  created_at: string;
}

export interface Subscription {
  tenant_id: string;
  product_type: ProductType;
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
