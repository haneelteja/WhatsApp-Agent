import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const maxDuration = 60;

// ─── Anthropic types (plain, no SDK import) ───────────────────────────────────

type AnthropicTool = {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, { type: string; description?: string; items?: { type: string } }>;
    required: string[];
  };
};

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> };

type MessageParam =
  | { role: 'user'; content: string | Array<{ type: 'tool_result'; tool_use_id: string; content: string }> }
  | { role: 'assistant'; content: string | ContentBlock[] };

// ─── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS: AnthropicTool[] = [
  {
    name: 'add_kb_article',
    description: 'Add a new FAQ/article entry to a knowledge base collection.',
    input_schema: {
      type: 'object',
      properties: {
        collection_id: { type: 'string', description: 'UUID of the KB collection' },
        collection_name: { type: 'string', description: 'Collection name for display' },
        question: { type: 'string', description: 'The question or topic title' },
        answer: { type: 'string', description: 'The detailed answer content' },
      },
      required: ['collection_id', 'collection_name', 'question', 'answer'],
    },
  },
  {
    name: 'update_escalation_triggers',
    description: 'Replace the escalation trigger keywords for a specific bot.',
    input_schema: {
      type: 'object',
      properties: {
        product_slug: { type: 'string', description: 'e.g. support_bot, sales_bot, lifecycle_bot' },
        triggers: { type: 'array', items: { type: 'string' }, description: 'Full list of trigger keywords' },
      },
      required: ['product_slug', 'triggers'],
    },
  },
  {
    name: 'toggle_button_template',
    description: 'Enable or disable a WhatsApp button template.',
    input_schema: {
      type: 'object',
      properties: {
        template_id: { type: 'string', description: 'UUID of the button template' },
        template_name: { type: 'string', description: 'Template name for display' },
        is_active: { type: 'boolean', description: 'true to enable, false to disable' },
      },
      required: ['template_id', 'template_name', 'is_active'],
    },
  },
  {
    name: 'update_system_prompt',
    description: 'Update the system prompt for a bot.',
    input_schema: {
      type: 'object',
      properties: {
        product_slug: { type: 'string' },
        system_prompt: { type: 'string', description: 'The full new system prompt text' },
      },
      required: ['product_slug', 'system_prompt'],
    },
  },
];

// ─── History helpers ───────────────────────────────────────────────────────────

type HistoryRow = {
  id: string;
  role: string;
  content: string;
  pending_action: Record<string, unknown> | null;
  action_status: string | null;
};

function buildMessages(history: HistoryRow[]): MessageParam[] {
  const msgs: MessageParam[] = [];
  for (const row of history) {
    if (row.role === 'user') {
      msgs.push({ role: 'user', content: row.content });
    } else {
      if (row.pending_action && row.action_status === 'executed') {
        const pa = row.pending_action as {
          toolUseId: string;
          toolName: string;
          toolInput: Record<string, unknown>;
          executionResult?: string;
        };
        const assistantBlocks: ContentBlock[] = [
          ...(row.content ? [{ type: 'text' as const, text: row.content }] : []),
          { type: 'tool_use' as const, id: pa.toolUseId, name: pa.toolName, input: pa.toolInput },
        ];
        msgs.push({ role: 'assistant', content: assistantBlocks });
        msgs.push({
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: pa.toolUseId, content: pa.executionResult ?? 'Done' }],
        });
      } else {
        msgs.push({ role: 'assistant', content: row.content || '…' });
      }
    }
  }
  return msgs;
}

// ─── Anthropic API call (plain fetch, no SDK) ──────────────────────────────────

async function callAnthropic(
  apiKey: string,
  systemPrompt: string,
  messages: MessageParam[],
): Promise<{ content: ContentBlock[] }> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      tools: TOOLS,
      messages,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic ${res.status}: ${text}`);
  }

  return res.json() as Promise<{ content: ContentBlock[] }>;
}

// ─── Route ─────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = getSupabaseAdminClient();
    const { data: tenantUser } = await admin
      .from('tenant_users')
      .select('tenant_id')
      .eq('user_id', user.id)
      .single();
    if (!tenantUser) return NextResponse.json({ error: 'No tenant' }, { status: 403 });

    const tenantId = tenantUser.tenant_id as string;
    const body = await request.json() as { message: string };
    const { message } = body;
    if (!message?.trim()) return NextResponse.json({ error: 'Empty message' }, { status: 400 });

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });

    // Load history + context in parallel
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [
      { data: historyRows },
      { data: kbCollections },
      { data: botConfigs },
      { data: buttonTemplates },
      { count: totalConvs },
      { count: escalatedConvs },
    ] = await Promise.all([
      admin.from('copilot_messages')
        .select('id, role, content, pending_action, action_status')
        .eq('user_id', user.id).eq('tenant_id', tenantId)
        .order('created_at', { ascending: false }).limit(30),
      admin.from('kb_collections').select('id, name, entry_count').eq('tenant_id', tenantId).eq('active', true),
      admin.from('bot_configs').select('product_slug, guardrails_json, escalation_triggers, confidence_threshold, kb_only_mode').eq('tenant_id', tenantId),
      admin.from('interactive_button_templates').select('id, name, is_active, type, trigger_keywords').eq('tenant_id', tenantId),
      admin.from('conversations').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('created_at', sevenDaysAgo),
      admin.from('conversations').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'escalated').gte('created_at', sevenDaysAgo),
    ]);

    const history = ((historyRows ?? []) as HistoryRow[]).reverse();

    type KbCol = { id: string; name: string; entry_count: number };
    type BotCfg = { product_slug: string; guardrails_json: Record<string, unknown> | null; escalation_triggers: string[] | null; confidence_threshold: number | null; kb_only_mode: boolean | null };
    type BtnTpl = { id: string; name: string; is_active: boolean; type: string; trigger_keywords: string[] | null };

    const escalationRate = (totalConvs ?? 0) > 0
      ? Math.round(((escalatedConvs ?? 0) / (totalConvs ?? 1)) * 100)
      : 0;

    const kbLines = (kbCollections as KbCol[] ?? []).map(
      c => `  • ID: ${c.id} | "${c.name}" (${c.entry_count ?? 0} entries)`
    );
    const botLines = (botConfigs as BotCfg[] ?? []).flatMap(cfg => {
      const g = cfg.guardrails_json ?? {};
      return [
        `  ${cfg.product_slug}:`,
        `    KB-only: ${cfg.kb_only_mode ?? false} | Confidence: ${cfg.confidence_threshold ?? 0.6}`,
        `    Escalation triggers: ${(cfg.escalation_triggers ?? []).join(', ') || 'none'}`,
        `    Blocked topics: ${((g['blocked_topics'] as string[] | null) ?? []).join(', ') || 'none'}`,
        `    Tone: ${(g['tone'] as string | null) ?? 'professional'}`,
      ];
    });
    const btnLines = (buttonTemplates as BtnTpl[] ?? []).map(
      t => `  • ID: ${t.id} | "${t.name}" | ${t.type} | Active: ${t.is_active} | Keywords: ${(t.trigger_keywords ?? []).join(', ') || 'none'}`
    );

    const systemPrompt = `You are the AI Copilot for this WhatsApp AI agent dashboard. You help operators understand and improve their bot setup.

KNOWLEDGE BASE COLLECTIONS (use IDs for add_kb_article):
${kbLines.length ? kbLines.join('\n') : '  (none configured)'}

BOT CONFIGURATIONS:
${botLines.length ? botLines.join('\n') : '  (none configured)'}

BUTTON TEMPLATES (use IDs for toggle_button_template):
${btnLines.length ? btnLines.join('\n') : '  (none configured)'}

CONVERSATION STATS (last 7 days):
  Total: ${totalConvs ?? 0} | Escalated: ${escalatedConvs ?? 0} (${escalationRate}%)

You can:
1. Answer questions about the configuration above
2. Guide navigation — embed links like: [GO:/knowledge-base "Go to Knowledge Base"]
   Valid paths: /knowledge-base, /guardrails, /settings, /button-templates, /campaigns, /analytics, /conversations
3. Propose write actions using tools (user must approve before executing)

Before calling a tool, briefly describe what you'll do. Keep responses concise.`;

    const claudeMessages = buildMessages(history);
    claudeMessages.push({ role: 'user', content: message });

    const response = await callAnthropic(anthropicKey, systemPrompt, claudeMessages);

    // Save user message
    await admin.from('copilot_messages').insert({
      user_id: user.id, tenant_id: tenantId, role: 'user', content: message,
    });

    const textBlock = response.content.find(b => b.type === 'text') as { type: 'text'; text: string } | undefined;
    const toolBlock = response.content.find(b => b.type === 'tool_use') as { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> } | undefined;

    if (toolBlock) {
      const assistantText = textBlock?.text ?? '';
      const { data: saved } = await admin.from('copilot_messages').insert({
        user_id: user.id, tenant_id: tenantId, role: 'assistant',
        content: assistantText,
        pending_action: { toolUseId: toolBlock.id, toolName: toolBlock.name, toolInput: toolBlock.input },
        action_status: 'pending',
      }).select('id').single();

      return NextResponse.json({
        type: 'action_pending',
        messageId: (saved as { id: string } | null)?.id ?? '',
        toolUseId: toolBlock.id,
        toolName: toolBlock.name,
        toolInput: toolBlock.input,
        assistantText,
      });
    }

    const content = textBlock?.text ?? '';
    const { data: saved } = await admin.from('copilot_messages').insert({
      user_id: user.id, tenant_id: tenantId, role: 'assistant', content,
    }).select('id').single();

    return NextResponse.json({
      type: 'message',
      content,
      messageId: (saved as { id: string } | null)?.id ?? '',
    });

  } catch (err) {
    console.error('[Copilot] chat error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
