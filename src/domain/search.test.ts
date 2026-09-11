import { escapeLike, searchPattern } from './search';

describe('searchPattern', () => {
  it('wraps the query so it matches anywhere in a field', () => {
    expect(searchPattern('duomo')).toBe('%duomo%');
  });

  it('returns null for a blank query, so an empty box shows nothing', () => {
    expect(searchPattern('')).toBeNull();
    expect(searchPattern('   ')).toBeNull();
  });

  it('trims, so a stray space does not stop a match', () => {
    expect(searchPattern('  duomo  ')).toBe('%duomo%');
  });

  it('neutralises wildcards, so a percent sign is not a match-everything', () => {
    expect(searchPattern('50%')).toBe('%50\\%%');
    expect(searchPattern('a_b')).toBe('%a\\_b%');
  });

  it('escapes the escape character itself', () => {
    expect(escapeLike('a\\b')).toBe('a\\\\b');
  });
});
