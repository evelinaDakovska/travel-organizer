import { z } from 'zod';

export const FEEDBACK_RECIPIENT = 'evelina.dakovska@gmail.com';
export const MAX_NAME_LENGTH = 100;
export const MAX_MESSAGE_LENGTH = 5000;

export const feedbackDraftSchema = z.object({
  name: z.string().max(MAX_NAME_LENGTH).default(''),
  message: z.string().max(MAX_MESSAGE_LENGTH).default(''),
  idempotencyKey: z.string().uuid().optional(),
  updatedAt: z.string().default(''),
});

export type FeedbackDraft = z.infer<typeof feedbackDraftSchema>;

export const feedbackPayloadSchema = z.object({
  name: z
    .string()
    .trim()
    .max(MAX_NAME_LENGTH, `Name must be ${MAX_NAME_LENGTH} characters or less`)
    .optional()
    .transform((val) => val || undefined),
  message: z
    .string()
    .trim()
    .min(1, 'Please enter a message')
    .max(MAX_MESSAGE_LENGTH, `Message must be ${MAX_MESSAGE_LENGTH} characters or less`),
  idempotencyKey: z.string().uuid('Invalid submission ID'),
  appVersion: z.string().min(1, 'App version is required'),
  appBuild: z.string().optional(),
  androidVersion: z.string().optional(),
});

export type FeedbackPayload = z.infer<typeof feedbackPayloadSchema>;

export type FeedbackSubmissionResult =
  | { success: true; message: string; deduplicated?: boolean }
  | { success: false; error: string; retryable: boolean };

/**
 * Sanitizes headers to prevent email header injection (stripping CR and LF).
 */
export function sanitizeHeader(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

/**
 * Escapes characters for safe HTML inclusion in email body.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Formats a clean fixed email subject.
 */
export function feedbackEmailSubject(name?: string): string {
  const sender = name?.trim() ? sanitizeHeader(name) : 'Anonymous';
  return `[Travel Organizer Feedback] from ${sender}`;
}

/**
 * Builds safe HTML body for delivery email.
 */
export function buildFeedbackEmailHtml(payload: FeedbackPayload): string {
  const safeName = escapeHtml(payload.name ?? 'Anonymous (not specified)');
  const safeMessage = escapeHtml(payload.message).replace(/\n/g, '<br/>');
  const safeVersion = escapeHtml(payload.appVersion + (payload.appBuild ? ` (${payload.appBuild})` : ''));
  const safeAndroid = escapeHtml(payload.androidVersion ?? 'Unknown / Not provided');
  const safeId = escapeHtml(payload.idempotencyKey);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1f2937; line-height: 1.5; padding: 16px; }
    .card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
    .message { font-size: 15px; white-space: pre-wrap; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 6px; padding: 16px; margin: 16px 0; }
    .meta { font-size: 13px; color: #6b7280; }
    .meta dt { font-weight: 600; display: inline-block; width: 140px; }
    .meta dd { display: inline; margin: 0; }
    .meta div { margin-bottom: 4px; }
  </style>
</head>
<body>
  <h2>Travel Organizer Feedback</h2>
  <div class="card">
    <div class="meta">
      <div><dt>From:</dt><dd>${safeName}</dd></div>
      <div><dt>App Version:</dt><dd>${safeVersion}</dd></div>
      <div><dt>Android Version:</dt><dd>${safeAndroid}</dd></div>
      <div><dt>Submission ID:</dt><dd><code>${safeId}</code></dd></div>
    </div>
  </div>
  <h3>Message:</h3>
  <div class="message">${safeMessage}</div>
</body>
</html>`;
}

/**
 * Builds plaintext body for delivery email.
 */
export function buildFeedbackEmailText(payload: FeedbackPayload): string {
  const sender = payload.name?.trim() ? payload.name.trim() : 'Anonymous (not specified)';
  const version = payload.appVersion + (payload.appBuild ? ` (${payload.appBuild})` : '');
  const android = payload.androidVersion ?? 'Unknown / Not provided';

  return `Travel Organizer Feedback
----------------------------------------
From:            ${sender}
App Version:     ${version}
Android Version: ${android}
Submission ID:   ${payload.idempotencyKey}

Message:
----------------------------------------
${payload.message}
`;
}
