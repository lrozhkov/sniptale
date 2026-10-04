import { beforeEach, expect, it, vi } from 'vitest';
import { createReviewWorkspaceStoreFixture } from './store.test-support';
import type { ReviewAnnotation, ReviewOperation } from '../../../features/video/review/types';

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
  saveVideoWorkspaceDraft,
} from './store';
import { createQuickEditAdvancedState } from '../../../features/video/review/advanced/defaults';
const id = 'recording:beta-v1-recording';
const source = { duration: 12, width: 640, height: 360, mimeType: 'video/webm', size: 15 };
const annotation: ReviewAnnotation = {
  id: 'a',
  text: 'Before',
  anchor: { kind: 'point', time: 2 },
};
const operation: ReviewOperation = {
  id: 'op1',
  at: 1,
  target: 'annotation',
  before: null,
  after: annotation,
};
beforeEach(() => {
  harness.failure = false;
  harness.database.mockResolvedValue(
    createReviewWorkspaceStoreFixture(() => harness.failure).database
  );
});

it('returns to cursor zero in one revision, preserves baseline and draft, and retains Redo on reopen', async () => {
  let saved = await openVideoWorkspace(id, source);
  const identity = () => ({
    aggregateId: id,
    expectedRevision: saved.workspace.revision,
    expectedSourceAssetId: saved.workspace.sourceAssetId,
  });
  const advanced = createQuickEditAdvancedState();
  advanced.audio.original = { muted: true, volume: 0.5 };
  saved = await saveVideoWorkspaceAdvanced({ ...identity(), advanced });
  saved = await commitVideoWorkspace({ ...identity(), operation });
  saved = await commitVideoWorkspace({
    ...identity(),
    operation: {
      ...operation,
      id: 'op2',
      before: annotation,
      after: { ...annotation, text: 'After' },
    },
  });
  saved = await saveVideoWorkspaceDraft({
    ...identity(),
    expectedDraftRevision: null,
    annotation: { ...annotation, id: 'draft' },
    before: null,
  });
  const before = structuredClone(saved);
  saved = await moveVideoWorkspaceHistory({ ...identity(), direction: 'start' });
  expect(saved.workspace).toMatchObject({
    cursor: 0,
    revision: before.workspace.revision + 1,
    history: before.workspace.history,
    advanced: before.workspace.advanced,
    source: before.workspace.source,
  });
  expect(saved.draft).toEqual(before.draft);
  expect(await readVideoWorkspace(id)).toEqual(saved);
  const atStart = structuredClone(saved);
  saved = await moveVideoWorkspaceHistory({ ...identity(), direction: 'start' });
  expect(saved).toEqual(atStart);
  saved = await moveVideoWorkspaceHistory({ ...identity(), direction: 'redo' });
  expect(saved.workspace.cursor).toBe(1);
  harness.failure = true;
  await expect(moveVideoWorkspaceHistory({ ...identity(), direction: 'start' })).rejects.toThrow();
  harness.failure = false;
  expect(await readVideoWorkspace(id)).toEqual(saved);
  await expect(
    moveVideoWorkspaceHistory({ ...identity(), expectedRevision: 1, direction: 'start' })
  ).rejects.toMatchObject({ code: 'conflict' });
  await expect(
    moveVideoWorkspaceHistory({ ...identity(), expectedSourceAssetId: 'other', direction: 'start' })
  ).rejects.toMatchObject({ code: 'conflict' });
});
