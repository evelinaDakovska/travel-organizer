import { tripItemInputSchema } from './tripItem';
import {
  offsetLabel,
  parseTemplateContent,
  taskStart,
  templateSummary,
  templateTask,
  type TemplateContent,
} from './templates';

const empty: TemplateContent = { version: 1, tasks: [], notes: [], lists: [] };
const at = (local: string) =>
  ({ local, tz: 'Europe/Helsinki', precision: local.length > 10 ? 'time' : 'date' }) as const;

describe('templateTask and taskStart (C5)', () => {
  it('keeps a task’s day relative to the start and moves it to the new trip', () => {
    const saved = templateTask(
      { title: 'Online check-in', notes: null, start: at('2026-11-19T09:20') },
      '2026-11-20',
    );
    expect(saved).toEqual({ title: 'Online check-in', offsetDays: -1, time: '09:20' });
    expect(taskStart(saved, '2027-02-10')).toEqual({ local: '2027-02-09T09:20' });
  });

  it('moves a date-only task by its date, across a month end', () => {
    const saved = templateTask({ title: 'Pack', notes: 'Light', start: at('2026-11-18') }, '2026-11-20');
    expect(saved).toEqual({ title: 'Pack', notes: 'Light', offsetDays: -2, time: null });
    expect(taskStart(saved, '2027-03-01')).toEqual({ local: '2027-02-27' });
  });

  it('leaves an undated task undated', () => {
    const saved = templateTask({ title: 'Buy adapters', notes: null, start: null }, '2026-11-20');
    expect(saved.offsetDays).toBeNull();
    expect(taskStart(saved, '2027-02-10')).toBeUndefined();
  });

  it('gives starts the item schema accepts, in the new trip’s zone', () => {
    const start = taskStart({ offsetDays: 3, time: '18:00' }, '2027-02-10');
    const parsed = tripItemInputSchema('Europe/Vienna').safeParse({
      kind: 'task',
      title: 'Dinner booking',
      status: 'confirmed',
      start,
    });
    expect(parsed.success && parsed.data.start).toEqual({ local: '2027-02-13T18:00' });
  });
});

describe('parseTemplateContent', () => {
  it('reads what was saved, and nothing it cannot read', () => {
    const content: TemplateContent = {
      ...empty,
      lists: [{ kind: 'packing', name: 'Winter', items: [{ label: 'Socks', quantity: 3 }] }],
    };
    expect(parseTemplateContent(JSON.stringify(content))).toEqual(content);
    expect(parseTemplateContent('{"version":2}')).toBeNull();
    expect(parseTemplateContent('not json')).toBeNull();
  });
});

describe('templateSummary and offsetLabel', () => {
  it('says what a template holds', () => {
    const content: TemplateContent = {
      version: 1,
      tasks: [templateTask({ title: 'a', notes: null, start: null }, '2026-01-01')],
      notes: [
        { title: 'x', body: '', pinned: false },
        { title: 'y', body: '', pinned: true },
      ],
      lists: [{ kind: 'packing', name: 'P', items: [] }],
    };
    expect(templateSummary(content)).toBe('1 task, 2 notes and 1 packing list');
    expect(templateSummary(empty)).toBe('Nothing in it yet');
  });

  it('says where a task lands', () => {
    expect(offsetLabel(-2)).toBe('2 days before');
    expect(offsetLabel(-1)).toBe('The day before');
    expect(offsetLabel(0)).toBe('Day 1');
    expect(offsetLabel(null)).toBe('No date');
  });
});
