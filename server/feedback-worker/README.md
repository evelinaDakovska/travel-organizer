# Feedback Endpoint Architecture & Setup

This directory contains the minimal serverless HTTPS feedback endpoint for the Travel Organizer app.

## Why this solution was chosen

1. **Smallest Maintainable Footprint**: A single stateless TypeScript handler (~150 lines) deployable to Cloudflare Workers or Vercel Edge.
2. **Fixed Recipient**: Hardcoded server-side to `evelina.dakovska@gmail.com`. The mobile client cannot alter or choose recipients.
3. **No Embedded Secrets in App**: SMTP credentials and email API keys live strictly in worker environment secrets, never inside the compiled APK.
4. **Idempotency**: Submissions include a UUID `idempotencyKey` tracked with a 24-hour retention window. If a mobile request times out or is retried, the worker returns success without generating duplicate emails.
5. **Abuse Protection**: Enforces rate limiting (max 10 submissions per 10 minutes per IP), input bounds (message <= 5,000 chars, name <= 100 chars), CRLF header sanitization, and HTML escaping.
6. **Zero Cost**:
   - **Cloudflare Workers**: 100,000 requests/day free forever.
   - **Resend**: 3,000 emails/month free forever (100 emails/day), or SendGrid free tier (100 emails/day).

---

## Architecture Diagram

```
[Mobile App (Android)]
        │
        │ HTTPS POST (Idempotency-Key: UUID)
        ▼
[Cloudflare Worker / Serverless Handler]
  ├── 1. Rate Limit Check (IP sliding window)
  ├── 2. Input Validation (name <= 100, message 1..5000, valid UUID)
  ├── 3. Idempotency Check (24h retention cache)
  │      └── If already seen: return HTTP 200 (deduplicated: true)
  ├── 4. Sanitize (CRLF stripped, HTML escaped)
  └── 5. Dispatch via Resend API (Bearer RESEND_API_KEY)
              │
              ▼
    evelina.dakovska@gmail.com
```

---

## Required Setup for Live Deployment

To activate live email delivery to your inbox:

1. **Obtain a Free Resend API Key**:
   - Sign up at [resend.com](https://resend.com) (free tier: 3,000 emails/month).
   - Create an API key (`re_...`).
   - Testing out-of-the-box: Resend provides `onboarding@resend.dev` which delivers directly to the account owner's email (`evelina.dakovska@gmail.com`) without needing a custom domain!

2. **Deploy the Worker (Cloudflare Workers)**:
   ```bash
   cd server/feedback-worker
   npx wrangler secret put RESEND_API_KEY
   # Enter your Resend API key when prompted
   npx wrangler deploy
   ```
   Wrangler outputs your live HTTPS URL:
   `https://travel-organizer-feedback.<your-subdomain>.workers.dev`

3. **Configure the Mobile App**:
   In your root `.env` or build environment, set:
   ```env
   EXPO_PUBLIC_FEEDBACK_ENDPOINT_URL=https://travel-organizer-feedback.<your-subdomain>.workers.dev
   ```
   Then rebuild the APK (`./gradlew assembleRelease`).
