/** Anonymous candidate-field reports. Origin checks remain in middleware; all
 * writes here are bounded, bot-verified, deduplicated and transactionally limited. */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { submitPublicFlag, deriveTargetWardId, InvalidFlagTargetError } from '../../lib/flags';
import { FLAG_COOKIE, flagBrowserHash, admitFlagRequest, metric, FlagRateLimitError } from '../../lib/flag-abuse';
import { readFlagBody, FlagBodyError, flagJson, flagNetworkHash } from '../../lib/flag-http';
import { verifyRecaptcha } from '../../lib/recaptcha';
import { logEvent } from '../../lib/log';
const webUrl = z.string().trim().min(1).max(2048).url().refine(v => /^https?:\/\//i.test(v));
const schema = z.object({
  wardId:z.number().int().positive().optional(), targetType:z.literal('candidate_field'), targetRef:z.string().trim().min(1).max(128),
  detail:z.string().trim().min(1).max(2000), suggestedValue:z.string().trim().min(1).max(1000).nullable().optional(), sourceUrl:webUrl.nullable().optional(),
  recaptchaToken:z.string().min(1).max(4096),
}).strict();
export const POST: APIRoute = async ({ request, cookies, clientAddress }) => {
  if (process.env.FLAGS_SUBMISSIONS_PAUSED === 'true') return flagJson({ error:'paused' },503);
  try {
    const networkHash = flagNetworkHash(request,clientAddress);
    if (!await admitFlagRequest(networkHash)) return flagJson({ error:'rate_limited' },429);
    const parsed = schema.safeParse(await readFlagBody(request));
    if (!parsed.success) return flagJson({ error:'invalid_payload' },400);
    await deriveTargetWardId(parsed.data.targetType,parsed.data.targetRef);
    const browserHash = flagBrowserHash(cookies.get(FLAG_COOKIE)?.value);
    if (!browserHash) return flagJson({ error:'browser_expired' },403);
    const configuredScore = Number(process.env.FLAGS_CAPTCHA_MIN_SCORE ?? 0.5);
    const captcha = await verifyRecaptcha(parsed.data.recaptchaToken, { expectedAction:'candidate_flag', expectedHostname:new URL(process.env.SITE_ORIGIN ?? request.url).hostname, minScore:Number.isFinite(configuredScore) && configuredScore >= 0 && configuredScore <= 1 ? configuredScore : 0.5 });
    if (!captcha.ok) {
      const unavailable = ['unavailable','misconfigured','provider_error'].includes(captcha.reason ?? '');
      await metric(unavailable ? 'captcha_error' : 'captcha_failed');
      return flagJson({ error:unavailable ? 'verification_unavailable' : 'verification_failed' },unavailable ? 503 : 403);
    }
    const result = await submitPublicFlag({ browserHash, networkHash },parsed.data);
    logEvent('flag_submitted', { state:result.state });
    // An id is not an anonymous status capability; no anonymous read endpoint exists.
    return flagJson({ ok:true, ...result });
  } catch (error) {
    if (error instanceof FlagBodyError) return flagJson({ error:'invalid_payload' },error.status);
    if (error instanceof InvalidFlagTargetError) return flagJson({ error:'invalid_target' },400);
    if (error instanceof FlagRateLimitError) { await metric('rate_limited'); return flagJson({ error:'rate_limited' },429); }
    logEvent('flag_submission_unavailable', {});
    return flagJson({ error:'unavailable' },503);
  }
};
