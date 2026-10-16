import { File, Paths } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';

import { feedbackDraftSchema, type FeedbackDraft } from '../domain/feedback';

const DRAFT_FILE_NAME = 'feedback_draft.json';

function getDraftFile(): File {
  return new File(Paths.document, DRAFT_FILE_NAME);
}

export const EMPTY_DRAFT: FeedbackDraft = {
  name: '',
  message: '',
  idempotencyKey: undefined,
  updatedAt: '',
};

/**
 * Loads the current feedback draft from local file storage.
 * Never throws: returns EMPTY_DRAFT on any error or missing file.
 */
export async function loadFeedbackDraft(): Promise<FeedbackDraft> {
  try {
    const file = getDraftFile();
    if (!file.exists) {
      return { ...EMPTY_DRAFT, idempotencyKey: randomUUID() };
    }
    const text = await file.text();
    if (!text.trim()) {
      return { ...EMPTY_DRAFT, idempotencyKey: randomUUID() };
    }
    const parsed = feedbackDraftSchema.safeParse(JSON.parse(text));
    if (!parsed.success) {
      return { ...EMPTY_DRAFT, idempotencyKey: randomUUID() };
    }
    return {
      ...parsed.data,
      idempotencyKey: parsed.data.idempotencyKey ?? randomUUID(),
    };
  } catch {
    return { ...EMPTY_DRAFT, idempotencyKey: randomUUID() };
  }
}

/**
 * Saves the current draft to local file storage.
 */
export async function saveFeedbackDraft(draft: FeedbackDraft): Promise<void> {
  try {
    const file = getDraftFile();
    const payload: FeedbackDraft = {
      name: draft.name,
      message: draft.message,
      idempotencyKey: draft.idempotencyKey ?? randomUUID(),
      updatedAt: new Date().toISOString(),
    };
    await file.write(JSON.stringify(payload));
  } catch {
    // Non-fatal if filesystem write fails momentarily
  }
}

/**
 * Clears both fields and deletes the saved draft file.
 * Used on deliberate "Clear draft".
 */
export async function clearFeedbackDraft(): Promise<void> {
  try {
    const file = getDraftFile();
    if (file.exists) {
      file.delete();
    }
  } catch {
    // Non-fatal
  }
}

/**
 * Retains the name for convenience, clears the message and generates
 * a new idempotencyKey for subsequent feedback.
 * Used upon successful submission.
 */
export async function clearFeedbackMessage(currentName: string): Promise<FeedbackDraft> {
  const nextDraft: FeedbackDraft = {
    name: currentName,
    message: '',
    idempotencyKey: randomUUID(),
    updatedAt: new Date().toISOString(),
  };
  await saveFeedbackDraft(nextDraft);
  return nextDraft;
}
