# Alphabot — WhatsApp AI Agent Platform

A multi-tenant WhatsApp AI platform that lets businesses deploy intelligent bots (support, sales, and lifecycle) on top of Meta WhatsApp Cloud API. Built as an npm workspaces monorepo with a Fastify API backend and a Next.js 14 dashboard.

---

## Architecture

```
alphabot/
├── apps/
│   ├── api/          Fastify backend — webhook handler, AI pipeline, scheduler (Render)
│   └── web/          Next.js 14 dashboard — App Router, Server Actions (Vercel)
├── packages/
│   ├── shared/       TypeScript types and utilities shared across apps
│   └── database/     Supabase client + 44 base SQL migrations
└── supabase/
    └── migrations/   23 incremental migrations applied on top of packages/database
```

**Runtime stack**

| Layer | Technology |
|-------|-----------|
| Database + Auth + Storage | Supabase (PostgreSQL + RLS + pgvector) |
| API server | Fastify 4, Node 22, TypeScript |
| Web dashboard | Next.js 14 App Router, Tailwind CSS |
| AI / LLM | Anthropic Claude (haiku-4-5 default), OpenRouter multi-model routing, Gemini |
| WhatsApp | Meta WhatsApp Cloud API (primary), Twilio WhatsApp (fallback) |
| Voice calls | Twilio / Exotel (telephony) · Deepgram / Sarvam (STT) · Google / Twilio Say (TTS) |
| KB embeddings | Voyage AI (voyage-3, 1024-dim vectors) |
| Caching + locks | Redis (ioredis), gracefully degrades if unavailable |
| Payments | Razorpay + PhonePe |
| Email | Resend |
| Error tracking | Sentry |
| API hosting | Render (Singapore region) |
| Web hosting | Vercel |

---

## Bot Types

**Support Bot** — Answers customer queries from a knowledge base, escalates on low confidence, tracks sentiment and conversation outcomes.

**Sales Bot** — Lead qualification with a configurable stage state machine, heuristic lead scoring, CRM-style kanban pipeline, product catalogue, warm handoff with AI-generated summary, voice call escalation.

**Lifecycle Bot** — Post-purchase flows: order status notifications, invoice PDF generation and WhatsApp delivery, payment reminders (3 escalating, daily cron), loyalty/reorder sequences after delivery, and return/replacement request handling.

---

## Key Features

- **Multi-tenant** — each tenant has isolated bot configs, guardrails, knowledge bases, contacts, and conversations with row-level security
- **Multi-bot per tenant** — support, sales, and lifecycle bots can all run simultaneously under one account
- **AI tool registry** — platform capabilities (lead scoring, product catalogue, return flow, etc.) are individually togglable per bot
- **Knowledge base RAG** — documents chunked, embedded with Voyage AI, retrieved via pgvector similarity search with Redis caching
- **Interactive WhatsApp buttons** — quick reply, list, and CTA URL templates sent by the AI using a `[BUTTONS:name]` marker
- **Conversation state machine** — AI tracks stage and entities via `[STAGE:x]` and `[ENTITY:key=value]` markers in responses
- **Voice pipeline** — both batch (Twilio Record/Respond) and low-latency WebSocket streaming (Smallest.ai Pulse + Lightning, 2-3 s round trip)
- **Campaigns** — WhatsApp and voice broadcast to contact groups with per-sender daily capacity limits and Thompson sampling
- **Copilot** — floating AI assistant in the dashboard using Anthropic tool-use streaming to query conversations, escalations, and settings
- **Platform console** — internal admin panel for managing all tenants, products, voice providers, LLM configs, and platform-wide guardrails
- **Scheduler** — 13 Redis-locked cron jobs covering reminders, lifecycle sequences, campaigns, daily reports, and AI insights

---

## Getting Started

### Prerequisites

- Node 22+
- npm 10+
- A Supabase project (database, auth, storage)
- A Redis instance (optional — platform degrades gracefully without it)
- Meta WhatsApp Cloud API credentials (WABA, phone number, permanent token)

### Install

```bash
npm install
```

### Environment variables

Copy `.env.example` and fill in the values for each app.

**`apps/api/.env`**

```env
NODE_ENV=development
API_PORT=4000
WEB_BASE_URL=http://localhost:3000
API_BASE_URL=http://localhost:4000

# Supabase
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=

# AI
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-haiku-4-5-20251001   # optional override

# WhatsApp — Meta Cloud API
META_WHATSAPP_TOKEN=
META_VERIFY_TOKEN=
META_PHONE_NUMBER_ID=
META_APP_SECRET=

# Redis (optional)
REDIS_URL=

# Voice (optional)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_NUMBER=

# Payments (optional)
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=

# Email
RESEND_API_KEY=

# Error tracking (optional)
SENTRY_DSN=
```

**`apps/web/.env.local`**

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# API backend
NEXT_PUBLIC_API_URL=http://localhost:4000

# WhatsApp (for server actions that call Meta directly)
META_WHATSAPP_TOKEN=
META_PHONE_NUMBER_ID=

# Email
RESEND_API_KEY=

SENTRY_DSN=
```

### Database migrations

Run the base migrations in your Supabase SQL editor from `packages/database/migrations/` (001 through 044 in order), then the incremental migrations from `supabase/migrations/` in filename order.

### Development

```bash
npm run dev          # starts both api (port 4000) and web (port 3000) via Turborepo
```

Or individually:

```bash
npm run dev --workspace=apps/api
npm run dev --workspace=apps/web
```

### Build

```bash
npm run build
```

### Type check

```bash
npm run type-check
```

### Tests

```bash
npm test
```

---

## Webhook Setup

The inbound WhatsApp webhook URL format is:

```
POST https://<your-api-domain>/api/webhook/:tenantId/:productType
GET  https://<your-api-domain>/api/webhook/:tenantId/:productType   (Meta verification)
```

Where `productType` is one of `support_bot`, `sales_bot`, or `lifecycle_bot`. Register this URL in your Meta App dashboard under WhatsApp → Configuration.

---

## Deployment

### API — Render

The `render.yaml` at the repo root defines the `alphabot-api` service. All environment variables are set as secret values in the Render dashboard (none are committed).

```
Build:  npm ci && npm run build --workspace=packages/shared --workspace=packages/database --workspace=apps/api
Start:  node apps/api/dist/server.js
Region: Singapore
```

### Web — Vercel

The `apps/web` directory is linked to a Vercel project. Deploy by pushing to `master` — Vercel picks up the Next.js app automatically. Set all `apps/web/.env.local` variables as Vercel environment variables in the dashboard.

---

## Scheduler Jobs

All jobs run in the API process via `node-cron` with Redis distributed locks (`withJobLock`) to prevent duplicate execution across restarts.

| Job | Schedule | Purpose |
|-----|----------|---------|
| Daily email reports | 08:00 UTC | Per-tenant WhatsApp/email summary |
| Follow-up messages | Hourly | Sends configured follow-ups to idle conversations |
| Campaign dispatch | Every 15 min | Fans out WhatsApp + voice campaign messages |
| No-reply call triggers | Every 30 min | Triggers outbound voice calls on silence |
| Lead follow-ups | Every 2 h | Follows up unresponsive leads |
| Scheduled broadcasts | Every minute | Sends due broadcast messages |
| Scheduled messages | Every minute | Sends due one-off scheduled messages |
| Campaign recovery | Every 10 min | Retries stuck campaign contacts |
| Payment reminders | Daily 11:30 UTC | 3 escalating reminders for unpaid orders |
| Lifecycle sequences | Daily 10:00 UTC | Fires contact_created, order_delivered, etc. sequences |
| AI insights | Hourly | Generates daily AI insight summaries per tenant |
| Sender capacity reset | Midnight UTC | Resets per-number daily send counters |

---

## Project Structure — Key Files

```
apps/api/src/
  server.ts                     Fastify entry point, plugin registration, WebSocket
  routes/webhook/index.ts       Core WhatsApp message handler
  jobs/scheduler.ts             All 13 cron jobs
  services/ai/claude.ts         getAIResponse() — LLM call with full context
  lib/llm-router.ts             routedChatCompletion() — Anthropic / OpenRouter / Gemini
  lib/tool-registry.ts          Platform capability registry and toolEnabled() guard
  lib/redis.ts                  ioredis client, cacheGet/Set/Del, withJobLock()
  services/kb/lookup.ts         Full RAG pipeline — vector search + keyword fallback
  services/voice/pipeline.ts    Batch voice pipeline (Twilio Record → STT → LLM → TTS)
  services/voice/stream-pipeline.ts  WebSocket streaming voice pipeline

apps/web/src/
  middleware.ts                 Supabase SSR session refresh, route protection
  app/(dashboard)/layout.tsx    Dashboard shell with tenant context
  app/api/copilot/chat/route.ts Anthropic tool-use copilot streaming endpoint
  app/actions/                  50+ 'use server' action files
  components/dashboard-nav.tsx  Role-gated sidebar navigation

packages/shared/src/types/index.ts   All shared TypeScript interfaces
packages/database/src/client.ts      getServerClient() / getTenantClient()
```

---

## License

Private — all rights reserved.
