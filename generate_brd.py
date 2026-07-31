"""
BRD Generator -- WhatsApp AI Agent Platform
Generates a professional A4 PDF using fpdf2 + Arial Unicode TTF.
Run:  python generate_brd.py
"""
from fpdf import FPDF
from fpdf.enums import XPos, YPos
import os

OUTPUT     = os.path.join(os.path.dirname(os.path.abspath(__file__)), "WhatsApp_AI_Agent_BRD.pdf")
FONTS_DIR  = r"C:\Windows\Fonts"

# ── Palette ──────────────────────────────────────────────────────────────────
C_DARK   = (15,  23,  42)
C_BLUE   = (37,  99, 235)
C_LBLUE  = (219, 234, 254)
C_GRAY50 = (248, 250, 252)
C_GRAY   = (71,  85, 105)
C_LGRAY  = (203, 213, 225)
C_WHITE  = (255, 255, 255)


class PDF(FPDF):

    def __init__(self):
        super().__init__(format="A4")
        self.set_auto_page_break(auto=True, margin=16)
        self.set_margins(14, 14, 14)
        # Register Arial as a Unicode-capable font family
        self.add_font("Arial", style="",   fname=os.path.join(FONTS_DIR, "arial.ttf"))
        self.add_font("Arial", style="B",  fname=os.path.join(FONTS_DIR, "arialbd.ttf"))
        self.add_font("Arial", style="I",  fname=os.path.join(FONTS_DIR, "ariali.ttf"))
        self.add_font("Arial", style="BI", fname=os.path.join(FONTS_DIR, "arialbi.ttf"))

    # ── Header / Footer ──────────────────────────────────────────────────────
    def header(self):
        if self.page_no() <= 1:
            return
        self.set_fill_color(*C_DARK)
        self.rect(0, 0, 210, 10, "F")
        self.set_font("Arial", "B", 6.5)
        self.set_text_color(*C_WHITE)
        self.set_xy(14, 2)
        self.cell(0, 6, "WhatsApp AI Agent  |  Business Requirements Document", align="L")
        self.set_xy(14, 2)
        self.cell(0, 6, f"Page  {self.page_no()}", align="R")
        self.set_text_color(*C_DARK)

    def footer(self):
        if self.page_no() <= 1:
            return
        self.set_y(-11)
        self.set_draw_color(*C_LGRAY)
        self.set_line_width(0.3)
        self.line(14, self.get_y(), 196, self.get_y())
        self.set_font("Arial", "I", 6.5)
        self.set_text_color(*C_GRAY)
        self.set_xy(14, self.get_y() + 1)
        self.cell(0, 5, "Confidential — Internal / Stakeholder Use Only", align="C")
        self.set_text_color(*C_DARK)

    # ── Primitives ───────────────────────────────────────────────────────────
    def rule(self, color=None, weight=0.3):
        color = color or C_LGRAY
        self.set_draw_color(*color)
        self.set_line_width(weight)
        self.line(14, self.get_y(), 196, self.get_y())

    def gap(self, n=3):
        self.ln(n)

    # ── Section headings ─────────────────────────────────────────────────────
    def h1(self, text):
        self.gap(5)
        yy = self.get_y()
        self.set_fill_color(*C_BLUE)
        self.rect(14, yy, 3.5, 9, "F")
        self.set_font("Arial", "B", 14)
        self.set_text_color(*C_DARK)
        self.set_xy(20, yy)
        self.cell(0, 9, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.gap(1)

    def h2(self, text):
        self.gap(4)
        self.set_font("Arial", "B", 11)
        self.set_text_color(*C_BLUE)
        self.cell(0, 7, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.rule(C_BLUE, 0.4)
        self.gap(1)
        self.set_text_color(*C_DARK)

    def h3(self, text):
        self.gap(3)
        self.set_font("Arial", "B", 9.5)
        self.set_text_color(*C_DARK)
        self.cell(0, 6, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    # ── Body / Bullet ────────────────────────────────────────────────────────
    def body(self, text, indent=0):
        self.set_font("Arial", "", 9)
        self.set_text_color(*C_DARK)
        self.set_x(14 + indent)
        self.multi_cell(182 - indent, 5, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    def bullet(self, text, depth=0):
        syms = ["•", "–", "·"]
        sym  = syms[min(depth, 2)]
        ind  = 4 + depth * 6
        self.set_font("Arial", "", 9)
        self.set_text_color(*C_DARK)
        self.set_x(14 + ind)
        self.cell(4, 5, sym)
        self.set_x(14 + ind + 4)
        self.multi_cell(178 - ind, 5, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    # ── Callout box ──────────────────────────────────────────────────────────
    def callout(self, text):
        self.gap(2)
        x0, y0 = 14, self.get_y()
        self.set_font("Arial", "I", 8.5)
        # estimate height
        avg_chars = 170
        lines = max(2, len(text) // avg_chars + text.count("\n") + 1)
        h_box = lines * 5 + 6
        self.set_fill_color(*C_LBLUE)
        self.set_draw_color(*C_LGRAY)
        self.set_line_width(0.3)
        self.rect(x0, y0, 182, h_box, "FD")
        self.set_fill_color(*C_BLUE)
        self.rect(x0, y0, 3, h_box, "F")
        self.set_xy(x0 + 6, y0 + 3)
        self.set_text_color(*C_GRAY)
        self.multi_cell(173, 5, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_y(y0 + h_box + 1)
        self.set_text_color(*C_DARK)

    # ── Tables ───────────────────────────────────────────────────────────────
    def thead(self, cols, ws):
        self.set_fill_color(*C_DARK)
        self.set_text_color(*C_WHITE)
        self.set_font("Arial", "B", 8)
        for col, w in zip(cols, ws):
            self.cell(w, 6.5, col, fill=True)
        self.ln()
        self.set_text_color(*C_DARK)

    def trow(self, cells, ws, shade=False):
        self.set_fill_color(*C_GRAY50) if shade else self.set_fill_color(*C_WHITE)
        self.set_font("Arial", "", 8)
        self.set_text_color(*C_DARK)
        x0, y0 = self.get_x(), self.get_y()
        row_h = 5.0
        for cell, w in zip(cells, ws):
            chars = max(1, int(w / 2.1))
            lines = max(1, (len(str(cell)) + chars - 1) // chars)
            row_h = max(row_h, lines * 4.5 + 1)
        for i, (cell, w) in enumerate(zip(cells, ws)):
            self.set_xy(x0 + sum(ws[:i]), y0)
            self.multi_cell(w, 4.5, str(cell), fill=True,
                            new_x=XPos.RIGHT, new_y=YPos.TOP)
        self.set_xy(x0, y0 + row_h)
        self.set_draw_color(*C_LGRAY)
        self.set_line_width(0.2)
        self.line(14, self.get_y(), 196, self.get_y())


# ════════════════════════════════════════════════════════════════════════════
#  COVER PAGE
# ════════════════════════════════════════════════════════════════════════════
def cover(pdf: PDF):
    pdf.add_page()

    # Dark header band
    pdf.set_fill_color(*C_DARK)
    pdf.rect(0, 0, 210, 82, "F")

    pdf.set_text_color(*C_WHITE)
    pdf.set_font("Arial", "B", 30)
    pdf.set_xy(14, 18)
    pdf.cell(0, 15, "WhatsApp AI Agent", align="C", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    pdf.set_font("Arial", "", 13)
    pdf.set_text_color(147, 197, 253)
    pdf.set_xy(14, 46)
    pdf.cell(0, 8, "Multi-Tenant SaaS Platform", align="C")

    # Blue banner
    pdf.set_fill_color(*C_BLUE)
    pdf.rect(0, 82, 210, 20, "F")
    pdf.set_font("Arial", "B", 15)
    pdf.set_text_color(*C_WHITE)
    pdf.set_xy(14, 87)
    pdf.cell(0, 10, "Business Requirements Document", align="C")

    # Meta card
    pdf.set_fill_color(241, 245, 249)
    pdf.set_draw_color(*C_LGRAY)
    pdf.set_line_width(0.4)
    pdf.rect(40, 118, 130, 72, "FD")

    meta = [
        ("Document Version", "1.0"),
        ("Status",           "Final Draft"),
        ("Date",             "July 2026"),
        ("Audience",         "Internal / Stakeholders"),
        ("Classification",   "Confidential"),
    ]
    for i, (k, v) in enumerate(meta):
        y = 124 + i * 11
        pdf.set_xy(48, y)
        pdf.set_font("Arial", "B", 8.5)
        pdf.set_text_color(*C_GRAY)
        pdf.cell(46, 6, k)
        pdf.set_font("Arial", "", 8.5)
        pdf.set_text_color(*C_DARK)
        pdf.cell(58, 6, v)

    # Abstract
    pdf.set_xy(14, 203)
    pdf.set_font("Arial", "I", 9)
    pdf.set_text_color(*C_GRAY)
    pdf.multi_cell(182, 5,
        "This document defines the complete business requirements for the WhatsApp AI Agent "
        "platform — a multi-tenant SaaS product enabling businesses to deploy AI-powered "
        "WhatsApp bots and voice agents for customer support, sales engagement, and lifecycle "
        "management, with embedded payment collection and campaign tooling.",
        new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_text_color(*C_DARK)


# ════════════════════════════════════════════════════════════════════════════
#  BODY CONTENT
# ════════════════════════════════════════════════════════════════════════════
def content(pdf: PDF):

    # ── 1. Executive Summary ──────────────────────────────────────────────────
    pdf.add_page()
    pdf.h1("1.  Executive Summary")
    pdf.body(
        "WhatsApp AI Agent is a B2B SaaS platform that enables businesses to deploy AI-powered "
        "conversational bots on WhatsApp and Voice channels without writing any code. The platform "
        "provides three specialised bot personas — Customer Support, Sales Engagement, and "
        "Lifecycle Management — each configurable through a no-code dashboard with layered "
        "guardrails, custom knowledge bases, escalation policies, voice call pipelines, campaign "
        "tools, and embedded payment collection."
    )
    pdf.gap(2)
    pdf.body(
        "Built for the Indian SMB and mid-market, the platform integrates natively with local "
        "payment gateways (PhonePe, Razorpay), local telephony (Exotel), and India's regional "
        "language AI providers (Sarvam AI). It supports 10+ regional languages and deploys "
        "on top of the Meta WhatsApp Business API."
    )
    pdf.h3("Core Value Propositions")
    for vp in [
        "Zero-code bot deployment — businesses configure, not code.",
        "Multi-bot, multi-tenant — one platform serves unlimited client organisations.",
        "4-layer guardrail cascade — platform → product → client → bot safety controls.",
        "Confidence-driven escalation — AI self-reports uncertainty and hands off to humans automatically.",
        "Omnichannel — WhatsApp messaging + outbound/inbound AI voice calls in one product.",
        "Embedded commerce — orders, UPI/card payment links, and delivery tracking inside conversations.",
        "India-first stack — Exotel, PhonePe, Razorpay, Sarvam AI, 10+ regional languages.",
        "Enterprise-grade security — Supabase Row-Level Security with per-tenant data isolation.",
    ]:
        pdf.bullet(vp)

    # ── 2. Platform Architecture ──────────────────────────────────────────────
    pdf.h1("2.  Platform Architecture")
    pdf.h2("2.1  System Components")
    ws = [50, 34, 98]
    pdf.thead(["Component", "Technology", "Responsibilities"], ws)
    for i, r in enumerate([
        ("API Server (apps/api)",      "Node.js / Fastify",   "Webhook processing, AI response pipeline, voice orchestration, campaign dispatch, KB ingest."),
        ("Web Application (apps/web)", "Next.js 14 App Router","Dual portal: client dashboard + platform admin UI. Server Actions for all data mutations."),
        ("Shared Package",             "TypeScript",           "Cross-package types, enums, and shared utility functions."),
        ("Database Package",           "Supabase / PostgreSQL","Migrations, RLS policies, pgvector for embeddings, get_bot_context RPC."),
        ("Cache Layer",                "Redis",                "KB lookup cache, bot context cache (60-second TTL), token quota counters."),
    ]):
        pdf.trow(r, ws, shade=i % 2 == 0)
    pdf.gap(3)

    pdf.h2("2.2  User Roles & Permissions")
    ws2 = [38, 34, 110]
    pdf.thead(["Role", "Scope", "Permissions"], ws2)
    for i, r in enumerate([
        ("Platform Manager", "SaaS Operator", "Full access: create/manage clients, products, guardrails, LLM configs, voice providers, billing, notifications, platform staff."),
        ("Platform Admin",   "SaaS Operator", "Read-only monitoring view of all client data and system health."),
        ("Client Manager",   "Tenant",        "Full workspace control: bot configs, guardrails, KB, team, WhatsApp numbers, LLM keys, orders."),
        ("Client Admin",     "Tenant",        "Escalation management, limited team management within the tenant."),
        ("Agent",            "Tenant",        "View and claim assigned escalations; send replies during human takeover."),
    ]):
        pdf.trow(r, ws2, shade=i % 2 == 0)
    pdf.gap(3)

    pdf.h2("2.3  Tenant Plans")
    ws3 = [34, 58, 90]
    pdf.thead(["Plan", "Conversation Limit / Month", "AI Token Quota"], ws3)
    for i, r in enumerate([
        ("Starter", "500 conversations",   "Monthly cap enforced (plan-based)"),
        ("Growth",  "2,000 conversations", "Higher monthly cap (plan-based)"),
        ("Scale",   "Unlimited",           "Unlimited"),
    ]):
        pdf.trow(r, ws3, shade=i % 2 == 0)
    pdf.gap(2)
    pdf.callout(
        "Tenant status: trial → active (on subscription) or trial → expired. "
        "Suspended tenants receive no bot replies; existing conversation history is preserved."
    )

    # ── 3. Bot Types ──────────────────────────────────────────────────────────
    pdf.h1("3.  Bot Types (Products)")
    pdf.body(
        "The platform ships three distinct bot products. Each can be activated independently "
        "per client with its own system prompt, knowledge base, guardrails, voice settings, "
        "LLM credentials, and escalation policy."
    )
    for slug, name, desc, caps in [
        ("support_bot", "Customer Support Bot",
         "Resolves customer queries by answering FAQs, looking up order/account status, "
         "and handling common support workflows via the knowledge base.",
         [
             "FAQ resolution from the knowledge base",
             "Order and account status lookup",
             "Confidence-based escalation to human agents",
             "CSAT rating collection after resolution (1–5 stars)",
             "Multilingual support (10+ Indian regional languages)",
         ]),
        ("sales_bot", "Sales Engagement Bot",
         "Qualifies inbound leads, shares product information, and detects buying intent "
         "to hand off warm prospects to a sales agent at exactly the right moment.",
         [
             "Lead qualification through structured conversation stages",
             "Product information delivery from the KB",
             "Sales lead detection ([SALES_LEAD] marker) with auto-escalation to sales agent",
             "Customer entity capture (email, product interest, quantity, location)",
             "Conversation state machine: greeting → qualifying → resolving → following_up → closing",
         ]),
        ("lifecycle_bot", "Lifecycle Management Bot",
         "Handles post-sale engagement: order tracking, invoice queries, payment reminders, "
         "and renewal outreach integrated with the Orders and Payments module.",
         [
             "Order status and delivery tracking",
             "Invoice and payment query resolution",
             "Payment link dispatch (PhonePe / Razorpay) within the conversation",
             "Proactive follow-up reminders for pending payments",
             "Renewal and upsell outreach",
         ]),
    ]:
        pdf.h3(f"{name}  —  slug: {slug}")
        pdf.body(desc, indent=4)
        pdf.gap(1)
        for cap in caps:
            pdf.bullet(cap, depth=1)

    # ── 4. Core Feature Modules ───────────────────────────────────────────────
    pdf.h1("4.  Core Feature Modules")

    pdf.h2("4.1  Inbound WhatsApp Message Pipeline")
    pdf.body(
        "Every inbound WhatsApp message triggers the pipeline below. The HTTP 200 response "
        "is sent immediately; all AI processing is fully asynchronous."
    )
    pipeline_steps = [
        ("Provider Inference",
         "Payload shape determines the WhatsApp provider (Meta Cloud vs Twilio). Falls back "
         "to the alternate provider if no active number is found for the inferred one."),
        ("Bot Context Load",
         "Single get_bot_context RPC fetches: WhatsApp number credentials, tenant plan/status, "
         "bot config, all 4 guardrail layers, and LLM credentials. Result Redis-cached for 60 s."),
        ("Plan & Status Enforcement",
         "Suspended tenants silently dropped. Monthly conversation and token quotas checked "
         "before any AI work begins."),
        ("Contact Upsert",
         "Contact identified by phone number (E.164) or BSUID (opaque WhatsApp username ID). "
         "Contact record and persistent memory JSON are created or updated."),
        ("CSAT Intercept",
         "If contact has an awaiting_csat flag and replies 1–5, the rating is recorded "
         "and a thank-you confirmation is sent. No AI call is made."),
        ("Message Deduplication",
         "whatsapp_msg_id unique constraint prevents duplicate AI calls when Meta retries webhooks."),
        ("Optimistic Processing Lock",
         "30-second lock on the conversation row prevents concurrent AI calls from simultaneous retries."),
        ("Escalation Keyword Check",
         "Configured trigger phrases checked before AI call. Match → conversation escalated, "
         "human-handover message sent immediately."),
        ("KB Retrieval (RAG)",
         "4-strategy cascade: Redis cache → pgvector similarity search (Voyage-3 embeddings) "
         "→ keyword ILIKE search → product-scoped legacy fallback."),
        ("History Assembly",
         "Up to 40 messages loaded. Recent messages passed verbatim; older turns compressed "
         "into an archive summary block appended to the system prompt."),
        ("AI Response Generation",
         "Claude API called with assembled system prompt (guardrails, KB context, conversation "
         "stage, contact memory, language directive). Confidence score extracted from CONFIDENCE:0.XX marker."),
        ("Marker Extraction & Stripping",
         "[SALES_LEAD], [STAGE:x], and [ENTITY:key=value] markers parsed and stripped "
         "before the message is sent to the customer."),
        ("Guardrail Enforcement",
         "Blocked keywords/topics checked across all 4 layers. Response truncated to the "
         "effective max_response_length (most restrictive layer wins)."),
        ("Escalation Policy",
         "Low-confidence counter incremented. If consecutive low-confidence turns "
         ">= max_low_confidence_reprompts, conversation is auto-escalated."),
        ("Reply Dispatch",
         "Message sent via provider gateway and stored with delivery_status=sent. "
         "Meta delivery/read receipts advance the status ladder: sent → delivered → read."),
        ("Lock Release",
         "Processing lock cleared non-blocking. Conversation updated_at timestamp refreshed."),
    ]
    for i, (title, desc) in enumerate(pipeline_steps, 1):
        pdf.set_font("Arial", "B", 9)
        pdf.set_text_color(*C_BLUE)
        pdf.set_x(14)
        pdf.cell(9, 5.5, f"{i}.")
        pdf.set_text_color(*C_DARK)
        pdf.cell(46, 5.5, title)
        pdf.set_font("Arial", "", 9)
        pdf.multi_cell(123, 5.5, desc, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_text_color(*C_DARK)

    pdf.h2("4.2  Conversation Management")
    pdf.h3("Conversation Statuses")
    ws_cv = [32, 150]
    pdf.thead(["Status", "Description"], ws_cv)
    for i, r in enumerate([
        ("open",       "Bot is actively responding to the customer."),
        ("escalated",  "Conversation handed to a human agent; bot is silent."),
        ("bot_paused", "Agent has taken manual control; messages are stored but not auto-replied."),
        ("resolved",   "Closed by an agent or auto-resolved after inactivity."),
    ]):
        pdf.trow(r, ws_cv, shade=i % 2 == 0)
    pdf.gap(2)

    pdf.h3("AI Conversation State Machine")
    pdf.body(
        "Conversations progress through structured stages. The AI declares stage transitions "
        "and captures customer entities by appending control markers at the end of its response "
        "(stripped before delivery to the customer):"
    )
    for stage in ["greeting", "qualifying", "resolving", "following_up", "closing"]:
        pdf.bullet(stage)
    pdf.gap(1)
    pdf.body(
        "Stage update:   [STAGE:qualifying]\n"
        "Entity capture: [ENTITY:email=alice@example.com]  [ENTITY:order_id=ORD-123]",
        indent=6
    )

    pdf.h3("Delivery Status Ladder")
    pdf.body(
        "Outbound messages move one-way: sent → delivered → read. "
        "The failed status is always accepted. Backward transitions are silently ignored."
    )

    pdf.h2("4.3  Knowledge Base (RAG)")
    pdf.body(
        "Each tenant manages one or more KB Collections assigned to specific bots with a "
        "priority order. Documents are ingested, semantically chunked, and embedded via "
        "Voyage-3 into a pgvector index."
    )
    pdf.h3("Supported Document Formats")
    pdf.body("PDF, DOCX, TXT, Markdown, Images (OCR via image extraction)")

    pdf.h3("KB Entry Lifecycle")
    pdf.body("draft  →  review  →  live  →  archived")

    pdf.h3("4-Strategy RAG Fallback")
    for s in [
        "Redis cache — previously retrieved results cached per (tenant, product, query).",
        "Vector similarity search — pgvector cosine similarity using Voyage-3 embeddings.",
        "Keyword ILIKE search — full-text keyword fallback when no vector match is found.",
        "Product-scoped legacy fallback — searches flat (non-collection) KB entries.",
    ]:
        pdf.bullet(s)

    pdf.h3("KB-Only Mode")
    pdf.body(
        "When enabled at any guardrail layer, the AI answers only from KB results. "
        "If no relevant entry is found it acknowledges the gap and offers to escalate. "
        "Configurable globally, per product type, per tenant, or per individual bot."
    )

    pdf.h3("AI-Generated KB Suggestions")
    pdf.body(
        "Frequently asked questions not covered by the KB are flagged as suggestions "
        "(status: pending). Client managers review and promote them to live entries or dismiss them."
    )

    pdf.h2("4.4  Escalation Management")
    pdf.h3("Escalation Triggers")
    for t in [
        "Keyword match — customer types a configured phrase (e.g., 'speak to human', 'urgent', 'refund').",
        "Low-confidence consecutive turns — AI confidence below threshold for N turns in a row.",
        "Sales lead detected — [SALES_LEAD] marker triggers immediate handoff to a sales agent.",
        "KB-only no-match — KB-only mode active but no relevant KB entry was found.",
        "Auto-escalation timeout — conversation open for more than X configured hours.",
    ]:
        pdf.bullet(t)

    pdf.h3("Escalation Flow")
    for s in [
        "Conversation status flipped to 'escalated'; bot goes silent.",
        "Escalation record created (status: pending).",
        "Email notification dispatched to client_manager and platform_admin via Brevo.",
        "If auto_dispatch_on_escalation is enabled: outbound voice call placed to the customer.",
        "Agent claims the escalation → conversation assigned (agent_id set on conversation).",
        "Agent sends manual WhatsApp replies until they mark the escalation resolved.",
        "On resolution: conversation closed; optional CSAT prompt sent to the customer.",
    ]:
        pdf.bullet(s)

    pdf.h3("Human Takeover (bot_paused)")
    pdf.body(
        "An agent can pause the bot without a full escalation — useful for brief "
        "interventions. Inbound messages are stored but not auto-replied. "
        "The agent can resume the bot at any time by switching status back to 'open'."
    )

    pdf.h3("CSAT Collection")
    pdf.body(
        "After resolution the bot sends a 1–5 star rating prompt. The score is stored in "
        "contact.memory_json with a timestamp. A confirmation message is sent "
        "(e.g., \"**** Thank you for your feedback!\")."
    )

    pdf.h2("4.5  Voice Call Module")
    pdf.body(
        "The voice module enables AI-powered outbound phone calls via a configurable "
        "three-component stack: Telephony + Speech-to-Text + Text-to-Speech. "
        "Each call runs a multi-turn AI conversation loop with full transcript storage "
        "and automated structured outcome extraction."
    )
    pdf.h3("Supported Voice Providers")
    ws_vp = [32, 60, 90]
    pdf.thead(["Component", "Providers", "Notes"], ws_vp)
    for i, r in enumerate([
        ("Telephony", "Twilio, Exotel",               "Exotel recommended in India (lower per-minute cost). Twilio for international."),
        ("STT",       "Deepgram Nova-2, Sarvam AI, Azure Speech", "Sarvam recommended for Hindi and Indian regional languages."),
        ("TTS",       "Twilio Say (free), Google Neural2, Sarvam TTS, Exotel Say", "Twilio Say is zero-cost built-in; Google/Sarvam for higher audio quality."),
    ]):
        pdf.trow(r, ws_vp, shade=i % 2 == 0)
    pdf.gap(2)

    pdf.h3("Voice Call Flow")
    for step in [
        "Dispatch request (API, campaign trigger, or escalation auto-dispatch) creates a voice_calls record.",
        "Telephony provider places the outbound call.",
        "On answer: TwiML/ExoML greeting message played; customer prompted to speak.",
        "Customer audio → STT transcription → Claude AI response → TTS audio returned as next prompt.",
        "Multi-turn loop repeats until max_turns reached, silence timeout, or customer hangs up.",
        "Final status received from provider: completed / failed / voicemail / no_answer / busy.",
        "Claude analyses the full transcript and extracts structured outcome JSON.",
        "Call cost in INR calculated and stored alongside the full transcript.",
    ]:
        pdf.bullet(step)

    pdf.h3("Post-Call Outcome Extraction")
    pdf.body("Claude analyses the transcript and returns structured fields:")
    for f in ["intent", "product_interest", "resolved (boolean)",
              "escalation_needed (boolean)", "sentiment", "follow_up_action", "summary"]:
        pdf.bullet(f, depth=1)

    pdf.h3("Voice Configuration Options (per-bot)")
    for cfg in [
        "telephony_provider, stt_provider, tts_provider — override platform-level defaults",
        "language — en-IN, hi-IN, ta-IN, te-IN, kn-IN, mr-IN, gu-IN, ml-IN, en-US",
        "tts_voice — provider-specific voice name (e.g., Polly.Aditi, en-IN-Neural2-A)",
        "max_call_duration_seconds — maximum call length (default: 300 s)",
        "max_turns — maximum AI conversation turns per call (default: 20)",
        "silence_timeout_seconds — silence before hang-up (default: 5 s)",
        "voicemail_enabled / voicemail_message — leave a voicemail on no-answer",
        "greeting_message — opening message (overrides the product default)",
        "auto_dispatch_on_escalation — auto-call customer when their conversation is escalated",
        "escalation_voice_delay_seconds — delay before dispatching the escalation call",
    ]:
        pdf.bullet(cfg)

    pdf.h3("Provider Cost Estimation")
    pdf.body(
        "A cost-estimate API endpoint returns the blended cost per minute (INR) for any "
        "telephony + STT + TTS combination, enabling platform managers to compare configurations."
    )

    pdf.h2("4.6  Campaign Engine")
    pdf.body(
        "Campaigns enable bulk outbound engagement via WhatsApp, Voice, or both simultaneously. "
        "Per-contact delivery and response status is tracked with configurable retry logic."
    )
    pdf.h3("Campaign Channels")
    ws_ch = [28, 154]
    pdf.thead(["Channel", "Behaviour"], ws_ch)
    for i, r in enumerate([
        ("WhatsApp", "Sends a WhatsApp template message to all contacts. Tracks: sent, replied, failed per contact."),
        ("Voice",    "Dispatches outbound AI calls to all contacts. Tracks: initiated, answered, voicemail, failed."),
        ("Both",     "Sends WhatsApp first; if no reply after configured delay, dispatches a voice call."),
    ]):
        pdf.trow(r, ws_ch, shade=i % 2 == 0)
    pdf.gap(2)

    pdf.h3("Campaign Lifecycle")
    pdf.body("draft  →  active (on launch)  →  paused (manual)  →  completed / cancelled")

    pdf.h3("Retry Logic")
    pdf.body(
        "Per-campaign retry_config: retry_after_hours (wait before retry) and max_retries "
        "(maximum attempts per contact). Contacts in failed state are retried within the window."
    )

    pdf.h3("Real-Time Campaign Stats")
    pdf.body(
        "stats_json tracks: total contacts, WhatsApp sent/replied/failed, "
        "voice answered/voicemail/failed — all displayed on the campaign detail page."
    )

    pdf.h2("4.7  Follow-Up Automation")
    pdf.body(
        "Proactively re-engages contacts whose conversation has been idle for a configurable number of days."
    )
    pdf.h3("Configuration Options")
    for cfg in [
        "enabled — toggle on/off per bot type",
        "idle_days — days of inactivity before follow-up triggers",
        "message_template — the follow-up message text",
        "max_follow_ups — maximum follow-ups per conversation before stopping",
        "contact_scope — all contacts or a specific segment",
    ]:
        pdf.bullet(cfg)
    pdf.h3("Follow-Up Statuses")
    pdf.body("scheduled  →  sent / failed / cancelled")

    pdf.h2("4.8  Orders & Payment Collection")
    pdf.body(
        "Agents or the lifecycle bot can create orders within a conversation. Payment links "
        "(PhonePe / Razorpay) are generated and sent via WhatsApp. Confirmations arrive via webhook."
    )
    pdf.h3("Order Workflow")
    for step in [
        "Create order: add line items (name, quantity, unit price) and set total.",
        "Select payment provider and generate a payment link.",
        "Payment link sent to customer via WhatsApp.",
        "Customer pays → provider webhook received at /api/payments/{provider}/webhook.",
        "Payment status updated to 'paid'; order status updated to 'confirmed'.",
        "Conversation continues — bot can confirm delivery and handle post-payment queries.",
    ]:
        pdf.bullet(step)
    pdf.h3("Payment Providers")
    for p, d in [
        ("PhonePe",  "UPI-based payments for India. SHA256-signed payloads. Redirect to PhonePe checkout."),
        ("Razorpay", "Multi-method: UPI, cards, net banking. Order API + webhook-driven confirmation."),
    ]:
        pdf.set_font("Arial", "B", 9)
        pdf.set_x(18)
        pdf.cell(26, 5, p + ":")
        pdf.set_font("Arial", "", 9)
        pdf.multi_cell(156, 5, d, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.h3("Order Statuses")
    pdf.body("pending  →  confirmed  →  dispatched  →  delivered  →  cancelled")

    # ── 5. Configuration System ───────────────────────────────────────────────
    pdf.h1("5.  Configuration System")

    pdf.h2("5.1  4-Layer Guardrail Cascade")
    pdf.body(
        "Guardrails control what the AI can say and how it handles sensitive topics. "
        "Four layers are merged at runtime using these merge rules:"
    )
    for rule in [
        "Lists (blocked_topics, blocked_keywords): UNION — all layers contribute their lists.",
        "Numeric limits (max_response_length): MIN — most restrictive layer wins.",
        "Booleans (kb_only_mode, no_external_links, no_personal_data): OR — any layer can enable.",
        "Action/message strings (on_blocked_topic, custom_blocked_message): most specific layer wins.",
    ]:
        pdf.bullet(rule)
    pdf.gap(2)

    ws_g = [8, 42, 40, 92]
    pdf.thead(["#", "Layer", "Set By", "Controls"], ws_g)
    for i, r in enumerate([
        ("1", "Global Platform Settings", "Platform Manager",
         "global_blocked_topics, global_blocked_keywords, max_response_length (default 2000), "
         "enforce_kb_only_globally, no_personal_data, no_external_links"),
        ("2", "Bot-Type Guardrails", "Platform Manager",
         "Per product slug (support_bot / sales_bot / lifecycle_bot): blocked_topics, blocked_keywords, "
         "max_response_length, kb_only_mode, no_personal_data, no_external_links, on_blocked_topic"),
        ("3", "Tenant Guardrails", "Client Manager",
         "Shared across all bots for the tenant: same as Layer 2 plus custom_blocked_message"),
        ("4", "Bot Config Guardrails", "Client Manager",
         "Per-bot overrides: tone, no_phone_numbers_in_response, on_low_confidence, "
         "reprompt_message, custom_blocked_message, max_response_length (default 1000)"),
    ]):
        pdf.trow(r, ws_g, shade=i % 2 == 0)
    pdf.gap(3)

    pdf.h2("5.2  Bot Configuration Settings")
    pdf.h3("Core Settings")
    for cfg in [
        "system_prompt — AI persona and business-specific instructions (overrides product default)",
        "ai_model — Anthropic model ID (e.g., claude-sonnet-4-6); overrides product default",
        "confidence_threshold — float 0–1; below this triggers low-confidence reprompt (default 0.6)",
        "escalation_triggers — keyword phrases for immediate human escalation",
        "kb_only_mode — restrict AI to KB answers only",
    ]:
        pdf.bullet(cfg)

    pdf.h3("Escalation Policy")
    for cfg in [
        "confidence_threshold — per-bot override of the platform default",
        "max_low_confidence_reprompts — consecutive low-confidence turns before escalating (default 2)",
        "on_exhaust — 'escalate' or 'silent' when reprompt limit is reached",
        "reprompt_message — optional message sent to the customer before the escalation turn",
        "auto_escalate_after_hours — auto-escalate after N hours open without resolution (null = off)",
    ]:
        pdf.bullet(cfg)

    pdf.h3("Tone & Content Filters")
    for cfg in [
        "tone — professional | casual | empathetic | formal (injected into system prompt)",
        "no_external_links — prevent the AI from including URLs",
        "no_phone_numbers_in_response — prevent the AI from sharing phone numbers",
        "no_personal_data — prevent the AI from referencing PII",
        "on_blocked_topic — escalate | silent | custom_message",
        "custom_blocked_message — text shown when a blocked topic is detected",
    ]:
        pdf.bullet(cfg)

    pdf.h2("5.3  LLM Configuration Hierarchy (6 Levels)")
    pdf.body(
        "The platform resolves which AI model and API credentials to use through a 6-level "
        "hierarchy. The first valid match from the top wins:"
    )
    ws_lv = [52, 130]
    pdf.thead(["Level", "Source"], ws_lv)
    for i, r in enumerate([
        ("1 — Client + Bot-specific",  "llm_configs row with matching tenant_id AND product_slug"),
        ("2 — Client generic",         "llm_configs row with matching tenant_id, no product_slug"),
        ("3 — Platform + Bot-specific","llm_configs row with no tenant_id, matching product_slug"),
        ("4 — Platform generic",       "llm_configs row with no tenant_id, no product_slug"),
        ("5 — Bot config model",       "bot_configs.ai_model (model only; uses platform API key)"),
        ("6 — Product default",        "products.default_model (product catalog; uses platform API key)"),
    ]):
        pdf.trow(r, ws_lv, shade=i % 2 == 0)
    pdf.gap(2)
    pdf.callout(
        "Auth-failure fallback: if a client's custom API key returns a 401/403 error, the platform "
        "automatically retries the AI call using its own platform key before returning an error to the customer."
    )

    pdf.h2("5.4  WhatsApp Number Management")
    pdf.body(
        "Each tenant can configure one or more WhatsApp Business numbers, each scoped "
        "to a specific bot product and provider."
    )
    ws_wp = [38, 144]
    pdf.thead(["Provider", "Configuration Required"], ws_wp)
    for i, r in enumerate([
        ("Meta Cloud API", "phone_number_id, access_token, verify_token, app_secret — official WhatsApp Business API."),
        ("Twilio",         "Account SID, Auth Token, WhatsApp-enabled phone number."),
        ("Interakt",       "API key and endpoint — third-party BSP."),
        ("WATI",           "API token and endpoint — third-party BSP."),
        ("Gupshup",        "API key and source phone — third-party BSP."),
    ]):
        pdf.trow(r, ws_wp, shade=i % 2 == 0)
    pdf.gap(2)
    pdf.body(
        "Numbers can be labelled, toggled active/inactive, and updated without service "
        "interruption. Multiple numbers per tenant are supported."
    )

    # ── 6. Analytics & Reporting ──────────────────────────────────────────────
    pdf.h1("6.  Analytics & Reporting")

    pdf.h2("6.1  Client Dashboard Analytics  (/analytics)")
    pdf.body("Available with 7-day and 30-day toggles.")
    for m in [
        "Total, open, escalated, resolved, and bot_paused conversation counts",
        "Daily message volume trend (bar chart, Recharts)",
        "Monthly AI token consumption rolling total",
        "Escalation rate and average resolution time",
        "Per-product breakdown (support_bot, sales_bot, lifecycle_bot)",
        "Contact sentiment distribution (positive, neutral, negative, frustrated)",
    ]:
        pdf.bullet(m)

    pdf.h2("6.2  Platform-Level Analytics  (/platform/analytics)")
    for m in [
        "Total active clients and active trials",
        "Platform-wide conversation volume across all tenants",
        "Trial utilisation rates and paid conversion trends",
        "Per-client breakdown of message and token usage",
    ]:
        pdf.bullet(m)

    pdf.h2("6.3  Usage Events (Metered Billing Data)")
    pdf.body("Every interaction generates a usage_events row for billing and capacity planning:")
    ws_ev = [60, 122]
    pdf.thead(["Event Type", "Triggered When"], ws_ev)
    for i, r in enumerate([
        ("conversation_started", "A new conversation is created for a contact."),
        ("message_sent",         "Each inbound message or bot reply."),
        ("ai_token_used",        "An AI response is generated (input + output token count stored)."),
        ("escalation",           "A conversation is escalated to a human agent."),
        ("kb_query",             "A KB lookup is performed for an incoming message."),
    ]):
        pdf.trow(r, ws_ev, shade=i % 2 == 0)
    pdf.gap(3)

    # ── 7. Notification System ────────────────────────────────────────────────
    pdf.h1("7.  Notification System")
    pdf.body(
        "Event-driven email notifications sent via Brevo (Sendinblue). Rules are configurable "
        "per event at platform-wide or per-tenant scope with role-based or custom email targeting."
    )
    pdf.h3("Notification Events")
    ws_ne = [60, 122]
    pdf.thead(["Event", "Description"], ws_ne)
    for i, r in enumerate([
        ("trial_expiring_7d",    "Trial expires in 7 days — alert client manager."),
        ("trial_expiring_1d",    "Trial expires tomorrow — alert client manager + platform manager."),
        ("trial_expired",        "Trial ended — notify both parties."),
        ("client_invited",       "New client invite sent via the platform."),
        ("client_activated",     "Client completed onboarding and went live."),
        ("escalation_created",   "New escalation — notify assigned agent and managers."),
        ("escalation_timeout",   "Escalation unclaimed past the threshold duration."),
        ("new_client_onboarded", "Platform manager alert on new client signup."),
        ("daily_report",         "Daily digest: conversation count, escalation rate, token usage."),
        ("low_confidence_spike", "Unusual spike in low-confidence AI responses detected."),
        ("bot_error",            "Runtime error in the bot pipeline."),
        ("subscription_renewed", "Billing cycle renewed successfully."),
    ]):
        pdf.trow(r, ws_ne, shade=i % 2 == 0)
    pdf.gap(2)
    pdf.h3("Recipient Targeting")
    for t in [
        "Role-based: platform_admin, platform_manager, client_manager, client_admin",
        "Custom email addresses (comma-separated list)",
        "Scope: platform-wide (all tenants) or per-tenant (specific client only)",
    ]:
        pdf.bullet(t)

    # ── 8. Free Trial Management ──────────────────────────────────────────────
    pdf.h1("8.  Free Trial Management")
    pdf.body(
        "Platform managers can grant time-limited free trials per product per client. "
        "Trials operate independently from paid subscriptions."
    )
    for item in [
        "Duration: configurable per trial (default 14 days).",
        "Scope: per product — clients can trial each bot type independently.",
        "Model restriction: trial may be limited to a specific AI model.",
        "Status flow:  active  →  expired  or  active  →  converted (on subscription).",
        "Automatic notifications: 7-day warning, 1-day warning, and expiry notification.",
        "Conversion tracking: flagged when a trial converts to a paid subscription.",
        "Trial utilisation tracked in platform analytics for conversion rate reporting.",
    ]:
        pdf.bullet(item)

    # ── 9. Team Management ────────────────────────────────────────────────────
    pdf.h1("9.  Team Management")
    pdf.h2("9.1  Client Team")
    pdf.body("Client managers invite team members via email. Invite links expire in 7 days.")
    ws_tm = [36, 146]
    pdf.thead(["Role", "Permissions"], ws_tm)
    for i, r in enumerate([
        ("client_manager", "Full workspace control: bot configs, guardrails, KB, team, WhatsApp numbers, LLM keys, orders, billing."),
        ("client_admin",   "Escalation management, limited team management within the tenant."),
        ("agent",          "View/claim assigned escalations; send WhatsApp replies during human takeover."),
    ]):
        pdf.trow(r, ws_tm, shade=i % 2 == 0)
    pdf.gap(3)

    pdf.h2("9.2  Platform Team")
    pdf.body("Platform managers invite internal SaaS operator staff.")
    ws_pt = [36, 146]
    pdf.thead(["Role", "Permissions"], ws_pt)
    for i, r in enumerate([
        ("manager", "Full platform control: create and manage all clients, products, configs."),
        ("admin",   "Read-only monitoring access to all client data for support and investigation."),
    ]):
        pdf.trow(r, ws_pt, shade=i % 2 == 0)
    pdf.gap(3)

    # ── 10. Third-Party Integrations ──────────────────────────────────────────
    pdf.h1("10.  Third-Party Integrations")
    ws_int = [42, 36, 104]
    pdf.thead(["Service", "Category", "Usage"], ws_int)
    for i, r in enumerate([
        ("Meta Cloud API",            "WhatsApp",          "Primary WhatsApp Business API. Webhook verification, message send, delivery receipts."),
        ("Twilio",                    "WhatsApp + Voice",  "WhatsApp Sandbox + outbound/inbound AI voice calls (TwiML)."),
        ("Interakt / WATI / Gupshup", "WhatsApp BSP",     "Alternative third-party WhatsApp providers."),
        ("Exotel",                    "Telephony (India)", "India-focused outbound voice (ExoML). Lower per-minute cost than Twilio."),
        ("Deepgram Nova-2",           "STT",               "Fast, accurate English speech-to-text transcription."),
        ("Sarvam AI",                 "STT + TTS",         "Indian regional language support: hi-IN, ta-IN, te-IN, kn-IN, mr-IN, gu-IN, ml-IN."),
        ("Azure Speech",              "STT",               "Enterprise-grade STT (optional)."),
        ("Google Neural2 TTS",        "TTS",               "High-quality TTS for English and Indian regional languages."),
        ("Twilio Say",                "TTS",               "Free built-in TTS using Amazon Polly voices (Aditi, Raveena)."),
        ("PhonePe",                   "Payments",          "UPI payment links. SHA256-signed payloads. India-first."),
        ("Razorpay",                  "Payments",          "Multi-method payment links (UPI, cards, net banking). Webhook-driven."),
        ("Anthropic / Claude",        "AI / LLM",          "Primary AI for bot responses and post-call outcome extraction."),
        ("OpenRouter",                "AI / LLM",          "Multi-model LLM routing option."),
        ("OpenAI",                    "AI / LLM",          "Direct OpenAI models as alternative LLM provider."),
        ("Voyage-3",                  "Embeddings",        "Semantic KB search embeddings stored in pgvector."),
        ("Supabase",                  "Database",          "PostgreSQL + pgvector + Row-Level Security + Auth."),
        ("Redis",                     "Cache",             "KB lookup cache, bot context cache (60 s TTL), token counters."),
        ("Brevo (Sendinblue)",        "Email",             "Transactional and event-driven notification emails."),
    ]):
        pdf.trow(r, ws_int, shade=i % 2 == 0)
    pdf.gap(3)

    # ── 11. Core Data Model ───────────────────────────────────────────────────
    pdf.h1("11.  Core Data Model")
    for group, items in [
        ("Identity & Access", [
            "tenants — Workspace/organisation (plan, status, provider).",
            "tenant_users — Team members linked to a tenant (role, user_id).",
            "platform_users — Platform staff (role: manager | admin).",
            "client_invites — Invite tokens (email, role, expires in 7 days).",
        ]),
        ("Communication", [
            "whatsapp_numbers — Business numbers (provider, product_slug, config_json with credentials, active flag).",
            "contacts — Customer records (phone/BSUID, name, memory_json: preferences, sentiment, CSAT, order history).",
            "conversations — Instances (status, product_type, stage, ai_vars, assigned_agent_id, processing_lock).",
            "messages — History (role, content, media_url, confidence_score, delivery_status, whatsapp_msg_id for dedup).",
            "escalations — Records (trigger_reason, agent_id, status: pending | assigned | resolved).",
            "agent_sessions — Human takeover periods (started_at, ended_at, resolution_note).",
        ]),
        ("AI & Configuration", [
            "products — Product catalog (slug, name, default_prompt, default_model, active).",
            "bot_configs — Per-bot settings (system_prompt, confidence_threshold, guardrails_json, voice_config, escalation_policy).",
            "platform_settings — Global key-value store for guardrails and feature flags.",
            "bot_type_guardrails — Layer 2 guardrails scoped to a product_slug.",
            "tenant_guardrails — Layer 3 guardrails shared across all bots for a tenant.",
            "llm_configs — LLM credentials (tenant_id x product_slug hierarchy; api_key, model, validation_status).",
        ]),
        ("Knowledge Base", [
            "kb_collections — Named KB collections (tenant, name, description).",
            "kb_collection_bots — Assigns collections to bots with priority ordering.",
            "knowledge_base — KB entries (question, answer, category, embedding vector, status, version).",
            "kb_documents — Uploaded documents (PDF/DOCX/TXT; status: pending → done | error; chunk_count).",
            "kb_suggestions — AI-generated FAQ suggestions (frequency count, status: pending | accepted | dismissed).",
        ]),
        ("Commerce", [
            "orders — Customer orders (items_json, total, status, contact_id, conversation_id).",
            "payments — Payment records (order_id, provider, status, link_url, webhook_received_at, payment_ref).",
            "campaigns — Outbound campaigns (channel, template_id, status, stats_json, retry_config).",
            "campaign_contacts — Per-contact campaign tracking (whatsapp_status, voice_status, attempts).",
            "follow_up_configs — Follow-up settings (idle_days, max_follow_ups, message_template).",
            "follow_up_sequences — Scheduled follow-up send log.",
        ]),
        ("Voice & Telephony", [
            "voice_provider_configs — Provider registry (component: telephony | stt | tts, credentials, cost_per_min_inr).",
            "voice_calls — Call log (status, duration_seconds, turn_count, transcript, outcome_json, cost_rupees, triggered_by).",
        ]),
        ("Billing & Usage", [
            "free_trials — Time-limited trials (tenant_id, product_slug, starts_at, ends_at, status).",
            "subscriptions — Billing records (product, tier, billing_cycle, next_billing_date).",
            "usage_events — Metered usage rows (event_type, token_count, timestamp).",
            "notification_configs — Event-triggered email rules (scope, event_type, recipients, enabled).",
            "tenant_products — Product activation per tenant (tier: base | advanced).",
        ]),
    ]:
        pdf.h3(group)
        for item in items:
            pdf.bullet(item)

    # ── 12. Security & Data Isolation ─────────────────────────────────────────
    pdf.h1("12.  Security & Data Isolation")

    pdf.h2("12.1  Row-Level Security (RLS)")
    pdf.body(
        "Supabase RLS policies enforce strict per-tenant data isolation at the database level. "
        "All web app queries run under authenticated user context; the API server uses the "
        "service role only for webhook processing."
    )
    for item in [
        "Tenants can only read/write their own conversations, contacts, messages, and KB.",
        "Agents see only conversations/escalations belonging to their tenant.",
        "Platform staff: admin (read-all) vs manager (read-write-all) enforced by policy.",
        "get_user_tenant_id() Postgres function resolves the caller's tenant from JWT claims.",
    ]:
        pdf.bullet(item)

    pdf.h2("12.2  Credential & Secret Management")
    for item in [
        "WhatsApp credentials (access tokens, phone number IDs) stored encrypted in config_json per number.",
        "Payment credentials (merchant IDs, salt keys) held in environment variables only.",
        "LLM API keys stored in llm_configs; masked in all API responses.",
        "Voice provider credentials in voice_provider_configs.credentials_json.",
        "Webhook signatures validated (Meta HMAC app_secret, Razorpay webhook secret).",
        "Environment variables managed via deployment platform — never committed to source control.",
    ]:
        pdf.bullet(item)

    pdf.h2("12.3  Anti-Abuse Controls")
    for item in [
        "30-second optimistic lock prevents duplicate AI calls from Meta webhook retries.",
        "whatsapp_msg_id unique constraint prevents duplicate message storage.",
        "Plan limits (conversation count + monthly token quota) checked before every AI call.",
        "Suspended tenant check at webhook entry — no processing for suspended accounts.",
        "Blocked keyword/topic guardrails enforced at every layer before sending any AI response.",
    ]:
        pdf.bullet(item)

    # ── 13. Non-Functional Requirements ──────────────────────────────────────
    pdf.h1("13.  Non-Functional Requirements")

    pdf.h2("13.1  Performance")
    for item in [
        "Webhook HTTP response < 100 ms (200 sent immediately; AI work is fully async).",
        "Bot context Redis cache (60 s TTL) reduces Supabase round-trips on hot paths.",
        "KB lookup target < 300 ms (Redis cache hit < 5 ms; vector search < 200 ms).",
        "get_bot_context RPC consolidates 7 Supabase queries into a single database call.",
    ]:
        pdf.bullet(item)

    pdf.h2("13.2  Reliability & Resilience")
    for item in [
        "Meta webhook retries handled via optimistic lock + whatsapp_msg_id deduplication.",
        "AI API key fallback: client key auth failure → automatic retry with platform key.",
        "Provider inference fallback: wrong WhatsApp provider inferred → retry with alternate.",
        "Graceful degradation: if AI pipeline fails, customer receives a human-escalation message.",
        "Voice call status webhooks handle all terminal states (completed, failed, voicemail, no_answer, busy).",
    ]:
        pdf.bullet(item)

    pdf.h2("13.3  Scalability")
    for item in [
        "Stateless API server — horizontal scaling supported.",
        "Redis caching for high-frequency bot context and KB lookup paths.",
        "pgvector for semantic KB search at large embedding volume.",
        "Metered usage events provide real-time billing and capacity planning data.",
    ]:
        pdf.bullet(item)

    pdf.h2("13.4  Internationalisation")
    for item in [
        "Auto language detection: Hindi (Devanagari), Tamil, Telugu, Kannada, Punjabi, Gujarati, Odia, Arabic, Chinese.",
        "Bot auto-replies in the detected language/script when non-Latin text is received.",
        "Voice STT/TTS supports 8+ Indian regional language codes (en-IN, hi-IN, ta-IN, te-IN, etc.).",
        "Payment providers (PhonePe, Razorpay) and telephony (Exotel) optimised for India.",
    ]:
        pdf.bullet(item)

    # ── 14. Glossary ──────────────────────────────────────────────────────────
    pdf.h1("14.  Glossary")
    ws_gl = [34, 148]
    pdf.thead(["Term", "Definition"], ws_gl)
    for i, r in enumerate([
        ("BSUID",           "WhatsApp Business Unique Identifier — opaque ID used instead of a phone number for users with a WhatsApp username."),
        ("Bot Context",     "Resolved configuration (system prompt, guardrails, LLM credentials, voice config) loaded per-request from Redis or RPC."),
        ("BSP",             "Business Solution Provider — third-party WhatsApp API provider (Interakt, WATI, Gupshup)."),
        ("CSAT",            "Customer Satisfaction Score — 1–5 star rating collected from the customer after conversation resolution."),
        ("ExoML",           "Exotel Markup Language — XML format for controlling Exotel voice call flows."),
        ("Guardrail",       "A safety rule applied to AI responses: blocked keywords, topic restrictions, content filters, response length limits."),
        ("KB",              "Knowledge Base — structured repository of Q&A entries and documents used for RAG-based AI augmentation."),
        ("LLM",             "Large Language Model — the AI model that generates bot responses (default: Claude by Anthropic)."),
        ("Optimistic Lock", "30-second database lock on a conversation row to prevent concurrent AI calls from simultaneous webhook retries."),
        ("Product Slug",    "String identifier for a bot type: support_bot, sales_bot, or lifecycle_bot."),
        ("RAG",             "Retrieval-Augmented Generation — injecting relevant KB results into the AI prompt before generating a response."),
        ("RLS",             "Row-Level Security — Supabase/PostgreSQL feature enforcing per-tenant data isolation at the query level."),
        ("STT",             "Speech-to-Text — converts customer voice audio to text for AI processing during voice calls."),
        ("Tenant",          "A client organisation using the platform; has its own team, bots, contacts, conversations, and billing."),
        ("TTS",             "Text-to-Speech — converts the AI's text response to audio delivered during voice calls."),
        ("TwiML",           "Twilio Markup Language — XML format for controlling Twilio voice call flows."),
    ]):
        pdf.trow(r, ws_gl, shade=i % 2 == 0)

    # Closing line
    pdf.gap(6)
    pdf.rule(C_BLUE, 0.5)
    pdf.gap(3)
    pdf.set_font("Arial", "I", 8.5)
    pdf.set_text_color(*C_GRAY)
    pdf.cell(0, 6, "End of Document  —  WhatsApp AI Agent BRD v1.0  —  July 2026", align="C")
    pdf.set_text_color(*C_DARK)


# ════════════════════════════════════════════════════════════════════════════
#  MAIN
# ════════════════════════════════════════════════════════════════════════════
def main():
    pdf = PDF()
    pdf.set_title("WhatsApp AI Agent — Business Requirements Document")
    pdf.set_author("WhatsApp AI Agent Platform")
    pdf.set_subject("BRD v1.0  |  July 2026")

    cover(pdf)
    content(pdf)

    pdf.output(OUTPUT)
    print(f"\nBRD saved to:\n  {OUTPUT}\n")


if __name__ == "__main__":
    main()
