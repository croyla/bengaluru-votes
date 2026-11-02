/** Same-origin, uncached initialization only when a visitor submits a report. */
import type { APIRoute } from 'astro';
import { FLAG_COOKIE, FLAG_COOKIE_SECONDS, flagBrowserHash, issueFlagToken, admitFlagRequest } from '../../../lib/flag-abuse';
import { flagNetworkHash, flagJson } from '../../../lib/flag-http';
export const POST: APIRoute = async ({ request, cookies, clientAddress }) => {
  if (process.env.FLAGS_SUBMISSIONS_PAUSED === 'true') return flagJson({ error: 'paused' }, 503);
  try {
    if (!await admitFlagRequest(flagNetworkHash(request,clientAddress))) return flagJson({ error: 'rate_limited' },429);
    if (!flagBrowserHash(cookies.get(FLAG_COOKIE)?.value)) {
      cookies.set(FLAG_COOKIE,issueFlagToken(),{ path: '/', httpOnly:true, sameSite:'strict', secure:new URL(request.url).protocol === 'https:', maxAge:FLAG_COOKIE_SECONDS });
    }
    return flagJson({ ok:true });
  } catch { return flagJson({ error:'unavailable' },503); }
};
