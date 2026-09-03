export interface StageDefinition {
  id: string;
  label: string;
  description: string;
  isTerminal?: boolean;
}

const STAGE_MAPS: Record<string, StageDefinition[]> = {
  support_bot: [
    { id: 'greeting',      label: 'Greeting',      description: 'Initial contact, understanding what the customer needs' },
    { id: 'triage',        label: 'Triage',         description: 'Gathering context to diagnose the issue' },
    { id: 'investigating', label: 'Investigating',  description: 'Actively researching or gathering more details' },
    { id: 'resolving',     label: 'Resolving',      description: 'Providing a solution or workaround' },
    { id: 'verifying',     label: 'Verifying',      description: 'Confirming resolution to customer satisfaction' },
    { id: 'closing',       label: 'Closing',        description: 'Wrapping up', isTerminal: true },
    { id: 'escalated',     label: 'Escalated',      description: 'Handed off to a human agent', isTerminal: true },
  ],
  sales_bot: [
    { id: 'greeting',           label: 'Greeting',          description: 'Opening the conversation, building rapport' },
    { id: 'qualifying',         label: 'Qualifying',         description: 'Determining if the prospect is a good fit' },
    { id: 'needs_analysis',     label: 'Needs Analysis',     description: "Exploring the customer's specific needs and pain points" },
    { id: 'pitching',           label: 'Pitching',           description: 'Presenting the solution and its value' },
    { id: 'objection_handling', label: 'Objection Handling', description: 'Addressing concerns and hesitations' },
    { id: 'closing',            label: 'Closing',            description: 'Asking for the order or commitment', isTerminal: true },
    { id: 'following_up',       label: 'Following Up',       description: 'Post-sale or re-engagement', isTerminal: true },
  ],
  lifecycle_bot: [
    { id: 'reactivation',   label: 'Reactivation',  description: 'Re-engaging an inactive or lapsed customer' },
    { id: 'value_delivery', label: 'Value Delivery', description: 'Delivering value or content to maintain engagement' },
    { id: 'engaging',       label: 'Engaging',       description: 'Building interest and engagement' },
    { id: 'converting',     label: 'Converting',     description: 'Moving toward a specific action or conversion' },
    { id: 'confirming',     label: 'Confirming',     description: 'Confirming intent and next steps' },
    { id: 'closing',        label: 'Closing',        description: 'Closing the loop on this interaction', isTerminal: true },
  ],
  _default: [
    { id: 'greeting',     label: 'Greeting',     description: 'Opening the conversation' },
    { id: 'qualifying',   label: 'Qualifying',   description: 'Understanding customer needs' },
    { id: 'resolving',    label: 'Resolving',    description: "Addressing the customer's need" },
    { id: 'following_up', label: 'Following Up', description: 'Checking in or next steps' },
    { id: 'closing',      label: 'Closing',      description: 'Wrapping up', isTerminal: true },
  ],
};

export function getStageDefinitions(productType: string): StageDefinition[] {
  return STAGE_MAPS[productType] ?? STAGE_MAPS['_default']!;
}

export function buildStagePromptBlock(productType: string, currentStage: string): string {
  const stages = getStageDefinitions(productType);
  const flow   = stages.map(s => s.id).join(' → ');
  const desc   = stages.find(s => s.id === currentStage)?.description;
  const validIds = stages.map(s => s.id).join(', ');
  return `Stage: ${currentStage}${desc ? ` — ${desc}` : ''}
Flow: ${flow}
Valid stage IDs for [STAGE:x]: ${validIds}`;
}
