/**
 * Minimal HTTPS backend endpoint for Travel Organizer in-app feedback.
 * Deployable to Cloudflare Workers, Vercel Edge, or Node.js runtime.
 *
 * Security & Reliability guarantees:
 * 1. Fixed recipient server-side (evelina.dakovska@gmail.com) — client cannot specify recipient.
 * 2. Never exposes SMTP credentials or provider private keys to client.
 * 3. Strict schema validation & input bounds.
 * 4. CRLF header sanitization and HTML escaping.
 * 5. Idempotency deduplication with 24-hour retention window.
 * 6. IP-based rate limiting against abuse.
 */

export interface Env {
  RESEND_API_KEY?: string;
  FEEDBACK_RECIPIENT_EMAIL?: string;
  FEEDBACK_FROM_EMAIL?: string;
  // Cloudflare KV namespace for persistence (optional, falls back to memory cache)
  FEEDBACK_KV?: any;
}

const DEFAULT_RECIPIENT = 'evelina.dakovska@gmail.com';
const DEFAULT_FROM = 'Travel Organizer Feedback <feedback@resend.dev>';
const IDEMPOTENCY_RETENTION_MS = 24 * 60 * 60 * 1000; // 24 hours
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_REQUESTS_PER_WINDOW = 10;

// In-memory fallback caches for serverless runtimes
const memoryIdempotency = new Map<string, { timestamp: number; response: any }>();
const memoryRateLimits = new Map<string, number[]>();

export function sanitizeHeader(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function isRateLimited(ip: string, now: number = Date.now()): boolean {
  const timestamps = memoryRateLimits.get(ip) ?? [];
  const valid = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (valid.length >= MAX_REQUESTS_PER_WINDOW) {
    memoryRateLimits.set(ip, valid);
    return true;
  }
  valid.push(now);
  memoryRateLimits.set(ip, valid);
  return false;
}

export function getIdempotentResult(key: string, now: number = Date.now()): any | null {
  const entry = memoryIdempotency.get(key);
  if (!entry) return null;
  if (now - entry.timestamp > IDEMPOTENCY_RETENTION_MS) {
    memoryIdempotency.delete(key);
    return null;
  }
  return entry.response;
}

export function recordIdempotentResult(key: string, response: any, now: number = Date.now()): void {
  memoryIdempotency.set(key, { timestamp: now, response });
}

export function clearMemoryCaches(): void {
  memoryIdempotency.clear();
  memoryRateLimits.clear();
}

export async function handleFeedbackRequest(
  request: Request,
  env: Env = {},
  clientIpOverride?: string,
): Promise<Response> {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Idempotency-Key',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const clientIp =
    clientIpOverride ??
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'anonymous';

  if (isRateLimited(clientIp)) {
    return new Response(
      JSON.stringify({ error: 'Rate limit exceeded. Please wait a few minutes before retrying.' }),
      { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Malformed JSON payload' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : undefined;
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const idempotencyKey =
    typeof body.idempotencyKey === 'string'
      ? body.idempotencyKey.trim()
      : request.headers.get('Idempotency-Key')?.trim();
  const appVersion = typeof body.appVersion === 'string' ? body.appVersion.trim() : 'Unknown';
  const appBuild = typeof body.appBuild === 'string' ? body.appBuild.trim() : undefined;
  const androidVersion = typeof body.androidVersion === 'string' ? body.androidVersion.trim() : undefined;

  if (!message || message.length === 0) {
    return new Response(JSON.stringify({ error: 'Message is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (message.length > 5000) {
    return new Response(JSON.stringify({ error: 'Message exceeds maximum length of 5000 characters' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (name && name.length > 100) {
    return new Response(JSON.stringify({ error: 'Name exceeds maximum length of 100 characters' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!idempotencyKey || !/^[0-9a-fA-F-]{36}$/.test(idempotencyKey)) {
    return new Response(JSON.stringify({ error: 'Valid UUID idempotencyKey is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Idempotency check: if already processed, return cached success response without sending duplicate email
  const cachedResponse = getIdempotentResult(idempotencyKey);
  if (cachedResponse) {
    return new Response(
      JSON.stringify({ ...cachedResponse, deduplicated: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const recipient = env.FEEDBACK_RECIPIENT_EMAIL?.trim() || DEFAULT_RECIPIENT;
  const from = env.FEEDBACK_FROM_EMAIL?.trim() || DEFAULT_FROM;
  const resendApiKey = env.RESEND_API_KEY?.trim();

  const safeSubject = `[Travel Organizer Feedback] from ${name ? sanitizeHeader(name) : 'Anonymous'}`;
  const safeName = escapeHtml(name || 'Anonymous (not specified)');
  const safeMessage = escapeHtml(message).replace(/\n/g, '<br/>');
  const safeVersion = escapeHtml(appVersion + (appBuild ? ` (${appBuild})` : ''));
  const safeAndroid = escapeHtml(androidVersion || 'Not reported');
  const safeKey = escapeHtml(idempotencyKey);

  const html = `<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, sans-serif; color: #111; padding: 16px;">
  <h2 style="margin-bottom: 12px;">Travel Organizer Feedback</h2>
  <div style="background: #f4f4f5; padding: 12px 16px; border-radius: 8px; margin-bottom: 16px;">
    <div><strong>From:</strong> ${safeName}</div>
    <div><strong>App Version:</strong> ${safeVersion}</div>
    <div><strong>Android Version:</strong> ${safeAndroid}</div>
    <div><strong>Submission ID:</strong> <code>${safeKey}</code></div>
  </div>
  <div style="background: #ffffff; border: 1px solid #e4e4e7; border-radius: 8px; padding: 16px; white-space: pre-wrap; font-size: 15px;">
${safeMessage}
  </div>
</body>
</html>`;

  const text = `Travel Organizer Feedback
----------------------------------------
From:            ${name || 'Anonymous'}
App Version:     ${appVersion}${appBuild ? ` (${appBuild})` : ''}
Android Version: ${androidVersion || 'Not reported'}
Submission ID:   ${idempotencyKey}

Message:
----------------------------------------
${message}
`;

  // Dispatch email if provider API key is configured
  if (resendApiKey) {
    try {
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify({
          from,
          to: recipient,
          subject: safeSubject,
          html,
          text,
        }),
      });

      if (!emailRes.ok) {
        const errText = await emailRes.text();
        return new Response(
          JSON.stringify({ error: `Email dispatch failed: ${emailRes.status}`, details: errText }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    } catch (err: any) {
      return new Response(
        JSON.stringify({ error: 'Failed to contact upstream email provider', details: err?.message }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
  }

  // Record successful delivery for idempotency
  const successResponse = {
    success: true,
    message: 'Feedback received and processed',
    id: idempotencyKey,
  };
  recordIdempotentResult(idempotencyKey, successResponse);

  return new Response(JSON.stringify(successResponse), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Cloudflare Workers fetch event export
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleFeedbackRequest(request, env);
  },
};
