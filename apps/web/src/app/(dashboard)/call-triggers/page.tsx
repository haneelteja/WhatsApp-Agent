import { redirect } from 'next/navigation';
import { Phone, Zap, Info } from 'lucide-react';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { CallTriggersCard } from '@/components/dashboard/CallTriggersCard';
import type { BotVoiceConfig } from '@alphabot/shared';

const BOT_META: Record<string, { name: string; badge: string }> = {
  support_bot:   { name: 'Support Bot',   badge: 'bg-sky-100 text-sky-700 border-sky-200'          },
  sales_bot:     { name: 'Sales Bot',     badge: 'bg-violet-100 text-violet-700 border-violet-200'  },
  lifecycle_bot: { name: 'Lifecycle Bot', badge: 'bg-orange-100 text-orange-700 border-orange-200'  },
};

export default async function CallTriggersPage() {
  const supabase = await getSupabaseServerClient();
  const admin    = getSupabaseAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: tenantUser } = await admin
    .from('tenant_users')
    .select('tenant_id, role')
    .eq('user_id', user.id)
    .single();

  if (!tenantUser) redirect('/dashboard');

  const tenantId = tenantUser.tenant_id;

  // Load all active bots for this tenant
  const { data: products } = await admin
    .from('tenant_products')
    .select('product_type')
    .eq('tenant_id', tenantId)
    .eq('active', true);

  const activeSlugs = (products ?? []).map((p: Record<string, unknown>) => p['product_type'] as string);

  // Load bot configs for all active bots
  const { data: botCfgs } = await admin
    .from('bot_configs')
    .select('product_slug, voice_config')
    .eq('tenant_id', tenantId)
    .in('product_slug', activeSlugs.length > 0 ? activeSlugs : ['__none__']);

  const cfgMap = new Map(
    (botCfgs ?? []).map((r: Record<string, unknown>) => [r['product_slug'] as string, r['voice_config'] as Partial<BotVoiceConfig>])
  );

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">

      {/* Page header */}
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
          <Zap size={18} className="text-emerald-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Call Triggers</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Configure when the bot automatically places a voice call from an ongoing WhatsApp conversation.
            Rules are evaluated per-bot and apply to all conversations handled by that bot.
          </p>
        </div>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-50 border border-blue-200 text-sm text-blue-800">
        <Info size={15} className="mt-0.5 shrink-0 text-blue-500" />
        <div>
          <p className="font-medium">How triggers work</p>
          <p className="text-blue-700 mt-0.5">
            When a trigger fires, the bot places an outbound voice call to the customer's WhatsApp number.
            Voice must be enabled for the bot (Settings → Voice tab) and the telephony provider must be configured.
            Business hours gates and call delays apply to all triggers below.
          </p>
        </div>
      </div>

      {/* Escalation trigger — always-on note */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-600">
        <Phone size={15} className="mt-0.5 shrink-0 text-gray-400" />
        <div>
          <p className="font-medium text-gray-700">Bot escalation trigger</p>
          <p className="mt-0.5">
            When a conversation is escalated (low confidence, blocked topic, or sales lead), the bot
            can automatically place a voice call. This is configured per-bot in{' '}
            <a href="/settings?tab=voice" className="underline text-emerald-600 hover:text-emerald-700">
              Settings → Voice
            </a>{' '}
            under &ldquo;Auto-dispatch on escalation.&rdquo;
          </p>
        </div>
      </div>

      {/* Per-bot cards */}
      {activeSlugs.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">
          No active bots found. Activate a bot in{' '}
          <a href="/settings?tab=workspace" className="underline text-emerald-600">Settings → Workspace</a>.
        </div>
      ) : (
        <div className="space-y-4">
          {activeSlugs.map(slug => {
            const meta = BOT_META[slug] ?? { name: slug, badge: 'bg-gray-100 text-gray-600 border-gray-200' };
            return (
              <CallTriggersCard
                key={slug}
                productSlug={slug}
                botName={meta.name}
                badgeColor={meta.badge}
                voiceCfg={cfgMap.get(slug) ?? {}}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
