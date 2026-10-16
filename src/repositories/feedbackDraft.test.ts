import {
  clearFeedbackDraft,
  clearFeedbackMessage,
  loadFeedbackDraft,
  saveFeedbackDraft,
} from './feedbackDraft';
import type { FeedbackDraft } from '../domain/feedback';

const mockFileState = {
  exists: false,
  content: '',
};

jest.mock('expo-crypto', () => ({
  randomUUID: () => '11111111-2222-4333-8444-555555555555',
}));

jest.mock('expo-file-system', () => {
  return {
    Paths: {
      document: { uri: 'file:///mock-document-dir/' },
    },
    File: jest.fn().mockImplementation(() => ({
      get exists() {
        return mockFileState.exists;
      },
      text: jest.fn().mockImplementation(async () => mockFileState.content),
      write: jest.fn().mockImplementation(async (data: string) => {
        mockFileState.exists = true;
        mockFileState.content = data;
      }),
      delete: jest.fn().mockImplementation(() => {
        mockFileState.exists = false;
        mockFileState.content = '';
      }),
    })),
  };
});

describe('feedbackDraft repository', () => {
  beforeEach(() => {
    mockFileState.exists = false;
    mockFileState.content = '';
  });

  it('returns empty draft with new idempotencyKey when file does not exist', async () => {
    const draft = await loadFeedbackDraft();
    expect(draft.name).toBe('');
    expect(draft.message).toBe('');
    expect(draft.idempotencyKey).toBe('11111111-2222-4333-8444-555555555555');
  });

  it('saves and restores draft across reloads', async () => {
    const draftToSave: FeedbackDraft = {
      name: 'Bob',
      message: 'Bug when rotating screen',
      idempotencyKey: '22222222-3333-4444-8555-666666666666',
      updatedAt: '2026-10-16T12:00:00.000Z',
    };
    await saveFeedbackDraft(draftToSave);

    expect(mockFileState.exists).toBe(true);

    const loaded = await loadFeedbackDraft();
    expect(loaded.name).toBe('Bob');
    expect(loaded.message).toBe('Bug when rotating screen');
    expect(loaded.idempotencyKey).toBe('22222222-3333-4444-8555-666666666666');
  });

  it('clears draft completely on clearFeedbackDraft', async () => {
    await saveFeedbackDraft({
      name: 'Bob',
      message: 'Hello',
      idempotencyKey: '22222222-3333-4444-8555-666666666666',
      updatedAt: '2026-10-16T12:00:00.000Z',
    });

    await clearFeedbackDraft();
    expect(mockFileState.exists).toBe(false);

    const loaded = await loadFeedbackDraft();
    expect(loaded.name).toBe('');
    expect(loaded.message).toBe('');
  });

  it('retains name and clears message on clearFeedbackMessage after successful send', async () => {
    await saveFeedbackDraft({
      name: 'Bob',
      message: 'Great app!',
      idempotencyKey: '22222222-3333-4444-8555-666666666666',
      updatedAt: '2026-10-16T12:00:00.000Z',
    });

    const nextDraft = await clearFeedbackMessage('Bob');
    expect(nextDraft.name).toBe('Bob');
    expect(nextDraft.message).toBe('');
    expect(nextDraft.idempotencyKey).toBe('11111111-2222-4333-8444-555555555555');

    const loaded = await loadFeedbackDraft();
    expect(loaded.name).toBe('Bob');
    expect(loaded.message).toBe('');
  });
});
