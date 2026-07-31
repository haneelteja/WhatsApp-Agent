# Alphabot — Complete User Guide

> **How to use this document**
> Every section is written for a specific persona. Find your role in the table below and jump to your section. Screenshot placeholders are marked with 📸 — replace each with an actual screenshot of that screen.

---

## Table of Contents

| Persona | Role Description | Jump To |
|---|---|---|
| **Platform Manager** | Alphabot internal staff — full platform control | [→ Section 1](#section-1-platform-manager) |
| **Platform Admin** | Alphabot internal staff — read/view access | [→ Section 2](#section-2-platform-admin) |
| **Tenant Admin / Supervisor** | Client company owner or manager | [→ Section 3](#section-3-tenant-admin--supervisor) |
| **Agent** | Client company front-line support staff | [→ Section 4](#section-4-agent) |

---

---

# Section 1: Platform Manager

> **Who is this?**
> You are an Alphabot internal team member with full control over all clients, products, guardrails, AI models, and billing. You access the **Platform Console** at `/platform`.

---

## 1.1 Logging In

1. Go to the Alphabot web URL provided by your administrator.
2. Enter your email and password on the login screen.
3. You will be directed to the **Platform Console** (URL ends in `/platform/clients`).

📸 **[SCREENSHOT: Login screen — email/password fields, Sign In button]**

> If you land on the client dashboard instead of the Platform Console, your account may not have a platform role assigned. Contact your system administrator.

---

## 1.2 Platform Console Overview

After login you arrive at the **Clients** page — the default landing page for all platform users.

The top navigation bar contains:

| Nav Item | What It Does |
|---|---|
| Clients | View and manage all onboarded client accounts |
| Products | Manage the bot product catalog |
| Guardrails | Set platform-wide content filters for all bots |
| AI Models | Configure LLM providers and API keys |
| Voice Providers | Set up telephony, STT, and TTS providers |
| Analytics | View usage metrics across all clients |
| Billing | Monitor subscriptions, trials, and revenue |
| Notifications | Configure platform-level notification settings |
| Settings | Platform-wide configuration |
| Team | Manage platform users (Admin and Manager accounts) |

📸 **[SCREENSHOT: Platform Console top navigation bar with all menu items visible]**

---

## 1.3 Managing Clients

### 1.3.1 Viewing All Clients

Navigate to **Clients** in the top nav.

You will see a table of all onboarded client accounts with:
- Client name
- Subscription plan (Trial / Starter / Pro / Enterprise)
- Status (Active / Suspended)
- Number of active bots
- Join date

📸 **[SCREENSHOT: Clients list page — table of clients with plan badges and status]**

**Filtering clients:**
- Use the search box (top-right) to filter by client name.
- Use the plan dropdown to filter by subscription tier.
- Use the status filter to show only Active or Suspended clients.

📸 **[SCREENSHOT: Clients page with search box active and results filtered]**

---

### 1.3.2 Onboarding a New Client

1. Click **+ New Client** (top-right of Clients page).
2. Fill in the form:

| Field | Description |
|---|---|
| Company Name | The client's business name |
| Admin Email | The primary admin user's email — they will receive an invite |
| Plan | Select Trial, Starter, Pro, or Enterprise |
| Products | Tick the bot products this client gets access to |

3. Click **Create Client**.
4. The client admin will receive an email invitation to set up their account.

📸 **[SCREENSHOT: New Client form with fields filled in]**

📸 **[SCREENSHOT: Success confirmation toast after client is created]**

---

### 1.3.3 Viewing a Client's Details

Click any client row to open the **Client Detail** page.

You will see:
- Company information and subscription plan
- List of active WhatsApp numbers linked to the account
- List of team members under this tenant
- Recent activity summary

📸 **[SCREENSHOT: Client detail page showing company info, WhatsApp numbers, team members]**

---

## 1.4 Managing the Product Catalog

Navigate to **Products** in the top nav.

Products are bot types (e.g., "Water Purifier Sales Bot", "Customer Support Bot"). Each product has:
- A unique slug (used internally to route messages)
- A display name
- A description

### Adding a New Product

1. Click **+ New Product**.
2. Enter the product **Slug** (lowercase, no spaces — e.g., `water-purifier`), **Name**, and **Description**.
3. Click **Save**.

📸 **[SCREENSHOT: Products list page with existing products]**

📸 **[SCREENSHOT: New Product form]**

> Products are assigned to clients during onboarding. A client can have multiple products (bots).

---

## 1.5 Platform Guardrails

Navigate to **Guardrails** in the top nav.

Platform guardrails are content rules that apply to **every bot on the platform**, regardless of what individual clients configure. They act as the outermost safety layer.

### What You Can Configure

| Setting | Description |
|---|---|
| Blocked Topics | Keywords or topic categories the bot must never discuss |
| Max Message Length | Maximum characters per bot reply |
| Language Restrictions | Allowed response languages |
| Escalation Keywords | Words that immediately trigger human handoff |
| Profanity Filter | Enable/disable automatic profanity blocking |

### Editing Guardrails

1. Edit any field directly on the page.
2. Click **Save Changes**.
3. Changes take effect within 60 seconds (Redis cache TTL).

📸 **[SCREENSHOT: Platform Guardrails page — blocked topics, escalation keywords fields]**

> **Important:** These rules cannot be overridden by any client. They are the platform-wide minimum safety standard.

---

## 1.6 AI Model Configuration

Navigate to **AI Models** in the top nav.

This is where you configure which LLM (Large Language Model) providers are available and set default API keys.

### Global vs. Tenant-Specific Models

- **Global configs** (no tenant assigned) — used by all bots unless overridden.
- **Tenant-specific configs** — used only by that client's bots.

### Adding a New LLM Configuration

1. Click **+ Add Config**.
2. Select a **Provider** (Anthropic, OpenAI, etc.).
3. Enter the **API Key**.
4. Select the **Model** (e.g., `claude-sonnet-4-6`).
5. Optionally enter a **Base URL** (for self-hosted or proxy endpoints).
6. Assign to a **Tenant** (leave blank for global default).
7. Click **Save**.

📸 **[SCREENSHOT: AI Models page — list of model configs with provider, model name, tenant columns]**

📸 **[SCREENSHOT: Add LLM Config form with fields]**

---

## 1.7 Voice Providers

Navigate to **Voice Providers** in the top nav.

This page manages the three layers of the voice call stack:

| Component | Purpose | Example Providers |
|---|---|---|
| **Telephony** | Handles actual call routing | Exotel, Twilio |
| **STT (Speech-to-Text)** | Transcribes caller's speech | Sarvam AI, Deepgram, Azure |
| **TTS (Text-to-Speech)** | Converts bot reply to audio | ExotelSay, Google TTS, Sarvam TTS |

The **Default stack cost** card at the top shows estimated cost per minute in ₹ based on which providers are set as default.

📸 **[SCREENSHOT: Voice Providers page — three sections (Telephony, STT, TTS) with provider cards]**

### Enabling a Provider

1. Click the **Edit** (pencil) icon on any provider card.
2. Enter the required credentials (API key, Account SID, etc.).
3. Toggle **Enabled** to ON.
4. Optionally toggle **Set as Default** to make this the platform default.
5. Click **Save**.

📸 **[SCREENSHOT: Edit credentials modal for Exotel telephony provider]**

### Setup Checklist (Recommended Order)

1. Enter credentials for **Telephony** (Exotel or Twilio) → Enable → Set Default
2. Enter credentials for **STT** (Sarvam or Deepgram) → Enable → Set Default
3. **TTS** — ExotelSay is free and included; just Enable and Set Default
4. Go to each bot's **Guardrails** settings → enable Voice → set greeting language

---

## 1.8 Platform Analytics

Navigate to **Analytics** in the top nav.

You can view platform-wide metrics across all clients:

| Metric | Description |
|---|---|
| Total Messages | All messages processed across all bots |
| Resolution Rate | % of conversations resolved without escalation |
| Escalation Rate | % of conversations escalated to human agents |
| Avg Response Time | Average bot reply latency |
| Active Tenants | Number of clients with activity in the period |
| Top Products | Which bot products have the highest volume |

Use the **date range picker** (top-right) to filter by time period.

📸 **[SCREENSHOT: Platform Analytics page — metric cards and charts]**

📸 **[SCREENSHOT: Date range picker open with custom range selected]**

---

## 1.9 Billing & Subscriptions

Navigate to **Billing** in the top nav.

You can monitor:
- Each client's subscription plan and renewal date
- Trial expiration dates (highlighted in amber when < 7 days remain)
- Monthly active usage per client
- AI token consumption across the platform

📸 **[SCREENSHOT: Billing page — client list with plan, renewal date, trial status columns]**

> **Action Required indicator:** Clients with expired trials or failed payments are highlighted in red. Click their row to view details and take action.

---

## 1.10 Notification Settings

Navigate to **Notifications** in the top nav.

Configure where platform-level alerts are sent:

| Alert Type | Description |
|---|---|
| New client signup | When a new client onboards |
| Trial expiring | When a client's trial has < 7 days left |
| Payment failure | When a subscription payment fails |
| High escalation rate | When a client's escalation rate exceeds threshold |

Enter email addresses or webhook URLs for each alert type, then click **Save**.

📸 **[SCREENSHOT: Notifications settings page with alert types and destination fields]**

---

## 1.11 Team Management (Platform Users)

Navigate to **Team** in the top nav.

As a Manager, you can:

### Inviting a New Platform User

1. Click **+ Invite User**.
2. Enter their **email address**.
3. Select their **role**:
   - **Manager** — full access (same as you)
   - **Admin** — read-only access
4. Click **Send Invite**.
5. The user receives an email to set up their account.

📸 **[SCREENSHOT: Team page — list of platform users with role badges]**

📸 **[SCREENSHOT: Invite User modal with email and role fields]**

### Removing a Team Member

1. Find the user in the Team list.
2. Click the **three-dot menu (⋮)** on their row.
3. Select **Remove User**.
4. Confirm the action.

📸 **[SCREENSHOT: Three-dot menu open on a team member row showing Remove User option]**

---

---

# Section 2: Platform Admin

> **Who is this?**
> You are an Alphabot internal team member with **read-only** access to the Platform Console. You can view all client data, analytics, and configurations but cannot make changes.

---

## 2.1 Logging In

Same process as Platform Manager (Section 1.1). After login you land on the **Platform Console**.

📸 **[SCREENSHOT: Platform Console landing page from Admin perspective]**

---

## 2.2 What You Can View

| Page | Your Access |
|---|---|
| Clients | View client list and details — no create/edit |
| Products | View product catalog |
| Guardrails | View platform guardrail settings |
| AI Models | View model configurations (API keys are masked) |
| Voice Providers | View provider configs (credentials masked) |
| Analytics | Full read access |
| Billing | View subscription status |
| Notifications | View notification destinations |
| Team | View team members — cannot invite or remove |

📸 **[SCREENSHOT: Admin view of Clients page — no "+ New Client" button visible]**

> **Note:** You will notice that action buttons (+ New, Edit, Save, Delete) are not visible or are disabled on your account. This is by design.

---

## 2.3 Viewing Client Details

1. Click any client in the Clients list.
2. View their subscription info, active bots, and team members.

📸 **[SCREENSHOT: Client detail page in read-only admin view]**

---

## 2.4 Viewing Analytics

Navigate to **Analytics**. All charts and metrics are available to you. Use the date range filter to explore specific periods.

📸 **[SCREENSHOT: Analytics page with charts visible]**

---

---

# Section 3: Tenant Admin / Supervisor

> **Who is this?**
> You are the owner or manager of a client company that uses Alphabot. You manage your team, configure your bot, handle escalations, create orders, and run campaigns. You access the **Client Dashboard** at `/dashboard`.

---

## 3.1 Logging In

1. Open the Alphabot invitation email you received from your Alphabot account manager.
2. Click the **Accept Invite** link.
3. Set your password.
4. You will be directed to your **Dashboard**.

📸 **[SCREENSHOT: Accept Invite email with button visible]**

📸 **[SCREENSHOT: Set Password screen]**

📸 **[SCREENSHOT: Dashboard home page after first login]**

---

## 3.2 Dashboard Overview

The Dashboard home shows key real-time metrics for your workspace:

| Card | Description |
|---|---|
| Open Conversations | Conversations currently being handled by the bot |
| Pending Escalations | Conversations waiting for a human agent |
| Resolved Today | Conversations marked resolved in the last 24 hours |
| Response Rate | % of customer messages the bot replied to |

📸 **[SCREENSHOT: Dashboard home — four metric cards at top]**

The left sidebar contains all navigation:

| Nav Item | What It Does |
|---|---|
| Dashboard | Home metrics overview |
| Conversations | All chat conversations |
| Escalations | Conversations needing human attention |
| Team | Manage your agents and supervisors |
| Knowledge Base | Q&A content that powers your bot |
| Orders | Create and manage customer orders |
| Follow-ups | Automated follow-up message sequences |
| Campaigns | Bulk WhatsApp or voice outreach |
| Voice | Voice call management |
| Analytics | Your workspace analytics |
| Billing | View your subscription and usage |
| Settings | Configure bots, WhatsApp numbers, and workspace |
| Guardrails | Configure content rules for your bots |
| AI Models | Configure LLM for your workspace |

📸 **[SCREENSHOT: Left sidebar with all navigation items]**

---

## 3.3 Conversations

### 3.3.1 Viewing All Conversations

Navigate to **Conversations** in the sidebar.

You see a list of all customer conversations with:
- Customer name / phone number
- Last message preview
- Bot that handled it
- Status (Open / Escalated / Resolved)
- Timestamp

📸 **[SCREENSHOT: Conversations list — full page with filters at top and list of conversations]**

**Filtering conversations:**
- **By Bot:** Select a product from the dropdown at the top.
- **By Status:** Toggle Open / Escalated / Resolved tabs.
- **Search:** Type a phone number or customer name in the search bar.

📸 **[SCREENSHOT: Conversations filtered by "Escalated" status — showing escalated conversations only]**

---

### 3.3.2 Viewing a Conversation Thread

Click any conversation to open it.

You see:
- Full message thread (customer messages on left, bot replies on right)
- Customer info panel (right side): name, phone, previous visits
- Conversation status badge
- Option to escalate or resolve

📸 **[SCREENSHOT: Conversation detail view — message thread visible with customer info panel on right]**

**Actions available:**
- **Escalate to Agent** — flags this conversation for human follow-up
- **Mark Resolved** — closes the conversation
- **Assign to Agent** — assign to a specific team member
- **Send Message** — type and send a message directly to the customer from here

📸 **[SCREENSHOT: Conversation detail — action buttons (Escalate, Resolve, Assign) visible]**

---

## 3.4 Escalations

Navigate to **Escalations** in the sidebar.

This page shows all conversations that have been flagged for human attention — either by the bot (low confidence) or manually.

Each escalation card shows:
- Customer name and phone number
- The last bot message and customer reply
- Time since escalation was triggered
- Current assignment status

📸 **[SCREENSHOT: Escalations page — list of escalation cards with customer info and timestamps]**

### Claiming an Escalation

1. Click **Claim** on an escalation card.
2. The conversation is assigned to you.
3. Click the conversation to open the thread and respond.
4. When resolved, click **Mark Resolved**.

📸 **[SCREENSHOT: Escalation card with "Claim" button visible]**

📸 **[SCREENSHOT: Escalation conversation thread open — agent typing a reply]**

---

## 3.5 Team Management

Navigate to **Team** in the sidebar.

### 3.5.1 Inviting a New Team Member

1. Click **+ Invite Member**.
2. Enter their **email address**.
3. Select their **role**:

| Role | Permissions |
|---|---|
| **Admin** | Full access — can configure settings, manage team, create orders |
| **Supervisor** | Can view and manage conversations, escalations, analytics |
| **Agent** | Can view conversations and handle escalations only |

4. Click **Send Invite**.
5. The team member receives an email invitation.

📸 **[SCREENSHOT: Team page — list of members with role badges (Admin, Supervisor, Agent)]**

📸 **[SCREENSHOT: Invite Member modal — email field and role dropdown]**

### 3.5.2 Removing a Team Member

1. Find the member in the Team list.
2. Click the **⋮ menu** on their row.
3. Select **Remove**.
4. Confirm removal.

📸 **[SCREENSHOT: Three-dot menu on team member with Remove option]**

---

## 3.6 Knowledge Base

The Knowledge Base (KB) is the set of Q&A pairs your bot uses to answer customer questions accurately.

Navigate to **Knowledge Base** in the sidebar.

### 3.6.1 Viewing Collections

KB entries are grouped into **Collections** (e.g., "Product FAQs", "Pricing", "Warranty"). You see a list of collections with entry count.

📸 **[SCREENSHOT: Knowledge Base — collections list with entry counts]**

### 3.6.2 Adding a New KB Entry

1. Click a collection to open it.
2. Click **+ Add Entry**.
3. Fill in:
   - **Question** — the customer query (e.g., "What is the price of the 10-litre purifier?")
   - **Answer** — the accurate answer the bot should give
4. Click **Save**.

📸 **[SCREENSHOT: KB collection detail — list of Q&A entries]**

📸 **[SCREENSHOT: Add Entry form with Question and Answer fields]**

### 3.6.3 Editing or Deleting an Entry

- Click the **pencil icon** to edit any entry.
- Click the **trash icon** to delete an entry.
- Changes are live within 60 seconds.

📸 **[SCREENSHOT: KB entry row with edit and delete icons]**

### 3.6.4 Creating a New Collection

1. On the KB main page, click **+ New Collection**.
2. Enter a **Name** and optional **Description**.
3. Click **Create**.

📸 **[SCREENSHOT: New Collection form]**

---

## 3.7 Orders

Navigate to **Orders** in the sidebar.

### 3.7.1 Creating a New Order

1. Click **+ New Order**.
2. Fill in the order form:

| Field | Description |
|---|---|
| Customer Name | The buyer's name |
| Phone Number | WhatsApp number (with country code, e.g., 919876543210) |
| Product | Select from your product catalog |
| Quantity | Number of units |
| Amount | Total order value in ₹ |
| Payment Method | Razorpay / PhonePe / Manual |
| Notes | Internal notes (not sent to customer) |

3. Click **Create Order**.
4. If a payment method is selected, a payment link is automatically generated and sent to the customer via WhatsApp.

📸 **[SCREENSHOT: Orders list — showing order rows with status badges (Pending, Paid, Delivered)]**

📸 **[SCREENSHOT: New Order form — all fields visible]**

📸 **[SCREENSHOT: Payment link confirmation toast after order creation]**

### 3.7.2 Viewing Order Status

- **Pending** — Order created, awaiting payment
- **Paid** — Payment received
- **Processing** — Order in fulfillment
- **Delivered** — Order fulfilled
- **Cancelled** — Order cancelled

Click any order row to view its full detail, payment history, and linked conversation.

📸 **[SCREENSHOT: Order detail page — payment status, customer info, and linked conversation]**

---

## 3.8 Follow-ups

Navigate to **Follow-ups** in the sidebar.

Follow-ups are automated WhatsApp messages sent to customers at scheduled intervals after a conversation or order event.

### Creating a Follow-up Sequence

1. Click **+ New Follow-up**.
2. Configure:
   - **Trigger** — What event starts the sequence (e.g., Order Created, Conversation Ended)
   - **Delay** — How long to wait (e.g., 2 hours, 1 day)
   - **Message** — The WhatsApp message to send
3. Click **Save**.

📸 **[SCREENSHOT: Follow-ups list — showing active sequences with trigger and delay]**

📸 **[SCREENSHOT: New Follow-up form — trigger, delay, and message fields]**

---

## 3.9 Campaigns

Navigate to **Campaigns** in the sidebar.

Campaigns let you send **bulk outreach** to a list of customers via WhatsApp messages, voice calls, or both.

### 3.9.1 Creating a WhatsApp Campaign

1. Click **+ New Campaign**.
2. Fill in:

| Field | Description |
|---|---|
| Campaign Name | Internal name for tracking |
| Channel | WhatsApp / Voice / Both |
| Message Template | The WhatsApp message body |
| Schedule | Send now or schedule for a future date/time |
| Contacts | Upload a CSV or paste phone numbers |

3. Click **Launch Campaign**.

📸 **[SCREENSHOT: Campaigns list — showing campaigns with channel badges and status]**

📸 **[SCREENSHOT: New Campaign form — channel selector showing WhatsApp/Voice/Both options]**

📸 **[SCREENSHOT: Contacts upload section — CSV upload button and preview of contacts]**

### 3.9.2 Campaign Stats

After a campaign runs, you can see real-time stats:

| Stat | Description |
|---|---|
| Sent | Messages successfully delivered |
| Replied | Customers who replied |
| Failed | Messages that could not be delivered |
| Calls Made | (Voice campaigns) Calls dialled |
| Calls Answered | Calls where customer picked up |
| Voicemails Left | Calls that went to voicemail |

📸 **[SCREENSHOT: Campaign detail page — stats cards and contact list with per-contact status]**

---

## 3.10 Bot Configuration (Settings)

Navigate to **Settings** in the sidebar.

### 3.10.1 Workspace Settings

Set your workspace name and timezone.

📸 **[SCREENSHOT: Settings — Workspace tab with name and timezone fields]**

### 3.10.2 Bot Configuration

Click the **Bot Config** tab. For each bot product:

| Setting | Description |
|---|---|
| System Prompt | The instructions that define your bot's personality and scope |
| AI Model | Which LLM model to use (if multiple are configured) |
| Confidence Threshold | Score below which the bot escalates (0.0–1.0, default 0.7) |
| Escalation Triggers | Keywords that immediately escalate to a human |
| Escalation Policy | Who to notify and how when an escalation is triggered |

📸 **[SCREENSHOT: Bot Config form — system prompt textarea, confidence threshold slider, escalation triggers]**

**Editing the System Prompt:**
1. Clear the existing text or modify it.
2. Click **Save Config**.
3. Changes are live within 60 seconds.

> **Tip:** The system prompt is the most powerful tool for shaping bot behaviour. Be specific about what topics the bot should and should not discuss.

### 3.10.3 WhatsApp Number Setup

Click the **WhatsApp Setup** tab.

Here you link your WhatsApp Business number (Twilio or Meta Cloud) to your bot.

**For Twilio:**
1. Enter your Twilio **Account SID** and **Auth Token**.
2. Enter your **Twilio WhatsApp Number** (e.g., `+14155238886`).
3. Click **Save**.
4. Copy the **Webhook URL** shown and paste it into your Twilio Console under Messaging → Sandbox Settings (or your WhatsApp Sender's Webhook URL).

📸 **[SCREENSHOT: WhatsApp Setup tab — Twilio credentials form and webhook URL]**

**For Meta Cloud API:**
1. Enter your **Phone Number ID** and **Access Token** from Meta Business Manager.
2. Enter the **Verify Token** you set in Meta.
3. Click **Save**.
4. Copy the **Webhook URL** and register it in Meta's App Dashboard.

📸 **[SCREENSHOT: WhatsApp Setup — Meta Cloud API form]**

---

## 3.11 Guardrails (Bot-level)

Navigate to **Guardrails** in the sidebar.

These rules apply only to your bots and work in addition to the platform-level guardrails.

| Setting | Description |
|---|---|
| Blocked Topics | Topics your bot should refuse to discuss |
| Allowed Languages | Languages the bot should reply in |
| Max Reply Length | Maximum characters per reply |
| Voice Enabled | Whether this bot can receive/make calls |
| Voice Greeting | Opening message for voice calls |
| Voice Language | Language for text-to-speech |

📸 **[SCREENSHOT: Guardrails page — blocked topics list, language settings, voice toggle]**

After making changes, click **Save Guardrails**. Changes are live within 60 seconds.

---

## 3.12 Analytics

Navigate to **Analytics** in the sidebar.

Your analytics are scoped to your workspace only. You can view:

| Metric | Description |
|---|---|
| Message Volume | Total messages over time (chart) |
| Resolution Rate | % of conversations resolved by bot |
| Escalation Rate | % escalated to humans |
| Avg Response Time | How fast the bot replies |
| Top Questions | Most common customer queries |
| Confidence Distribution | Distribution of bot confidence scores |

Use the **date range picker** to filter the period.

📸 **[SCREENSHOT: Analytics page — line chart for message volume, metric cards below]**

📸 **[SCREENSHOT: Top Questions table — question text and frequency count]**

---

## 3.13 Billing

Navigate to **Billing** in the sidebar.

You can view:
- Your current subscription **plan** and **renewal date**
- Monthly **message volume** used vs. your plan limit
- **AI token usage** (tracks LLM API costs)
- Payment history

📸 **[SCREENSHOT: Billing page — plan card, usage bar, token usage card]**

> To upgrade your plan, click **Upgrade Plan** and follow the on-screen instructions, or contact your Alphabot account manager.

---

---

# Section 4: Agent

> **Who is this?**
> You are a front-line support agent for a client company. Your primary job is to handle escalated conversations — cases where the bot could not resolve the customer's query and needs a human to step in.

---

## 4.1 Logging In

1. Open the invitation email from your manager/admin.
2. Click **Accept Invite**.
3. Set your password.
4. You will be directed to the **Dashboard**.

📸 **[SCREENSHOT: Agent dashboard — simplified view with fewer sidebar items than Admin]**

---

## 4.2 What You Can Access

As an Agent, your sidebar shows a limited set of pages:

| Page | Your Access |
|---|---|
| Dashboard | View metrics (read-only) |
| Conversations | View all conversations |
| Escalations | View and claim escalations — **your primary workspace** |
| Analytics | View metrics (read-only) |

📸 **[SCREENSHOT: Agent sidebar — only Dashboard, Conversations, Escalations, Analytics visible]**

---

## 4.3 Handling Escalations (Primary Workflow)

### Step 1 — Navigate to Escalations

Click **Escalations** in the sidebar.

You see all conversations that need human attention, sorted by oldest first (most urgent at top).

📸 **[SCREENSHOT: Escalations queue — cards sorted by time waiting, oldest at top with amber/red timestamps]**

### Step 2 — Claim a Conversation

1. Review the escalation card:
   - Customer name and number
   - Why the bot escalated (e.g., "Low confidence", "Keyword trigger: 'refund'")
   - Last few messages from the conversation
2. Click **Claim** to assign it to yourself.

📸 **[SCREENSHOT: Escalation card showing customer info, escalation reason, last messages, and Claim button]**

> Once you claim a conversation, it is removed from other agents' queues. Only you can see it in your "My Escalations" view.

### Step 3 — Open the Conversation

1. After claiming, click **Open Conversation** to see the full thread.
2. Read through the history to understand what the customer needs.

📸 **[SCREENSHOT: Conversation thread — full message history, customer on left, bot on right, new agent reply area at bottom]**

### Step 4 — Reply to the Customer

1. Type your response in the **message box** at the bottom.
2. Click **Send** (or press Enter).
3. Your message is sent via WhatsApp to the customer immediately.

📸 **[SCREENSHOT: Message box at bottom of conversation — agent typing a reply]**

📸 **[SCREENSHOT: Agent reply appearing in the thread as a new message]**

### Step 5 — Resolve the Conversation

1. Once the customer's issue is resolved, click **Mark Resolved** (top-right of conversation).
2. The conversation moves to the Resolved tab.
3. The bot resumes normal handling for future messages from this customer.

📸 **[SCREENSHOT: Mark Resolved button at top right of conversation view]**

📸 **[SCREENSHOT: Success state — conversation moved to Resolved, green badge]**

---

## 4.4 Viewing Conversations

Navigate to **Conversations** in the sidebar.

You can browse all conversations (not just escalations) to understand context or assist a customer proactively.

📸 **[SCREENSHOT: Conversations list from agent view — filtering by status]**

**Filter by status:**
- **Open** — Bot is actively handling these
- **Escalated** — Waiting for human
- **Resolved** — Completed conversations

---

## 4.5 Viewing Analytics

Navigate to **Analytics**.

You can see workspace-level metrics (same as Admin view) but cannot change any settings.

📸 **[SCREENSHOT: Analytics page from agent perspective — read-only view]**

---

---

# Section 5: Testing with Twilio Sandbox

> **Who is this for?** Any persona who wants to test the bot before going live with a production WhatsApp number.

---

## 5.1 What is the Twilio Sandbox?

The Twilio Sandbox is a shared test WhatsApp number provided by Twilio. It lets you test your bot without needing a verified WhatsApp Business number. Any device can send messages to the sandbox after a one-time opt-in step.

**Sandbox number:** +1 415 523 8886

---

## 5.2 Adding a New Test Device

Repeat this for every phone number that wants to test the bot.

### Step 1

Open WhatsApp on the test device.

### Step 2

Start a new chat with **+1 415 523 8886**.

📸 **[SCREENSHOT: WhatsApp new chat — searching for +14155238886]**

### Step 3

Send this exact message:
```
join nearly-home
```

📸 **[SCREENSHOT: WhatsApp chat with sandbox number — "join nearly-home" sent]**

### Step 4

Twilio will reply with a confirmation message:
> *"You are now connected to the sandbox and can send and receive messages."*

📸 **[SCREENSHOT: Twilio confirmation reply in WhatsApp]**

### Step 5

Send any message to start testing the bot:
```
Hello
```

The bot should reply within a few seconds.

📸 **[SCREENSHOT: Test conversation — bot reply visible after "Hello" message]**

---

## 5.3 Checking the Webhook URL

If the bot is not replying, verify the webhook is configured correctly.

1. Log in to the [Twilio Console](https://console.twilio.com).
2. Go to **Messaging → Try it out → Send a WhatsApp message**.
3. Click **Sandbox settings**.
4. Confirm the **"WHEN A MESSAGE COMES IN"** field contains your Render API URL:
   ```
   https://your-app.onrender.com/api/webhook/twilio
   ```
5. Click **Save**.

📸 **[SCREENSHOT: Twilio Sandbox settings page — webhook URL field highlighted]**

---

## 5.4 Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| Bot not replying at all | Webhook URL wrong or Render app is down | Check Twilio sandbox settings and Render dashboard |
| Bot replies but says "I could not find your account" | `whatsapp_numbers` row missing or inactive | Check Supabase → `whatsapp_numbers` table, ensure `active = true` |
| Bot replies but confidence score visible in message | Deploy the latest code — `extractConfidence` bug already fixed | Trigger a new deploy on Render |
| "Sorry, I can only respond in 24 hours" | Test number not joined sandbox | Re-send "join nearly-home" to the sandbox |
| Sandbox working but production number not | Production number needs to be a registered WhatsApp Business sender | Follow Twilio or Meta's sender registration process |

---

---

## Appendix: Role Permissions Summary

| Feature | Platform Manager | Platform Admin | Tenant Admin | Supervisor | Agent |
|---|---|---|---|---|---|
| Platform Console | ✅ Full | ✅ Read-only | ❌ | ❌ | ❌ |
| Manage Clients | ✅ | 👁 View | ❌ | ❌ | ❌ |
| Invite Platform Users | ✅ | ❌ | ❌ | ❌ | ❌ |
| View All Tenants Analytics | ✅ | ✅ | ❌ | ❌ | ❌ |
| Configure Guardrails (Platform) | ✅ | ❌ | ❌ | ❌ | ❌ |
| Configure AI Models (Platform) | ✅ | ❌ | ❌ | ❌ | ❌ |
| Configure Voice Providers | ✅ | ❌ | ❌ | ❌ | ❌ |
| Dashboard (own workspace) | ❌ | ❌ | ✅ | ✅ | ✅ |
| View Conversations | ❌ | ❌ | ✅ | ✅ | ✅ |
| Handle Escalations | ❌ | ❌ | ✅ | ✅ | ✅ |
| Send Messages to Customers | ❌ | ❌ | ✅ | ✅ | ✅ |
| Invite Team Members | ❌ | ❌ | ✅ | ❌ | ❌ |
| Remove Team Members | ❌ | ❌ | ✅ | ❌ | ❌ |
| Manage Knowledge Base | ❌ | ❌ | ✅ | 👁 View | 👁 View |
| Create Orders | ❌ | ❌ | ✅ | ❌ | ❌ |
| Create Campaigns | ❌ | ❌ | ✅ | ❌ | ❌ |
| Configure Bot Settings | ❌ | ❌ | ✅ | ❌ | ❌ |
| Configure Guardrails (Bot) | ❌ | ❌ | ✅ | ❌ | ❌ |
| View Own Analytics | ❌ | ❌ | ✅ | ✅ | ✅ |
| View Billing | ❌ | ❌ | ✅ | ❌ | ❌ |

---

*Document version: 1.0 — Last updated: July 2026*
*For support, contact your Alphabot account manager.*
