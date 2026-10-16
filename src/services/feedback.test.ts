import { submitFeedback } from './feedback';
import type { FeedbackPayload } from '../domain/feedback';

const validPayload: FeedbackPayload = {
  name: 'Tester',
  message: 'Working well on emulator!',
  idempotencyKey: '11111111-2222-4333-8444-555555555555',
  appVersion: '0.7.1',
  appBuild: '11',
  androidVersion: 'Android 14 (API 34)',
};

describe('feedback service', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.EXPO_PUBLIC_FEEDBACK_ENDPOINT_URL;
  });

  it('fails gracefully when endpoint is not configured', async () => {
    const result = await submitFeedback(validPayload);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('not configured');
      expect(result.retryable).toBe(true);
    }
  });

  it('rejects invalid payload client-side before making network request', async () => {
    const invalidPayload: FeedbackPayload = {
      ...validPayload,
      message: '', // invalid
    };
    const mockFetch = jest.fn();
    global.fetch = mockFetch;

    const result = await submitFeedback(invalidPayload, 'https://example.com/feedback');
    expect(result.success).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns success on 200 OK from server', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, deduplicated: false }),
    });

    const result = await submitFeedback(validPayload, 'https://example.com/feedback');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.message).toBe('Feedback sent. Thank you!');
      expect(result.deduplicated).toBe(false);
    }
  });

  it('handles deduplicated response smoothly', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, deduplicated: true }),
    });

    const result = await submitFeedback(validPayload, 'https://example.com/feedback');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.deduplicated).toBe(true);
    }
  });

  it('handles 429 rate limit as retryable', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: 'Too many requests' }),
    });

    const result = await submitFeedback(validPayload, 'https://example.com/feedback');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.retryable).toBe(true);
      expect(result.error).toContain('Too many submissions');
    }
  });

  it('handles server 500 error as retryable', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Internal server error' }),
    });

    const result = await submitFeedback(validPayload, 'https://example.com/feedback');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.retryable).toBe(true);
    }
  });

  it('handles network error and preserves draft', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Failed to fetch'));

    const result = await submitFeedback(validPayload, 'https://example.com/feedback');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.retryable).toBe(true);
      expect(result.error).toContain('Network error');
    }
  });
});
