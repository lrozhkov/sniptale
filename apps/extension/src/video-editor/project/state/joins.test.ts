import { createVideoProjectFromRecording } from '../../../features/video/project/factories/creation';
import { getProjectAssetUseCounts } from '../../../features/video/project/media-usage';
import { resolveVideoProjectCompositionJoinPlans } from '../../../features/video/project/scene/joins';
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

it.each([false, true])('restores held and moving joins through one history step (%s)', (moving) => {
  const { store, project, joins } = setup();
  const proposal = moving ? joins.map((join) => ({ ...join, sampling: 'cut' as const })) : joins;
  const before = store.getState();
  expect(before.updateCompositionJoins(proposal, project)).toEqual({ status: 'updated' });
  const after = store.getState();
  expect(after.project!.version).toBe(moving ? 40 : 26);
  expect(after.project!.clips).toEqual(project.clips);
  expect(after.projectHistory.past).toHaveLength(before.projectHistory.past.length + 1);
  const undo = undoVideoEditorProjectHistory(after.projectHistory, after.project!, after.selection);
  if (undo?.status !== 'applied') throw new Error('Undo was refused');
  expect(undo.project.compositionJoins).toBeUndefined();
  const redo = redoVideoEditorProjectHistory(undo.history, undo.project, undo.selection);
  if (redo?.status !== 'applied') throw new Error('Redo was refused');
  expect(redo.project.compositionJoins).toEqual(proposal);
  expect(after.updateCompositionJoins(proposal, after.project!)).toEqual({ status: 'unchanged' });
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

function cutSetup() {
  const project = createVideoProjectFromRecording({
    recordingId: 'cut-source',
    filename: 'Source.webm',
    width: 160,
    height: 90,
    duration: 8,
    mimeType: 'video/webm',
    size: 1,
    hasAudio: false,
  });
  const original = project.clips.find((clip) => clip.type === 'VIDEO')!;
  if (original.type !== 'VIDEO') throw new Error('Missing source');
  const left = { ...original, sourceInstanceId: 'original', duration: 2, sourceDuration: 2 };
  const right = {
    ...original,
    id: 'right',
    sourceInstanceId: 'original',
    startTime: 2,
    sourceStart: 4,
    duration: 4,
    sourceDuration: 4,
  };
  project.clips = [left, right];
  project.duration = 6;
  const store = createVideoEditorProjectTestStore();
  store.getState().setProject(project);
  const join = {
    id: 'cut',
    sampling: 'cut' as const,
    clipId: right.id,
    edge: 'start' as const,
    transition: { type: 'dissolve' as const, before: 0.5, after: 0.5 },
    sourceRange: { assetId: original.assetId, sourceInstanceId: 'original', start: 2, end: 4 },
  };
  expect(store.getState().updateCompositionJoins([join], store.getState().project!).status).toBe(
    'updated'
  );
  return { store, left, right, join, original };
}

it('retains a cut after deleting its source placements and restores the exact association through Undo', () => {
  const { store, left, right, join, original } = cutSetup();
  expect(resolveVideoProjectCompositionJoinPlans(store.getState().project!)).toHaveLength(1);
  store.getState().deleteClip(right.id);
  const retained = {
    id: join.id,
    sampling: 'cut',
    transition: join.transition,
    sourceRange: join.sourceRange,
  };
  expect(store.getState().project!.compositionJoins).toEqual([retained]);
  store.getState().deleteClip(left.id);
  const deleted = store.getState();
  expect(deleted.project!.clips.filter((clip) => clip.type === 'VIDEO')).toEqual([]);
  expect(deleted.project!.compositionJoins).toEqual([retained]);
  expect(getProjectAssetUseCounts(deleted.project!).get(original.assetId)).toBe(1);
  const undo = undoVideoEditorProjectHistory(
    deleted.projectHistory,
    deleted.project!,
    deleted.selection
  );
  if (undo?.status !== 'applied') throw new Error('Undo refused');
  const restored = undoVideoEditorProjectHistory(undo.history, undo.project, undo.selection);
  if (restored?.status !== 'applied') throw new Error('Second Undo refused');
  expect(restored.project.compositionJoins).toEqual([join]);
  expect(resolveVideoProjectCompositionJoinPlans(restored.project)).toHaveLength(1);
});

it('keeps source cut association through split rate gap closure trim and JSON reopen', async () => {
  const { store, left, right, join } = cutSetup();
  store.getState().splitClipAt(left.id, 1);
  const tail = store
    .getState()
    .project!.clips.find(
      (clip) => clip.type === 'VIDEO' && clip.id !== left.id && clip.id !== right.id
    );
  if (tail?.type !== 'VIDEO') throw new Error('Missing split source');
  expect(resolveVideoProjectCompositionJoinPlans(store.getState().project!)[0]?.seam).toBe(2);
  store.getState().updateClipPlaybackRate(tail.id, 2);
  expect(resolveVideoProjectCompositionJoinPlans(store.getState().project!)).toEqual([]);
  expect(store.getState().project!.compositionJoins).toEqual([join]);
  store.getState().closeTrackGap(right.trackId, 1.5, 2);
  expect(resolveVideoProjectCompositionJoinPlans(store.getState().project!)[0]?.seam).toBe(1.5);
  store.getState().trimClipStart(right.id, 1.75);
  expect(resolveVideoProjectCompositionJoinPlans(store.getState().project!)).toEqual([]);
  store.getState().closeTrackGap(right.trackId, 1.5, 1.75);
  const edited = store.getState().project!;
  expect(resolveVideoProjectCompositionJoinPlans(edited)[0]?.seam).toBe(1.5);
  expect(edited.compositionJoins).toEqual([join]);
  const { hydrateVideoProject } = await import('../../../features/video/project/hydration');
  expect(
    resolveVideoProjectCompositionJoinPlans(
      hydrateVideoProject(JSON.parse(JSON.stringify(edited)))
    )[0]?.seam
  ).toBe(1.5);
});

it('does not substitute another source instance when the outgoing source placement is deleted', () => {
  const { store, left, join } = cutSetup();
  store.getState().deleteClip(left.id);
  const project = store.getState().project!;
  expect(project.compositionJoins).toEqual([join]);
  expect(
    resolveVideoProjectCompositionJoinPlans({
      ...project,
      clips: [...project.clips, { ...left, id: 'foreign', sourceInstanceId: 'foreign' }],
    })
  ).toEqual([]);
});
