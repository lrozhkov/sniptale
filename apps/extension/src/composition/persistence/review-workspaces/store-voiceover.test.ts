import { beforeEach, expect, it, vi } from 'vitest';
import { createReviewWorkspaceStoreFixture } from './store.test-support';
import type { ReviewOperation } from '../../../features/video/review/types';
import {
  replayReviewHistory,
  reviewAdvancedContentBaseline,
} from '../../../features/video/review/document';
import {
  anchorReviewVoiceover,
  projectReviewVoiceover,
} from '../../../features/video/review/voiceover-edits';
import { buildReviewTimeMap } from '../../../features/video/review/timeline';
import { createQuickEditAdvancedState } from '../../../features/video/review/advanced/defaults';
const harness = vi.hoisted(() => ({ database: vi.fn(), failure: false }));
vi.mock('../infrastructure/indexed-db/core', () => ({
  initDB: harness.database,
  MEDIA_LIBRARY_STORE: 'media_library',
  VIDEO_WORKSPACES_STORE: 'video_workspaces',
  VIDEO_WORKSPACE_DRAFTS_STORE: 'video_workspace_drafts',
}));
vi.mock('../assets/opfs-store', async (original) => ({
  ...(await original<typeof import('../assets/opfs-store')>()),
  listReadyJournals: vi.fn(async () => []),
}));
vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: async (operation: (db: unknown) => Promise<unknown>) =>
    operation(await harness.database()),
}));
import {
  commitVideoWorkspace,
  moveVideoWorkspaceHistory,
  openVideoWorkspace,
  readVideoWorkspace,
  saveVideoWorkspaceAdvanced,
} from './store';
const id = 'recording:beta-v1-recording';
const source = { duration: 12, width: 640, height: 360, mimeType: 'video/webm', size: 15 };
beforeEach(() => {
  harness.failure = false;
  const fixture = createReviewWorkspaceStoreFixture(() => harness.failure);
  harness.database.mockResolvedValue(fixture.database);
});
it('persists native voice normalization on a new Speed command and restores it after reopening', async () => {
  let state = await openVideoWorkspace(id, source);
  const commit = async (operation: ReviewOperation) => {
    state = await commitVideoWorkspace({
      aggregateId: id,
      expectedRevision: state.workspace.revision,
      expectedSourceAssetId: state.workspace.sourceAssetId,
      operation,
    });
  };
  const project = () =>
    replayReviewHistory(
      state.workspace.history,
      state.workspace.cursor,
      state.workspace.source,
      reviewAdvancedContentBaseline(state.workspace.advanced)
    );
  const speed = {
    id: 'speed',
    kind: 'speed' as const,
    start: 0,
    end: 8,
    requestedStart: 0,
    requestedEnd: 8,
    rate: 2 as const,
    audio: 'speed' as const,
  };
  await commit({ id: 'speed-add', at: 1, target: 'edit', before: null, after: speed });
  const before = project().advancedContent;
  const voice = anchorReviewVoiceover(
    {
      id: 'voice',
      assetId: 'voice-asset',
      timelineStart: 1,
      sourceOffset: 0.4,
      duration: 2,
      volume: 1,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
    },
    buildReviewTimeMap(12, [speed])
  );
  await commit({
    id: 'voice-add',
    at: 2,
    target: 'advancedContent',
    before,
    after: { ...before, audio: { ...before.audio, voiceover: [voice] } },
  });
  await commit({ id: 'speed-remove', at: 3, target: 'edit', before: speed, after: null });
  expect(state.workspace.history[2]).toMatchObject({ normalizeVoiceoverTempo: true });
  const reopened = await readVideoWorkspace(id);
  expect(reopened).toEqual(state);
  state = reopened!;
  const audio = project().advancedContent.audio;
  expect(projectReviewVoiceover(audio.voiceover, audio.voiceoverSegments)).toMatchObject([
    { playbackRate: 1, duration: 2, sourceOffset: 0.4, timelineStart: 2 },
  ]);
});

it('preserves voiceover records and temporarily suppresses recordings intersected by cuts', async () => {
  const opened = await openVideoWorkspace(id, source);
  const advanced = createQuickEditAdvancedState();
  advanced.ui.mode = 'advanced';
  advanced.ui.tracks.audio = true;
  const clip = {
    id: 'voice',
    assetId: 'voice-asset',
    timelineStart: 1,
    sourceOffset: 2,
    duration: 8,
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
  };
  advanced.audio.voiceover = [clip, { ...clip, id: 'later', timelineStart: 10, duration: 1 }];
  advanced.audio.music = [{ ...clip, id: 'music' }];
  const saved = await saveVideoWorkspaceAdvanced({
    aggregateId: id,
    expectedRevision: opened.workspace.revision,
    expectedSourceAssetId: 'beta-v1-recording-asset',
    advanced,
  });
  const args = {
    aggregateId: id,
    expectedRevision: saved.workspace.revision,
    expectedSourceAssetId: 'beta-v1-recording-asset',
    operation: {
      id: 'cut-voice',
      at: 10,
      target: 'edit',
      before: null,
      after: { id: 'cut', kind: 'cut', start: 2, end: 4, requestedStart: 2, requestedEnd: 4 },
    },
  };
  const { replayReviewHistory, reviewAdvancedContentBaseline } =
    await import('../../../features/video/review/document');
  const { resolveQuickEditEffectiveState } =
    await import('../../../features/video/review/advanced/effective');
  const derive = (workspace: typeof saved.workspace) =>
    replayReviewHistory(
      workspace.history,
      workspace.cursor,
      source,
      reviewAdvancedContentBaseline(workspace.advanced)
    ).advancedContent;
  harness.failure = true;
  await expect(commitVideoWorkspace(args)).rejects.toBeDefined();
  expect((await readVideoWorkspace(id))?.workspace).toEqual(saved.workspace);
  harness.failure = false;
  const committed = await commitVideoWorkspace(args);
  const content = derive(committed.workspace);
  expect(content.audio.voiceover).toHaveLength(2);
  expect(content.audio.voiceover[0]).toMatchObject(clip);
  expect(content.audio.music).toEqual(advanced.audio.music);
  const applied = resolveQuickEditEffectiveState({ ...content, ui: advanced.ui });
  expect(
    applied.voiceover.map(({ timelineStart, sourceOffset, duration }) => ({
      timelineStart,
      sourceOffset,
      duration,
    }))
  ).toEqual([
    { timelineStart: 1, sourceOffset: 2, duration: 1 },
    { timelineStart: 2, sourceOffset: 5, duration: 5 },
    { timelineStart: 8, sourceOffset: 2, duration: 1 },
  ]);
  expect((await openVideoWorkspace(id, source)).workspace).toEqual(committed.workspace);
  const undone = await moveVideoWorkspaceHistory({
    ...args,
    expectedRevision: committed.workspace.revision,
    direction: 'undo',
  });
  expect(derive(undone.workspace).audio).toEqual(advanced.audio);
  const redone = await moveVideoWorkspaceHistory({
    ...args,
    expectedRevision: undone.workspace.revision,
    direction: 'redo',
  });
  expect(derive(redone.workspace)).toEqual(content);
  const restored = await commitVideoWorkspace({
    ...args,
    expectedRevision: redone.workspace.revision,
    operation: {
      ...args.operation,
      id: 'restore-video',
      before: args.operation.after,
      after: null,
    },
  });
  expect(
    resolveQuickEditEffectiveState({
      ...derive(restored.workspace),
      ui: advanced.ui,
    }).voiceover.map(({ timelineStart, duration }) => ({ timelineStart, duration }))
  ).toEqual([
    { timelineStart: 1, duration: 8 },
    { timelineStart: 10, duration: 1 },
  ]);
});
