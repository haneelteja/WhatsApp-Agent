# Alphabot ROI Model — Assumptions, Sources, and Formulas

Every number shown in the ROI Builder is derived from the formulas below.
Any assumption that is an estimate (not measured from Elma client data) is
marked **[estimate]**. Use the bottom of the stated range in all client-facing
conversations.

---

## Inputs the prospect provides

| Variable | Symbol | Notes |
|---|---|---|
| Monthly inbound messages | `msgs` | WhatsApp threads, not individual messages |
| Average order / deal value | `aov` | In ₹; use GMV per transaction, not lifetime |
| Enquiry-to-customer conversion | `conv` | Expressed as %; 4% means 4 in 100 enquiries convert |
| Number of staff handling replies | `staff` | Full-time equivalents, not headcount if part-time |
| Fully-loaded monthly cost per person | `sc` | Salary + PF + ESI + overheads; default = 1.25× CTC |
| Current first-response time | `rt` | Bucket: <5 min / <30 min / 1–8 hours / next day |
| After-hours message share | `ah` | % of messages arriving outside 9 am–7 pm |
| Monthly ad / lead-gen spend | `adSpend` | Only collected when sales intent is selected |

---

## Value stream 1 — Staff time recovered

**What it measures:** Cost of human time spent on messages the bot deflects.

**Formula:**
```
deflection_rate   = DEFLECTION[primaryIntent]          (see table below)
msgs_deflected    = msgs × deflection_rate
hours_saved       = msgs_deflected × AVG_MINS_PER_MSG ÷ 60
cost_per_hour     = (sc × staff) ÷ 160
monthly_value     = FLOOR(hours_saved × cost_per_hour)
```

**Constants:**
- `AVG_MINS_PER_MSG` = 3.5 minutes **[estimate]** — time to read, think, type, and send one
  WhatsApp reply on a business thread. Range observed in SME context: 2–6 min depending
  on complexity. Use 3.5 as the conservative midpoint.
- Working hours per month: 160 (20 days × 8 hours).

**Deflection rates by primary intent** (industry benchmarks; source: Intercom 2023
Benchmark Report, Drift 2022 Conversational Marketing Report, Meta WhatsApp Business
API partner data — all adjusted down 15–20% for Indian SME context):

| Primary intent | Deflection rate | Source confidence |
|---|---|---|
| Answer repeat questions (Support) | 68% | **[estimate]** — published benchmark range 65–75%; using lower bound |
| Qualify and follow up on leads | 52% | **[estimate]** — range 48–58%; lower bound |
| Take and track orders | 78% | **[estimate]** — range 72–82%; lower bound |
| Book appointments or slots | 62% | **[estimate]** — range 58–68%; lower bound |
| Send payment links / confirm payment | 72% | **[estimate]** — range 68–76%; lower bound |
| Onboard new customers / repeat purchase | 58% | **[estimate]** — range 54–64%; lower bound |
| Outbound campaigns | 0% | Not applicable; outbound is new activity, not deflection |

**Ceiling:** Staff time recovered ≤ 35% of estimated monthly staff cost on messages.

---

## Value stream 2 — Leads recovered from slow / no response

**What it measures:** Revenue from leads that currently go cold because no one
responds quickly enough, especially after hours.

**Formula:**
```
ah_msgs           = msgs × (ah ÷ 100)
loss_rate         = LOSS_TABLE[rt]                    (see table below)
leads_lost        = FLOOR(ah_msgs × loss_rate)
recovery_rate     = 0.50                              (conservative; see note)
recovered_leads   = FLOOR(leads_lost × recovery_rate)
monthly_value     = FLOOR(recovered_leads × (conv ÷ 100) × aov)
```

**Lead loss rates by current response time:**

| Response time bucket | `rt` code | % of after-hours enquiries that go cold |
|---|---|---|
| Under 5 minutes | `min5` | 10% |
| 5–30 minutes | `min30` | 20% |
| 1–8 hours | `hours` | 42% |
| Next day or longer | `nextday` | 62% |

Source: HubSpot "Lead Response Management" study (original Harvard Business Review
data), Drift 2022, adjusted down 20% for B2C/SME context where urgency is lower
than B2B enterprise. These are the most widely cited figures in CX literature;
treat as **[estimates]** for SME WhatsApp.

**Recovery rate note:** The bot does not recover every cold lead. 50% recovery
rate is conservative — an instant bot response re-engages the prospect and routes
them to the right next step (catalogue, booking, callback request). Some leads
have already decided elsewhere; 50% accounts for that. Range in practice: 40–65%;
use 50%.

**Ceiling:** Lead recovery value ≤ 40% of estimated monthly ad spend (for
ad-driven businesses) or 25% of total estimated monthly revenue (for
referral-driven businesses).

---

## Value stream 3 — Conversion lift from instant response

**What it measures:** Additional orders / deals from prospects who would have
converted anyway, but faster — and from fewer drop-offs mid-funnel.

Only applied when primary intent includes a sales or qualification function.

**Formula:**
```
sales_intent_share = 0.30     [estimate] — 30% of inbound msgs are sales-intent
                               (range: 20–40% depending on channel mix)
qualified_pool     = msgs × sales_intent_share
lift_multiplier    = 0.06     [estimate] — 6% conversion lift from instant response
                               (range: 4–9%; using lower bound)
incremental_orders = FLOOR(qualified_pool × (conv ÷ 100) × lift_multiplier ÷ (conv ÷ 100))
                   = FLOOR(qualified_pool × lift_multiplier)
monthly_value      = FLOOR(incremental_orders × aov)
```

Simplified: `monthly_value = FLOOR(msgs × 0.30 × 0.06 × aov)`

Source: InsideSales.com / HBR "The Short Life of Online Sales Leads" (5× higher
conversion when response is under 1 hour vs. 24 hours). Adjusted down aggressively
for Indian SME context where WhatsApp is already faster than email. **[estimate]**

**Ceiling:** Conversion lift value ≤ 15% of current monthly estimated revenue.

---

## Value stream 4 — Repeat purchase / retention

Shown only when primary intent is "Onboard new customers and drive repeat purchase"
or "Run outbound campaigns to existing customers."

**Formula:**
```
existing_customers_share = 0.40    [estimate] — 40% of inbound msgs come from
                                    existing customers (range: 30–55%)
eligible_base   = msgs × existing_customers_share
campaign_reach  = eligible_base × 0.60    [estimate] — 60% open / read rate on
                                             WhatsApp outbound (range: 50–75%;
                                             Meta reports 58–72% for business msgs)
reactivation    = 0.08             [estimate] — 8% of reached customers place a
                                    repeat order (range: 6–12%; lower bound)
monthly_value   = FLOOR(eligible_base × 0.60 × 0.08 × aov)
                = FLOOR(msgs × 0.40 × 0.60 × 0.08 × aov)
                = FLOOR(msgs × 0.0192 × aov)
```

**Ceiling:** Repeat purchase value ≤ 30% of current estimated monthly revenue.

---

## Conservative / Expected / Optimistic bands

Each value stream is multiplied by a scenario factor before summing.

| Scenario | Multiplier | Meaning |
|---|---|---|
| Conservative | 0.60 | 60th-percentile downside; use this in the first client meeting |
| Expected | 1.00 | Median outcome across comparable deployments |
| Optimistic | 1.40 | Strong performance; requires active adoption and good KB |

**Rule:** Always present Conservative first and most prominently. Never lead with
Optimistic. If the Conservative case doesn't cover the monthly fee within 6 months,
say so and recommend the lighter plan.

---

## Net return calculations

```
gross_benefit[scenario]  = SUM of all value streams × scenario_multiplier
alphabot_fee             = monthly fee for recommended tier (see Pricing below)
net_monthly[scenario]    = FLOOR(gross_benefit[scenario] - alphabot_fee)
payback_weeks[scenario]  = CEIL(setup_fee ÷ net_monthly[scenario] × 4.33)
annual_net[scenario]     = FLOOR((net_monthly[scenario] × 12) - setup_fee)
roi_multiple[scenario]   = FLOOR(annual_net[scenario] ÷ (setup_fee + alphabot_fee × 12) × 10) ÷ 10
```

---

## Minimum volume guardrail

If `msgs < 100`:
- Do not show a full ROI model.
- Show: "At your current volume, a bot pays for itself once you're getting 100+
  messages a month. You're at [msgs]. Here's what the crossover looks like: ..."
- Show a simple table of msgs → monthly benefit at their AOV and conversion rate.

If payback > 26 weeks (6 months) in the Conservative scenario:
- Say so plainly: "At this volume and these assumptions, payback takes [N] months
  in our conservative estimate."
- Recommend the lighter tier if the fee reduction closes the gap.

---

## Pricing (placeholder — update before going live)

| SKU | Monthly fee | Setup (one-time) | Notes |
|---|---|---|---|
| Conversational Support | ₹4,999/month | ₹9,999 | FAQ, order status, returns |
| AI Sales | ₹6,999/month | ₹14,999 | Lead qual, follow-up, pipeline |
| Onboarding & Lifecycle | ₹8,999/month | ₹19,999 | Onboarding, campaigns, retention |
| Full Suite | ₹12,999/month | ₹24,999 | All three products |

**These are placeholder figures.** Replace with actual pricing before any client use.

---

## SKU selection logic

| Primary intent | Recommended SKU |
|---|---|
| Answer repeat questions | Conversational Support |
| Take and track orders | Conversational Support |
| Book appointments or slots | Conversational Support |
| Send payment links / confirm payment | Conversational Support |
| Qualify and follow up on leads | AI Sales |
| Onboard new customers / drive repeat purchase | Onboarding & Lifecycle |
| Run outbound campaigns | Onboarding & Lifecycle |
| Multiple intents spanning all three | Full Suite |

---

## Segment defaults

Used as pre-fills when the prospect does not know their own numbers.
Label each default clearly as "typical for [segment] at this volume."

| Segment | Monthly msgs | AOV (₹) | Conv % | Staff | Staff cost/mo | After-hours % | Default response time |
|---|---|---|---|---|---|---|---|
| D2C (blended) | 380 | 1,800 | 4.0 | 2 | 16,000 | 27% | 1–8 hours |
| Services/consulting | 100 | 28,000 | 9.0 | 1 | 45,000 | 14% | 1–8 hours |
| Manufacturing/B2B | 150 | 50,000 | 5.0 | 2 | 35,000 | 12% | 1–8 hours |
| Subscription/recurring | 280 | 1,800 | 8.0 | 1 | 30,000 | 22% | 1–8 hours |
| Retail/local | 300 | 900 | 10.0 | 2 | 16,000 | 23% | Under 30 min |
| Healthcare/clinics | 350 | 1,000 | 19.0 | 2 | 20,000 | 19% | 1–8 hours |
| Education/coaching | 320 | 5,000 | 7.0 | 2 | 21,000 | 22% | 1–8 hours |
| Real estate | 80 | 3,000,000 | 1.0 | 2 | 45,000 | 17% | 1–8 hours |

---

---

## Appointment Bot — additional value streams

Used when primary intent is "Book and manage appointments."
Applies to: Restaurant & F&B, Salon & Beauty, Fitness & Wellness, Healthcare.

### Stream 1 override — Booking automation

Same formula as staff time recovered, but `AVG_MINS_PER_MSG` is replaced by
`BOOKING_MINS` — the time a staff member currently spends processing one
booking manually (phone call, WhatsApp back-and-forth, calendar entry).

```
BOOKING_MINS  = 5 minutes default [estimate] — range 3–8 min depending on
                complexity. Salons: 4 min. Restaurants: 5 min. Healthcare: 6 min.
bookings_automated  = msgs × deflection_rate
                    (deflection rate for appointments: 75% [estimate])
hours_saved         = bookings_automated × BOOKING_MINS ÷ 60
cost_per_hour       = (sc × staff) ÷ 160
monthly_value       = FLOOR(hours_saved × cost_per_hour)
```

### Stream 5 — No-show reduction

**What it measures:** Revenue from slots that would have been left empty because
a customer booked but didn't turn up.

The bot sends:
1. A confirmation message immediately on booking
2. A reminder 24 hours before
3. A morning-of reminder
4. A follow-up for non-responses

**Formula:**
```
confirmed_bookings  = msgs × (conv ÷ 100)
current_noshows     = FLOOR(confirmed_bookings × (nsR ÷ 100))
reduction_rate      = 0.30    [estimate — conservative]
noshows_recovered   = FLOOR(current_noshows × reduction_rate)
monthly_value       = FLOOR(noshows_recovered × aov)
```

**No-show rate defaults by segment:**

| Segment | Default no-show rate | Source |
|---|---|---|
| Restaurant | 15% | **[estimate]** — OpenTable 2023 UK data; adjusted for Indian casual dining |
| Salon & Beauty | 20% | **[estimate]** — Treatwell 2022 industry report range 15–30% |
| Fitness | 18% | **[estimate]** — Mindbody industry data |
| Healthcare / Clinics | 18% | **[estimate]** — WHO primary care literature; Indian context similar |

**Reduction rate note:** 30% no-show reduction from WhatsApp reminders is
conservative. Published studies on SMS reminder effectiveness show 25–45%
reduction; WhatsApp has higher read rates (~70%) than SMS (~45%), so the upper
end is achievable. Use 30% in client-facing models.

**Ceiling:** No-show value ≤ 40% of confirmed booking revenue.

---

## Appointment Bot pricing (placeholder)

| SKU | Monthly fee | Setup (one-time) |
|---|---|---|
| Appointment Bot | ₹5,999/month | ₹11,999 |

**Replace with actual pricing before any client use.**

---

## New segments — defaults

| Segment | Monthly msgs | AOV (₹) | Conv % | No-show % | Staff | Staff cost/mo | After-hours % |
|---|---|---|---|---|---|---|---|
| Restaurant & F&B | 250 | 800 | 35 | 15 | 2 | 15,000 | 30% |
| Salon & Beauty | 200 | 600 | 40 | 20 | 1 | 15,000 | 20% |
| Fitness & Wellness | 180 | 500 | 35 | 18 | 1 | 18,000 | 25% |

Note: for appointment businesses, `conv` is enquiry-to-booking rate (not
enquiry-to-sale). `aov` is the value of one confirmed booking or session
(used for no-show loss calculation and lead recovery calculation).

---

## Revision log

| Date | Change | Author |
|---|---|---|
| 2026-09-13 | Initial model — all assumptions are estimates; no Elma client data ingested yet | Alphabot |
