import { expect, it } from 'vitest';
import { createGuideProject, createGuideStep } from './factories';
import { applyGuideStructureOperation } from './mutations';
import { resolveGuideNumbering } from './numbering';

it('skips hidden and manual labels without shifting following automatic steps', () => {
  const items = ['first', 'hidden', 'manual', 'last'].map((id) => createGuideStep(id, id));
  items[1]!.showNumber = false;
  items[2]!.numbering = { label: 'A.1' };
  expect([...resolveGuideNumbering(items).values()]).toEqual([
    { label: '1', nextAutomaticNumber: 2 },
    { label: null, nextAutomaticNumber: 2 },
    { label: 'A.1', nextAutomaticNumber: 2 },
    { label: '2', nextAutomaticNumber: 3 },
  ]);
});
it('restarts on sections and steps before resolving hidden or custom labels', () => {
  const items = ['first', 'restart', 'manual', 'last'].map((id) => createGuideStep(id, id));
  items[1]!.showNumber = false;
  items[1]!.numbering = { restartAt: 5 };
  items[2]!.numbering = { label: 'Appendix', restartAt: 9 };
  const result = resolveGuideNumbering([
    items[0]!,
    { kind: 'section', id: 'section', title: '', paragraphs: [], numbering: { restartAt: 3 } },
    ...items.slice(1),
  ]);
  expect([...result.values()]).toEqual([
    { label: '1', nextAutomaticNumber: 2 },
    { label: null, nextAutomaticNumber: 3 },
    { label: null, nextAutomaticNumber: 5 },
    { label: 'Appendix', nextAutomaticNumber: 9 },
    { label: '9', nextAutomaticNumber: 10 },
  ]);
});
it('recomputes after canonical reorder/removal without retaining a derived counter', () => {
  const project = createGuideProject('Guide');
  project.items = ['a', 'b', 'c'].map((id) => createGuideStep(id, id));
  project.items[1]!.numbering = { restartAt: 7 };
  const moved = applyGuideStructureOperation(project, {
    kind: 'move-item',
    itemId: 'b',
    direction: -1,
  });
  expect([...resolveGuideNumbering(moved.items).values()].map((entry) => entry.label)).toEqual([
    '7',
    '8',
    '9',
  ]);
  const removed = applyGuideStructureOperation(moved, { kind: 'remove-item', itemId: 'b' });
  expect([...resolveGuideNumbering(removed.items).values()].map((entry) => entry.label)).toEqual([
    '1',
    '2',
  ]);
  expect([...resolveGuideNumbering(project.items).values()].map((entry) => entry.label)).toEqual([
    '1',
    '7',
    '8',
  ]);
  expect(resolveGuideNumbering([]).size).toBe(0);
});
