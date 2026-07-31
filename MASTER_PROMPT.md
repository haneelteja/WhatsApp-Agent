# WhatsApp AI Agent Platform — Master Prompt

> Use this prompt to generate any artifact: presentation slides, Word documents, one-pagers, pitch decks, architecture diagrams, user guides, training manuals, or API docs. The prompt is self-contained and covers every aspect of the product.

---

## PRODUCT IDENTITY

**Product Name:** WhatsApp AI Agent
**Type:** Multi-tenant B2B SaaS platform
**Core Purpose:** Enable any business to deploy AI-powered WhatsApp bots and Voice AI agents — without writing code — for customer support, sales engagement, and lifecycle management.
**Primary Market:** Indian SMBs and mid-market enterprises; India-first design (regional languages, local payment and telephony providers).
**Deployment Stack:** Node.js API (Fastify) + Next.js 14 web app + Supabase (PostgreSQL + pgvector + RLS) + Redis cache.

---

## PLATFORM PERSONAS (TWO PORTALS)

### Portal 1 — Client Dashboard (Tenant UI)
Used by the business (the customer of the SaaS). Accessible at the main app URL. Lets businesses configure their bots, manage conversations, view analytics, handle escalations, manage their team, and run campaigns.

### Portal 2 — Platform Admin (Operator UI)
Used by the SaaS operator (the company running this platform). Accessible at /platform. Lets the operator manage all client tenants, configure global guardrails, manage voice providers, assign LLM configs, create products, and monitor platform health.

---

## USER ROLES & WHAT THEY CAN DO

| Role | Portal | Can Do |
|---|---|---|
| Platform Manager | Admin | Everything: create/edit/suspend clients, manage products, set global guardrails, configure voice providers, manage LLM credentials at all levels, set notification rules, invite platform staff |
| Platform Admin | Admin | Read-only visibility into all client data, system health monitoring |
| Client Manager | Client | Full control of their workspace: configure bots, manage KB, set guardrails, invite team, manage WhatsApp numbers, set LLM keys, create orders, view analytics |
| Client Admin | Client | Manage escalations, assign agents, limited team management |
| Agent | Client | View and claim escalations assigned to their tenant, send WhatsApp replies during human takeover, resolve conversations |

**Data isolation:** Each tenant only sees their own data. Enforced at the database layer via Supabase Row-Level Security (RLS) — not just application-level checks.

---

## BOT TYPES (3 PRODUCTS)

Every client can activate any combination of the three bot types. Each runs independently with its own configuration.

### 1. Customer Support Bot (`support_bot`)
**Purpose:** Handle customer queries, resolve support tickets, answer FAQs.
**Key capabilities:**
- Answers questions using a configurable knowledge base (RAG)
- Escalates to human agent when AI confidence is low or customer requests it
- Tracks CSAT (1–5 star rating) after each conversation closes
- Works in 10+ Indian regional languages (Hindi, Tamil, Telugu, Kannada, Punjabi, Gujarati, Odia, etc.)
- Detects and replies in the same language/script as the customer

### 2. Sales Engagement Bot (`sales_bot`)
**Purpose:** Qualify inbound leads, share product info, detect buying intent, hand off warm prospects to sales agents.
**Key capabilities:**
- Progresses customers through a conversation state machine: greeting → qualifying → resolving → following_up → closing
- Detects buying intent via `[SALES_LEAD]` marker — auto-escalates to sales agent the moment a customer is ready to buy
- Captures structured customer entities: email, product interest, quantity, location, budget
- Sends AI-extracted lead data to the escalation record for the sales agent's context

### 3. Lifecycle Management Bot (`lifecycle_bot`)
**Purpose:** Post-sale engagement — order tracking, payment collection, renewal reminders.
**Key capabilities:**
- Answers order and invoice queries
- Creates orders and sends payment links (PhonePe / Razorpay) directly in the WhatsApp conversation
- Sends payment reminders and follow-ups for unpaid invoices
- Handles renewal and upsell outreach

---

## CORE FEATURE MODULES

### Feature 1 — Inbound WhatsApp Message Pipeline
Every message goes through a 16-step async pipeline:
1. **Provider inference** — identifies Meta Cloud or Twilio from payload shape; falls back to alternate if no number found
2. **Bot context load** — single RPC fetches all config (credentials, bot settings, all 4 guardrail layers, LLM credentials) from Redis cache (60s TTL) or Supabase
3. **Plan enforcement** — checks tenant status (suspended/active/trial), conversation count limits, token quota
4. **Contact upsert** — identifies contact by phone number (E.164) or BSUID (WhatsApp username opaque ID); maintains persistent memory JSON per contact
5. **CSAT intercept** — if awaiting rating and customer sends 1–5, records it silently; no AI call needed
6. **Deduplication** — `whatsapp_msg_id` unique constraint blocks duplicate processing from Meta webhook retries
7. **Optimistic lock** — 30-second row lock on conversation prevents concurrent AI calls
8. **Escalation keyword check** — checks configured trigger phrases; if matched, escalates immediately without AI call
9. **KB retrieval (RAG)** — 4-strategy cascade: Redis cache → pgvector similarity (Voyage-3 embeddings) → keyword ILIKE → product fallback
10. **History assembly** — loads up to 40 messages; recent ones verbatim, older turns compressed into archive summary in the system prompt
11. **AI generation** — Claude API called with full system prompt (guardrails + KB results + conversation stage + contact memory + language directive); confidence extracted from `CONFIDENCE:0.XX` marker
12. **Marker extraction** — strips `[SALES_LEAD]`, `[STAGE:x]`, `[ENTITY:key=value]` markers from response before sending to customer
13. **Guardrail enforcement** — blocked keywords/topics applied across all 4 layers; response truncated to effective `max_response_length`
14. **Escalation policy** — low-confidence counter incremented; if consecutive low-confidence turns ≥ `max_low_confidence_reprompts`, auto-escalates
15. **Reply dispatch** — sends via WhatsApp gateway, stores with `delivery_status=sent`
16. **Lock release + delivery tracking** — releases processing lock; Meta receipts advance status ladder: sent → delivered → read

### Feature 2 — Conversation Management
- **4 statuses:** `open` (bot active), `escalated` (human agent), `bot_paused` (agent watching, bot silent), `resolved` (closed)
- **AI state machine:** Conversations have a `stage` field (greeting → qualifying → resolving → following_up → closing). AI advances stages and captures entities using control markers stripped before delivery.
- **Entity capture example:** `[ENTITY:email=alice@example.com]` `[ENTITY:order_id=ORD-123]`
- **Delivery ladder:** One-way — sent → delivered → read. Backward transitions silently ignored.
- **Concurrent processing lock:** 30-second optimistic lock prevents race conditions on Meta webhook retries.

### Feature 3 — Knowledge Base (RAG)
- Tenants create named **KB Collections** and assign them to specific bots with priority ordering
- **Document ingestion:** Upload PDF, DOCX, TXT, Markdown, or images (OCR). Files are semantically chunked and embedded via Voyage-3 into pgvector.
- **Entry lifecycle:** draft → review → live → archived
- **Search cascade:** Redis cache → pgvector cosine similarity → keyword ILIKE → product-scoped fallback
- **KB-only mode:** When enabled, AI is restricted to KB answers only. If no match found, it acknowledges the gap and offers to escalate.
- **AI suggestions:** Frequently unanswered questions are automatically flagged as KB suggestions (pending → accepted/dismissed) for the client manager to review.

### Feature 4 — Escalation Management
**Triggers:**
- Customer types a configured keyword (e.g., "speak to human", "urgent", "refund", "complaint")
- AI confidence below threshold for N consecutive turns
- `[SALES_LEAD]` marker detected → immediate sales agent handoff
- KB-only mode active + no KB match found
- Auto-escalation timeout: conversation open > X hours (configurable)

**Flow:**
1. Conversation status → `escalated`; bot goes silent
2. Escalation record created (status: pending)
3. Email sent to `client_manager` + `platform_admin` via Brevo
4. If `auto_dispatch_on_escalation=true` → outbound voice call placed to customer
5. Agent claims escalation → `assigned_agent_id` set on conversation
6. Agent sends manual replies; bot stays silent until resolved
7. On resolution → conversation closed; optional CSAT prompt sent

**Human takeover (`bot_paused`):** Agent can pause bot without full escalation. Bot resumes when agent sets status back to `open`.

**CSAT:** After resolution, bot sends 1–5 star prompt. Score stored in `contact.memory_json.csat_score` with timestamp.

### Feature 5 — Voice Call Module
AI-powered outbound phone calls with a configurable 3-component stack.

**Provider stack:**
- **Telephony:** Twilio (international) or Exotel (India, lower cost)
- **STT:** Deepgram Nova-2, Sarvam AI (Indian regional languages), Azure Speech
- **TTS:** Twilio Say (free, built-in), Google Neural2, Sarvam TTS, Exotel Say

**Call flow:**
1. Dispatch call (via API, campaign trigger, or auto-dispatch on escalation)
2. Voice calls record created; telephony provider dials out
3. On answer: greeting TwiML/ExoML played; customer prompted to speak
4. Customer audio → STT → Claude AI response → TTS audio → next prompt
5. Loop until `max_turns` reached, silence timeout, or hang-up
6. Provider sends final status: `completed / failed / voicemail / no_answer / busy`
7. Claude analyzes full transcript → extracts structured outcome: `{intent, product_interest, resolved, escalation_needed, sentiment, follow_up_action, summary}`
8. Cost in INR calculated and stored with transcript

**Voice config per-bot:** language (en-IN, hi-IN, ta-IN, te-IN, kn-IN, mr-IN, gu-IN, ml-IN, en-US), TTS voice, `max_call_duration_seconds` (default 300), `max_turns` (default 20), `silence_timeout_seconds` (default 5), `voicemail_enabled`, `greeting_message`, `auto_dispatch_on_escalation`, `escalation_voice_delay_seconds`.

**Cost estimation:** Platform exposes an API endpoint that returns blended cost per minute (INR) for any telephony + STT + TTS combination.

### Feature 6 — Campaign Engine
Bulk outbound engagement with per-contact tracking and retry logic.

**Channels:**
- `whatsapp` — Sends template message to all contacts; tracks sent/replied/failed per contact
- `voice` — Dispatches AI calls to all contacts; tracks initiated/answered/voicemail/failed
- `both` — WhatsApp first; if no reply after configured delay, dispatches voice call

**Lifecycle:** draft → active (launch) → paused (manual) → completed / cancelled

**Retry config:** `retry_after_hours`, `max_retries` per contact. Failed contacts retried within window.

**Real-time stats:** `stats_json` tracks totals, WhatsApp delivery metrics, voice outcome metrics — visible on campaign detail page.

### Feature 7 — Follow-Up Automation
Scheduler re-engages idle contacts automatically.

**Config per bot:** `enabled`, `idle_days` (inactivity threshold), `message_template`, `max_follow_ups` (cap per conversation), `contact_scope`.

**Statuses:** scheduled → sent / failed / cancelled

### Feature 8 — Orders & Payment Collection
Lifecycle bot or agents can create orders and collect payment within the conversation.

**Workflow:**
1. Create order with line items (name, qty, unit price) and total
2. Generate payment link via PhonePe or Razorpay
3. Link sent to customer on WhatsApp
4. Customer pays → provider webhook → payment status `paid` → order status `confirmed`
5. Bot continues conversation (delivery confirmation, post-purchase queries)

**Providers:** PhonePe (UPI, SHA256-signed payloads) | Razorpay (UPI + cards + net banking, webhook-driven)

**Order statuses:** pending → confirmed → dispatched → delivered → cancelled

### Feature 9 — Analytics & Reporting
**Client dashboard (/analytics):** 7-day and 30-day toggles. Shows conversation counts (total/open/escalated/resolved/bot_paused), daily message volume chart, monthly token consumption, escalation rate, per-product breakdown, contact sentiment distribution (positive/neutral/negative/frustrated).

**Platform admin (/platform/analytics):** Total clients, active trials, platform-wide conversation volume, per-client usage breakdown, trial conversion rates.

**Metered usage events (for billing):** `conversation_started`, `message_sent`, `ai_token_used` (with token count), `escalation`, `kb_query`.

### Feature 10 — Notification System
Event-driven email notifications via Brevo with configurable rules.

**12 events:** `trial_expiring_7d`, `trial_expiring_1d`, `trial_expired`, `client_invited`, `client_activated`, `escalation_created`, `escalation_timeout`, `new_client_onboarded`, `daily_report`, `low_confidence_spike`, `bot_error`, `subscription_renewed`

**Targeting:** Role-based (platform_admin, platform_manager, client_manager, client_admin) OR custom email list. Scope: platform-wide or per-tenant.

### Feature 11 — Free Trial Management
- Per-product trials, independently per client
- Configurable duration (default 14 days), optional model restriction
- Status: active → expired OR active → converted
- Automatic notifications at 7 days, 1 day, and on expiry
- Trial conversion tracked in platform analytics

### Feature 12 — Team Management
**Client team:** Client manager invites via email (7-day expiry links). Roles: `client_manager`, `client_admin`, `agent`.
**Platform team:** Platform manager invites internal staff. Roles: `manager` (full control), `admin` (read-only).

---

## CONFIGURATION SYSTEM

### 4-Layer Guardrail Cascade
Guardrails control AI behaviour. Four layers merged at runtime:
- **Merge rules:** Lists → UNION (all layers contribute). Numeric limits → MIN (most restrictive wins). Booleans → OR (any layer can enable). Strings (actions/messages) → most specific layer wins.

| Layer | Set By | What It Controls |
|---|---|---|
| 1 — Global | Platform Manager | global_blocked_topics, global_blocked_keywords, max_response_length (default 2000), enforce_kb_only_globally, no_personal_data, no_external_links |
| 2 — Bot-Type | Platform Manager | Per product slug: blocked_topics, blocked_keywords, max_response_length, kb_only_mode, no_personal_data, no_external_links, on_blocked_topic |
| 3 — Tenant | Client Manager | Shared across all bots: same as Layer 2 + custom_blocked_message |
| 4 — Bot Config | Client Manager | Per-bot: tone, no_phone_numbers_in_response, on_low_confidence, reprompt_message, max_response_length (default 1000) |

### Bot Configuration Settings (per-bot)
- `system_prompt` — full AI persona and business instructions (overrides product default)
- `ai_model` — Anthropic model ID (e.g., claude-sonnet-4-6)
- `confidence_threshold` — float 0–1, below which low-confidence reprompt triggers (default 0.6)
- `escalation_triggers` — list of keyword phrases for immediate human escalation
- `kb_only_mode` — restrict AI to KB answers only
- **Tone:** professional | casual | empathetic | formal
- **Content filters:** no_external_links, no_phone_numbers_in_response, no_personal_data
- **Escalation policy:** max_low_confidence_reprompts (default 2), on_exhaust (escalate|silent), reprompt_message, auto_escalate_after_hours
- **Voice config:** full voice stack settings (see Voice module above)

### LLM Configuration Hierarchy (6 Levels)
Determines which AI model and API key to use. First valid match wins:
1. Client LLM config — specific bot (tenant_id + product_slug)
2. Client LLM config — generic/all bots (tenant_id only)
3. Platform LLM config — specific bot (product_slug only)
4. Platform LLM config — generic (no tenant, no product)
5. `bot_configs.ai_model` — model from bot config, uses platform API key
6. `products.default_model` — product catalog default, uses platform API key

**Auth-failure fallback:** If client's custom API key fails (401/403), the platform automatically retries using its own platform key before surfacing an error.

---

## WHATSAPP PROVIDERS SUPPORTED

| Provider | Type | Config Fields |
|---|---|---|
| Meta Cloud API | Official WhatsApp Business API | phone_number_id, access_token, verify_token, app_secret |
| Twilio | WhatsApp Sandbox | Account SID, Auth Token, phone number |
| Interakt | Third-party BSP | API key, endpoint |
| WATI | Third-party BSP | API token, endpoint |
| Gupshup | Third-party BSP | API key, source phone |

Multiple numbers per tenant supported. Numbers labelled per use case, toggled active/inactive without deleting credentials.

---

## TECHNICAL ARCHITECTURE

### System Components
- **API Server (`apps/api`):** Node.js + Fastify. Handles webhooks, AI pipeline, voice orchestration, campaign dispatch, KB ingest. Stateless — horizontally scalable.
- **Web App (`apps/web`):** Next.js 14 App Router. Two portals (client + platform admin). All data mutations via Server Actions. Recharts for analytics visualisation.
- **Database:** Supabase (PostgreSQL). pgvector extension for embedding-based KB search. Row-Level Security (RLS) for tenant isolation. `get_bot_context` RPC consolidates 7 queries into 1 call.
- **Cache:** Redis. Bot context cache (60s TTL). KB lookup cache. Token quota counters (incremented optimistically after each AI call).
- **Auth:** Supabase Auth. JWT claims decoded server-side. `get_user_tenant_id()` Postgres function resolves tenant from token.

### Performance Design
- Webhook HTTP response always < 100ms (reply sent immediately; AI work is async)
- Redis cache hit on bot context: < 5ms
- KB vector search target: < 200ms
- `get_bot_context` RPC: 1 DB call instead of 7 parallel queries
- Optimistic lock prevents duplicate AI calls on Meta webhook retries
- `whatsapp_msg_id` unique constraint prevents duplicate message storage

### Security Architecture
- Row-Level Security at database layer — not just application layer
- WhatsApp credentials encrypted in `config_json` per number
- LLM API keys stored in `llm_configs`; masked in all API responses
- Webhook signatures validated (Meta HMAC + app_secret, Razorpay webhook secret)
- Payment credentials (PhonePe salt keys, Razorpay secret) in environment variables only
- Processing lock prevents race conditions from concurrent webhook retries

---

## CORE DATA MODEL (30+ Tables, 7 Groups)

**Identity & Access:** `tenants`, `tenant_users`, `platform_users`, `client_invites`

**Communication:** `whatsapp_numbers` (credentials per number), `contacts` (phone/BSUID + persistent `memory_json`), `conversations` (status + stage + ai_vars + processing_lock), `messages` (role + content + confidence_score + delivery_status + whatsapp_msg_id), `escalations` (trigger_reason + agent_id + status), `agent_sessions` (takeover periods)

**AI & Config:** `products` (slug + default_prompt + default_model), `bot_configs` (system_prompt + confidence_threshold + guardrails_json + voice_config + escalation_policy), `platform_settings` (global guardrails), `bot_type_guardrails` (layer 2), `tenant_guardrails` (layer 3), `llm_configs` (tenant × product hierarchy)

**Knowledge Base:** `kb_collections`, `kb_collection_bots` (priority assignment), `knowledge_base` (entries + embedding vector + status), `kb_documents` (PDF/DOCX/TXT; processing status + chunk_count), `kb_suggestions` (AI-generated FAQ candidates)

**Commerce:** `orders` (items_json + total + status), `payments` (provider + status + link_url + webhook_received_at), `campaigns` (channel + stats_json + retry_config), `campaign_contacts` (per-contact status + attempts), `follow_up_configs`, `follow_up_sequences`

**Voice & Telephony:** `voice_provider_configs` (component: telephony|stt|tts + credentials + cost_per_min_inr), `voice_calls` (transcript + outcome_json + cost_rupees + triggered_by)

**Billing & Usage:** `free_trials`, `subscriptions`, `usage_events` (event_type + token_count), `notification_configs`, `tenant_products` (activation per tenant)

---

## THIRD-PARTY INTEGRATIONS (18 Services)

| Service | Category | Purpose |
|---|---|---|
| Meta Cloud API | WhatsApp | Primary messaging API |
| Twilio | WhatsApp + Voice | Sandbox messaging + AI voice calls (TwiML) |
| Interakt / WATI / Gupshup | WhatsApp BSP | Alternative messaging providers |
| Exotel | Telephony (India) | Outbound voice calls (ExoML), lowest India cost |
| Deepgram Nova-2 | STT | Fast English transcription |
| Sarvam AI | STT + TTS | Hindi + 7 Indian regional languages |
| Azure Speech | STT | Enterprise-grade optional STT |
| Google Neural2 TTS | TTS | High-quality multilingual TTS |
| Twilio Say | TTS | Free built-in (Amazon Polly voices) |
| PhonePe | Payments | UPI payment links, India |
| Razorpay | Payments | UPI + cards + net banking |
| Anthropic / Claude | AI / LLM | Primary AI model (default) |
| OpenRouter | AI / LLM | Multi-model routing option |
| OpenAI | AI / LLM | Direct OpenAI models option |
| Voyage-3 | Embeddings | KB semantic search |
| Supabase | Database | PostgreSQL + pgvector + RLS + Auth |
| Redis | Cache | KB cache + bot context cache + token counters |
| Brevo (Sendinblue) | Email | Transactional + notification emails |

---

## TENANT PLANS

| Plan | Conversation Limit/Month | Token Quota |
|---|---|---|
| Starter | 500 | Monthly cap |
| Growth | 2,000 | Higher monthly cap |
| Scale | Unlimited | Unlimited |

**Tenant statuses:** `trial` → `active` (on subscription) or `trial` → `expired`. `suspended` = no bot replies, data preserved.

---

## USER GUIDE — HOW EACH USER USES THE PLATFORM

### Platform Manager — Day-to-Day
1. **Create client:** Go to /platform/clients/new → select products, set plan, configure trial duration → send invite.
2. **Configure global guardrails:** /platform/guardrails → set global blocked topics, keywords, content filters, max response length.
3. **Set per-product guardrails:** /platform/bot-guardrails → configure safety rules for each bot type.
4. **Manage voice providers:** /platform/voice-providers → add telephony/STT/TTS credentials, set defaults, view cost per minute.
5. **Configure LLM:** /platform/ai-models → add API keys for Anthropic/OpenRouter/OpenAI at platform or per-bot level.
6. **Monitor:** /platform/clients → view all tenants, trial status, conversation volume, token usage.
7. **Notifications:** /platform/notifications → configure who gets emailed on which events.

### Client Manager — Day-to-Day
1. **Configure bot:** /settings → write system prompt, set confidence threshold, configure escalation triggers, select tone, set content filters.
2. **Build knowledge base:** /knowledge-base → create a collection, upload PDFs/DOCX or add Q&A entries manually, assign collection to the bot with priority.
3. **Add WhatsApp number:** /settings → WhatsApp Numbers section → select provider (Meta/Twilio/etc.), enter credentials.
4. **Set guardrails:** /guardrails → configure tenant-wide blocked topics and content filters.
5. **Configure LLM:** /ai-models → add custom Anthropic/OpenRouter API key if required.
6. **Set up follow-ups:** /follow-ups → enable, set idle days, write follow-up message template, set max count.
7. **Invite team:** /team → invite agents and admins by email.
8. **Run a campaign:** /campaigns/new → name it, select channel (WhatsApp/Voice/Both), paste contact list, launch.
9. **Monitor:** /analytics → view conversation trends, escalation rate, token usage.

### Agent — Day-to-Day
1. **View escalations:** /escalations → see pending escalations with full conversation context, customer info, and escalation reason.
2. **Claim escalation:** Click Claim → conversation assigned to agent; bot goes silent.
3. **Reply:** /conversations/[id] → type WhatsApp messages directly; customer receives them as normal WhatsApp messages.
4. **View context:** See full conversation history, contact memory (sentiment, past orders, preferences), and AI-captured entities.
5. **Resolve:** Mark resolved → conversation closes; CSAT prompt sent to customer; agent session logged.
6. **Pause bot:** For sensitive conversations — pause bot, handle manually, resume when done.

### Customer (End User on WhatsApp)
1. Sends a WhatsApp message to the business's WhatsApp number.
2. Bot replies instantly (within seconds) in the customer's language.
3. Bot can answer questions, look up orders, send payment links, guide through purchase decisions.
4. Customer can type "speak to human" (or configured phrase) at any time → human agent connected.
5. After issue resolved, receives a 1–5 star CSAT prompt.
6. All interactions are in WhatsApp — no app to download, no login required.

---

## KEY DIFFERENTIATORS

1. **No-code configuration** — system prompt, KB, guardrails, escalation policy all set via dashboard.
2. **4-layer guardrail cascade** — safety controls at platform, product, client, and bot levels; impossible to bypass lower layers from above.
3. **AI confidence scoring** — bot knows when it's uncertain; auto-escalates instead of hallucinating.
4. **Contact memory** — persistent JSON memory per customer (preferences, sentiment, past orders, CSAT history) injected into every AI call.
5. **Multi-level LLM routing** — clients bring their own API keys; 6-level hierarchy ensures failsafe fallback.
6. **Voice AI** — full outbound AI call pipeline, not just click-to-call; India-optimised with Exotel + Sarvam.
7. **Omnichannel campaigns** — WhatsApp + Voice in one campaign with retry logic and per-contact tracking.
8. **Embedded payments** — payment links generated and sent inside WhatsApp without leaving the conversation.
9. **India-first** — 10+ regional languages, Exotel, PhonePe, Razorpay, Sarvam AI out of the box.
10. **Enterprise RLS security** — tenant isolation enforced at the database query level, not application code.

---

## GLOSSARY

| Term | Definition |
|---|---|
| BSUID | WhatsApp Business Unique Identifier — opaque ID for users with WhatsApp username instead of visible phone number |
| Bot Context | All resolved config (system prompt, guardrails, LLM creds, voice config) loaded per-request from Redis cache or Supabase RPC |
| BSP | Business Solution Provider — third-party WhatsApp API provider (Interakt, WATI, Gupshup) |
| CSAT | Customer Satisfaction Score — 1–5 star rating from customer after conversation resolution |
| ExoML | Exotel Markup Language — XML format for Exotel voice call control |
| Guardrail | Safety rule applied to AI responses: blocked keywords, topic restrictions, content filters, length limits |
| KB | Knowledge Base — Q&A entries and documents used for RAG |
| LLM | Large Language Model — AI model generating bot responses (default: Claude by Anthropic) |
| Optimistic Lock | 30-second DB lock on conversation row preventing duplicate AI calls from webhook retries |
| Product Slug | String identifier: `support_bot`, `sales_bot`, or `lifecycle_bot` |
| RAG | Retrieval-Augmented Generation — injecting KB results into the AI prompt before generating a response |
| RLS | Row-Level Security — PostgreSQL feature enforcing per-tenant data isolation at query level |
| STT | Speech-to-Text — converts customer voice audio to text for AI processing |
| Tenant | A client organisation on the platform with its own team, bots, contacts, and billing |
| TTS | Text-to-Speech — converts AI text response to audio for voice calls |
| TwiML | Twilio Markup Language — XML format for Twilio voice call control |

---

*Platform: WhatsApp AI Agent SaaS | Version: 1.0 | July 2026 | Confidential*
