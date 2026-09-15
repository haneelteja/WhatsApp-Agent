'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Bot, ArrowRight, Loader2, MessageSquare, TrendingUp, CheckCircle,
  Send, Sparkles, Calendar, HeartPulse, Users, ChevronRight,
  RefreshCw, BarChart3, Clock, Star,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = 'about' | 'business' | 'loading' | 'result';

interface LeadData {
  name: string;
  email: string;
  company: string;
  role: string;
  industry: string;
  companySize: string;
  dailyMessages: string;
  currentHandling: string;
  painPoints: string[];
  primaryGoal: string;
}

interface UseCase {
  title: string;
  description: string;
  impact: string;
  metric_a?: string;
  metric_b?: string;
}

interface Analysis {
  recommended_bot: string;
  recommended_name: string;
  recommended_price: string;
  confidence: string;
  recommendation_reason: string;
  roi_monthly_savings: number;
  roi_payback_period: string;
  roi_narrative: string;
  use_cases: UseCase[];
  business_impact: string;
  secondary_bot: string;
  secondary_name: string;
  secondary_reason: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const INDUSTRIES = [
  'D2C / E-commerce', 'Healthcare / Clinics', 'Restaurant & F&B',
  'Salon & Beauty Studio', 'Fitness & Wellness', 'Real Estate',
  'Education / Edtech', 'BFSI / Finance', 'Retail',
  'Manufacturing / B2B', 'Other',
];

const ROLES = ['Founder / CEO', 'Operations', 'Marketing', 'Sales', 'IT / Tech', 'Other'];

const SIZES = ['1–10 employees', '11–50 employees', '51–200 employees', '200+ employees'];

const MESSAGE_RANGES = ['Less than 50/day', '50–200/day', '200–500/day', '500+/day'];

const HANDLING_OPTIONS = [
  'Manual — team responds personally',
  'Basic auto-reply (keywords only)',
  'Another chatbot platform',
  'No system — ad hoc',
];

const PAIN_POINTS = [
  'Slow response time', 'Missed leads after hours', 'High support staff cost',
  'No after-hours coverage', 'Missed bookings & no-shows', 'Manual follow-up burden',
  'Lost leads from campaigns', 'Customer churn / inactive users',
];

const GOALS = [
  { key: 'Automate customer support', label: 'Automate support', icon: HeartPulse },
  { key: 'Convert more leads', label: 'Convert more leads', icon: TrendingUp },
  { key: 'Retain & re-engage customers', label: 'Retain customers', icon: Users },
  { key: 'Manage bookings & appointments', label: 'Manage bookings', icon: Calendar },
];

const BOT_STYLE: Record<string, { ring: string; badge: string; icon: React.ElementType; bg: string; accent: string }> = {
  support:      { ring: 'ring-sky-400',    badge: 'bg-sky-100 text-sky-700',      icon: HeartPulse, bg: 'from-sky-50 to-white',    accent: '#0ea5e9' },
  sales:        { ring: 'ring-violet-400', badge: 'bg-violet-100 text-violet-700', icon: TrendingUp, bg: 'from-violet-50 to-white', accent: '#8b5cf6' },
  lifecycle:    { ring: 'ring-orange-400', badge: 'bg-orange-100 text-orange-700', icon: Users,      bg: 'from-orange-50 to-white', accent: '#f97316' },
  appointments: { ring: 'ring-pink-400',   badge: 'bg-pink-100 text-pink-700',     icon: Calendar,   bg: 'from-pink-50 to-white',   accent: '#ec4899' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clsx(...args: (string | boolean | undefined | null)[]) {
  return args.filter(Boolean).join(' ');
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ProgressBar({ step }: { step: Step }) {
  const steps: Step[] = ['about', 'business', 'loading', 'result'];
  const idx = steps.indexOf(step);
  return (
    <div className="flex items-center gap-2 mb-8">
      {['About You', 'Your Business', 'Analysis', 'Results'].map((label, i) => (
        <div key={i} className="flex items-center gap-2 flex-1 last:flex-none">
          <div className={clsx(
            'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all',
            i < idx ? 'bg-emerald-500 text-white' :
            i === idx ? 'bg-emerald-500 text-white ring-4 ring-emerald-100' :
            'bg-slate-100 text-slate-400'
          )}>
            {i < idx ? <CheckCircle size={14} /> : i + 1}
          </div>
          <span className={clsx(
            'text-xs font-medium hidden sm:block',
            i <= idx ? 'text-emerald-700' : 'text-slate-400'
          )}>{label}</span>
          {i < 3 && <div className={clsx('flex-1 h-0.5 mx-1', i < idx ? 'bg-emerald-400' : 'bg-slate-100')} />}
        </div>
      ))}
    </div>
  );
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-sm font-semibold text-slate-700 mb-1.5">
      {children}
      {required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
  );
}

function TextInput({ value, onChange, placeholder, type = 'text', error }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string; error?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={clsx(
        'w-full rounded-xl border px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 transition-all',
        error ? 'border-red-300 focus:ring-red-200' : 'border-slate-200 focus:ring-emerald-200 focus:border-emerald-400'
      )}
    />
  );
}

function SelectInput({ value, onChange, options, placeholder }: {
  value: string; onChange: (v: string) => void; options: string[]; placeholder?: string;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 bg-white"
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function ChipGroup({ options, selected, onToggle, max = 99 }: {
  options: string[]; selected: string[]; onToggle: (v: string) => void; max?: number;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(o => {
        const active = selected.includes(o);
        const disabled = !active && selected.length >= max;
        return (
          <button
            key={o}
            type="button"
            onClick={() => !disabled && onToggle(o)}
            className={clsx(
              'px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
              active ? 'bg-emerald-500 text-white border-emerald-500' :
              disabled ? 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed' :
              'bg-white text-slate-600 border-slate-200 hover:border-emerald-300 hover:text-emerald-700'
            )}
          >{o}</button>
        );
      })}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ProspectAdvisorPage() {
  const [step, setStep] = useState<Step>('about');
  const [error, setError] = useState('');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  const [lead, setLead] = useState<LeadData>({
    name: '', email: '', company: '', role: '', industry: '',
    companySize: '', dailyMessages: '', currentHandling: '',
    painPoints: [], primaryGoal: '',
  });

  function set<K extends keyof LeadData>(key: K, value: LeadData[K]) {
    setLead(prev => ({ ...prev, [key]: value }));
  }

  function togglePain(p: string) {
    set('painPoints', lead.painPoints.includes(p)
      ? lead.painPoints.filter(x => x !== p)
      : [...lead.painPoints, p]
    );
  }

  // ── Validation ────────────────────────────────────────────────────────────

  function validateAbout(): string {
    if (!lead.name.trim())    return 'Please enter your full name.';
    if (!lead.email.trim() || !lead.email.includes('@')) return 'Please enter a valid email address.';
    if (!lead.company.trim()) return 'Please enter your company name.';
    if (!lead.role)           return 'Please select your role.';
    if (!lead.industry)       return 'Please select your industry.';
    if (!lead.companySize)    return 'Please select your company size.';
    return '';
  }

  function validateBusiness(): string {
    if (!lead.dailyMessages)    return 'Please select your daily WhatsApp message volume.';
    if (!lead.currentHandling)  return 'Please select how you currently handle WhatsApp.';
    if (!lead.primaryGoal)      return 'Please select your primary goal.';
    return '';
  }

  // ── Step navigation ───────────────────────────────────────────────────────

  function handleAboutNext() {
    const err = validateAbout();
    if (err) { setError(err); return; }
    setError('');
    setStep('business');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleBusinessNext() {
    const err = validateBusiness();
    if (err) { setError(err); return; }
    setError('');
    setStep('loading');
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Fire email in background — don't block UI
    fetch('/api/prospect-advisor/send-lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead, analysis: null }),
    }).catch(() => { /* non-blocking */ });

    // LLM analysis
    try {
      const res = await fetch('/api/prospect-advisor/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead }),
      });
      const data = await res.json();

      if (!res.ok || !data.analysis) {
        setError(data.error ?? 'Analysis failed. Please try again.');
        setStep('business');
        return;
      }

      setAnalysis(data.analysis);
      setStep('result');

      // Fire email again with full analysis
      fetch('/api/prospect-advisor/send-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead, analysis: data.analysis }),
      }).catch(() => { /* non-blocking */ });
    } catch {
      setError('Something went wrong. Please check your connection and try again.');
      setStep('business');
    }
  }

  // ── Chat ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (showChat) {
      setTimeout(() => chatInputRef.current?.focus(), 100);
    }
  }, [showChat]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatLoading]);

  async function sendChat(e: React.FormEvent) {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text || chatLoading || !analysis) return;

    const newMessages: ChatMessage[] = [...chatMessages, { role: 'user', content: text }];
    setChatMessages(newMessages);
    setChatInput('');
    setChatLoading(true);

    // Add placeholder assistant message
    setChatMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    try {
      const res = await fetch('/api/prospect-advisor/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead, analysis, messages: newMessages }),
      });

      if (!res.ok || !res.body) {
        setChatMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: "Sorry, I couldn't process that. Please try again." };
          return updated;
        });
        setChatLoading(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let assistantText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.text) {
              assistantText += parsed.text;
              setChatMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: 'assistant', content: assistantText };
                return updated;
              });
            }
          } catch { /* skip */ }
        }
      }
    } catch {
      setChatMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', content: "Connection error — please try again." };
        return updated;
      });
    } finally {
      setChatLoading(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const style = analysis ? (BOT_STYLE[analysis.recommended_bot] ?? BOT_STYLE.support) : null;
  const BotIcon = style?.icon ?? Bot;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-emerald-50/30">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center">
              <Bot size={15} className="text-white" />
            </div>
            <span className="font-bold text-slate-800 text-sm">Alphabot</span>
            <span className="text-slate-300 text-sm">·</span>
            <span className="text-slate-500 text-sm">AI Advisor</span>
          </div>
          {step === 'result' && (
            <button
              onClick={() => { setStep('about'); setAnalysis(null); setChatMessages([]); setShowChat(false); setError(''); }}
              className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1"
            >
              <RefreshCw size={12} /> Start over
            </button>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">

        {/* ── ABOUT step ────────────────────────────────────────────────── */}
        {step === 'about' && (
          <div>
            <ProgressBar step={step} />
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-slate-900 mb-1">Find the right WhatsApp AI bot for your business</h1>
              <p className="text-slate-500 text-sm">Answer 8 questions. Our AI will recommend the best Alphabot setup and show you the ROI in under 30 seconds.</p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
              <h2 className="font-semibold text-slate-700 flex items-center gap-2 text-sm">
                <span className="w-5 h-5 rounded-full bg-emerald-500 text-white text-xs flex items-center justify-center font-bold">1</span>
                About you
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <FieldLabel required>Full name</FieldLabel>
                  <TextInput value={lead.name} onChange={v => set('name', v)} placeholder="Rajesh Kumar" />
                </div>
                <div>
                  <FieldLabel required>Work email</FieldLabel>
                  <TextInput value={lead.email} onChange={v => set('email', v)} placeholder="rajesh@company.com" type="email" />
                </div>
                <div>
                  <FieldLabel required>Company name</FieldLabel>
                  <TextInput value={lead.company} onChange={v => set('company', v)} placeholder="Acme Pvt. Ltd." />
                </div>
                <div>
                  <FieldLabel required>Your role</FieldLabel>
                  <SelectInput value={lead.role} onChange={v => set('role', v)} options={ROLES} placeholder="Select role" />
                </div>
                <div>
                  <FieldLabel required>Industry</FieldLabel>
                  <SelectInput value={lead.industry} onChange={v => set('industry', v)} options={INDUSTRIES} placeholder="Select industry" />
                </div>
                <div>
                  <FieldLabel required>Company size</FieldLabel>
                  <SelectInput value={lead.companySize} onChange={v => set('companySize', v)} options={SIZES} placeholder="Select size" />
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-600">{error}</div>
              )}

              <button
                onClick={handleAboutNext}
                className="w-full sm:w-auto flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold px-6 py-2.5 rounded-xl transition-colors"
              >
                Next — Your Business <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ── BUSINESS step ─────────────────────────────────────────────── */}
        {step === 'business' && (
          <div>
            <ProgressBar step={step} />
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-slate-900 mb-1">Tell us about your WhatsApp setup</h1>
              <p className="text-slate-500 text-sm">This helps our AI calculate your specific ROI and pick the best bot for your situation.</p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
              <h2 className="font-semibold text-slate-700 flex items-center gap-2 text-sm">
                <span className="w-5 h-5 rounded-full bg-emerald-500 text-white text-xs flex items-center justify-center font-bold">2</span>
                Your business
              </h2>

              <div>
                <FieldLabel required>How many WhatsApp messages do you receive per day?</FieldLabel>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {MESSAGE_RANGES.map(r => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => set('dailyMessages', r)}
                      className={clsx(
                        'py-2.5 px-3 rounded-xl text-xs font-semibold border transition-all text-center',
                        lead.dailyMessages === r
                          ? 'bg-emerald-500 text-white border-emerald-500'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300'
                      )}
                    >{r}</button>
                  ))}
                </div>
              </div>

              <div>
                <FieldLabel required>How do you currently handle WhatsApp messages?</FieldLabel>
                <div className="space-y-2">
                  {HANDLING_OPTIONS.map(o => (
                    <button
                      key={o}
                      type="button"
                      onClick={() => set('currentHandling', o)}
                      className={clsx(
                        'w-full text-left py-2.5 px-4 rounded-xl text-sm border transition-all',
                        lead.currentHandling === o
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-800 font-medium'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                      )}
                    >{o}</button>
                  ))}
                </div>
              </div>

              <div>
                <FieldLabel>What are your biggest pain points? <span className="font-normal text-slate-400">(select all that apply)</span></FieldLabel>
                <ChipGroup options={PAIN_POINTS} selected={lead.painPoints} onToggle={togglePain} />
              </div>

              <div>
                <FieldLabel required>What&apos;s your primary goal with WhatsApp automation?</FieldLabel>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {GOALS.map(g => {
                    const Icon = g.icon;
                    const active = lead.primaryGoal === g.key;
                    return (
                      <button
                        key={g.key}
                        type="button"
                        onClick={() => set('primaryGoal', g.key)}
                        className={clsx(
                          'flex items-center gap-3 py-3 px-4 rounded-xl border text-sm font-medium transition-all text-left',
                          active
                            ? 'bg-emerald-50 border-emerald-400 text-emerald-800'
                            : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                        )}
                      >
                        <Icon size={16} className={active ? 'text-emerald-600' : 'text-slate-400'} />
                        {g.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-600">{error}</div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => { setError(''); setStep('about'); }}
                  className="px-5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-600 hover:border-slate-300 font-medium transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleBusinessNext}
                  className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold px-6 py-2.5 rounded-xl transition-colors"
                >
                  <Sparkles size={15} /> Get My Recommendation
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── LOADING step ──────────────────────────────────────────────── */}
        {step === 'loading' && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8">
            <div className="relative">
              <div className="w-20 h-20 rounded-2xl bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-200">
                <Bot size={36} className="text-white" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-white border-2 border-emerald-500 flex items-center justify-center">
                <Loader2 size={13} className="text-emerald-500 animate-spin" />
              </div>
            </div>
            <div className="text-center">
              <h2 className="text-xl font-bold text-slate-800 mb-2">Analysing your business…</h2>
              <p className="text-slate-500 text-sm max-w-xs">Our AI is reading your profile, calculating your ROI, and finding the best bot match for {lead.company}.</p>
            </div>
            <LoadingDots />
          </div>
        )}

        {/* ── RESULT step ───────────────────────────────────────────────── */}
        {step === 'result' && analysis && style && (
          <div>
            <ProgressBar step={step} />

            {/* Recommendation card */}
            <div className={clsx('rounded-2xl bg-gradient-to-br p-6 mb-4 border ring-2', style.bg, style.ring, 'border-white shadow-lg')}>
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1">
                    Recommended for {lead.company}
                  </div>
                  <h1 className="text-2xl font-bold text-slate-900">{analysis.recommended_name}</h1>
                  <div className="text-lg font-semibold text-slate-600 mt-0.5">{analysis.recommended_price}</div>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <div className={clsx('flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold', style.badge)}>
                    <BotIcon size={12} />
                    {analysis.confidence === 'high' ? 'Strong match' : 'Good match'}
                  </div>
                  <div className="flex gap-0.5">
                    {[1,2,3,4,5].map(i => (
                      <Star key={i} size={11} className={analysis.confidence === 'high' ? 'text-amber-400 fill-amber-400' : i <= 4 ? 'text-amber-400 fill-amber-400' : 'text-slate-200'} />
                    ))}
                  </div>
                </div>
              </div>
              <p className="text-slate-700 text-sm leading-relaxed">{analysis.recommendation_reason}</p>
            </div>

            {/* ROI metrics */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 text-center">
                <BarChart3 size={18} className="text-emerald-500 mx-auto mb-1.5" />
                <div className="text-xl font-bold text-slate-900">₹{analysis.roi_monthly_savings.toLocaleString('en-IN')}</div>
                <div className="text-xs text-slate-500 mt-0.5">Saved / month</div>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 text-center">
                <Clock size={18} className="text-emerald-500 mx-auto mb-1.5" />
                <div className="text-xl font-bold text-slate-900">{analysis.roi_payback_period}</div>
                <div className="text-xs text-slate-500 mt-0.5">Payback period</div>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 text-center">
                <CheckCircle size={18} className="text-emerald-500 mx-auto mb-1.5" />
                <div className="text-xl font-bold text-slate-900">70–80%</div>
                <div className="text-xs text-slate-500 mt-0.5">Automation rate</div>
              </div>
            </div>

            {/* ROI narrative */}
            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 mb-4">
              <div className="text-xs font-semibold text-emerald-600 uppercase tracking-wider mb-1">Your ROI story</div>
              <p className="text-sm text-emerald-900 leading-relaxed">{analysis.roi_narrative}</p>
            </div>

            {/* Use cases */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-4">
              <h2 className="font-semibold text-slate-800 mb-1 flex items-center gap-2">
                <ChevronRight size={16} className="text-emerald-500" />
                Key Use Cases for {lead.industry}
              </h2>
              <p className="text-xs text-slate-400 mb-4">How the bot handles your specific workflows — step by step</p>
              <div className="space-y-3">
                {analysis.use_cases.map((uc, i) => (
                  <UseCaseCard key={i} uc={uc} index={i} />
                ))}
              </div>
            </div>

            {/* Business impact */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-4">
              <h2 className="font-semibold text-slate-800 mb-2">What changes for {lead.company}</h2>
              <p className="text-sm text-slate-600 leading-relaxed">{analysis.business_impact}</p>
            </div>

            {/* Secondary bot */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-6 flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-200 flex items-center justify-center shrink-0">
                <Sparkles size={14} className="text-slate-500" />
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500 mb-0.5">Also consider at 60–90 days</div>
                <div className="text-sm font-semibold text-slate-800">{analysis.secondary_name}</div>
                <div className="text-xs text-slate-500 mt-0.5">{analysis.secondary_reason}</div>
              </div>
            </div>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              <a
                href="https://wa.me/919642917777?text=Hi%2C%20I%27d%20like%20to%20book%20a%20demo%20for%20Alphabot"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold px-6 py-3 rounded-xl transition-colors text-sm"
              >
                Book a free demo <ArrowRight size={15} />
              </a>
              <button
                onClick={() => { setShowChat(v => !v); }}
                className={clsx(
                  'flex-1 flex items-center justify-center gap-2 font-semibold px-6 py-3 rounded-xl transition-colors text-sm border',
                  showChat
                    ? 'bg-slate-100 text-slate-700 border-slate-200'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-300 hover:text-emerald-700'
                )}
              >
                <MessageSquare size={15} />
                {showChat ? 'Hide chat' : 'Ask a question'}
              </button>
            </div>

            {/* Chat panel */}
            {showChat && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center">
                    <Bot size={14} className="text-white" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-800">Chat with Alphabot AI</div>
                    <div className="text-xs text-slate-400">Ask anything about your recommendation, pricing, or how it works</div>
                  </div>
                </div>

                {/* Starter prompts */}
                {chatMessages.length === 0 && (
                  <div className="p-4 flex flex-wrap gap-2">
                    {[
                      'How long does setup take?',
                      `How does it handle ${lead.industry.split(' ')[0]} queries?`,
                      'What about pricing and trials?',
                      'How is it different from AiSensy?',
                    ].map(q => (
                      <button
                        key={q}
                        onClick={() => { setChatInput(q); setTimeout(() => chatInputRef.current?.focus(), 50); }}
                        className="text-xs px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 hover:border-emerald-300 hover:text-emerald-700 transition-colors"
                      >{q}</button>
                    ))}
                  </div>
                )}

                {/* Messages */}
                {chatMessages.length > 0 && (
                  <div className="p-4 space-y-4 max-h-80 overflow-y-auto">
                    {chatMessages.map((m, i) => (
                      <div key={i} className={clsx('flex gap-2.5', m.role === 'user' ? 'flex-row-reverse' : '')}>
                        {m.role === 'assistant' && (
                          <div className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center shrink-0 mt-0.5">
                            <Bot size={13} className="text-white" />
                          </div>
                        )}
                        <div className={clsx(
                          'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                          m.role === 'user'
                            ? 'bg-emerald-500 text-white rounded-tr-sm'
                            : 'bg-slate-50 text-slate-800 rounded-tl-sm',
                          !m.content && 'animate-pulse'
                        )}>
                          {m.content || <span className="text-slate-400">...</span>}
                        </div>
                      </div>
                    ))}
                    <div ref={chatEndRef} />
                  </div>
                )}

                {/* Input */}
                <form onSubmit={sendChat} className="border-t border-slate-100 p-3 flex gap-2">
                  <input
                    ref={chatInputRef}
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    placeholder="Ask about setup, pricing, use cases…"
                    disabled={chatLoading}
                    className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={!chatInput.trim() || chatLoading}
                    className="w-10 h-10 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white flex items-center justify-center transition-colors shrink-0"
                  >
                    {chatLoading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                  </button>
                </form>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

const UC_ICONS = [Calendar, Clock, CheckCircle, RefreshCw, TrendingUp];
const UC_COLORS = [
  { bg: 'bg-sky-50',    border: 'border-sky-100',    icon: 'text-sky-500',    num: 'bg-sky-100 text-sky-700',    pill: 'bg-sky-50 text-sky-700 border-sky-200' },
  { bg: 'bg-violet-50', border: 'border-violet-100', icon: 'text-violet-500', num: 'bg-violet-100 text-violet-700', pill: 'bg-violet-50 text-violet-700 border-violet-200' },
  { bg: 'bg-emerald-50',border: 'border-emerald-100',icon: 'text-emerald-500',num: 'bg-emerald-100 text-emerald-700', pill: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { bg: 'bg-orange-50', border: 'border-orange-100', icon: 'text-orange-500', num: 'bg-orange-100 text-orange-700', pill: 'bg-orange-50 text-orange-700 border-orange-200' },
  { bg: 'bg-pink-50',   border: 'border-pink-100',   icon: 'text-pink-500',   num: 'bg-pink-100 text-pink-700',   pill: 'bg-pink-50 text-pink-700 border-pink-200' },
];

function UseCaseCard({ uc, index }: { uc: UseCase; index: number }) {
  const color = UC_COLORS[index % UC_COLORS.length];
  const Icon = UC_ICONS[index % UC_ICONS.length];
  return (
    <div className={clsx('rounded-2xl border p-4', color.bg, color.border)}>
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div className={clsx('w-8 h-8 rounded-xl flex items-center justify-center shrink-0', color.num)}>
          <Icon size={15} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={clsx('text-xs font-bold px-2 py-0.5 rounded-full border', color.pill)}>
              #{index + 1}
            </span>
            <h3 className="text-sm font-bold text-slate-800">{uc.title}</h3>
          </div>
        </div>
      </div>

      {/* Description */}
      <p className="text-xs text-slate-600 leading-relaxed mb-3 pl-11">{uc.description}</p>

      {/* Impact + metrics */}
      <div className="pl-11 space-y-2">
        <div className="flex items-start gap-1.5">
          <CheckCircle size={12} className="text-emerald-500 mt-0.5 shrink-0" />
          <p className="text-xs font-semibold text-slate-700 leading-relaxed">{uc.impact}</p>
        </div>
        {(uc.metric_a || uc.metric_b) && (
          <div className="flex flex-wrap gap-2 mt-1">
            {uc.metric_a && (
              <span className="inline-flex items-center gap-1 bg-white border border-slate-200 text-slate-600 text-xs font-medium px-2.5 py-1 rounded-lg">
                <TrendingUp size={10} className="text-emerald-500" />
                {uc.metric_a}
              </span>
            )}
            {uc.metric_b && (
              <span className="inline-flex items-center gap-1 bg-white border border-slate-200 text-slate-600 text-xs font-medium px-2.5 py-1 rounded-lg">
                <Star size={10} className="text-amber-400" />
                {uc.metric_b}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function LoadingDots() {
  return (
    <div className="flex gap-1.5">
      {[0, 1, 2].map(i => (
        <div
          key={i}
          className="w-2 h-2 rounded-full bg-emerald-400"
          style={{ animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
        />
      ))}
      <style>{`@keyframes bounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-8px)}}`}</style>
    </div>
  );
}
