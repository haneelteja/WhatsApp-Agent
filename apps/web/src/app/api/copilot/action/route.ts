import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = getSupabaseAdminClient();
  const { messageId, approved } = await request.json() as { messageId: string; approved: boolean };

  const { data: msg } = await admin
    .from('copilot_messages')
    .select('id, user_id, tenant_id, pending_action, content')
    .eq('id', messageId)
    .single();

  if (!msg || (msg as { user_id: string }).user_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const tenantId = (msg as { tenant_id: string }).tenant_id;
  const pendingAction = (msg as { pending_action: Record<string, unknown> | null }).pending_action as {
    toolUseId: string;
    toolName: string;
    toolInput: Record<string, unknown>;
  } | null;

  if (!pendingAction) {
    return NextResponse.json({ error: 'Message has no pending action' }, { status: 400 });
  }

  if (!approved) {
    await admin.from('copilot_messages').update({ action_status: 'cancelled' }).eq('id', messageId);
    const confirmText = 'No problem — action cancelled. Let me know if you\'d like to try something else!';
    const { data: cancelMsg } = await admin.from('copilot_messages').insert({
      user_id: user.id,
      tenant_id: tenantId,
      role: 'assistant',
      content: confirmText,
    }).select('id').single();

    return NextResponse.json({
      type: 'message',
      content: confirmText,
      messageId: (cancelMsg as { id: string } | null)?.id ?? '',
    });
  }

  // Execute the approved action
  let executionResult = '';

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  async function resolveCollectionId(collection_id: string, collection_name: string): Promise<string> {
    if (UUID_RE.test(collection_id)) return collection_id;
    // collection_id is a placeholder slug — look up by name first to avoid duplicates
    const name = collection_name?.trim() || 'Knowledge Base';
    const { data: existing } = await admin
      .from('kb_collections')
      .select('id')
      .eq('tenant_id', tenantId)
      .ilike('name', name)
      .limit(1)
      .single();
    if (existing) return (existing as { id: string }).id;
    // No match — create a new collection
    const { data: newCol, error: colErr } = await admin
      .from('kb_collections')
      .insert({ tenant_id: tenantId, name, active: true })
      .select('id')
      .single();
    if (colErr) throw new Error(colErr.message);
    return (newCol as { id: string }).id;
  }

  try {
    switch (pendingAction.toolName) {
      case 'add_kb_article': {
        const { collection_id, collection_name, question, answer } = pendingAction.toolInput as {
          collection_id: string; question: string; answer: string; collection_name: string;
        };
        const realId = await resolveCollectionId(collection_id, collection_name);
        const { error } = await admin.from('knowledge_base').insert({
          collection_id: realId,
          tenant_id: tenantId,
          product_type: 'support_bot',
          question,
          answer,
          status: 'live',
        });
        if (error) throw new Error(error.message);
        executionResult = `Added KB article: "${question}"`;
        break;
      }
      case 'update_escalation_triggers': {
        const { product_slug, triggers } = pendingAction.toolInput as { product_slug: string; triggers: string[] };
        const { error } = await admin.from('bot_configs')
          .update({ escalation_triggers: triggers })
          .eq('tenant_id', tenantId)
          .eq('product_slug', product_slug);
        if (error) throw new Error(error.message);
        executionResult = `Updated escalation triggers for ${product_slug} (${triggers.length} keywords)`;
        break;
      }
      case 'toggle_button_template': {
        const { template_id, template_name, is_active } = pendingAction.toolInput as {
          template_id: string; template_name: string; is_active: boolean;
        };
        const { error } = await admin.from('interactive_button_templates')
          .update({ is_active })
          .eq('id', template_id)
          .eq('tenant_id', tenantId);
        if (error) throw new Error(error.message);
        executionResult = `${is_active ? 'Enabled' : 'Disabled'} button template "${template_name}"`;
        break;
      }
      case 'update_system_prompt': {
        const { product_slug, system_prompt } = pendingAction.toolInput as { product_slug: string; system_prompt: string };
        const { error } = await admin.from('bot_configs')
          .update({ system_prompt })
          .eq('tenant_id', tenantId)
          .eq('product_slug', product_slug);
        if (error) throw new Error(error.message);
        executionResult = `Updated system prompt for ${product_slug}`;
        break;
      }
      case 'add_kb_articles_bulk': {
        const { collection_id, collection_name, articles } = pendingAction.toolInput as {
          collection_id: string;
          collection_name: string;
          articles: Array<{ question: string; answer: string }>;
        };
        const realId = await resolveCollectionId(collection_id, collection_name);
        const rows = articles.map(a => ({
          collection_id: realId,
          tenant_id: tenantId,
          product_type: 'support_bot',
          question: a.question,
          answer: a.answer,
          status: 'live',
        }));
        const { error } = await admin.from('knowledge_base').insert(rows);
        if (error) throw new Error(error.message);
        executionResult = `Added ${rows.length} KB article${rows.length !== 1 ? 's' : ''} to "${collection_name}"`;
        break;
      }
      default:
        executionResult = `Unknown action: ${pendingAction.toolName}`;
    }
  } catch (err) {
    return NextResponse.json({ error: 'Execution failed: ' + String(err) }, { status: 500 });
  }

  await admin.from('copilot_messages').update({
    action_status: 'executed',
    pending_action: { ...pendingAction, executionResult },
  }).eq('id', messageId);

  const confirmText = `✓ Done! ${executionResult}. Let me know if you'd like to make any other changes.`;
  const { data: doneMsg } = await admin.from('copilot_messages').insert({
    user_id: user.id,
    tenant_id: tenantId,
    role: 'assistant',
    content: confirmText,
  }).select('id').single();

  return NextResponse.json({
    type: 'message',
    content: confirmText,
    messageId: (doneMsg as { id: string } | null)?.id ?? '',
  });
}
