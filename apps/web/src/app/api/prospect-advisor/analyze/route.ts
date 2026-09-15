import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const SYSTEM_PROMPT = `You are Alphabot's AI sales advisor. Analyse a business's profile and generate a precise, deeply personalised bot recommendation with ROI estimates and rich use cases.

Alphabot is a WhatsApp AI Agent Suite with 4 bots:
1. Support Bot (₹4,999/mo) — 24/7 automated query handling using a knowledge base. Best for: any business with high inbound support volume, after-hours coverage, FAQ automation.
2. Appointment Bot (₹5,999/mo) — Automated booking flows, no-show reminders, rescheduling. Best for: restaurants, salons, fitness studios, healthcare clinics, any service booking business.
3. Sales Bot (₹6,999/mo) — Lead qualification, product catalogue, conversion push, campaign follow-up. Best for: D2C, real estate, edtech, any business with high lead volume.
4. Lifecycle Bot (₹8,999/mo) — Re-engagement campaigns, retention sequences, win-back flows, post-sale nurture. Best for: D2C brands, subscription businesses, BFSI, any business with churn risk.

ROI estimation guidelines:
- Average Indian WhatsApp support agent costs ₹18,000–25,000/month
- Bot automation rate: 70–80% of daily messages
- Each missed restaurant/salon booking: ₹800–2,500 revenue loss
- Lead conversion improvement with bot: 20–40% vs manual
- No-show reduction with automated reminders: 40–60%
- After-hours query capture: 30–40% of total daily volume
- Salon appointment: ₹500–2,000 per slot; fitness class: ₹300–800 per session
- D2C average order value: ₹800–3,000; cart recovery rate: 15–25%
- Real estate lead: ₹50,000–2,00,000 lifetime value; qualification saves 3–4hr/lead

Return ONLY a valid JSON object (no markdown, no code fences, no explanation outside the JSON):
{
  "recommended_bot": "support|sales|lifecycle|appointments",
  "recommended_name": "string (full bot name)",
  "recommended_price": "₹X,XXX/mo",
  "confidence": "high|medium",
  "recommendation_reason": "2-3 sentences specific to their business, industry, and daily message volume",
  "roi_monthly_savings": <integer in rupees>,
  "roi_payback_period": "<number> weeks",
  "roi_narrative": "1-2 sentences with specific numbers derived from their daily message volume and industry",
  "use_cases": [
    {
      "title": "string — specific to their industry (e.g. 'Automated Table Reservations' not 'Booking Automation')",
      "description": "2-3 sentences describing EXACTLY how the WhatsApp bot handles this scenario: what the customer sends, what the bot does step by step, what happens without staff involvement",
      "impact": "primary quantified outcome with specific numbers (e.g. 'Reduces no-shows by 40–60%; recovers ₹1,200–1,500 per prevented no-show')",
      "metric_a": "short metric label + value (e.g. '2–3 hrs/day saved')",
      "metric_b": "second short metric label + value (e.g. '100% after-hours capture')"
    }
  ],
  "business_impact": "2-3 sentences on how this transforms their specific operation — reference their industry, team size, and daily volume",
  "secondary_bot": "support|sales|lifecycle|appointments",
  "secondary_name": "string",
  "secondary_reason": "1 sentence why they'd also benefit from this second bot within 60-90 days"
}

Rules:
- Provide exactly 5 use_cases
- Every use_case title must be industry-specific (name the actual activity: 'Party Booking Flow', 'Stylist Slot Confirmation', 'Trial Class Enquiry', not generic labels)
- description must describe the actual WhatsApp conversation sequence — mention what the customer says and what the bot does at each step
- impact must include at least two specific numbers (time saved, revenue recovered, or percentage improvement)
- metric_a and metric_b must each be under 30 characters
- Make every field specific to the actual inputs — reference industry, pain points, daily volume, company size
- roi_monthly_savings must be a realistic integer
- recommended_bot and secondary_bot must not be the same value`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { lead } = body;

    if (!lead?.name || !lead?.industry || !lead?.dailyMessages) {
      return NextResponse.json({ error: 'Missing required lead fields' }, { status: 400 });
    }

    const model = process.env['PROSPECT_ADVISOR_MODEL'] ?? process.env['ANTHROPIC_MODEL'] ?? 'claude-haiku-4-5-20251001';
    const apiKey = process.env['ANTHROPIC_API_KEY'];

    if (!apiKey) {
      return NextResponse.json({ error: 'LLM not configured' }, { status: 500 });
    }

    const userMessage = `Business Profile:
- Company: ${lead.company}
- Industry: ${lead.industry}
- Company Size: ${lead.companySize}
- Decision Maker Role: ${lead.role}
- Daily WhatsApp Messages: ${lead.dailyMessages}
- Current WhatsApp Handling: ${lead.currentHandling}
- Biggest Pain Points: ${lead.painPoints?.join(', ') || 'Not specified'}
- Primary Goal: ${lead.primaryGoal}

Generate the recommendation JSON now.`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      }),
      signal: AbortSignal.timeout(45_000),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[prospect-advisor/analyze] Anthropic error:', err);
      return NextResponse.json({ error: 'AI analysis failed' }, { status: 502 });
    }

    const data = await res.json();
    const rawText: string = data?.content?.[0]?.text ?? '';

    // Strip markdown fences if model wraps in ```json
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

    let analysis;
    try {
      analysis = JSON.parse(cleaned);
    } catch {
      console.error('[prospect-advisor/analyze] JSON parse failed. Raw:', rawText.slice(0, 500));
      return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 502 });
    }

    return NextResponse.json({ analysis });
  } catch (err) {
    console.error('[prospect-advisor/analyze] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
