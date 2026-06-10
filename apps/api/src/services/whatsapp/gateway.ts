import type {
  IWhatsAppProvider,
  IncomingWhatsAppMessage,
  OutgoingMessage,
  SendMessageResult,
  WhatsAppProvider,
} from '@alphabot/shared';
import { MetaCloudProvider } from './providers/meta.js';
import { TwilioProvider } from './providers/twilio.js';

// ─── Gateway: single entry-point for all WhatsApp operations ─────────────────
// Phase 1: MetaCloud + Twilio (sandbox) registered.
// Phase 2: add Interakt, Wati, Gupshup here — callers don't change.

const providers: Map<WhatsAppProvider, IWhatsAppProvider> = new Map<WhatsAppProvider, IWhatsAppProvider>([
  ['meta_cloud', new MetaCloudProvider()],
  ['twilio', new TwilioProvider()],
]);

export class WhatsAppGateway {
  private provider: IWhatsAppProvider;

  constructor(providerName: WhatsAppProvider) {
    const p = providers.get(providerName);
    if (!p) throw new Error(`WhatsApp provider not registered: ${providerName}`);
    this.provider = p;
  }

  verifyWebhook(query: Record<string, string>, verifyToken: string): string | false {
    return this.provider.verifyWebhook(query, verifyToken);
  }

  parseIncoming(payload: unknown): IncomingWhatsAppMessage | null {
    return this.provider.parseIncoming(payload);
  }

  async sendMessage(
    phoneNumberId: string,
    accessToken: string,
    message: OutgoingMessage
  ): Promise<SendMessageResult> {
    return this.provider.sendMessage(phoneNumberId, accessToken, message);
  }

  async markAsRead(
    phoneNumberId: string,
    accessToken: string,
    messageId: string
  ): Promise<void> {
    return this.provider.markAsRead(phoneNumberId, accessToken, messageId);
  }
}
