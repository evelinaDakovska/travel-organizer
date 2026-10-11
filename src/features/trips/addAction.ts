/**
 * What the floating button on a trip's tabs adds, by the tab it is on (F2). Pure, no React: the
 * layout draws it. The button shows what it adds, with a small + so it still reads as "add".
 */
export type AddAction = {
  target: 'item' | 'expense' | 'note';
  /** The glyph inside the button: the plain + for an item, the thing itself otherwise. */
  icon: 'add' | 'addExpense' | 'addNote';
  label: string;
};

export function addActionFor(tab: string | undefined): AddAction {
  switch (tab) {
    case 'expenses':
      return { target: 'expense', icon: 'addExpense', label: 'Add an expense' };
    case 'notes':
      return { target: 'note', icon: 'addNote', label: 'Add a note' };
    default:
      return { target: 'item', icon: 'add', label: 'Add to trip' };
  }
}
