import type {
  IWhatsAppProvider,
  IncomingWhatsAppMessage,
  MetaMessage,
  MetaWebhookPayload,
  OutgoingInteractiveMessage,
  OutgoingMediaMessage,
  OutgoingMessage,
  OutgoingTemplateMessage,
  OutgoingTextMessage,
  SendMessageResult,
} from '@alphabot/shared';

const GRAPH_API_BASE = 'https://graph.facebook.com/v22.0';

export class MetaCloudProvider implements IWhatsAppProvider {
  readonly provider = 'meta_cloud' as const;

  // ─── Webhook verification (GET) ──────────────────────────────────────────
  verifyWebhook(query: Record<string, string>, verifyToken: string): string | false {
    if (
      query['hub.mode'] === 'subscribe' &&
      query['hub.verify_token'] === verifyToken
    ) {
      return query['hub.challenge'] ?? false;
    }
    return false;
  }

  // ─── Parse incoming webhook payload ─────────────────────────────────────
  parseIncoming(payload: unknown): IncomingWhatsAppMessage | null {
    try {
      const p = payload as MetaWebhookPayload;
      if (p.object !== 'whatsapp_business_account') return null;

      for (const entry of p.entry ?? []) {
        for (const change of entry.changes ?? []) {
          const value = change.value;
          if (!value?.messages?.length) continue;

          const raw: MetaMessage = value.messages[0]!;
          const contactName =
            value.contacts?.[0]?.profile?.name ?? undefined;
          const phoneNumberId = value.metadata.phone_number_id;

          return this.normaliseMessage(raw, phoneNumberId, contactName);
        }
      }
    } catch {
      // malformed payload — return null
    }
    return null;
  }

  private normaliseMessage(
    raw: MetaMessage,
    phoneNumberId: string,
    contactName?: string
  ): IncomingWhatsAppMessage {
    const base = {
      provider: 'meta_cloud' as const,
      phoneNumberId,
      from: raw.from,
      messageId: raw.id,
      timestamp: Number(raw.timestamp),
      contactName,
    };

    if (raw.type === 'text' && raw.text) {
      return { ...base, type: 'text', text: raw.text.body };
    }
    if (raw.type === 'image' && raw.image) {
      return { ...base, type: 'image', mediaId: raw.image.id, mimeType: raw.image.mime_type };
    }
    if (raw.type === 'audio' && raw.audio) {
      return { ...base, type: 'audio', mediaId: raw.audio.id, mimeType: raw.audio.mime_type };
    }
    if (raw.type === 'document' && raw.document) {
      return { ...base, type: 'document', mediaId: raw.document.id, mimeType: raw.document.mime_type };
    }
    if (raw.type === 'video' && raw.video) {
      return { ...base, type: 'video', mediaId: raw.video.id, mimeType: raw.video.mime_type };
    }

    return { ...base, type: 'unsupported' };
  }

  // ─── Send message ────────────────────────────────────────────────────────
  async sendMessage(
    phoneNumberId: string,
    accessToken: string,
    message: OutgoingMessage
  ): Promise<SendMessageResult> {
    const url = `${GRAPH_API_BASE}/${phoneNumberId}/messages`;
    const body = this.buildPayload(message);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text();
      return { messageId: '', status: 'failed', error: err };
    }

    const data = (await response.json()) as { messages: Array<{ id: string }> };
    const messageId = data.messages?.[0]?.id ?? '';
    return { messageId, status: 'sent' };
  }

  // ─── Mark as read ────────────────────────────────────────────────────────
  async markAsRead(
    phoneNumberId: string,
    accessToken: string,
    messageId: string
  ): Promise<void> {
    await fetch(`${GRAPH_API_BASE}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      }),
    });
  }

  // ─── Payload builders ────────────────────────────────────────────────────

  private buildPayload(message: OutgoingMessage): Record<string, unknown> {
    const base = { messaging_product: 'whatsapp', recipient_type: 'individual' };

    switch (message.type) {
      case 'text':
        return this.buildText(base, message);
      case 'template':
        return this.buildTemplate(base, message);
      case 'interactive':
        return this.buildInteractive(base, message);
      case 'media':
        return this.buildMedia(base, message);
    }
  }

  private buildText(base: Record<string, unknown>, m: OutgoingTextMessage) {
    return {
      ...base,
      to: m.to,
      type: 'text',
      text: { preview_url: m.previewUrl ?? false, body: m.text },
    };
  }

  private buildTemplate(base: Record<string, unknown>, m: OutgoingTemplateMessage) {
    return {
      ...base,
      to: m.to,
      type: 'template',
      template: {
        name: m.templateName,
        language: { code: m.languageCode },
        components: m.components ?? [],
      },
    };
  }

  private buildInteractive(base: Record<string, unknown>, m: OutgoingInteractiveMessage) {
    const interactive: Record<string, unknown> = {
      type: m.interactiveType,
      body: { text: m.body },
    };

    if (m.interactiveType === 'button' && m.buttons) {
      interactive['action'] = { buttons: m.buttons };
    } else if (m.interactiveType === 'list' && m.listSections) {
      interactive['action'] = { sections: m.listSections, button: 'Choose an option' };
    }

    return { ...base, to: m.to, type: 'interactive', interactive };
  }

  private buildMedia(base: Record<string, unknown>, m: OutgoingMediaMessage) {
    return {
      ...base,
      to: m.to,
      type: m.mediaType,
      [m.mediaType]: {
        link: m.mediaUrl,
        caption: m.caption,
        filename: m.filename,
      },
    };
  }
}
