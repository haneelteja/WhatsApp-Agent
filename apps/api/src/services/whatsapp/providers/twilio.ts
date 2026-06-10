import type {
  IWhatsAppProvider,
  IncomingWhatsAppMessage,
  OutgoingMessage,
  SendMessageResult,
} from '@alphabot/shared';

export class TwilioProvider implements IWhatsAppProvider {
  readonly provider = 'twilio' as const;

  verifyWebhook(_query: Record<string, string>, _verifyToken: string): string | false {
    // Twilio uses HMAC signature validation — not a hub.challenge flow.
    // GET verification is never called for Twilio webhooks.
    return false;
  }

  parseIncoming(payload: unknown): IncomingWhatsAppMessage | null {
    const body = payload as Record<string, string | undefined>;
    if (!body['MessageSid'] || !body['From']) return null;

    const from = (body['From'] ?? '').replace('whatsapp:', '');
    const to = (body['To'] ?? '').replace('whatsapp:', '');
    const text = body['Body'] ?? '';
    const numMedia = parseInt(body['NumMedia'] ?? '0', 10);

    let type: IncomingWhatsAppMessage['type'] = 'text';
    let mediaUrl: string | undefined;
    let mimeType: string | undefined;

    if (numMedia > 0) {
      mediaUrl = body['MediaUrl0'];
      mimeType = body['MediaContentType0'] ?? '';
      if (mimeType.startsWith('image/')) type = 'image';
      else if (mimeType.startsWith('audio/')) type = 'audio';
      else if (mimeType.startsWith('video/')) type = 'video';
      else type = 'document';
    }

    return {
      provider: 'twilio',
      phoneNumberId: to,
      from,
      messageId: body['MessageSid'] ?? '',
      timestamp: Date.now(),
      type,
      text: text || undefined,
      mediaUrl,
      mimeType,
      contactName: body['ProfileName'],
    };
  }

  // phoneNumber   = Twilio sandbox number, e.g. +14155238886
  // credentials   = "AccountSid:AuthToken" (stored as access_token in config_json)
  async sendMessage(
    phoneNumber: string,
    credentials: string,
    message: OutgoingMessage
  ): Promise<SendMessageResult> {
    const colonIdx = credentials.indexOf(':');
    const accountSid = credentials.slice(0, colonIdx);
    const authToken = credentials.slice(colonIdx + 1);

    let body = '';
    if (message.type === 'text') {
      body = message.text;
    } else if (message.type === 'interactive') {
      body = message.body;
    } else if (message.type === 'template') {
      body = `[Template: ${message.templateName}]`;
    } else {
      body = `[${message.mediaType} message]`;
    }

    const params = new URLSearchParams({
      To: `whatsapp:${message.to}`,
      From: `whatsapp:${phoneNumber}`,
      Body: body,
    });

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        },
        body: params.toString(),
      }
    );

    const data = await response.json() as {
      sid?: string;
      error_message?: string;
      message?: string;
    };

    if (!response.ok) {
      return {
        messageId: '',
        status: 'failed',
        error: data.error_message ?? data.message ?? `Twilio HTTP ${response.status}`,
      };
    }

    return { messageId: data.sid ?? '', status: 'sent' };
  }

  async markAsRead(
    _phoneNumber: string,
    _credentials: string,
    _messageId: string
  ): Promise<void> {
    // Twilio WhatsApp Sandbox does not support mark-as-read
  }
}
