// Exotel telephony provider — India-optimised, cheapest PSTN (~₹0.35/min).
// Exotel uses app-based call flows. Outbound calls are dispatched via REST API
// and conversation happens via ExoML (similar to TwiML).
//
// Required credentials: api_key, api_token, account_sid, from_number, app_id

import type { TelephonyProvider, OutboundCallParams, OutboundCallResult } from '../../types.js';

interface ExotelConfig {
  api_key:     string;
  api_token:   string;
  account_sid: string;  // Exotel SID (subdomain)
  from_number: string;
  app_id:      string;  // ExoPhone / ExoML App ID for voice flows
}

function exotelAuth(key: string, token: string): string {
  return 'Basic ' + Buffer.from(`${key}:${token}`).toString('base64');
}

export function createExotelProvider(config: ExotelConfig): TelephonyProvider {
  const baseUrl = `https://api.exotel.com/v1/Accounts/${config.account_sid}`;

  return {
    name: 'exotel',

    async dispatch({ to, from, twimlUrl, statusCallback }): Promise<OutboundCallResult> {
      const callerNumber = from || config.from_number;
      const body = new URLSearchParams({
        From:           callerNumber,
        To:             to,
        Url:            twimlUrl,      // ExoML URL (Exotel supports TwiML-compatible XML)
        StatusCallback: statusCallback,
        CallerId:       callerNumber,
        // Exotel-specific: link to your ExoPhone app for routing
        ...(config.app_id ? { AppId: config.app_id } : {}),
      });

      const res = await fetch(`${baseUrl}/Calls/connect.json`, {
        method:  'POST',
        headers: {
          Authorization:  exotelAuth(config.api_key, config.api_token),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Exotel dispatch failed ${res.status}: ${text.slice(0, 300)}`);
      }

      const data = await res.json() as { Call: { Sid: string; Status: string } };
      return {
        callSid: data.Call.Sid,
        status:  data.Call.Status === 'in-progress' ? 'in_progress' : 'initiated',
      };
    },

    async hangup(callSid): Promise<void> {
      await fetch(`${baseUrl}/Calls/${callSid}.json`, {
        method:  'POST',
        headers: {
          Authorization:  exotelAuth(config.api_key, config.api_token),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ Status: 'completed' }).toString(),
      });
    },

    async validate(): Promise<boolean> {
      try {
        const res = await fetch(`${baseUrl}.json`, {
          headers: { Authorization: exotelAuth(config.api_key, config.api_token) },
        });
        return res.ok;
      } catch {
        return false;
      }
    },
  };
}
