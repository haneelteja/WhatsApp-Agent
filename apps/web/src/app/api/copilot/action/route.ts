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
  const pendingAction = (msg as { pending_action: Record<string, unknown> }).pending_action as {
    toolUseId: string;
    toolName: string;
    toolInput: Record<string, unknown>;
  };

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

  try {
    switch (pendingAction.toolName) {
      case 'add_kb_article': {
        const { collection_id, question, answer } = pendingAction.toolInput as {
          collection_id: string; question: string; answer: string; collection_name: string;
        };
        const { error } = await admin.from('knowledge_base').insert({
          collection_id,
          tenant_id: tenantId,
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
