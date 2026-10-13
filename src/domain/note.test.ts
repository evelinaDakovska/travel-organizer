import { notePreview } from './note';

describe('notePreview', () => {
  it('runs the lines together and drops blank ones', () => {
    expect(notePreview('Door code 4512\n\n  Wi-Fi: lapland-guest  \nCall Anna')).toBe(
      'Door code 4512 · Wi-Fi: lapland-guest · Call Anna',
    );
  });

  it('is empty for an empty body', () => {
    expect(notePreview('')).toBe('');
    expect(notePreview('\n  \n')).toBe('');
  });
});
