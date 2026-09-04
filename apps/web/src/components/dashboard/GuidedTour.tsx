'use client';

import { useState, useEffect, useTransition } from 'react';
import {
  LayoutDashboard, MessageSquare, Target, BookOpen,
  ShieldCheck, Megaphone, BarChart2, Settings,
  Sparkles, ArrowRight, X, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { markTourCompleteAction } from '@/app/actions/tour';

// ── Tour steps (one per sidebar section) ─────────────────────────────────────

const STEPS = [
  {
    id:          'overview',
    title:       'Overview',
    description: 'Your command centre. See live stats — active conversations, leads captured today, bot success rate, and pending escalations at a glance.',
    icon:        LayoutDashboard,
  },
  {
    id:          'conversations',
    title:       'Conversations',
    description: 'Every WhatsApp chat your bot handles appears here. Monitor bot replies in real time, jump in manually, assign chats to agents, or escalate to your team.',
    icon:        MessageSquare,
  },
  {
    id:          'leads',
    title:       'Leads',
    description: 'Every contact your bot talks to is captured as a lead. Track qualification status, view conversation history, and assign to your sales team.',
    icon:        Target,
  },
  {
    id:          'knowledge-base',
    title:       'Knowledge Base',
    description: 'Upload FAQs, product docs, and policies. Your bot answers customer questions directly from this content — the richer your KB, the smarter your bot.',
    icon:        BookOpen,
  },
  {
    id:          'guardrails',
    title:       'Guardrails',
    description: 'Control what your bot can and cannot say. Block topics, restrict keywords, set tone, and configure when the bot should hand off to a human agent.',
    icon:        ShieldCheck,
  },
  {
    id:          'campaigns',
    title:       'Campaigns',
    description: 'Send broadcast messages to your leads at scale. Schedule delivery, let the bot handle replies automatically, and track open and response rates.',
    icon:        Megaphone,
  },
  {
    id:          'analytics',
    title:       'Analytics',
    description: 'Track bot performance, conversation volumes, lead conversion rates, and campaign results — all in one dashboard. Export for your reports.',
    icon:        BarChart2,
  },
  {
    id:          'settings',
    title:       'Settings',
    description: 'Add your WhatsApp number, activate bots, invite team members, and configure AI models. Start here to get your first bot live.',
    icon:        Settings,
  },
];

type Phase = 'welcome' | 'spotlight' | 'done';

// ── Main component ────────────────────────────────────────────────────────────

export function GuidedTour({ initialCompleted }: { initialCompleted: boolean }) {
  const [phase,   setPhase]   = useState<Phase>(initialCompleted ? 'done' : 'welcome');
  const [stepIdx, setStepIdx] = useState(0);
  const [rect,    setRect]    = useState<DOMRect | null>(null);
  const [, startTx]           = useTransition();

  // Find the DOM element for the current spotlight step and measure it
  useEffect(() => {
    if (phase !== 'spotlight') return;

    const step = STEPS[stepIdx];
    if (!step) { complete(); return; }

    const el = document.querySelector<HTMLElement>(`[data-tour-id="${step.id}"]`);
    if (!el) {
      // Element not in DOM (role-based nav) — skip this step
      setStepIdx(i => i + 1);
      return;
    }

    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const timer = setTimeout(() => setRect(el.getBoundingClientRect()), 200);
    return () => clearTimeout(timer);
  }, [phase, stepIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep rect fresh on window resize
  useEffect(() => {
    if (phase !== 'spotlight') return;
    function onResize() {
      const step = STEPS[stepIdx];
      if (!step) return;
      const el = document.querySelector<HTMLElement>(`[data-tour-id="${step.id}"]`);
      if (el) setRect(el.getBoundingClientRect());
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [phase, stepIdx]);

  function skip() {
    startTx(async () => {
      await markTourCompleteAction();
      setPhase('done');
    });
  }

  function complete() {
    startTx(async () => {
      await markTourCompleteAction();
      setPhase('done');
    });
  }

  function startSpotlight() {
    // On mobile the sidebar is hidden — skip spotlight, just finish
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      complete();
      return;
    }
    setStepIdx(0);
    setRect(null);
    setPhase('spotlight');
  }

  function next() {
    if (stepIdx >= STEPS.length - 1) { complete(); return; }
    setStepIdx(i => i + 1);
  }

  function prev() {
    if (stepIdx > 0) setStepIdx(i => i - 1);
  }

  if (phase === 'done') return null;

  // ── Welcome modal ───────────────────────────────────────────────────────────
  if (phase === 'welcome') {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
          {/* Gradient header */}
          <div className="bg-gradient-to-br from-emerald-500 to-teal-600 px-8 pt-10 pb-8 text-center relative">
            <button type="button" onClick={skip}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white/80 hover:bg-white/30 transition-colors"
              aria-label="Skip tour">
              <X size={14} />
            </button>
            <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center mx-auto mb-4 shadow-lg">
              <Sparkles size={28} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">Welcome to Alphabot</h1>
            <p className="text-emerald-100 text-sm mt-1">Your AI-powered WhatsApp assistant</p>
          </div>

          <div className="px-8 py-6">
            <p className="text-slate-600 text-sm leading-relaxed text-center">
              You&apos;re moments away from having an AI bot responding to WhatsApp messages for your business.
              Take a quick tour to see everything that&apos;s available.
            </p>

            {/* Feature preview chips */}
            <div className="grid grid-cols-2 gap-2 mt-5 mb-6">
              {[
                { icon: MessageSquare, label: 'Live Conversations' },
                { icon: Target,        label: 'Lead Tracking'      },
                { icon: BookOpen,      label: 'Knowledge Base'     },
                { icon: BarChart2,     label: 'Analytics'          },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2.5">
                  <Icon size={13} className="text-emerald-600 shrink-0" />
                  <span className="text-xs font-medium text-slate-600">{label}</span>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button type="button" onClick={skip}
                className="flex-1 px-4 py-2.5 text-sm font-semibold text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
                Skip tour
              </button>
              <button type="button" onClick={startSpotlight}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-colors">
                Start tour <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Spotlight phase ─────────────────────────────────────────────────────────
  const step = STEPS[stepIdx];
  if (!step) return null;
  const StepIcon = step.icon;

  // Tooltip position: to the right of the highlighted sidebar element
  const tooltipLeft = rect ? rect.right + 20 : 260;
  const tooltipTop  = rect
    ? Math.min(Math.max(rect.top + rect.height / 2, 120), window.innerHeight - 250)
    : window.innerHeight / 2;

  return (
    <>
      {/* Dark overlay with spotlight hole */}
      <svg
        style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', zIndex: 9998, pointerEvents: 'all', cursor: 'default' }}
        aria-hidden="true"
      >
        <defs>
          <mask id="alphabot-tour-spotlight">
            <rect width="100%" height="100%" fill="white" />
            {rect && (
              <rect
                x={rect.left - 6}
                y={rect.top - 4}
                width={rect.width + 12}
                height={rect.height + 8}
                rx={10}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.65)"
          mask="url(#alphabot-tour-spotlight)"
        />
      </svg>

      {/* Tooltip card */}
      <div
        style={{
          position:  'fixed',
          left:      tooltipLeft,
          top:       tooltipTop,
          transform: 'translateY(-50%)',
          zIndex:    9999,
          width:     292,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Left-pointing arrow */}
        <div style={{
          position:    'absolute',
          left:        -9,
          top:         '50%',
          transform:   'translateY(-50%)',
          width:        0,
          height:       0,
          borderTop:    '9px solid transparent',
          borderBottom: '9px solid transparent',
          borderRight:  '9px solid white',
          filter:       'drop-shadow(-1px 0 1px rgba(0,0,0,0.06))',
        }} />

        <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-emerald-50 to-teal-50 px-5 py-4 border-b border-emerald-100">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">
                Step {stepIdx + 1} of {STEPS.length}
              </span>
              <button type="button" onClick={skip}
                className="w-5 h-5 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                aria-label="Skip tour">
                <X size={11} />
              </button>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                <StepIcon size={16} className="text-emerald-700" />
              </div>
              <h3 className="text-sm font-bold text-slate-800">{step.title}</h3>
            </div>
          </div>

          <div className="px-5 py-4">
            <p className="text-xs text-slate-500 leading-relaxed">{step.description}</p>

            {/* Progress dots */}
            <div className="flex items-center gap-1 mt-4 mb-4">
              {STEPS.map((_, i) => (
                <div key={i} className={`rounded-full transition-all duration-200 ${
                  i === stepIdx ? 'w-5 h-1.5 bg-emerald-500' : 'w-1.5 h-1.5 bg-slate-200'
                }`} />
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button type="button" onClick={skip}
                className="text-[11px] font-semibold text-slate-400 hover:text-slate-600 transition-colors mr-auto">
                Skip tour
              </button>
              {stepIdx > 0 && (
                <button type="button" onClick={prev}
                  className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 transition-colors">
                  <ChevronLeft size={13} />
                </button>
              )}
              <button type="button" onClick={next}
                className="flex items-center gap-1.5 text-xs font-semibold px-4 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors">
                {stepIdx === STEPS.length - 1 ? 'Finish' : 'Next'}
                {stepIdx < STEPS.length - 1 && <ChevronRight size={12} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
