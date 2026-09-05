import { expect, it, vi } from 'vitest';
import { VideoProjectAssetType } from '../../../../features/video/project/types';
import { undoVideoEditorProjectHistory } from '../../history';
import { setup } from './material.test-support';

it.each(['appendMaterial', 'insertMaterial', 'overlayMaterial'] as const)(
  '%s places the selected source interval with synchronized embedded audio',
  (command) => {
    const { store, asset } = setup(true);
    const before = store.getState().project!;
    expect(store.getState()[command](asset.id, { start: 2, end: 4 }).status).toBe('placed');
    const state = store.getState();
    expect(state.project!.clips).toMatchObject([
      { sourceStart: 2, sourceDuration: 2, duration: 2, muted: true },
      { sourceStart: 2, sourceDuration: 2, duration: 2, muted: false },
    ]);
    expect(state.project!.clips[0]!.groupId).toBe(state.project!.clips[1]!.groupId);
    expect(state.projectHistory.past).toHaveLength(1);
    const undo = undoVideoEditorProjectHistory(state.projectHistory, state.project!);
    expect(undo?.status).toBe('applied');
    if (undo?.status === 'applied')
      expect(undo.project).toEqual({ ...before, updatedAt: undo.project.updatedAt });
  }
);

it.each([
  { start: -1, end: 2 },
  { start: 4, end: 2 },
  { start: 2, end: 2 },
  { start: 0, end: 7 },
  { start: NaN, end: 2 },
  { start: 0, end: Infinity },
  { start: 2, end: 2.001 },
])('rejects an invalid range %j without a project or history transition', (range) => {
  const { store, asset } = setup();
  const before = store.getState();
  const listener = vi.fn();
  store.subscribe(listener);
  expect(store.getState().appendMaterial(asset.id, range)).toEqual({
    status: 'rejected',
    reason: 'invalid-range',
  });
  expect(store.getState()).toBe(before);
  expect(listener).not.toHaveBeenCalled();
});

it('opens only the selected duration at a cut and preserves the existing source tails', () => {
  const { store, asset } = setup(true);
  store.getState().appendMaterial(asset.id);
  expect(store.getState().insertMaterial(asset.id, { start: 1, end: 2.5 }).status).toBe('placed');
  const after = store.getState().project!;
  expect(after.duration).toBe(7.5);
  const primary = after.clips.filter((clip) => clip.type === 'VIDEO');
  expect(primary.sort((a, b) => a.startTime - b.startTime)).toMatchObject([
    { startTime: 0, sourceStart: 0, duration: 3 },
    { startTime: 3, sourceStart: 1, duration: 1.5 },
    { startTime: 4.5, sourceStart: 3, duration: 3 },
  ]);
});

it('retains the image duration contract and rejects a timed image source range', () => {
  const { store, asset } = setup(false, VideoProjectAssetType.IMAGE);
  expect(store.getState().appendMaterial(asset.id, { start: 0, end: 1 })).toEqual({
    status: 'rejected',
    reason: 'invalid-range',
  });
  expect(store.getState().appendMaterial(asset.id).status).toBe('placed');
  expect(store.getState().project!.clips[0]!.duration).toBe(5);
});

it('retains a one-frame source selection when the project is reopened', async () => {
  const { hydrateVideoProject } = await import('../../../../features/video/project/hydration');
  const { store, asset } = setup(true);
  expect(store.getState().appendMaterial(asset.id, { start: 2, end: 2 + 1 / 30 }).status).toBe(
    'placed'
  );
  const before = store.getState().project!;
  const reopened = hydrateVideoProject(before);
  expect(reopened.clips.map((clip) => clip.duration)).toEqual(
    before.clips.map((clip) => clip.duration)
  );
});
