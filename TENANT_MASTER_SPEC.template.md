---
spec_version: "1.0"
tenant_id: "{{TENANT_ID}}"
generated_at: "{{GENERATED_AT}}"
generated_from: "{{SESSION_ID}}"
approved_at: null
approved_by: null
checksum: "{{CHECKSUM}}"
---

<!-- ════════════════════════════════════════════════════════════════
     ALPHABOT TENANT MASTER SPECIFICATION — TEMPLATE v1.0
     ════════════════════════════════════════════════════════════════

     THIS FILE IS THE EDITABLE SOURCE OF TRUTH.
     The JSON file is compiled from this document. Editing the JSON
     directly will cause drift. Always edit here, then recompile.

     COMPILE RULES (MD → JSON)
     ─────────────────────────
     1. Parse the YAML frontmatter block for top-level metadata.
     2. For each section (§1–§14), locate its field table.
     3. Each table row maps to: sections.{section_id}.{field_id}
        = { value: <Value>, provenance: { source: <Source>,
            confidence: <Confidence>, evidence: <Evidence>,
            blocking: <Priority> } }
     4. Multi-value fields (arrays): split the Value cell on " | " (pipe).
     5. Boolean fields: "Yes" → true, "No" → false, "—" → null.
     6. Enum fields: map display strings to enum keys per ENUM MAP below.
     7. Missing/empty values → source: "missing", confidence: "low",
        value: null.
     8. Compute checksum: DJB2 hash of JSON.stringify(sections) with
        keys sorted alphabetically at every level.
     9. Parse §15 Gap Register entries into gap_register.entries[].
     10. The compiled JSON must validate against tenant-master-spec.schema.json.

     ENUM MAP
     ────────
     Category:
       "D2C / online store"              → d2c
       "Services or consulting"          → services
       "Manufacturing or B2B supply"     → manufacturing_b2b
       "Subscription or recurring orders"→ subscription
       "Retail or local storefront"      → retail
       "Other"                           → other

     Pricing disclosure:
       "Yes — share prices freely"       → share_freely
       "Yes — but always add disclaimer" → share_with_disclaimer
       "Only if customer specifically asks" → on_request
       "Never — always direct to contact"  → never
       "Custom rule"                     → custom

     Competitor policy:
       "Ignore competitors"              → do_not_acknowledge
       "Deflect to own brand"            → deflect
       "Acknowledge and redirect"        → acknowledge_redirect
       "Custom"                          → custom

     PII policy:
       "Minimum — name and contact only" → minimum
       "For delivery — name, address, contact" → for_delivery
       "No sensitive info ever"          → no_sensitive
       "Custom"                          → custom

     Tone: formal | semi_formal | friendly_casual | warm_personal | custom
     Emoji: none | minimal | moderate | expressive
     Response length: very_short | short | medium | as_needed
     Out-of-hours: hold_notify | auto_reply_callback | auto_reply_slot |
                   bot_continues | custom

     Activated products:
       "Conversational Support Bot" → support_bot
       "AI Sales Bot"               → sales_bot
       "Onboarding & Lifecycle Bot" → lifecycle_bot

     SOURCE VALUES (provenance.source)
     ──────────────────────────────────
     stated    — client said it directly during intake
     extracted — detected from free-form text or uploaded document
     inferred  — AI Coach deduced it; must be confirmed before use
     default   — system default applied (e.g. timezone = Asia/Kolkata)
     missing   — not yet provided; appears in §15 Gap Register

     CONFIDENCE
     ──────────
     high   — verbatim from client or unambiguous
     medium — plausible but may need confirmation
     low    — weak signal; treat as missing for routing purposes

     PRIORITY (blocking)
     ───────────────────
     P0 — bot cannot go live without this field
     P1 — bot is degraded or uses a suboptimal default without it
     P2 — nice-to-have; bot operates normally without it

     PROVENANCE NOTE: inferred and default fields MUST appear in §15.
     They are proposals pending owner approval, never silently applied.
═══════════════════════════════════════════════════════════════════ -->

# Tenant Master Specification
## {{TRADE_NAME}}

**Generated:** {{GENERATED_DATE}}  
**Status:** `{{STATUS}}`  
**Session:** {{SESSION_ID}}

---

## §1 Tenant Identity
**Status:** `{{s1_status}}` | **Completeness:** {{s1_filled}}/7 fields

| Field | Value | Source | Confidence | Priority | Evidence / Notes |
|-------|-------|--------|------------|----------|-----------------|
| Legal business name | {{legal_name}} | {{legal_name_src}} | {{legal_name_conf}} | P0 | {{legal_name_ev}} |
| Brand / trade name | {{trade_name}} | {{trade_name_src}} | {{trade_name_conf}} | P0 | {{trade_name_ev}} |
| Business category | {{category}} | {{category_src}} | {{category_conf}} | P0 | {{category_ev}} |
| Locations served | {{locations_served}} | {{locations_served_src}} | {{locations_served_conf}} | P1 | {{locations_served_ev}} |
| Customer languages | {{languages}} | {{languages_src}} | {{languages_conf}} | P0 | {{languages_ev}} |
| Owner WhatsApp | {{owner_whatsapp}} | {{owner_whatsapp_src}} | {{owner_whatsapp_conf}} | P0 | {{owner_whatsapp_ev}} |
| Owner email | {{owner_email}} | {{owner_email_src}} | {{owner_email_conf}} | P1 | {{owner_email_ev}} |

---

## §2 Business Model
**Status:** `{{s2_status}}` | **Completeness:** {{s2_filled}}/5 fields

| Field | Value | Source | Confidence | Priority | Evidence / Notes |
|-------|-------|--------|------------|----------|-----------------|
| What you sell | {{what_they_sell}} | {{what_they_sell_src}} | {{what_they_sell_conf}} | P0 | {{what_they_sell_ev}} |
| Order pathway | {{how_they_sell}} | {{how_they_sell_src}} | {{how_they_sell_conf}} | P1 | {{how_they_sell_ev}} |
| Typical customer | {{typical_customer}} | {{typical_customer_src}} | {{typical_customer_conf}} | P1 | {{typical_customer_ev}} |
| Average order value | {{avg_order_value}} | {{avg_order_value_src}} | {{avg_order_value_conf}} | P2 | {{avg_order_value_ev}} |
| Seasonality | {{seasonality}} | {{seasonality_src}} | {{seasonality_conf}} | P2 | {{seasonality_ev}} |

---

## §3 Catalogue
**Status:** `{{s3_status}}` | **Completeness:** {{s3_filled}}/3 fields

| Field | Value | Source | Confidence | Priority | Evidence / Notes |
|-------|-------|--------|------------|----------|-----------------|
| Products / services | {{catalogue_overview}} | {{catalogue_overview_src}} | {{catalogue_overview_conf}} | P0 | {{catalogue_overview_ev}} |
| Pricing disclosure rule | {{pricing_disclosure}} | {{pricing_disclosure_src}} | {{pricing_disclosure_conf}} | P0 | {{pricing_disclosure_ev}} |
| Pricing disclaimer text | {{pricing_disclaimer}} | {{pricing_disclaimer_src}} | {{pricing_disclaimer_conf}} | P1 | {{pricing_disclaimer_ev}} |

---

## §4 Policies
**Status:** `{{s4_status}}` | **Completeness:** {{s4_filled}}/9 fields

| Field | Value | Source | Confidence | Priority | Evidence / Notes |
|-------|-------|--------|------------|----------|-----------------|
| Delivery coverage | {{delivery_areas}} | {{delivery_areas_src}} | {{delivery_areas_conf}} | P0 | {{delivery_areas_ev}} |
| Delivery lead time | {{delivery_lead_time}} | {{delivery_lead_time_src}} | {{delivery_lead_time_conf}} | P0 | {{delivery_lead_time_ev}} |
| Delivery charges | {{delivery_charges}} | {{delivery_charges_src}} | {{delivery_charges_conf}} | P1 | {{delivery_charges_ev}} |
| Payment methods | {{payment_methods}} | {{payment_methods_src}} | {{payment_methods_conf}} | P0 | {{payment_methods_ev}} |
| COD available | {{cod_available}} | {{cod_available_src}} | {{cod_available_conf}} | P0 | {{cod_available_ev}} |
| Advance / token | {{advance_payment}} | {{advance_payment_src}} | {{advance_payment_conf}} | P1 | {{advance_payment_ev}} |
| Return and refund | {{return_policy}} | {{return_policy_src}} | {{return_policy_conf}} | P0 | {{return_policy_ev}} |
| Warranty | {{warranty}} | {{warranty_src}} | {{warranty_conf}} | P1 | {{warranty_ev}} |
| Cancellation | {{cancellation_policy}} | {{cancellation_policy_src}} | {{cancellation_policy_conf}} | P1 | {{cancellation_policy_ev}} |

---

## §5 Knowledge Base
**Status:** `{{s5_status}}` | **Completeness:** {{s5_filled}}/1 fields

**Raw Q&A Input:**
```
{{faq_raw}}
```

Source: {{faq_raw_src}} | Confidence: {{faq_raw_conf}} | Priority: P1

<!-- AI Coach parses faq_raw into structured faq_pairs during ingest.
     Parsed pairs appear in the compiled JSON under knowledge_base.faq_pairs[].
     Each pair carries the intents it serves (AI Coach assigns these). -->

---

## §6 Scope of Conversation
**Status:** `{{s6_status}}` | **Completeness:** {{s6_filled}}/2 fields

| Field | Value | Source | Confidence | Priority | Evidence / Notes |
|-------|-------|--------|------------|----------|-----------------|
| Bot handles independently | {{bot_handles}} | {{bot_handles_src}} | {{bot_handles_conf}} | P0 | {{bot_handles_ev}} |
| Always escalates to human | {{bot_does_not_handle}} | {{bot_does_not_handle_src}} | {{bot_does_not_handle_conf}} | P0 | {{bot_does_not_handle_ev}} |

---

## §7 Guardrails
**Status:** `{{s7_status}}` | **Completeness:** {{s7_filled}}/5 fields

| Field | Value | Source | Confidence | Priority | Evidence / Notes |
|-------|-------|--------|------------|----------|-----------------|
| Never-say list | {{never_say}} | {{never_say_src}} | {{never_say_conf}} | P0 | {{never_say_ev}} |
| Force-escalate topics | {{escalation_topics}} | {{escalation_topics_src}} | {{escalation_topics_conf}} | P0 | {{escalation_topics_ev}} |
| Competitor mention policy | {{competitor_policy}} | {{competitor_policy_src}} | {{competitor_policy_conf}} | P1 | {{competitor_policy_ev}} |
| PII collection policy | {{pii_policy}} | {{pii_policy_src}} | {{pii_policy_conf}} | P0 | {{pii_policy_ev}} |
| Regulatory constraints | {{regulatory_constraints}} | {{regulatory_constraints_src}} | {{regulatory_constraints_conf}} | P1 | {{regulatory_constraints_ev}} |

<!-- GUARDRAIL CHANGES REQUIRE EXPLICIT CONFIRMATION. They cannot be
     bundled into a batch approval with routine content edits (see AI_COACH_INGEST.md §4.3). -->

---

## §8 Voice
**Status:** `{{s8_status}}` | **Completeness:** {{s8_filled}}/5 fields

| Field | Value | Source | Confidence | Priority | Evidence / Notes |
|-------|-------|--------|------------|----------|-----------------|
| Tone and personality | {{tone}} | {{tone_src}} | {{tone_conf}} | P0 | {{tone_ev}} |
| Emoji policy | {{emoji_policy}} | {{emoji_policy_src}} | {{emoji_policy_conf}} | P2 | {{emoji_policy_ev}} |
| Response length ceiling | {{response_length}} | {{response_length_src}} | {{response_length_conf}} | P1 | {{response_length_ev}} |
| Language mix rule | {{language_mix}} | {{language_mix_src}} | {{language_mix_conf}} | P1 | {{language_mix_ev}} |

**Opening Greeting (P0):**
```
{{greeting_message}}
```
Source: {{greeting_message_src}} | Confidence: {{greeting_message_conf}}

---

## §9 Intents and Flows
**Status:** `{{s9_status}}` | **Completeness:** {{s9_filled}}/3 fields

| Field | Value | Source | Confidence | Priority | Evidence / Notes |
|-------|-------|--------|------------|----------|-----------------|
| Activated products | {{activated_products}} | {{activated_products_src}} | {{activated_products_conf}} | P0 | {{activated_products_ev}} |
| Order capture fields | {{order_capture_fields}} | {{order_capture_fields_src}} | {{order_capture_fields_conf}} | P1 | {{order_capture_fields_ev}} |

**Primary Customer Intents (P0):**
```
{{primary_intents}}
```
Source: {{primary_intents_src}} | Confidence: {{primary_intents_conf}}

<!-- AI Coach generates per-product intent-flow configs from primary_intents
     and the activated products list. These flows are proposed to the owner
     as a diff, not applied silently. -->

---

## §10 Escalation
**Status:** `{{s10_status}}` | **Completeness:** {{s10_filled}}/4 fields

| Field | Value | Source | Confidence | Priority | Evidence / Notes |
|-------|-------|--------|------------|----------|-----------------|
| Escalation WhatsApp number | {{escalation_number}} | {{escalation_number_src}} | {{escalation_number_conf}} | P0 | {{escalation_number_ev}} |
| Human availability hours | {{human_hours}} | {{human_hours_src}} | {{human_hours_conf}} | P0 | {{human_hours_ev}} |
| Out-of-hours behaviour | {{out_of_hours}} | {{out_of_hours_src}} | {{out_of_hours_conf}} | P0 | {{out_of_hours_ev}} |
| Escalation response SLA | {{escalation_sla}} | {{escalation_sla_src}} | {{escalation_sla_conf}} | P1 | {{escalation_sla_ev}} |

---

## §11 Integrations
**Status:** `{{s11_status}}` | **Completeness:** {{s11_filled}}/2 fields

| Field | Value | Source | Confidence | Priority | Evidence / Notes |
|-------|-------|--------|------------|----------|-----------------|
| PhonePe payment links | {{phonepe_enabled}} | {{phonepe_enabled_src}} | {{phonepe_enabled_conf}} | P2 | {{phonepe_enabled_ev}} |
| CRM / data destination | {{crm_destination}} | {{crm_destination_src}} | {{crm_destination_conf}} | P2 | {{crm_destination_ev}} |

---

## §12 Media Library
**Status:** `{{s12_status}}` | **Completeness:** {{s12_filled}}/2 fields

| Field | Value | Source | Confidence | Priority | Evidence / Notes |
|-------|-------|--------|------------|----------|-----------------|
| Catalogue / brochure | {{catalogue_doc}} | {{catalogue_doc_src}} | {{catalogue_doc_conf}} | P2 | {{catalogue_doc_ev}} |
| Other shareable documents | {{media_other}} | {{media_other_src}} | {{media_other_conf}} | P2 | {{media_other_ev}} |

<!-- Items marked "upload later" must be listed in §15 Gap Register as P2 gaps. -->

---

## §13 Operating Calendar
**Status:** `{{s13_status}}` | **Completeness:** {{s13_filled}}/3 fields

| Field | Value | Source | Confidence | Priority | Evidence / Notes |
|-------|-------|--------|------------|----------|-----------------|
| Business hours | {{business_hours}} | {{business_hours_src}} | {{business_hours_conf}} | P0 | {{business_hours_ev}} |
| Closures / holidays | {{holidays}} | {{holidays_src}} | {{holidays_conf}} | P1 | {{holidays_ev}} |
| Timezone | Asia/Kolkata | default | high | — | Auto-set |

---

## §14 Success Criteria
**Status:** `{{s14_status}}` | **Completeness:** {{s14_filled}}/1 fields

**90-Day Goals (P2):**
```
{{success_goals}}
```
Source: {{success_goals_src}} | Confidence: {{success_goals_conf}}

---

## §15 Gap and Confidence Register

> **This is the AI Coach's active worklist.** Every field not at `stated` + `high` confidence
> appears here. The coach works through this list in priority order before going live.

**Summary:** {{gap_total}} gaps (P0: {{gap_p0}}, P1: {{gap_p1}}, P2: {{gap_p2}})

| # | Field | Section | Priority | Current Source | Confidence | What's Missing | Business Impact |
|---|-------|---------|----------|---------------|------------|----------------|-----------------|
{{GAP_ROWS}}

<!-- AI Coach must resolve all P0 entries before marking the spec as go-live ready.
     P1 entries produce degraded-mode warnings in the coaching interface.
     P2 entries are surfaced as optional improvements, never blockers. -->

---

*Generated by Alphabot Tenant Intake · Session {{SESSION_ID}} · Spec v1.0*
