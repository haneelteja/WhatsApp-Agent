'use client';

import { useState, useTransition } from 'react';
import { Clock, Globe, CheckCircle2 } from 'lucide-react';
import { saveVoiceWorkingHours } from '@/app/actions/voice-working-hours';

type DayKey      = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
type DaySchedule = { start: string; end: string; enabled: boolean };

const DAYS: { key: DayKey; label: string }[] = [
  { key: 'mon', label: 'Monday'    },
  { key: 'tue', label: 'Tuesday'   },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday'  },
  { key: 'fri', label: 'Friday'    },
  { key: 'sat', label: 'Saturday'  },
  { key: 'sun', label: 'Sunday'    },
];

const TIMEZONES = [
  { value: 'Asia/Kolkata',       label: 'India (IST — UTC+5:30)'        },
  { value: 'Asia/Dubai',         label: 'Dubai (GST — UTC+4)'           },
  { value: 'Asia/Singapore',     label: 'Singapore (SGT — UTC+8)'       },
  { value: 'Asia/Tokyo',         label: 'Tokyo (JST — UTC+9)'           },
  { value: 'Asia/Dhaka',         label: 'Dhaka (BST — UTC+6)'           },
  { value: 'Asia/Karachi',       label: 'Karachi (PKT — UTC+5)'         },
  { value: 'Asia/Colombo',       label: 'Colombo (SLST — UTC+5:30)'     },
  { value: 'Asia/Riyadh',        label: 'Riyadh (AST — UTC+3)'          },
  { value: 'Europe/London',      label: 'London (GMT/BST)'               },
  { value: 'Europe/Paris',       label: 'Paris/Berlin (CET — UTC+1)'    },
  { value: 'America/New_York',   label: 'New York (EST/EDT)'             },
  { value: 'America/Chicago',    label: 'Chicago (CST/CDT)'              },
  { value: 'America/Los_Angeles',label: 'Los Angeles (PST/PDT)'          },
  { value: 'America/Sao_Paulo',  label: 'São Paulo (BRT — UTC-3)'       },
  { value: 'Australia/Sydney',   label: 'Sydney (AEST/AEDT)'             },
  { value: 'Pacific/Auckland',   label: 'Auckland (NZST/NZDT)'           },
  { value: 'UTC',                label: 'UTC'                             },
];

const DEFAULT_HOURS: Record<DayKey, DaySchedule> = {
  mon: { start: '09:00', end: '18:00', enabled: true  },
  tue: { start: '09:00', end: '18:00', enabled: true  },
  wed: { start: '09:00', end: '18:00', enabled: true  },
  thu: { start: '09:00', end: '18:00', enabled: true  },
  fri: { start: '09:00', end: '18:00', enabled: true  },
  sat: { start: '09:00', end: '13:00', enabled: false },
  sun: { start: '09:00', end: '13:00', enabled: false },
};

export type WorkingHoursInitial = {
  timezone:              string;
  working_hours_enabled: boolean;
  working_hours_json:    Record<DayKey, DaySchedule>;
};

export function VoiceWorkingHoursCard({ initial }: { initial: WorkingHoursInitial | null }) {
  const [timezone, setTimezone]   = useState(initial?.timezone ?? 'Asia/Kolkata');
  const [enabled,  setEnabled]    = useState(initial?.working_hours_enabled ?? false);
  const [hours,    setHours]      = useState<Record<DayKey, DaySchedule>>(
    initial?.working_hours_json ?? DEFAULT_HOURS,
  );
  const [saved,    setSaved]      = useState(false);
  const [error,    setError]      = useState<string | null>(null);
  const [pending,  startTransition] = useTransition();

  function updateDay(day: DayKey, patch: Partial<DaySchedule>) {
    setHours(prev => ({ ...prev, [day]: { ...prev[day], ...patch } }));
    setSaved(false);
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await saveVoiceWorkingHours(timezone, enabled, hours);
      if (result.error) {
        setError(result.error);
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    });
  }

  return (
    <div className="space-y-5">
      {/* Master toggle */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-gray-800">Restrict calls to working hours</p>
          <p className="text-xs text-gray-400 mt-0.5">
            When enabled, outbound calls (manual, campaign, escalation) will be blocked outside the schedule below.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setEnabled(e => !e); setSaved(false); }}
          className={`relative shrink-0 w-11 h-6 rounded-full transition-colors duration-200 ${
            enabled ? 'bg-emerald-500' : 'bg-gray-200'
          }`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
            enabled ? 'translate-x-5' : 'translate-x-0'
          }`} />
        </button>
      </div>

      {/* Timezone */}
      <div>
        <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          <Globe size={11} />
          Timezone
        </label>
        <select
          value={timezone}
          onChange={e => { setTimezone(e.target.value); setSaved(false); }}
          disabled={!enabled}
          className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:opacity-50 disabled:bg-gray-50"
        >
          {TIMEZONES.map(tz => (
            <option key={tz.value} value={tz.value}>{tz.label}</option>
          ))}
        </select>
      </div>

      {/* Schedule grid */}
      <div>
        <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          <Clock size={11} />
          Schedule
        </label>

        <div className="rounded-2xl border border-gray-100 overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-4 py-2.5 bg-gray-50 border-b border-gray-100">
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Day</span>
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-20 text-center">Start</span>
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-20 text-center">End</span>
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-14 text-center">Active</span>
          </div>

          {/* Day rows */}
          <div className="divide-y divide-gray-50 bg-white">
            {DAYS.map(({ key, label }) => {
              const day = hours[key];
              const isWeekend = key === 'sat' || key === 'sun';
              return (
                <div
                  key={key}
                  className={`grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center px-4 py-3 transition-colors ${
                    !enabled || !day.enabled ? 'opacity-50' : ''
                  } ${isWeekend ? 'bg-slate-50/40' : ''}`}
                >
                  <span className={`text-sm font-medium ${day.enabled ? 'text-gray-800' : 'text-gray-400'}`}>
                    {label}
                  </span>

                  <input
                    type="time"
                    value={day.start}
                    disabled={!enabled || !day.enabled}
                    onChange={e => updateDay(key, { start: e.target.value })}
                    className="w-20 text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:opacity-50 disabled:bg-gray-50 text-center"
                  />

                  <input
                    type="time"
                    value={day.end}
                    disabled={!enabled || !day.enabled}
                    onChange={e => updateDay(key, { end: e.target.value })}
                    className="w-20 text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:opacity-50 disabled:bg-gray-50 text-center"
                  />

                  <div className="w-14 flex justify-center">
                    <button
                      type="button"
                      disabled={!enabled}
                      onClick={() => updateDay(key, { enabled: !day.enabled })}
                      className={`w-8 h-4.5 relative rounded-full transition-colors duration-200 disabled:opacity-40 ${
                        day.enabled ? 'bg-emerald-500' : 'bg-gray-200'
                      }`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                        day.enabled ? 'translate-x-3.5' : 'translate-x-0'
                      }`} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-2.5">{error}</p>
      )}

      {/* Save button */}
      <div className="flex items-center justify-end gap-3">
        {saved && (
          <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
            <CheckCircle2 size={13} />
            Saved
          </span>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={pending}
          className="px-5 py-2 text-sm font-semibold bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Save working hours'}
        </button>
      </div>
    </div>
  );
}
