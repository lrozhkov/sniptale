import { afterEach, expect, it, vi } from 'vitest';
import {
  createImageClip,
  createProject,
  createVideoClip,
} from '../../../features/video/project/timeline/project-meta.test.helpers';
import {
  beginVideoEditorProjectHistoryTransaction,
  endVideoEditorProjectHistoryTransaction,
  undoVideoEditorProjectHistory,
  redoVideoEditorProjectHistory,
} from '../history';
import { createVideoEditorProjectTestStore } from './test-store.test-support';

afterEach(() => vi.restoreAllMocks());
function setup() {
  const store = createVideoEditorProjectTestStore();
  const initial = createProject([
    createImageClip({ id: 'intro', duration: 1 }),
    createVideoClip({ id: 'main', startTime: 1, duration: 2, sourceDuration: 2 }),
  ]);
  initial.duration = 3;
  store.getState().setProject(initial);
  const project = store.getState().project!;
  const joins = [
    {
      id: 'intro-join',
      clipId: 'intro',
      edge: 'end' as const,
      transition: { type: 'dissolve' as const, before: 0.2, after: 0.2 },
    },
  ];
  return { store, project, joins };
}

it('accepts one independent join history step and restores it through Undo and Redo without changing clips', () => {
  const { store, project, joins } = setup();
  const before = store.getState();
  expect(before.updateCompositionJoins(joins, project)).toEqual({ status: 'updated' });
  const after = store.getState();
  expect(after.project!.version).toBe(26);
  expect(after.project!.clips).toEqual(project.clips);
  expect(after.projectHistory.past).toHaveLength(before.projectHistory.past.length + 1);
  const undo = undoVideoEditorProjectHistory(after.projectHistory, after.project!, after.selection);
  if (undo?.status !== 'applied') throw new Error('Undo was refused');
  expect(undo.project.compositionJoins).toBeUndefined();
  const redo = redoVideoEditorProjectHistory(undo.history, undo.project, undo.selection);
  if (redo?.status !== 'applied') throw new Error('Redo was refused');
  expect(redo.project.compositionJoins).toEqual(joins);
  expect(after.updateCompositionJoins(joins, after.project!)).toEqual({ status: 'unchanged' });
  expect(store.getState()).toBe(after);
});

it('refuses a competing join edit from the stale accepted root without losing the first edit', () => {
  const { store, project, joins } = setup();
  expect(store.getState().updateCompositionJoins(joins, project).status).toBe('updated');
  const before = store.getState();
  expect(before.updateCompositionJoins([], project)).toEqual({
    status: 'rejected',
    reason: 'stale-project',
  });
  expect(store.getState()).toBe(before);
  expect(before.project!.compositionJoins).toEqual(joins);
});

it('refuses an old root after recreation of the same project identity', () => {
  const { store, project, joins } = setup();
  store.getState().setProject(structuredClone(project));
  const before = store.getState();
  expect(before.project!.id).toBe(project.id);
  expect(before.updateCompositionJoins(joins, project)).toEqual({
    status: 'rejected',
    reason: 'stale-project',
  });
  expect(store.getState()).toBe(before);
});

it('refuses a foreign history lease and accepts a fresh retry after it ends', () => {
  const { store, project, joins } = setup();
  store.setState({
    projectHistory: beginVideoEditorProjectHistoryTransaction(
      store.getState().projectHistory,
      project
    ),
  });
  const before = store.getState();
  expect(before.updateCompositionJoins(joins, project)).toEqual({
    status: 'rejected',
    reason: 'history-busy',
  });
  expect(store.getState()).toBe(before);
  store.setState({
    projectHistory: endVideoEditorProjectHistoryTransaction(before.projectHistory, project),
  });
  expect(store.getState().updateCompositionJoins(joins, store.getState().project!)).toEqual({
    status: 'updated',
  });
});

it('preserves root and history when snapshot allocation fails and accepts a retry', () => {
  const { store, project, joins } = setup();
  const before = store.getState();
  const clone = vi.spyOn(globalThis, 'structuredClone').mockImplementation(() => {
    throw new Error('No snapshot');
  });
  expect(before.updateCompositionJoins(joins, project)).toEqual({
    status: 'rejected',
    reason: 'history-unavailable',
  });
  expect(store.getState()).toBe(before);
  clone.mockRestore();
  expect(store.getState().updateCompositionJoins(joins, project)).toEqual({ status: 'updated' });
});

it('refuses malformed joins and retries a valid proposal without partial publication', () => {
  const { store, project, joins } = setup();
  const before = store.getState();
  for (const proposal of [
    [...joins, ...joins],
    [{ ...joins[0]!, clipId: 'missing' }],
    [{ ...joins[0]!, transition: { ...joins[0]!.transition, before: NaN } }],
  ]) {
    expect(before.updateCompositionJoins(proposal, project)).toEqual({
      status: 'rejected',
      reason: 'invalid-project',
    });
    expect(store.getState()).toBe(before);
  }
  expect(before.updateCompositionJoins(joins, project)).toEqual({ status: 'updated' });
});

it('refuses an inspector command after its project closes without changing the empty session', () => {
  const { store, project, joins } = setup();
  store.setState({ project: null });
  const before = store.getState();
  expect(before.updateCompositionJoins(joins, project)).toEqual({
    status: 'rejected',
    reason: 'no-project',
  });
  expect(store.getState()).toBe(before);
});
