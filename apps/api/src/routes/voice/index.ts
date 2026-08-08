// Voice API routes.
//
// POST /api/voice/dispatch          — trigger an outbound call (platform or client)
// GET  /api/voice/twiml/:id         — Twilio hits this when call is answered → returns greeting TwiML
// POST /api/voice/respond/:id       — Twilio hits this after each recording → returns next-turn TwiML
// POST /api/voice/status/:id        — Twilio call status callback (completed/failed/etc.)
// GET  /api/voice/calls/:tenantId   — list voice calls for a tenant
// GET  /api/voice/calls/:tenantId/:id — single call detail
// GET  /api/voice/providers          — list voice provider configs (public, no credentials)
// PUT  /api/voice/providers/:id      — update provider credentials (platform manager)
// GET  /api/voice/cost-estimate      — estimate cost for a given provider combination

import type { FastifyInstance } from 'fastify';
import { getServerClient } from '@alphabot/database';
import { dispatchCall, finaliseCall } from '../../services/voice/call-manager.js';
import { buildGreetingTwiml, processTurn, buildVoicemailTwiml, appendTranscript } from '../../services/voice/pipeline.js';
import { resolveVoiceProviders, bustProviderCache, estimateCostPerMin } from '../../services/voice/registry.js';
import type { BotVoiceConfig, DispatchCallRequest, ProductSlug } from '@alphabot/shared';

export async function voiceRoutes(fastify: FastifyInstance): Promise<void> {

  // ─── POST /api/voice/dispatch ─────────────────────────────────────────────
  fastify.post<{ Body: DispatchCallRequest }>('/dispatch', async (request, reply) => {
    const body = request.body;
    if (!body?.tenant_id || !body?.to_number || !body?.product_slug) {
      return reply.status(400).send({ error: 'tenant_id, product_slug, and to_number are required' });
    }

    try {
      const result = await dispatchCall(body);
      return reply.status(200).send(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      fastify.log.error({ err: msg, tenantId: body.tenant_id }, '[Voice] Dispatch failed');
      return reply.status(500).send({ error: msg });
    }
  });

  // ─── GET /api/voice/twiml/:voiceCallId ───────────────────────────────────
  // Twilio calls this when the customer answers. Returns TwiML greeting + first Record.
  fastify.get<{ Params: { voiceCallId: string }; Querystring: Record<string, string> }>(
    '/twiml/:voiceCallId',
    async (request, reply) => {
      const { voiceCallId } = request.params;
      const callContext = request.query as Record<string, string>;

      try {
        const db = getServerClient();
        const { data: callRow } = await db
          .from('voice_calls')
          .select('tenant_id, product_slug, stt_provider, tts_provider')
          .eq('id', voiceCallId)
          .single();

        if (!callRow) return reply.status(404).type('text/xml').send('<Response><Hangup/></Response>');

        const call = callRow as { tenant_id: string; product_slug: string; stt_provider: string; tts_provider: string };

        // Load providers — query bot_configs directly (getBotContext needs a WA number)
        const { data: bcRowsTwiml } = await db
          .from('bot_configs')
          .select('voice_config')
          .eq('tenant_id', call.tenant_id)
          .eq('product_slug', call.product_slug)
          .order('updated_at', { ascending: false })
          .limit(1);
        const voiceCfg  = ((bcRowsTwiml?.[0] as { voice_config?: BotVoiceConfig } | null)?.voice_config ?? {}) as BotVoiceConfig;
        const providers = await resolveVoiceProviders(voiceCfg);

        const apiBase   = process.env['API_BASE_URL'] ?? 'https://whatsapp-agent-fmtg.onrender.com';
        const respondUrl = `${apiBase}/api/voice/respond/${voiceCallId}`;

        const twiml = await buildGreetingTwiml(
          { voiceCallId, tenantId: call.tenant_id, productSlug: call.product_slug as ProductSlug, respondUrl, stt: providers.stt, tts: providers.tts },
          callContext,
        );

        await db.from('voice_calls').update({ status: 'in_progress' }).eq('id', voiceCallId);

        return reply.status(200).type('text/xml').send(twiml);
      } catch (err) {
        fastify.log.error({ err: err instanceof Error ? err.message : err, voiceCallId }, '[Voice] TwiML generation failed');
        return reply.status(200).type('text/xml').send(
          '<?xml version="1.0" encoding="UTF-8"?><Response><Say>We are experiencing a technical issue. Please try again later.</Say><Hangup/></Response>',
        );
      }
    },
  );

  // ─── POST /api/voice/respond/:voiceCallId ─────────────────────────────────
  // Twilio hits this after each voice recording. Transcribes, calls AI, returns next TwiML.
  fastify.post<{ Params: { voiceCallId: string }; Body: Record<string, string> }>(
    '/respond/:voiceCallId',
    async (request, reply) => {
      const { voiceCallId } = request.params;
      const body = request.body as Record<string, string>;

      // Always respond 200 immediately; Twilio retries on non-2xx
      const db = getServerClient();

      try {
        const { data: callRow } = await db
          .from('voice_calls')
          .select('tenant_id, product_slug, stt_provider, tts_provider, transcript, turn_count')
          .eq('id', voiceCallId)
          .single();

        if (!callRow) return reply.status(200).type('text/xml').send('<Response><Hangup/></Response>');

        const call = callRow as {
          tenant_id:    string;
          product_slug: string;
          stt_provider: string;
          tts_provider: string;
          transcript:   string | null;
          turn_count:   number;
        };

        const recordingUrl  = body['RecordingUrl'];
        const callSid       = body['CallSid'];
        const recordingAuth = body['_recording_auth'] ?? '';  // set by Twilio auth for recordings

        if (!recordingUrl) {
          return reply.status(200).type('text/xml').send(
            '<Response><Say>I did not catch that, please try again.</Say><Record action="' +
            `${process.env['API_BASE_URL']}/api/voice/respond/${voiceCallId}` +
            '" maxLength="10" timeout="5" playBeep="false"/></Response>',
          );
        }

        // Load providers — query bot_configs directly (getBotContext needs a WA number)
        const { data: bcRowsRespond } = await db
          .from('bot_configs')
          .select('voice_config')
          .eq('tenant_id', call.tenant_id)
          .eq('product_slug', call.product_slug)
          .order('updated_at', { ascending: false })
          .limit(1);
        const voiceCfg  = ((bcRowsRespond?.[0] as { voice_config?: BotVoiceConfig } | null)?.voice_config ?? {}) as BotVoiceConfig;
        const providers = await resolveVoiceProviders(voiceCfg);

        // Twilio recordings require Basic auth — load token from DB (not env var) since
        // the token is stored in voice_provider_configs after platform setup.
        let twilioAuthToken = process.env['TWILIO_AUTH_TOKEN'] ?? '';
        if (!twilioAuthToken && providers.telephony.name === 'twilio') {
          const { data: twRow } = await db
            .from('voice_provider_configs')
            .select('credentials_json')
            .eq('component', 'telephony')
            .eq('provider_name', 'twilio')
            .single();
          twilioAuthToken = (twRow?.credentials_json as { auth_token?: string } | null)?.auth_token ?? '';
        }

        const twilioCreds = providers.telephony.name === 'twilio'
          ? `Basic ${Buffer.from(`${body['AccountSid'] ?? body['account_sid'] ?? ''}:${twilioAuthToken}`).toString('base64')}`
          : '';  // Exotel: no auth needed

        const apiBase    = process.env['API_BASE_URL'] ?? 'https://whatsapp-agent-fmtg.onrender.com';
        const respondUrl = `${apiBase}/api/voice/respond/${voiceCallId}`;

        const { twiml, transcriptLine, shouldEnd } = await processTurn(
          { voiceCallId, tenantId: call.tenant_id, productSlug: call.product_slug as ProductSlug, respondUrl, stt: providers.stt, tts: providers.tts },
          recordingUrl,
          twilioCreds,
          call.turn_count,
          call.transcript ?? '',
        );

        // Persist transcript turn non-blocking
        if (transcriptLine) {
          void appendTranscript(voiceCallId, transcriptLine);
        }

        if (shouldEnd) {
          void finaliseCall(voiceCallId, callSid ?? '', 'completed', null);
        }

        return reply.status(200).type('text/xml').send(twiml);
      } catch (err) {
        fastify.log.error({ err: err instanceof Error ? err.message : err, voiceCallId }, '[Voice] Respond failed');
        return reply.status(200).type('text/xml').send(
          '<Response><Say>I am having trouble processing your request. Please try again.</Say><Hangup/></Response>',
        );
      }
    },
  );

  // ─── POST /api/voice/status/:voiceCallId ──────────────────────────────────
  // Twilio / Exotel call status callback — updates call record when call ends.
  fastify.post<{ Params: { voiceCallId: string }; Body: Record<string, string> }>(
    '/status/:voiceCallId',
    async (request, reply) => {
      reply.status(200).send('');  // always 200

      const { voiceCallId } = request.params;
      const body = request.body as Record<string, string>;

      const callSid    = body['CallSid']  ?? body['sid']       ?? '';
      // Twilio: CallStatus + CallDuration  |  Exotel: Status + Duration
      const callStatus = body['CallStatus'] ?? body['Status']   ?? '';
      const duration   = parseInt(body['CallDuration'] ?? body['Duration'] ?? '0', 10) || null;
      // Twilio: RecordingUrl  |  Exotel: RecordingUrl (same field name)
      const recordingUrl = body['RecordingUrl'] ?? body['recording_url'] ?? null;

      if (callStatus && callStatus !== 'in-progress') {
        void finaliseCall(voiceCallId, callSid, callStatus, duration, recordingUrl ?? undefined);
      }
    },
  );

  // ─── GET /api/voice/calls/:tenantId ──────────────────────────────────────
  fastify.get<{ Params: { tenantId: string }; Querystring: { page?: string; status?: string; limit?: string } }>(
    '/calls/:tenantId',
    async (request, reply) => {
      const { tenantId } = request.params;
      const { page = '1', status, limit = '20' } = request.query;
      const pageSize = Math.min(parseInt(limit, 10) || 20, 100);
      const offset   = (parseInt(page, 10) - 1) * pageSize;

      const db = getServerClient();
      let query = db
        .from('voice_calls')
        .select('*', { count: 'exact' })
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .range(offset, offset + pageSize - 1);

      if (status) query = query.eq('status', status);

      const { data, count, error } = await query;
      if (error) return reply.status(500).send({ error: error.message });

      return reply.send({ calls: data ?? [], total: count ?? 0, page: parseInt(page, 10), page_size: pageSize });
    },
  );

  // ─── GET /api/voice/calls/:tenantId/:id ──────────────────────────────────
  fastify.get<{ Params: { tenantId: string; id: string } }>(
    '/calls/:tenantId/:id',
    async (request, reply) => {
      const { tenantId, id } = request.params;
      const db = getServerClient();
      const { data, error } = await db
        .from('voice_calls')
        .select('*')
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .single();

      if (error || !data) return reply.status(404).send({ error: 'Call not found' });
      return reply.send(data);
    },
  );

  // ─── GET /api/voice/providers ─────────────────────────────────────────────
  // Returns public provider list (no credentials). Used in platform console + bot config UI.
  fastify.get('/providers', async (_request, reply) => {
    const db = getServerClient();
    const { data, error } = await db
      .from('voice_provider_configs')
      .select('id, component, provider_name, display_name, config_json, is_default, enabled, estimated_cost_per_min_inr')
      .order('component')
      .order('provider_name');

    if (error) return reply.status(500).send({ error: error.message });

    // Mark which rows have credentials (without exposing them)
    const { data: withCreds } = await db
      .from('voice_provider_configs')
      .select('id, credentials_json');

    const credSet = new Set(
      (withCreds ?? [])
        .filter((r: { credentials_json: Record<string, string> }) =>
          Object.values(r.credentials_json).some(v => v && v.length > 0))
        .map((r: { id: string }) => r.id),
    );

    const publicRows = (data ?? []).map((r: Record<string, unknown>) => ({
      ...r,
      has_credentials: credSet.has(r['id'] as string),
    }));

    return reply.send(publicRows);
  });

  // ─── PUT /api/voice/providers/:id ────────────────────────────────────────
  // Update provider credentials + config. Platform manager only.
  fastify.put<{ Params: { id: string }; Body: { credentials_json?: Record<string, string>; config_json?: Record<string, unknown>; is_default?: boolean; enabled?: boolean } }>(
    '/providers/:id',
    async (request, reply) => {
      const { id }  = request.params;
      const updates = request.body;

      const db = getServerClient();
      const { error } = await db
        .from('voice_provider_configs')
        .update({
          ...(updates.credentials_json !== undefined ? { credentials_json: updates.credentials_json } : {}),
          ...(updates.config_json      !== undefined ? { config_json:      updates.config_json      } : {}),
          ...(updates.is_default       !== undefined ? { is_default:       updates.is_default       } : {}),
          ...(updates.enabled          !== undefined ? { enabled:          updates.enabled          } : {}),
        })
        .eq('id', id);

      if (error) return reply.status(500).send({ error: error.message });

      // Bust cache so next call picks up new credentials
      bustProviderCache();

      return reply.send({ ok: true });
    },
  );

  // ─── GET /api/voice/cost-estimate ────────────────────────────────────────
  fastify.get<{ Querystring: { telephony?: string; stt?: string; tts?: string } }>(
    '/cost-estimate',
    async (request, reply) => {
      const { telephony, stt, tts } = request.query;
      const estimate = await estimateCostPerMin({ telephony_provider: telephony as never, stt_provider: stt as never, tts_provider: tts as never });
      return reply.send(estimate);
    },
  );
}
