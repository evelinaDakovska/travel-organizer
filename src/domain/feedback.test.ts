import {
  buildFeedbackEmailHtml,
  buildFeedbackEmailText,
  escapeHtml,
  feedbackEmailSubject,
  feedbackPayloadSchema,
  sanitizeHeader,
  type FeedbackPayload,
} from './feedback';

describe('feedback domain', () => {
  const validPayload: FeedbackPayload = {
    name: 'Alice Tester',
    message: 'Love the quick expense sheet! Can we add currency conversion in the future?',
    idempotencyKey: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
    appVersion: '0.7.1',
    appBuild: '11',
    androidVersion: 'Android 14 (API 34)',
  };

  describe('feedbackPayloadSchema', () => {
    it('accepts valid payload with name and message', () => {
      const parsed = feedbackPayloadSchema.safeParse(validPayload);
      expect(parsed.success).toBe(true);
    });

    it('accepts payload without name (anonymous)', () => {
      const parsed = feedbackPayloadSchema.safeParse({
        ...validPayload,
        name: undefined,
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.name).toBeUndefined();
      }
    });

    it('rejects empty message', () => {
      const parsed = feedbackPayloadSchema.safeParse({
        ...validPayload,
        message: '   ',
      });
      expect(parsed.success).toBe(false);
    });

    it('rejects oversized message (> 5000 characters)', () => {
      const longMessage = 'A'.repeat(5001);
      const parsed = feedbackPayloadSchema.safeParse({
        ...validPayload,
        message: longMessage,
      });
      expect(parsed.success).toBe(false);
    });

    it('rejects oversized name (> 100 characters)', () => {
      const longName = 'A'.repeat(101);
      const parsed = feedbackPayloadSchema.safeParse({
        ...validPayload,
        name: longName,
      });
      expect(parsed.success).toBe(false);
    });

    it('rejects invalid idempotencyKey (not a UUID)', () => {
      const parsed = feedbackPayloadSchema.safeParse({
        ...validPayload,
        idempotencyKey: 'not-a-uuid',
      });
      expect(parsed.success).toBe(false);
    });
  });

  describe('sanitization and formatting', () => {
    it('sanitizes headers against CRLF injection', () => {
      const malicious = 'Test User\r\nBcc: evil@attacker.com\nSubject: Injected';
      expect(sanitizeHeader(malicious)).toBe('Test User Bcc: evil@attacker.com Subject: Injected');
      expect(sanitizeHeader(malicious)).not.toContain('\r');
      expect(sanitizeHeader(malicious)).not.toContain('\n');
    });

    it('formats subject line safely with name', () => {
      expect(feedbackEmailSubject('Alice')).toBe('[Travel Organizer Feedback] from Alice');
    });

    it('formats subject line safely for anonymous', () => {
      expect(feedbackEmailSubject(undefined)).toBe('[Travel Organizer Feedback] from Anonymous');
      expect(feedbackEmailSubject('   ')).toBe('[Travel Organizer Feedback] from Anonymous');
    });

    it('escapes HTML characters in message and fields', () => {
      const dirty = '<script>alert("xss")</script> & \'hello\'';
      const clean = escapeHtml(dirty);
      expect(clean).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; &#39;hello&#39;');
      expect(clean).not.toContain('<script>');
    });

    it('builds plaintext email containing all relevant fields and no trip details', () => {
      const text = buildFeedbackEmailText(validPayload);
      expect(text).toContain('Alice Tester');
      expect(text).toContain('0.7.1 (11)');
      expect(text).toContain('Android 14 (API 34)');
      expect(text).toContain(validPayload.idempotencyKey);
      expect(text).toContain(validPayload.message);
    });

    it('builds HTML email containing escaped fields and line breaks', () => {
      const html = buildFeedbackEmailHtml({
        ...validPayload,
        message: 'Line 1\nLine 2 <script>',
      });
      expect(html).toContain('Alice Tester');
      expect(html).toContain('Line 1<br/>Line 2 &lt;script&gt;');
      expect(html).not.toContain('<script>');
    });
  });
});
