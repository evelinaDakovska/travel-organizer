import { isStale, queryView, type QueryState } from './queryView';

const state = <T,>(overrides: Partial<QueryState<T>>): QueryState<T> => ({
  data: undefined,
  error: undefined,
  loading: false,
  ...overrides,
});
const failure = new Error('disk I/O error');

describe('queryView', () => {
  it('is loading before the first read finishes', () => {
    expect(queryView(state({ loading: true }))).toBe('loading');
  });

  it('is failed when the first read failed, never empty or missing', () => {
    expect(queryView(state({ error: failure }))).toBe('failed');
    expect(queryView(state({ error: failure, loading: true }))).toBe('failed');
  });

  it('is missing only when a read worked and found nothing', () => {
    expect(queryView(state({ data: null }))).toBe('missing');
  });

  it('is empty for a list that read fine and has nothing in it', () => {
    expect(queryView(state({ data: [] }))).toBe('empty');
  });

  it('is ready with something to show', () => {
    expect(queryView(state({ data: [1] }))).toBe('ready');
    expect(queryView(state({ data: { id: 'trip' } }))).toBe('ready');
  });

  it('keeps showing earlier data when a refresh fails', () => {
    const refreshFailed = state({ data: [1], error: failure });
    expect(queryView(refreshFailed)).toBe('ready');
    expect(isStale(refreshFailed)).toBe(true);
  });

  it('is not stale once a retry succeeds, nor before any data', () => {
    expect(isStale(state({ data: [1] }))).toBe(false);
    expect(isStale(state({ error: failure }))).toBe(false);
  });

  it('treats a deleted record whose refresh then fails as stale, still missing', () => {
    const gone = state({ data: null, error: failure });
    expect(queryView(gone)).toBe('missing');
    expect(isStale(gone)).toBe(true);
  });
});
