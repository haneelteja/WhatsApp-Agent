'use client';

import { useState }  from 'react';
import Link          from 'next/link';
import { Phone, MessageSquare, AlertCircle } from 'lucide-react';
import { ContactsGroupBar, ContactGroupBadges } from './ContactsGroupManager';
import type { GroupOption, AssignedGroup }      from './ContactsGroupManager';

// ─── Types ────────────────────────────────────────────────────────────────────

type MemoryJson = {
  sentiment?:          string;
  preferences?:        Record<string, string>;
  open_issues?:        string[];
  awaiting_csat?:      boolean;
  csat_score?:         number;
};

export type ContactRowData = {
  id:          string;
  phone:       string | null;
  bsuid:       string | null;
  name:        string | null;
  memory_json: MemoryJson | null;
  updated_at:  string;
  conv_count:  number;
  latest_conv_id: string | null;
  assigned:    AssignedGroup[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SENTIMENT_STYLES: Record<string, { label: string; dot: string; badge: string }> = {
  positive:   { label: 'Positive',   dot: 'bg-emerald-400', badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
  neutral:    { label: 'Neutral',    dot: 'bg-slate-300',   badge: 'bg-slate-50 text-slate-600 ring-1 ring-slate-200' },
  negative:   { label: 'Negative',   dot: 'bg-orange-400',  badge: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200' },
  frustrated: { label: 'Frustrated', dot: 'bg-red-400',     badge: 'bg-red-50 text-red-700 ring-1 ring-red-200' },
};

function formatRelative(dateStr: string): string {
  const diff  = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7)   return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function displayName(c: ContactRowData) {
  return c.name ?? c.phone ?? c.bsuid ?? 'Unknown';
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ContactsTabClient({
  contacts,
  initialGroups,
}: {
  contacts:      ContactRowData[];
  initialGroups: GroupOption[];
}) {
  const [allGroups, setAllGroups] = useState<GroupOption[]>(initialGroups);

  return (
    <div className="space-y-4">
      {/* Groups bar — create new group inline, see all groups */}
      <div className="bg-white rounded-xl border border-slate-200 px-5 py-4">
        <ContactsGroupBar initialGroups={initialGroups} onGroupsChange={setAllGroups} />
      </div>

      {/* Contact list */}
      {contacts.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <p className="text-slate-500 font-medium">No contacts found</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
          {contacts.map(contact => {
            const mem       = contact.memory_json ?? {};
            const sentiment = mem.sentiment ?? 'neutral';
            const sentStyle = SENTIMENT_STYLES[sentiment] ?? SENTIMENT_STYLES['neutral']!;
            const openIssues  = mem.open_issues ?? [];
            const preferences = mem.preferences ?? {};
            const prefEntries = Object.entries(preferences).slice(0, 3);

            return (
              <div key={contact.id} className="flex items-start gap-4 px-5 py-4 hover:bg-slate-50/70 transition-colors">
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 text-emerald-700 font-semibold text-sm">
                  {displayName(contact).charAt(0).toUpperCase()}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-900 text-sm">{displayName(contact)}</span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${sentStyle.badge}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${sentStyle.dot}`} />
                      {sentStyle.label}
                    </span>
                    {mem.awaiting_csat && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700 ring-1 ring-purple-200">CSAT pending</span>
                    )}
                    {mem.csat_score !== undefined && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 ring-1 ring-amber-200">CSAT {mem.csat_score}/5</span>
                    )}
                  </div>

                  {contact.phone && (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Phone size={11} className="text-slate-400" />
                      <span className="text-xs text-slate-500">{contact.phone}</span>
                    </div>
                  )}

                  {prefEntries.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {prefEntries.map(([k, v]) => (
                        <span key={k} className="px-2 py-0.5 rounded-md text-xs bg-slate-100 text-slate-600">
                          <span className="text-slate-400">{k}:</span> {v}
                        </span>
                      ))}
                      {Object.keys(preferences).length > 3 && (
                        <span className="px-2 py-0.5 rounded-md text-xs bg-slate-100 text-slate-400">
                          +{Object.keys(preferences).length - 3} more
                        </span>
                      )}
                    </div>
                  )}

                  {openIssues.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <AlertCircle size={11} className="text-orange-400 shrink-0" />
                      <span className="text-xs text-orange-600 truncate">{openIssues[0]}</span>
                      {openIssues.length > 1 && <span className="text-xs text-slate-400">+{openIssues.length - 1}</span>}
                    </div>
                  )}

                  {/* Group badges — always visible, live state */}
                  <ContactGroupBadges
                    contactId={contact.id}
                    allGroups={allGroups}
                    initialAssigned={contact.assigned}
                  />
                </div>

                {/* Right column */}
                <div className="shrink-0 flex flex-col items-end gap-1.5 text-right">
                  <span className="text-xs text-slate-400">{formatRelative(contact.updated_at)}</span>
                  <div className="flex items-center gap-1 text-xs text-slate-500">
                    <MessageSquare size={11} className="text-slate-400" />
                    <span>{contact.conv_count} conv{contact.conv_count !== 1 ? 's' : ''}</span>
                  </div>
                  {contact.latest_conv_id && (
                    <Link
                      href={`/conversations/${contact.latest_conv_id}`}
                      className="text-xs text-emerald-600 hover:text-emerald-700 font-medium hover:underline"
                    >
                      View chat →
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
