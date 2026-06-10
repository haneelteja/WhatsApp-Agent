import type { WhatsAppProvider } from './index.js';

// ─── WhatsApp Gateway Interface ───────────────────────────────────────────────
// All providers normalise to these shapes. Add BSP providers in Phase 2.

export interface IncomingWhatsAppMessage {
  provider: WhatsAppProvider;
  phoneNumberId: string;
  from: string;
  messageId: string;
  timestamp: number;
  type: 'text' | 'image' | 'audio' | 'document' | 'video' | 'unsupported';
  text?: string;
  mediaId?: string;
  mediaUrl?: string;
  mimeType?: string;
  contactName?: string;
}

export interface OutgoingTextMessage {
  type: 'text';
  to: string;
  text: string;
  previewUrl?: boolean;
}

export interface OutgoingTemplateMessage {
  type: 'template';
  to: string;
  templateName: string;
  languageCode: string;
  components?: TemplateComponent[];
}

export interface OutgoingInteractiveMessage {
  type: 'interactive';
  to: string;
  interactiveType: 'button' | 'list';
  body: string;
  buttons?: InteractiveButton[];
  listSections?: ListSection[];
}

export interface OutgoingMediaMessage {
  type: 'media';
  to: string;
  mediaType: 'image' | 'document' | 'audio' | 'video';
  mediaUrl: string;
  caption?: string;
  filename?: string;
}

export type OutgoingMessage =
  | OutgoingTextMessage
  | OutgoingTemplateMessage
  | OutgoingInteractiveMessage
  | OutgoingMediaMessage;

export interface SendMessageResult {
  messageId: string;
  status: 'sent' | 'failed';
  error?: string;
}

// ─── WhatsApp Provider Interface (Gateway contract) ───────────────────────────

export interface IWhatsAppProvider {
  provider: WhatsAppProvider;
  verifyWebhook(query: Record<string, string>, verifyToken: string): string | false;
  parseIncoming(payload: unknown): IncomingWhatsAppMessage | null;
  sendMessage(
    phoneNumberId: string,
    accessToken: string,
    message: OutgoingMessage
  ): Promise<SendMessageResult>;
  markAsRead(
    phoneNumberId: string,
    accessToken: string,
    messageId: string
  ): Promise<void>;
}

// ─── Meta Cloud API raw payload shapes ───────────────────────────────────────

export interface MetaWebhookPayload {
  object: string;
  entry: MetaEntry[];
}

export interface MetaEntry {
  id: string;
  changes: MetaChange[];
}

export interface MetaChange {
  value: MetaChangeValue;
  field: string;
}

export interface MetaChangeValue {
  messaging_product: string;
  metadata: { display_phone_number: string; phone_number_id: string };
  contacts?: Array<{ profile: { name: string }; wa_id: string }>;
  messages?: MetaMessage[];
  statuses?: MetaStatus[];
}

export interface MetaMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: { id: string; mime_type: string; sha256: string; caption?: string };
  audio?: { id: string; mime_type: string; voice: boolean };
  document?: { id: string; mime_type: string; filename: string; caption?: string };
  video?: { id: string; mime_type: string; caption?: string };
}

export interface MetaStatus {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  recipient_id: string;
}

// ─── Helper types ─────────────────────────────────────────────────────────────

export interface TemplateComponent {
  type: 'header' | 'body' | 'button';
  parameters: Array<{ type: 'text' | 'image' | 'document'; text?: string }>;
}

export interface InteractiveButton {
  type: 'reply';
  reply: { id: string; title: string };
}

export interface ListSection {
  title: string;
  rows: Array<{ id: string; title: string; description?: string }>;
}
