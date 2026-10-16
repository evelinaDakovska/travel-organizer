import {
  feedbackPayloadSchema,
  type FeedbackPayload,
  type FeedbackSubmissionResult,
} from '../domain/feedback';

const REQUEST_TIMEOUT_MS = 15000;

export async function submitFeedback(
  payload: FeedbackPayload,
  customEndpointUrl?: string,
): Promise<FeedbackSubmissionResult> {
  const parsed = feedbackPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    const errorMsg = parsed.error.issues[0]?.message ?? 'Invalid feedback submission';
    return { success: false, error: errorMsg, retryable: false };
  }

  const endpointUrl =
    customEndpointUrl ?? process.env['EXPO_PUBLIC_FEEDBACK_ENDPOINT_URL']?.trim();

  if (!endpointUrl) {
    return {
      success: false,
      error:
        'Feedback delivery endpoint is not configured. Your draft remains safely saved on this device.',
      retryable: true,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': parsed.data.idempotencyKey,
      },
      body: JSON.stringify(parsed.data),
      signal: controller.signal,
    });

    clearTimeout(timer);

    let responseData: any = {};
    try {
      responseData = await response.json();
    } catch {
      // response might be empty or plain text
    }

    if (response.ok) {
      return {
        success: true,
        message: 'Feedback sent. Thank you!',
        deduplicated: Boolean(responseData.deduplicated),
      };
    }

    if (response.status === 429) {
      return {
        success: false,
        error: 'Too many submissions. Please wait a short while before sending again.',
        retryable: true,
      };
    }

    if (response.status >= 500) {
      return {
        success: false,
        error: 'The feedback server encountered an error. Please retry in a few moments.',
        retryable: true,
      };
    }

    return {
      success: false,
      error: responseData.error || `Could not submit feedback (HTTP ${response.status})`,
      retryable: false,
    };
  } catch (error: any) {
    clearTimeout(timer);
    const isAbort = error?.name === 'AbortError';
    return {
      success: false,
      error: isAbort
        ? 'Feedback submission timed out. Check your connection and try again.'
        : 'Network error. Could not reach feedback server. Your draft is preserved.',
      retryable: true,
    };
  }
}
