import {
  amountText,
  groupItems,
  listItemInputSchema,
  listProgress,
  moveInOrder,
  PRESET_LISTS,
  progressText,
} from './lists';

describe('listProgress and progressText', () => {
  it('counts rows, not quantities', () => {
    const progress = listProgress([{ doneAt: 'x' }, { doneAt: null }, { doneAt: null }]);
    expect(progress).toEqual({ done: 1, total: 3 });
    expect(progressText('packing', progress)).toBe('Packed 1 of 3');
    expect(progressText('shopping', progress)).toBe('Bought 1 of 3');
    expect(progressText('packing', { done: 0, total: 0 })).toBe('Nothing in it yet');
  });
});

describe('amountText', () => {
  it('says how much when it is said', () => {
    expect(amountText({ quantity: 3, unit: 'pairs' })).toBe('3 pairs');
    expect(amountText({ quantity: 2, unit: null })).toBe('2');
    expect(amountText({ quantity: null, unit: null })).toBeNull();
  });
});

describe('groupItems', () => {
  const item = (sortOrder: number, category: string | null) => ({ sortOrder, category });

  it('keeps the list order, each group where its first item is, ungrouped last', () => {
    const groups = groupItems([
      item(3, 'Clothing'),
      item(0, null),
      item(1, 'Documents'),
      item(2, 'Clothing'),
      item(4, ' '),
    ]);
    expect(groups.map((g) => [g.category, g.items.map((i) => i.sortOrder)])).toEqual([
      ['Documents', [1]],
      ['Clothing', [2, 3]],
      [null, [0, 4]],
    ]);
  });
});

describe('moveInOrder', () => {
  it('swaps with the neighbour, and refuses to move past an end', () => {
    expect(moveInOrder(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moveInOrder(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
    expect(moveInOrder(['a', 'b', 'c'], 'a', -1)).toBeNull();
    expect(moveInOrder(['a', 'b', 'c'], 'c', 1)).toBeNull();
    expect(moveInOrder(['a'], 'x', 1)).toBeNull();
  });
});

describe('listItemInputSchema', () => {
  it('needs a label, takes a whole quantity of at least one, and drops empty extras', () => {
    expect(listItemInputSchema.parse({ label: ' Socks ', unit: '', note: '  ' })).toEqual({
      label: 'Socks',
    });
    expect(listItemInputSchema.safeParse({ label: '' }).success).toBe(false);
    expect(listItemInputSchema.safeParse({ label: 'x', quantity: 0 }).success).toBe(false);
    expect(listItemInputSchema.safeParse({ label: 'x', quantity: 1.5 }).success).toBe(false);
  });

  it('says what is wrong when the quantity is not a number at all', () => {
    const typed = listItemInputSchema.safeParse({ label: 'x', quantity: Number('two') });
    expect(typed.error?.issues[0]?.message).toBe('A whole number');
  });
});

describe('PRESET_LISTS', () => {
  it('holds valid items, packing and shopping both', () => {
    for (const preset of PRESET_LISTS) {
      for (const item of preset.items) expect(listItemInputSchema.safeParse(item).success).toBe(true);
    }
    expect(new Set(PRESET_LISTS.map((preset) => preset.kind))).toEqual(
      new Set(['packing', 'shopping']),
    );
  });
});
