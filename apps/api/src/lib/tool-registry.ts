// Platform tool registry — defines every capability a bot can use.
// The allowed_tools column on bot_configs holds a subset of these IDs.
// At runtime, the webhook handler checks this list before injecting
// tool-specific prompt blocks and before calling tool functions.

export const TOOL_IDS = {
  KNOWLEDGE_BASE:     'knowledge_base',
  PRODUCT_CATALOGUE:  'product_catalogue',
  BUTTON_TEMPLATES:   'button_templates',
  LEAD_SCORING:       'lead_scoring',
  INTENT_SIGNALS:     'intent_signals',
  CONTACT_MEMORY:     'contact_memory',
  SCHEDULED_FOLLOWUP: 'scheduled_followup',
  VOICE_ESCALATION:   'voice_escalation',
  RETURN_REQUEST:     'return_request',
} as const;

export type ToolId = typeof TOOL_IDS[keyof typeof TOOL_IDS];

export interface ToolDefinition {
  id:          ToolId;
  label:       string;
  description: string;
  botTypes:    ('support_bot' | 'sales_bot' | 'lifecycle_bot' | '*')[];
  default:     boolean;
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    id:          TOOL_IDS.KNOWLEDGE_BASE,
    label:       'Knowledge Base Lookup',
    description: 'AI searches your knowledge base articles before responding. Enables accurate, cited answers.',
    botTypes:    ['*'],
    default:     true,
  },
  {
    id:          TOOL_IDS.PRODUCT_CATALOGUE,
    label:       'Product Catalogue',
    description: 'AI can display and quote from your product/price catalogue within conversations.',
    botTypes:    ['sales_bot', 'lifecycle_bot'],
    default:     true,
  },
  {
    id:          TOOL_IDS.BUTTON_TEMPLATES,
    label:       'Interactive Buttons',
    description: 'AI sends WhatsApp button messages for structured choices (Yes/No, options menus).',
    botTypes:    ['*'],
    default:     true,
  },
  {
    id:          TOOL_IDS.LEAD_SCORING,
    label:       'Lead Scoring',
    description: 'AI detects buying intent and flags high-value leads for human follow-up.',
    botTypes:    ['sales_bot'],
    default:     true,
  },
  {
    id:          TOOL_IDS.INTENT_SIGNALS,
    label:       'Intent Signal Detection',
    description: 'AI tags conversations with intent signals (pricing inquiry, urgency, objections) for explainable scoring.',
    botTypes:    ['sales_bot', 'lifecycle_bot'],
    default:     true,
  },
  {
    id:          TOOL_IDS.CONTACT_MEMORY,
    label:       'Contact Memory',
    description: 'AI remembers previous interactions and preferences for returning contacts.',
    botTypes:    ['*'],
    default:     true,
  },
  {
    id:          TOOL_IDS.SCHEDULED_FOLLOWUP,
    label:       'Scheduled Follow-up',
    description: 'AI can schedule automatic follow-up messages when conversations go quiet.',
    botTypes:    ['sales_bot', 'lifecycle_bot'],
    default:     false,
  },
  {
    id:          TOOL_IDS.VOICE_ESCALATION,
    label:       'Voice Call Escalation',
    description: 'AI can trigger an outbound voice call when a high-intent lead is detected.',
    botTypes:    ['sales_bot'],
    default:     false,
  },
  {
    id:          TOOL_IDS.RETURN_REQUEST,
    label:       'Return / Replacement Flow',
    description: 'AI detects return and replacement requests and logs them for staff review.',
    botTypes:    ['lifecycle_bot'],
    default:     true,
  },
];

export function getDefaultTools(productType: string): ToolId[] {
  return TOOL_DEFINITIONS
    .filter(t => t.default && (t.botTypes.includes('*') || t.botTypes.includes(productType as never)))
    .map(t => t.id);
}

export function toolEnabled(allowedTools: string[], toolId: ToolId): boolean {
  // Empty array means "use defaults" for backwards compatibility
  if (allowedTools.length === 0) return TOOL_DEFINITIONS.find(t => t.id === toolId)?.default ?? false;
  return allowedTools.includes(toolId);
}
