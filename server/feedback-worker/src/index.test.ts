import {
  clearMemoryCaches,
  escapeHtml,
  handleFeedbackRequest,
  isRateLimited,
  sanitizeHeader,
} from './index';

describe('feedback-worker server endpoint', () => {
  beforeEach(() => {
    clearMemoryCaches();
  });

  const validPayload = {
    name: 'Alice',
    message: 'Everything looks great on my test trip.',
    idempotencyKey: '11111111-2222-4333-8444-555555555555',
    appVersion: '0.7.1',
    appBuild: '11',
    androidVersion: 'Android 14',
  };

  it('handles OPTIONS preflight with CORS headers', async () => {
    const request = new Request('https://api.example.com/feedback', { method: 'OPTIONS' });
    const response = await handleFeedbackRequest(request);
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('rejects GET requests with 405 Method Not Allowed', async () => {
    const request = new Request('https://api.example.com/feedback', { method: 'GET' });
    const response = await handleFeedbackRequest(request);
    expect(response.status).toBe(405);
  });

  it('rejects empty message with 400 Bad Request', async () => {
    const request = new Request('https://api.example.com/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validPayload, message: '   ' }),
    });
    const response = await handleFeedbackRequest(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Message is required');
  });

  it('rejects oversized message with 400 Bad Request', async () => {
    const request = new Request('https://api.example.com/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validPayload, message: 'x'.repeat(5001) }),
    });
    const response = await handleFeedbackRequest(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('5000');
  });

  it('rejects invalid or missing idempotencyKey with 400 Bad Request', async () => {
    const request = new Request('https://api.example.com/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validPayload, idempotencyKey: 'not-a-uuid' }),
    });
    const response = await handleFeedbackRequest(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('idempotencyKey');
  });

  it('accepts valid feedback and returns 200 with submission ID', async () => {
    const request = new Request('https://api.example.com/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload),
    });
    const response = await handleFeedbackRequest(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.id).toBe(validPayload.idempotencyKey);
  });

  it('deduplicates identical idempotencyKey on retry without duplicate processing', async () => {
    const makeRequest = () =>
      new Request('https://api.example.com/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validPayload),
      });

    const first = await handleFeedbackRequest(makeRequest());
    expect(first.status).toBe(200);
    const firstData = await first.json();
    expect(firstData.deduplicated).toBeUndefined();

    // Second request with same idempotencyKey
    const second = await handleFeedbackRequest(makeRequest());
    expect(second.status).toBe(200);
    const secondData = await second.json();
    expect(secondData.success).toBe(true);
    expect(secondData.deduplicated).toBe(true);
  });

  it('enforces rate limits per IP', async () => {
    const ip = '192.168.1.100';
    for (let i = 0; i < 10; i++) {
      expect(isRateLimited(ip, 1000 + i)).toBe(false);
    }
    // 11th request within window is rate limited
    expect(isRateLimited(ip, 2000)).toBe(true);
  });

  it('sanitizes headers against injection and escapes HTML', () => {
    expect(sanitizeHeader('Name\r\nBcc: evil@test.com')).toBe('Name Bcc: evil@test.com');
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });
});
