'use client';

import { useState, useTransition } from 'react';
import { Save, RefreshCw, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import {
  saveClientExotelCredsAction,
  saveClientFromNumberAction,
  fetchExotelNumbersAction,
} from '@/app/actions/tenant-voice-config';

export interface ClientVoiceConfigRow {
  from_number:        string;
  has_exotel_creds:   boolean;
  exotel_account_sid: string | null;
}

export function ClientVoiceConfigCard({ initial }: { initial: ClientVoiceConfigRow | null }) {
  const hasExistingCreds = initial?.has_exotel_creds ?? false;

  // ── Credentials ───────────────────────────────────────────────────────────
  const [editCreds,    setEditCreds]    = useState(!hasExistingCreds);
  const [apiKey,       setApiKey]       = useState('');
  const [apiToken,     setApiToken]     = useState('');
  const [accountSid,   setAccountSid]   = useState(initial?.exotel_account_sid ?? '');
  const [showApiKey,   setShowApiKey]   = useState(false);
  const [showApiToken, setShowApiToken] = useState(false);
  const [credsSaved,   setCredsSaved]   = useState(false);
  const [credsError,   setCredsError]   = useState<string | null>(null);

  // ── Number ────────────────────────────────────────────────────────────────
  const [fromNumber,  setFromNumber]  = useState(initial?.from_number ?? '');
  const [numbers,     setNumbers]     = useState<{ phone_number: string; friendly_name: string }[]>([]);
  const [fetchedNums, setFetchedNums] = useState(false);
  const [numsError,   setNumsError]   = useState<string | null>(null);
  const [numSaved,    setNumSaved]    = useState(false);

  const [isPending, startTransition] = useTransition();

  function handleSaveCreds() {
    setCredsError(null);
    setCredsSaved(false);
    startTransition(async () => {
      const result = await saveClientExotelCredsAction({ api_key: apiKey, api_token: apiToken, account_sid: accountSid });
      if (result.error) setCredsError(result.error);
      else { setCredsSaved(true); setEditCreds(false); setApiKey(''); setApiToken(''); }
    });
  }

  function handleFetchNumbers() {
    setNumsError(null);
    startTransition(async () => {
      const result = await fetchExotelNumbersAction();
      if (result.error) setNumsError(result.error);
      else {
        setNumbers(result.numbers);
        setFetchedNums(true);
        if (result.numbers.length === 1) setFromNumber(result.numbers[0]!.phone_number);
      }
    });
  }

  function handleSaveNumber() {
    setNumSaved(false);
    startTransition(async () => {
      const result = await saveClientFromNumberAction(fromNumber);
      if (!result.error) { setNumSaved(true); setTimeout(() => setNumSaved(false), 3000); }
    });
  }

  return (
    <div className="space-y-6">
      {/* ── Exotel Account Setup ──────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-sm font-semibold text-gray-800">Exotel Account</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Connect your own Exotel account so your bot calls from your own number using your own credits.
            </p>
          </div>
          {hasExistingCreds && !editCreds && (
            <button type="button" onClick={() => setEditCreds(true)}
              className="text-[11px] text-emerald-600 hover:text-emerald-800 font-medium shrink-0">
              Update
            </button>
          )}
        </div>

        {!editCreds && hasExistingCreds ? (
          <div className="flex items-center gap-2 text-sm text-gray-600 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
            <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />
            <div>
              <p className="font-medium text-emerald-800">Exotel connected</p>
              <p className="text-xs text-emerald-600 mt-0.5">Account: {initial?.exotel_account_sid}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3 bg-gray-50 border border-gray-200 rounded-xl p-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">API Key</label>
                <div className="relative">
                  <input type={showApiKey ? 'text' : 'password'} value={apiKey}
                    onChange={e => setApiKey(e.target.value)} placeholder="Your Exotel API key"
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 pr-8 focus:outline-none focus:ring-2 focus:ring-emerald-300 font-mono" />
                  <button type="button" onClick={() => setShowApiKey(v => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showApiKey ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">API Token</label>
                <div className="relative">
                  <input type={showApiToken ? 'text' : 'password'} value={apiToken}
                    onChange={e => setApiToken(e.target.value)} placeholder="Your Exotel API token"
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 pr-8 focus:outline-none focus:ring-2 focus:ring-emerald-300 font-mono" />
                  <button type="button" onClick={() => setShowApiToken(v => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showApiToken ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Account SID</label>
                <input type="text" value={accountSid} onChange={e => setAccountSid(e.target.value)}
                  placeholder="Your Exotel account SID"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-300 font-mono" />
              </div>
            </div>
            <p className="text-xs text-gray-400">
              Find these in your Exotel Dashboard → Account → API Credentials. We store them securely server-side only.
            </p>
            <div className="flex items-center gap-3">
              <button type="button" onClick={handleSaveCreds}
                disabled={isPending || !apiKey || !apiToken || !accountSid}
                className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors">
                <Save size={12} />
                {isPending ? 'Saving…' : 'Connect Exotel'}
              </button>
              {hasExistingCreds && (
                <button type="button" onClick={() => setEditCreds(false)}
                  className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
              )}
              {credsSaved && <span className="text-xs text-emerald-600 font-medium">Connected</span>}
              {credsError && <span className="text-xs text-red-600">{credsError}</span>}
            </div>
          </div>
        )}
      </div>

      {/* ── Outbound Number ───────────────────────────────────────────────── */}
      <div>
        <p className="text-sm font-semibold text-gray-800 mb-1">Outbound Caller ID</p>
        <p className="text-xs text-gray-400 mb-3">
          The number your customers will see when your bot calls them. Must be a number registered in your Exotel account.
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          {fetchedNums && numbers.length > 0 ? (
            <select value={fromNumber} onChange={e => setFromNumber(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-300 font-mono bg-white min-w-[220px]">
              <option value="">— select a number —</option>
              {numbers.map(n => (
                <option key={n.phone_number} value={n.phone_number}>
                  {n.phone_number}{n.friendly_name !== n.phone_number ? ` (${n.friendly_name})` : ''}
                </option>
              ))}
            </select>
          ) : (
            <div className="flex items-center gap-2">
              <input type="tel" value={fromNumber} onChange={e => setFromNumber(e.target.value)}
                placeholder="+91xxxxxxxxxx"
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-300 font-mono w-48" />
            </div>
          )}
          <button type="button" onClick={handleFetchNumbers} disabled={isPending}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors disabled:opacity-50">
            <RefreshCw size={12} className={isPending ? 'animate-spin' : ''} />
            Load my numbers
          </button>
          <button type="button" onClick={handleSaveNumber} disabled={isPending || !fromNumber}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg transition-colors">
            <Save size={12} />
            {numSaved ? 'Saved' : 'Save Number'}
          </button>
        </div>
        {fromNumber && !fetchedNums && (
          <p className="text-xs text-gray-400 mt-1.5">Current: <span className="font-mono">{fromNumber}</span></p>
        )}
        {numsError && <p className="text-xs text-red-600 mt-1.5">{numsError}</p>}
      </div>
    </div>
  );
}
