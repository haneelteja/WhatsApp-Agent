# Alphabot Bot Advisor — Logic Reference

This document records the complete question set, scoring model, and pre-written result copy
used in the Bot Advisor HTML page. Port this logic into the WhatsApp bot without re-deriving it.

---

## Question Set

| # | Label | Question text |
|---|-------|---------------|
| Q1 | Your business | What kind of business are you running? |
| Q2 | Customer channel | Where do most customer conversations happen today? |
| Q3 | Biggest bottleneck | What's the biggest bottleneck right now? |
| Q4 | Monthly volume | How many customer enquiries do you get a month? |
| Q5 | Your team | Who handles customer replies today? |

---

## Scoring Table

Each row shows: **answer option → score additions**.
Points are cumulative across all 5 questions. Highest total wins.
**Tie-break: Conversational Support Bot always wins ties.**

### Q1 — Business type

| Option | Support | Sales | Lifecycle |
|--------|---------|-------|-----------|
| D2C / online store | +3 | — | +1 |
| Services or consulting | — | +3 | +2 |
| Manufacturing or B2B supply | +2 | +3 | — |
| Subscription or recurring orders | — | — | +4 |
| Retail or local storefront | +2 | — | — |

### Q2 — Customer channel

| Option | Support | Sales | Lifecycle |
|--------|---------|-------|-----------|
| WhatsApp | +2 | — | — |
| Phone calls | +2 | — | — |
| Instagram or Facebook DMs | — | +3 | — |
| Website or email | — | +2 | — |
| Walk-ins | +1 | — | — |

### Q3 — Biggest bottleneck

| Option | Support | Sales | Lifecycle |
|--------|---------|-------|-----------|
| Same questions asked over and over | +5 | — | — |
| Leads come in but don't get followed up | — | +5 | — |
| New customers need hand-holding to get started | — | — | +5 |
| Customers buy once and vanish | — | — | +5 |
| Nobody's free to reply at all | +3 | +2 | — |

### Q4 — Monthly volume

| Option | Support | Sales | Lifecycle | Special |
|--------|---------|-------|-----------|---------|
| **Under 100** | — | — | — | **Honest-fit gate — skip scoring, show alternative result** |
| 100–500 | — | +2 | — | |
| 500–2,000 | +2 | +2 | +1 | |
| 2,000+ | +3 | — | +2 | |

### Q5 — Team

| Option | Support | Sales | Lifecycle |
|--------|---------|-------|-----------|
| Just me | +1 | +1 | — |
| One or two people | +1 | — | — |
| A small team | — | +1 | +1 |
| Nobody consistently | +2 | +1 | — |

---

## Volume Gate (Under 100)

If Q4 = "Under 100", **do not compute a winner**. Show the honest-fit result instead:

> "For fewer than 100 enquiries a month, you'd spend more setting up a bot than you'd
> save in the first few months. That's not where we want to start a relationship."
>
> **Threshold:** ~150 enquiries/month is where a WhatsApp bot starts to pay for itself.

Still offer the demo link. Do not force a product recommendation.

---

## Products

| Key | Product name | Core job |
|-----|-------------|----------|
| `support` | Conversational Support Bot | Answers repeat customer questions, escalates to a human when needed |
| `sales` | AI Sales Bot | Qualifies inbound leads, nurtures them, pushes to conversion |
| `lifecycle` | Onboarding & Lifecycle Bot | Activates new customers, then drives retention and repeat purchase |

**Accent colours** (use in UI, one per product):
- Support → `#22C35E` (WhatsApp green)
- Sales → `#C99820` (gold)
- Lifecycle → `#6FE078` (bright green)

---

## Result Copy

### One-liner reason (keyed on winner × Q1 index 0–4)

#### Support Bot

| Q1 | Reason |
|----|--------|
| D2C | "For your online store, the biggest time-save is answering 'where's my order', COD confirmations, and return queries automatically — without anyone on your team lifting a finger." |
| Services | "For your service business, getting customers an instant reply — even at midnight — keeps them from calling the next name on their list." |
| Manufacturing | "For your B2B operation, responding to order-status checks and rate-card queries instantly removes friction from every distributor relationship." |
| Subscription | "For your subscription business, handling billing and account queries automatically means your team can focus on growth, not the support queue." |
| Retail | "For your retail store, answering stock, timing, and directions queries around the clock means more customers walk in rather than walk past." |

#### Sales Bot

| Q1 | Reason |
|----|--------|
| D2C | "For your online store, every lead that doesn't hear back within the hour is probably buying from someone else. The Sales Bot fixes that automatically." |
| Services | "For your service business, the biggest revenue leak is enquiries that go quiet. A bot that qualifies and follows up instantly — before they cool off — closes that gap." |
| Manufacturing | "For your B2B operation, distributor and bulk enquiries need fast qualification and structured follow-up. That's exactly what the Sales Bot handles." |
| Subscription | "For your subscription business, trial users and warm leads need timely nudges to convert. The Sales Bot tracks and follows up without any manual effort." |
| Retail | "For your retail store, every customer who messages you is a potential sale. The Sales Bot makes sure none of them go unanswered." |

#### Lifecycle Bot

| Q1 | Reason |
|----|--------|
| D2C | "For your online store, a second or third order from an existing buyer costs a fraction of acquiring a new one. The Lifecycle Bot automates the entire retention loop." |
| Services | "For your service business, a structured onboarding experience and timely check-ins turn first-time clients into long-term retainers." |
| Manufacturing | "For your B2B operation, automated repeat-order reminders and distributor touchpoints keep every relationship warm — without any manual follow-up." |
| Subscription | "For your subscription business, the difference between a churned subscriber and a loyal one is often a single well-timed message. The Lifecycle Bot sends it." |
| Retail | "For your retail store, your best customers are the ones who've already bought. The Lifecycle Bot brings them back with reminders, offers, and loyalty rewards." |

---

### Use-case bank (winner × Q1 — 5 items each)

#### Support Bot

**D2C:**
1. Answers 'where's my order?' without anyone touching the phone
2. Handles COD confirmation and rescheduling automatically
3. Replies to size, shade, and compatibility questions 24/7
4. Processes return and exchange requests before they become refund demands
5. Escalates complaints to a human before the situation blows up

**Services:**
1. Answers pricing and availability questions at any hour
2. Sends intake forms automatically when a prospect asks 'how do I start?'
3. Handles 'can you do X?' queries without eating your calendar
4. Covers client questions while you're in a meeting or on-site
5. Escalates unhappy clients before they go quiet and churn

**Manufacturing/B2B:**
1. Responds to order-status and delivery queries instantly
2. Handles MOQ, rate-card, and spec queries without a phone call
3. Routes technical questions to the right person on your team
4. Covers distributor enquiries while your team is on the factory floor
5. Sends payment reminders and invoice copies automatically

**Subscription:**
1. Handles 'how do I pause, change, or cancel?' without losing the subscriber
2. Answers billing and invoice queries automatically
3. Escalates dissatisfied subscribers before they churn
4. Covers queries at every hour, not just 9 to 6
5. Sends account-status updates without manual effort

**Retail:**
1. Answers stock and pricing questions without a call or walk-in
2. Handles store timings, directions, and parking automatically
3. Responds to WhatsApp broadcast replies at scale
4. Covers evenings and Sundays without extra staff
5. Escalates complaints before they reach Google Reviews

#### Sales Bot

**D2C:**
1. Qualifies visitors who are browsing vs. those who are ready to buy
2. Follows up with enquiries that went quiet after the first message
3. Runs time-limited offer campaigns over WhatsApp
4. Captures leads from Instagram comments and moves them to a DM conversation
5. Re-engages cold leads with an automated follow-up sequence

**Services:**
1. Qualifies every inbound lead before it reaches your calendar
2. Responds within seconds — before the prospect moves on
3. Sends your portfolio, case studies, or brochures automatically
4. Books discovery calls without the back-and-forth
5. Re-engages warm leads who went quiet after receiving a quote

**Manufacturing/B2B:**
1. Qualifies distributor and bulk-order enquiries before your team calls
2. Follows up on trade-fair and exhibition leads automatically
3. Sends product catalogues and price lists on demand
4. Nurtures long-cycle B2B deals with scheduled touchpoints
5. Re-engages dormant accounts with a seasonal check-in

**Subscription:**
1. Converts free-trial users who haven't upgraded yet
2. Runs upsell campaigns at the right moment in the customer journey
3. Follows up on lapsed subscribers with a win-back offer
4. Routes high-value enterprise leads to your sales team instantly

**Retail:**
1. Captures walk-in enquirers as WhatsApp prospects before they leave
2. Runs flash-sale notifications to opted-in customers
3. Follows up with customers who enquired but didn't purchase
4. Converts social-media DMs into WhatsApp sales conversations

#### Lifecycle Bot

**D2C:**
1. Sends order confirmation and delivery updates automatically
2. Walks new buyers through how to get the best from their purchase
3. Triggers a replenishment reminder before they run out
4. Sends a loyalty reward at the third and fifth order
5. Re-engages customers 60 days after their last purchase with a personalised offer

**Services:**
1. Sends onboarding checklists to new clients without typing them each time
2. Checks in at day 7, day 30, and day 90 after sign-up
3. Triggers a renewal reminder before a retainer or contract lapses
4. Asks for a testimonial or referral once the project wraps

**Manufacturing/B2B:**
1. Sends payment reminders before due dates, not after
2. Follows up on repeat-order cycles automatically
3. Notifies distributors of new stock arrivals or price changes
4. Reactivates dormant accounts with a seasonal check-in message

**Subscription:**
1. Onboards new subscribers step by step over the first two weeks
2. Triggers intervention messages when usage drops below a threshold
3. Sends renewal reminders 7, 3, and 1 day before expiry
4. Runs a win-back sequence automatically after cancellation

**Retail:**
1. Follows up with customers two weeks after a purchase to check in
2. Sends birthday and anniversary offers automatically
3. Re-engages customers who haven't visited in 90 days
4. Runs a referral campaign to your existing buyers

---

### Realistic impact (winner × Q4 volume band)

| Product | 100–500/mo | 500–2,000/mo | 2,000+/mo |
|---------|-----------|--------------|-----------|
| Support | "Saves your team roughly 4–10 hours a week on repeat queries — that's your first weekend back." | "Handles 60–80% of questions automatically — 10–25 hours saved per week, response times under 60 seconds." | "Deflects 70–85% of inbound volume, the equivalent of 1–2 full-time support agents at a fraction of the cost." |
| Sales | "Follows up 80–200 leads a month without any manual effort. No lead goes uncontacted again." | "Qualifies and nurtures 400–1,600 leads a month. Conversion rates typically lift 20–40% from faster first response alone." | "Closes the follow-up gap on over 1,600 leads a month. At this volume, speed-to-lead is the single biggest revenue lever — and it's now automatic." |
| Lifecycle | "Runs 100–500 automated customer touchpoints a month. Repeat purchase rates typically lift 15–25% within 90 days." | "Drives 15–30% more repeat purchases through automated retention — no added headcount required." | "At this volume, a 10% lift in repeat-purchase rate is material revenue. The Lifecycle Bot runs that lift automatically, at scale." |

---

### Runner-up trigger text (winner → runner-up)

| Pair | Trigger copy |
|------|-------------|
| Support → Sales | "The AI Sales Bot is the natural next step. Add it when lead volume grows faster than your team can qualify them — usually around the 300/month mark." |
| Support → Lifecycle | "Once support is on autopilot, the Lifecycle Bot turns one-time buyers into repeat customers. Most businesses add it within 3–6 months." |
| Sales → Support | "As lead volume grows, so does the support queue. Add the Conversational Support Bot when your team starts spending more than an hour a day on repeat questions." |
| Sales → Lifecycle | "After the top of the funnel is working, the Lifecycle Bot keeps those customers coming back. Most add it 3–6 months after launching the Sales Bot." |
| Lifecycle → Support | "Customer questions scale with your customer base. Add the Conversational Support Bot when repeat queries start eating into your team's time." |
| Lifecycle → Sales | "Good retention is half the equation. The AI Sales Bot handles new-customer acquisition. Add it once you're confident the onboarding flow is solid." |

---

## WhatsApp Bot Porting Notes

When porting this flow into the WhatsApp bot:

1. **State storage**: Store `step`, `scores`, `q1_idx`, `vol_idx` in the conversation session. The bot needs to accumulate answers across 5 turns.

2. **Back navigation**: In WhatsApp, implement back via a keyword (e.g., "back" or "←"). On each back, subtract the score contribution from the previous step and re-send that question.

3. **Volume gate**: After Q4, check `vol_idx === 0` before proceeding. If true, send the honest-fit message immediately without asking Q5.

4. **Winner calculation**: Sum scores after Q5, pick highest. Tie → support.

5. **Result delivery**: Split into 3 WhatsApp messages to avoid walls of text:
   - Message 1: Product name + one-liner reason
   - Message 2: Use-case list (5 items as numbered bullets) + impact line
   - Message 3: Runner-up blurb + CTA with demo link

6. **Demo link**: `https://wa.me/{DEMO_NUMBER}?text=Hi+I'd+like+to+see+the+Alphabot+demo`

7. **Honest-fit flow**: After the honest-fit message, offer the demo link with a single tap/reply option.
