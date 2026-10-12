import { expect, it } from 'vitest';
import { parseGuideProject } from '@sniptale/runtime-contracts/scenario/guide-parser';
import {
  createGuideProject,
  createGuideStep,
  createTourDocument,
  createTourImageSlide,
  applyTourCommands,
  applyGuideStructureOperation,
} from '../../../features/scenario/project/public';
import { reduceGuideHistory, type GuideHistory } from './history';

function initial(): GuideHistory {
  return { present: createGuideProject('Original', 'guide', 1), past: [], future: [], group: null };
}

it('captures final X before Y when X already published a technical maxWait intermediate', () => {
  const X = '00000000-0000-4000-8000-000000000001';
  const Y = '00000000-0000-4000-8000-000000000002';
  let state = initial();
  state = reduceGuideHistory(state, {
    kind: 'edit',
    project: { ...state.present!, name: 'A' },
    group: 'name',
    actionId: X,
  });
  const intermediate = state.present!;
  state = reduceGuideHistory(state, {
    kind: 'publish',
    source: intermediate,
    project: { ...intermediate, updatedAt: 2 },
    actionId: X,
  });
  state = reduceGuideHistory(state, {
    kind: 'edit',
    project: { ...state.present!, name: 'AB' },
    group: 'name',
    actionId: X,
  });
  const finalX = state.present!;
  state = reduceGuideHistory(state, {
    kind: 'edit',
    project: { ...finalX, tags: ['Y'] },
    group: 'tags',
    actionId: Y,
  });
  expect(state).toHaveProperty('closedCaptures', [{ project: finalX, actionId: X }]);
  expect(state).toHaveProperty('actionId', Y);
  state = reduceGuideHistory(state, {
    kind: 'undo',
    actionId: '00000000-0000-4000-8000-000000000003',
  });
  expect(state.present?.name).toBe('AB');
  expect(state.present?.tags).toEqual([]);
});

it('keeps a newer closed Redo capture when an older acknowledgement shares its project object', () => {
  const X = '00000000-0000-4000-8000-000000000001';
  const U = '00000000-0000-4000-8000-000000000002';
  const R = '00000000-0000-4000-8000-000000000003';
  let state = initial();
  state = reduceGuideHistory(state, {
    kind: 'edit',
    project: { ...state.present!, name: 'A' },
    group: 'name',
    actionId: X,
  });
  const source = state.present!;
  state = reduceGuideHistory(state, { kind: 'undo', actionId: U });
  state = reduceGuideHistory(state, { kind: 'redo', actionId: R });
  state = reduceGuideHistory(state, { kind: 'seal' });
  state = reduceGuideHistory(state, {
    kind: 'publish',
    source,
    project: { ...source, updatedAt: 2 },
    actionId: X,
  });
  expect(state.closedCaptures?.some((capture) => capture.actionId === R)).toBe(true);
});

it('retains unchanged canonical item references when publishing the current autosave source', () => {
  const draft = createGuideProject('Guide', 'guide', 1);
  draft.items = [createGuideStep('First', 'first'), createGuideStep('Second', 'second')];
  const parsed = parseGuideProject(draft);
  if (parsed.status !== 'ok') throw new Error('Invalid source fixture');
  const source = parsed.project;
  const committed = structuredClone({ ...source, name: 'Saved name', updatedAt: 2 });
  const state: GuideHistory = { present: source, past: [draft], future: [], group: 'name' };
  const next = reduceGuideHistory(state, { kind: 'publish', source, project: committed });
  expect(next.present).toEqual(committed);
  expect(next.present?.items).toBe(source.items);
  expect(next.present?.items[0]).toBe(source.items[0]);
  expect(next.present?.items[1]).toBe(source.items[1]);
  expect(next.past).toBe(state.past);
  expect(next.group).toBe(state.group);
  expect(committed.items[0]).not.toBe(source.items[0]);
});

it('publishes changed canonical items and their order without mutating the source', () => {
  const source = createGuideProject('Guide', 'guide', 1);
  source.items = [createGuideStep('First', 'first'), createGuideStep('Second', 'second')];
  const committed = structuredClone({
    ...source,
    name: 'Canonical name',
    updatedAt: 2,
    items: [{ ...source.items[1]!, title: 'Canonical second' }, createGuideStep('New', 'new')],
  });
  const next = reduceGuideHistory(
    { ...initial(), present: source },
    {
      kind: 'publish',
      source,
      project: committed,
    }
  );
  expect(next.present).toEqual(committed);
  expect(next.present?.items).not.toBe(source.items);
  expect(source.items.map((item) => item.title)).toEqual(['First', 'Second']);
});

it('adopts a canonical item correction while keeping its unchanged sibling stable', () => {
  const source = createGuideProject('Guide', 'guide', 1);
  source.items = [createGuideStep('First', 'first'), createGuideStep('Second', 'second')];
  const committed = structuredClone({ ...source, updatedAt: 2 });
  committed.items[0]!.title = 'Canonical correction';
  const next = reduceGuideHistory(
    { ...initial(), present: source },
    {
      kind: 'publish',
      source,
      project: committed,
    }
  );
  expect(next.present).toEqual(committed);
  expect(next.present?.items[0]).toBe(committed.items[0]);
  expect(next.present?.items[1]).toBe(source.items[1]);
  expect(source.items[0]?.title).toBe('First');
});

it('groups a field edit until blur and restores the prior content in both directions', () => {
  let state = initial();
  const original = state.present!;
  state = reduceGuideHistory(state, {
    kind: 'edit',
    project: { ...original, name: 'A' },
    group: 'name',
  });
  state = reduceGuideHistory(state, {
    kind: 'edit',
    project: { ...original, name: 'AB' },
    group: 'name',
  });
  expect(state.past).toHaveLength(1);
  state = reduceGuideHistory(state, { kind: 'seal' });
  state = reduceGuideHistory(state, {
    kind: 'edit',
    project: { ...original, name: 'ABC' },
    group: 'name',
  });
  expect(state.past).toHaveLength(2);
  state = reduceGuideHistory(state, { kind: 'undo' });
  expect(state.present?.name).toBe('AB');
  state = reduceGuideHistory(state, { kind: 'redo' });
  expect(state.present?.name).toBe('ABC');
});

it('preserves undo after a successful save and invalidates redo on a new edit', () => {
  let state = initial();
  const project = state.present!;
  state = reduceGuideHistory(state, {
    kind: 'edit',
    project: { ...project, name: 'Edited' },
    group: null,
  });
  state = reduceGuideHistory(state, {
    kind: 'commit',
    project: { ...state.present!, updatedAt: 10 },
  });
  expect(state.present?.updatedAt).toBe(10);
  state = reduceGuideHistory(state, { kind: 'undo' });
  expect(state.present?.name).toBe('Original');
  state = reduceGuideHistory(state, {
    kind: 'edit',
    project: { ...project, name: 'Another' },
    group: null,
  });
  expect(state.future).toHaveLength(0);
});

it('resets history across project lifecycle and ignores a foreign commit', () => {
  let state = initial();
  const foreign = createGuideProject('Other', 'other', 2);
  expect(reduceGuideHistory(state, { kind: 'commit', project: foreign })).toBe(state);
  state = reduceGuideHistory(state, {
    kind: 'edit',
    project: { ...state.present!, name: 'Edited' },
    group: null,
  });
  state = reduceGuideHistory(state, { kind: 'reset', project: foreign });
  expect(state.past).toHaveLength(0);
  expect(state.future).toHaveLength(0);
  expect(state.present).toBe(foreign);
  state = reduceGuideHistory(state, { kind: 'reset', project: null });
  expect(reduceGuideHistory(state, { kind: 'undo' }).present).toBeNull();
});

it('bounds retained undo entries and does not mutate previous history values', () => {
  const original = initial();
  let state = original;
  for (let index = 1; index <= 60; index += 1) {
    state = reduceGuideHistory(state, {
      kind: 'edit',
      project: { ...state.present!, name: String(index) },
      group: null,
    });
  }
  expect(state.past).toHaveLength(50);
  expect(state.past[0]?.name).toBe('10');
  expect(original.past).toHaveLength(0);
  expect(original.present?.name).toBe('Original');
});

it('acknowledges an older autosave without replacing later text or splitting its edit group', () => {
  let state = initial();
  const original = state.present!;
  const source = { ...original, name: 'A' };
  state = reduceGuideHistory(state, { kind: 'edit', project: source, group: 'name' });
  state = reduceGuideHistory(state, {
    kind: 'edit',
    project: { ...source, name: 'AB' },
    group: 'name',
  });
  state = reduceGuideHistory(state, {
    kind: 'publish',
    source,
    project: { ...source, updatedAt: 2 },
  });
  expect(state.present).toMatchObject({ name: 'AB', updatedAt: 2 });
  expect(state.past).toHaveLength(1);
  expect(state.group).toBe('name');
  state = reduceGuideHistory(state, { kind: 'undo' });
  expect(state.present?.name).toBe('Original');
});

it('hydrates bounded project history in chronological order and resets redo', () => {
  const project = createGuideProject('Current', 'guide', 100);
  const past = Array.from({ length: 55 }, (_, index) => ({ ...project, name: String(index) }));
  let state = reduceGuideHistory(initial(), {
    kind: 'reset',
    project,
    past: [...past, createGuideProject('Other', 'other', 1)],
  });
  expect(state.past).toHaveLength(50);
  expect(state.past[0]?.name).toBe('5');
  state = reduceGuideHistory(state, { kind: 'undo' });
  expect(state.present?.name).toBe('54');
  state = reduceGuideHistory(state, { kind: 'redo' });
  expect(state.present).toBe(project);
  expect(reduceGuideHistory(state, { kind: 'reset', project: null }).past).toEqual([]);
});

it('undoes a whole tour command batch in the existing project history', () => {
  let state = initial();
  const source = state.present!;
  const tour = createTourDocument('tour');
  const changed = applyTourCommands(
    source,
    [
      { kind: 'replace-tour', tour },
      { kind: 'insert-slide', slide: createTourImageSlide('slide') },
    ],
    { images: [], audio: [] }
  );
  state = reduceGuideHistory(state, { kind: 'edit', project: changed, group: null });
  expect(state.past).toHaveLength(1);
  expect(state.present?.tour?.slides).toHaveLength(1);
  state = reduceGuideHistory(state, { kind: 'undo' });
  expect(state.present).toEqual(source);
  state = reduceGuideHistory(state, { kind: 'redo' });
  expect(state.present).toEqual(changed);
  expect(state.present?.items).toEqual(source.items);
});

it('undoes and redoes frameless title and body together in one history entry', () => {
  let state = initial();
  const source = state.present!;
  const changed = applyGuideStructureOperation(source, {
    kind: 'add-step',
    title: 'Context',
    description: 'Read before continuing',
  });
  state = reduceGuideHistory(state, { kind: 'edit', project: changed, group: null });
  expect(state.past).toEqual([source]);
  state = reduceGuideHistory(state, { kind: 'undo' });
  expect(state.present).toEqual(source);
  state = reduceGuideHistory(state, { kind: 'redo' });
  expect(state.present).toEqual(changed);
});
