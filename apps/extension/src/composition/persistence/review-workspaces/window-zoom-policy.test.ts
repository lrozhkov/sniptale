import {
  replayReviewHistory,
  reviewAdvancedContentBaseline,
} from '../../../features/video/review/document';
import { beforeEach, expect, it, vi } from 'vitest';
import { createReviewWorkspaceStoreFixture } from './store.test-support';
const harness = vi.hoisted(() => ({ database: vi.fn() }));
vi.mock('../infrastructure/indexed-db/core', () => ({
  initDB: harness.database,
  MEDIA_LIBRARY_STORE: 'media_library',
  VIDEO_WORKSPACES_STORE: 'video_workspaces',
  VIDEO_WORKSPACE_HISTORY_STORE: 'video_workspace_history',
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
import { commitVideoWorkspace, moveVideoWorkspaceHistory, openVideoWorkspace } from './store';
const id = 'recording:beta-v1-recording';
const source = { duration: 12, width: 640, height: 360, mimeType: 'video/webm', size: 15 };
beforeEach(() => {
  harness.database.mockResolvedValue(createReviewWorkspaceStoreFixture(() => false).database);
});

it('undoes and reopens zoom target changes without rewriting the initial policy', async () => {
  const opened = await openVideoWorkspace(id, source);
  const before = reviewAdvancedContentBaseline(opened.workspace.advanced);
  const after = {
    ...before,
    background: { ...before.background, zoomBehavior: 'content' as const },
  };
  const committed = await commitVideoWorkspace({
    aggregateId: id,
    expectedSourceAssetId: 'beta-v1-recording-asset',
    expectedRevision: opened.workspace.revision,
    operation: { id: 'zoom-target', at: 2, target: 'advancedContent', before, after },
  });
  expect((await openVideoWorkspace(id, source)).workspace).toEqual(committed.workspace);
  const undone = await moveVideoWorkspaceHistory({
    aggregateId: id,
    expectedSourceAssetId: 'beta-v1-recording-asset',
    expectedRevision: committed.workspace.revision,
    direction: 'undo',
  });
  expect(reviewAdvancedContentBaseline(undone.workspace.advanced).background.zoomBehavior).toBe(
    'window'
  );
  expect((await openVideoWorkspace(id, source)).workspace).toEqual(undone.workspace);
  const redone = await moveVideoWorkspaceHistory({
    aggregateId: id,
    expectedSourceAssetId: 'beta-v1-recording-asset',
    expectedRevision: undone.workspace.revision,
    direction: 'redo',
  });
  expect(
    replayReviewHistory(
      redone.workspace.history,
      redone.workspace.cursor,
      source,
      reviewAdvancedContentBaseline(redone.workspace.advanced)
    ).advancedContent.background.zoomBehavior
  ).toBe('content');
  expect((await openVideoWorkspace(id, source)).workspace).toEqual(redone.workspace);
});
