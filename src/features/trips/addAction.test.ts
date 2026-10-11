import { addActionFor } from './addAction';

describe('addActionFor', () => {
  it('adds an item on Now, Timeline and Places', () => {
    for (const tab of ['index', 'timeline', 'places', undefined]) {
      expect(addActionFor(tab)).toEqual({ target: 'item', icon: 'add', label: 'Add to trip' });
    }
  });

  it('adds an expense on Expenses, and says so with its own icon', () => {
    expect(addActionFor('expenses')).toEqual({
      target: 'expense',
      icon: 'addExpense',
      label: 'Add an expense',
    });
  });

  it('adds a note on Notes — not a trip item', () => {
    expect(addActionFor('notes')).toEqual({ target: 'note', icon: 'addNote', label: 'Add a note' });
  });
});
