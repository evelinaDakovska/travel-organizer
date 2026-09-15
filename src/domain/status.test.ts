import { statusActions } from './status';

describe('statusActions', () => {
  it('lets an idea be moved onto the timeline, or deleted', () => {
    expect(statusActions('idea')).toEqual({
      promote: true,
      cancel: false,
      restore: false,
      delete: true,
    });
  });

  it('lets a confirmed item be cancelled, but never deleted in one step', () => {
    expect(statusActions('confirmed')).toEqual({
      promote: false,
      cancel: true,
      restore: false,
      delete: false,
    });
  });

  it('lets a cancelled item be restored, or deleted once its documents are no longer wanted', () => {
    expect(statusActions('cancelled')).toEqual({
      promote: false,
      cancel: false,
      restore: true,
      delete: true,
    });
  });

  it('always offers at least one way forward', () => {
    for (const status of ['idea', 'confirmed', 'cancelled'] as const) {
      expect(Object.values(statusActions(status)).some(Boolean)).toBe(true);
    }
  });
});
