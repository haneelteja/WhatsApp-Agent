export const OUTBOUND_EVENT_OPTIONS = [
  { value: 'contact.created',        label: 'Contact created',        desc: 'New contact added via inbound webhook' },
  { value: 'contact.updated',        label: 'Contact updated',        desc: 'Contact sentiment or data changed' },
  { value: 'conversation.resolved',  label: 'Conversation resolved',  desc: 'Agent or bot marks conversation as resolved' },
  { value: 'conversation.escalated', label: 'Conversation escalated', desc: 'Conversation needs human attention' },
];
