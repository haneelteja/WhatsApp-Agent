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
import { resolveVoiceProviders, bustProviderCache, estimateCostPerMin } from '../../services/voice/registry.js';
import type { DispatchCallRequest } from '@alphabot/shared';

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

  // ─── POST /api/voice/twiml/:voiceCallId ──────────────────────────────────
  // Twilio POSTs to this when the customer answers.
  // Returns TwiML that opens a Media Streams WebSocket — streaming STT+TTS pipeline.
  fastify.post<{ Params: { voiceCallId: string } }>(
    '/twiml/:voiceCallId',
    async (request, reply) => {
      const { voiceCallId } = request.params;

      try {
        const db = getServerClient();
        const { data: callRow } = await db
          .from('voice_calls')
          .select('id')
          .eq('id', voiceCallId)
          .single();

        if (!callRow) return reply.status(404).type('text/xml').send('<Response><Hangup/></Response>');

        // Build the wss:// URL for Twilio to connect to our Media Streams handler.
        // API_BASE_URL is https://... — swap https for wss.
        const apiBase   = process.env['API_BASE_URL'] ?? 'https://whatsapp-agent-fmtg.onrender.com';
        const streamUrl = apiBase.replace(/^https/, 'wss') + `/api/voice/stream/${voiceCallId}`;

        const twiml = [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<Response>',
          `  <Connect><Stream url="${streamUrl}"/></Connect>`,
          '</Response>',
        ].join('');

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
  // Legacy batch Record/Respond route — superseded by the streaming WebSocket pipeline.
  // Kept so old Twilio webhooks don't 404 during the transition.
  fastify.post<{ Params: { voiceCallId: string } }>(
    '/respond/:voiceCallId',
    async (_request, reply) => {
      return reply.status(200).type('text/xml').send(
        '<?xml version="1.0" encoding="UTF-8"?><Response><Say>This call is using the new streaming pipeline. Please redial.</Say><Hangup/></Response>',
      );
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
      const callStatus = body['CallStatus'] ?? body['Status']   ?? '';
      const duration   = parseInt(body['CallDuration'] ?? body['Duration'] ?? '0', 10) || null;
      const recordingUrl    = body['RecordingUrl'] ?? body['recording_url'] ?? null;
      const recordingStatus = body['RecordingStatus'] ?? null;

      fastify.log.info(
        { voiceCallId, callSid, callStatus, duration, recordingStatus, recordingUrl, bodyKeys: Object.keys(body) },
        '[Voice] Status callback received',
      );

      // RecordingStatusCallback: save recording URL regardless of CallStatus field.
      // Twilio always includes the current CallStatus (e.g. "in-progress") in recording callbacks,
      // so we cannot use !callStatus as a guard — that would always fail.
      if (recordingStatus === 'completed' && recordingUrl) {
        fastify.log.info({ voiceCallId, recordingUrl }, '[Voice] Saving recording URL');
        getServerClient()
          .from('voice_calls')
          .update({ recording_url: recordingUrl })
          .eq('id', voiceCallId)
          .then(({ error }) => {
            if (error) fastify.log.error({ error, voiceCallId }, '[Voice] Failed to save recording URL');
            else fastify.log.info({ voiceCallId }, '[Voice] Recording URL saved');
          });
      }

      // StatusCallback: finalize if terminal status
      const terminalStatuses = new Set(['completed', 'failed', 'busy', 'no-answer', 'canceled']);
      if (callStatus && terminalStatuses.has(callStatus)) {
        void finaliseCall(voiceCallId, callSid, callStatus, duration, recordingUrl ?? undefined);
      } else if (!recordingUrl) {
        fastify.log.info({ voiceCallId, callStatus }, '[Voice] Status callback skipped — non-terminal or empty');
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

  // ─── GET /api/voice/recording/:voiceCallId ───────────────────────────────
  // Server-side proxy that fetches the Twilio recording with Basic Auth and
  // streams it back to the caller. Keeps Twilio credentials off the browser.
  fastify.get<{ Params: { voiceCallId: string } }>(
    '/recording/:voiceCallId',
    async (request, reply) => {
      const { voiceCallId } = request.params;
      const db = getServerClient();

      const { data: callRow } = await db
        .from('voice_calls')
        .select('recording_url')
        .eq('id', voiceCallId)
        .single();

      if (!callRow?.recording_url) {
        return reply.status(404).send({ error: 'No recording available for this call' });
      }

      // Parse AccountSid embedded in the Twilio URL:
      // https://api.twilio.com/2010-04-01/Accounts/{accountSid}/Recordings/{recordingSid}
      const sidMatch  = callRow.recording_url.match(/\/Accounts\/([^/]+)\//);
      const accountSid = sidMatch?.[1];

      const { data: providerRow } = await db
        .from('voice_provider_configs')
        .select('credentials_json')
        .eq('provider_name', 'twilio')
        .eq('component', 'telephony')
        .limit(1)
        .maybeSingle();

      const creds     = providerRow?.credentials_json as Record<string, string> | null;
      const authToken = creds?.['auth_token'];

      if (!authToken || !accountSid) {
        return reply.status(503).send({ error: 'Recording credentials not configured' });
      }

      const mp3Url = callRow.recording_url.endsWith('.mp3')
        ? callRow.recording_url
        : `${callRow.recording_url}.mp3`;

      const auth     = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
      const upstream = await fetch(mp3Url, {
        headers: { Authorization: `Basic ${auth}` },
        signal:  AbortSignal.timeout(15_000),
      });

      if (!upstream.ok) {
        fastify.log.warn({ voiceCallId, status: upstream.status }, '[Voice] Twilio recording fetch failed');
        return reply.status(upstream.status).send({ error: 'Recording fetch failed' });
      }

      const audio = Buffer.from(await upstream.arrayBuffer());
      reply.header('Content-Type', 'audio/mpeg');
      reply.header('Cache-Control', 'private, max-age=3600');
      reply.header('Content-Length', audio.length);
      return reply.send(audio);
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
