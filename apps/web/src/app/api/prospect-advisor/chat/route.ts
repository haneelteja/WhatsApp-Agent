import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { lead, analysis, messages } = body;

    const apiKey = process.env['ANTHROPIC_API_KEY'];
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'LLM not configured' }), { status: 500 });
    }

    const model = process.env['PROSPECT_ADVISOR_MODEL'] ?? process.env['ANTHROPIC_MODEL'] ?? 'claude-haiku-4-5-20251001';

    const systemPrompt = `You are Alphabot's helpful AI sales advisor, talking directly with a business owner or decision-maker who has just received a personalised bot recommendation.

Context about this business:
- Company: ${lead.company}
- Industry: ${lead.industry}
- Company Size: ${lead.companySize}
- Role: ${lead.role}
- Daily WhatsApp Messages: ${lead.dailyMessages}
- Pain Points: ${lead.painPoints?.join(', ')}
- Primary Goal: ${lead.primaryGoal}

Recommendation already given:
- Recommended Bot: ${analysis.recommended_name} (${analysis.recommended_price})
- Reason: ${analysis.recommendation_reason}
- ROI: ${analysis.roi_narrative}

Your role:
- Answer questions about how Alphabot works, pricing, setup, integrations, and use cases
- Be specific to their industry and business context — never give generic answers
- If they ask about pricing, setup time, or how it works — be concrete and accurate
- Setup time: 48 hours, no engineering required
- Free trial: 14 days, full-featured
- India-native: INR pricing, Easebuzz payments, DPDPA-compliant
- If they want to speak to someone: "I'd be happy to arrange a personalised demo — just share your preferred time and a team member will reach out."
- Keep responses concise and conversational — 2-4 sentences max unless they ask for detail
- Don't be salesy or pushy — be genuinely helpful and honest`;

    const anthropicMessages = (messages as { role: string; content: string }[]).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 600,
        stream: true,
        system: systemPrompt,
        messages: anthropicMessages,
      }),
      signal: AbortSignal.timeout(45_000),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[prospect-advisor/chat] Anthropic error:', err);
      return new Response(JSON.stringify({ error: 'Chat failed' }), { status: 502 });
    }

    // Stream Anthropic SSE → client SSE
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const reader = res.body?.getReader();
        if (!reader) { controller.close(); return; }
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: parsed.delta.text })}\n\n`));
              }
              if (parsed.type === 'message_stop') {
                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              }
            } catch { /* skip malformed lines */ }
          }
        }
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    console.error('[prospect-advisor/chat] Unexpected error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
}
