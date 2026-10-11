import { expect, it } from 'vitest';
import { createQuickEditAdvancedState } from '../../../features/video/review/advanced/defaults';
import { createReviewWorkspaceStoreFixture } from './store.test-support';
import { createVideoWorkspaceStore, readWorkspaceStorage } from './storage';
import { parseVideoWorkspace } from './parser';
import type { VideoWorkspace } from './contracts';

const stores = ['video_workspaces', 'video_workspace_history'];
const workspace: VideoWorkspace = {
  aggregateId: 'review',
  formatVersion: 1,
  source: { duration: 12, width: 640, height: 360, mimeType: 'video/webm', size: 15 },
  sourceAssetId: 'bytes',
  revision: 1,
  cursor: 0,
  createdAt: 1,
  updatedAt: 1,
  advanced: createQuickEditAdvancedState(),
  history: [],
};

it('reads legacy rows without writes, then explicitly replaces and removes only owned physical rows', async () => {
  const fixture = createReviewWorkspaceStoreFixture(() => false);
  fixture.rows.get('video_workspaces')!.set('review', workspace);
  const before = structuredClone(fixture.rows);
  const reader = fixture.database.transaction(stores, 'readonly');
  expect(parseVideoWorkspace((await readWorkspaceStorage(reader, 'review')).logical)).toEqual(
    workspace
  );
  await reader.done;
  expect(fixture.rows).toEqual(before);
  const writer = fixture.database.transaction(stores, 'readwrite');
  await createVideoWorkspaceStore(writer).put(workspace);
  await writer.done;
  fixture.rows.get('video_workspace_history')!.set(JSON.stringify(['other', 0]), {
    aggregateId: 'other',
    ordinal: 0,
    advanced: 'opaque evidence',
  });
  const cleanup = fixture.database.transaction(stores, 'readwrite');
  await createVideoWorkspaceStore(cleanup).delete('review');
  await cleanup.done;
  expect(fixture.rows.get('video_workspaces')!.has('review')).toBe(false);
  expect([...fixture.rows.get('video_workspace_history')!.values()]).toEqual([
    { aggregateId: 'other', ordinal: 0, advanced: 'opaque evidence' },
  ]);
});

it('enumerates orphan evidence and refuses replacement without rewriting it', async () => {
  const fixture = createReviewWorkspaceStoreFixture(() => false);
  fixture.rows.get('video_workspace_history')!.set(JSON.stringify(['review', 0]), {
    aggregateId: 'review',
    ordinal: 0,
    advanced: workspace.advanced,
  });
  const before = structuredClone(fixture.rows);
  const tx = fixture.database.transaction(stores, 'readwrite');
  const participant = createVideoWorkspaceStore(tx);
  expect(await participant.getAll()).toEqual([
    expect.objectContaining({ aggregateId: 'review', formatVersion: 2 }),
  ]);
  await expect(participant.put(workspace)).rejects.toThrow('Invalid existing workspace');
  tx.abort();
  await tx.done.catch(() => undefined);
  expect(fixture.rows).toEqual(before);
});
