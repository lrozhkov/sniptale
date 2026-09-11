import { expect, it } from 'vitest';
import { createGuideProject } from '../../../features/scenario/project/public';
import { reduceGuideHistory, type GuideHistory } from './history';

function initial(): GuideHistory {
  return { present: createGuideProject('Original', 'guide', 1), past: [], future: [], group: null };
}

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
