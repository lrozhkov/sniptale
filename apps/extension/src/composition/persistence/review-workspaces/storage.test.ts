import { expect, it } from 'vitest';
import { createQuickEditAdvancedState } from '../../../features/video/review/advanced/defaults';
import { createReviewWorkspaceStoreFixture } from './store.test-support';
import { createVideoWorkspaceStore, readWorkspaceStorage, writeWorkspaceStorage } from './storage';
import { reviewAdvancedContentBaseline } from '../../../features/video/review/document';
import type { ReviewOperation } from '../../../features/video/review/types';
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

it.each(['cursor', 'branch', 'replace', 'rollover'] as const)(
  'reads back the complete %s delta and preserves foreign evidence',
  async (kind) => {
    const operation = (id: string, time: number): ReviewOperation => ({
      id,
      at: time,
      target: 'annotation',
      before: null,
      after: { id, text: id, anchor: { kind: 'point', time } },
    });
    const first = operation('first', 1);
    const second = operation('second', 2);
    const previous: VideoWorkspace = {
      ...workspace,
      formatVersion: 2,
      history: [first, second],
      cursor: kind === 'branch' ? 1 : 2,
      baseline: {
        annotations: [],
        edits: [],
        canvasComments: [],
        advancedContent: reviewAdvancedContentBaseline(workspace.advanced),
      },
    };
    const fixture = createReviewWorkspaceStoreFixture(() => false);
    const initial = fixture.database.transaction(stores, 'readwrite');
    await createVideoWorkspaceStore(initial).put(previous);
    await initial.done;
    const foreign = { aggregateId: 'other', ordinal: 1, operation: first };
    fixture.rows.get('video_workspace_history')!.set(JSON.stringify(['other', 1]), foreign);
    let next: VideoWorkspace = { ...previous, revision: 2 };
    if (kind === 'cursor') next = { ...next, cursor: 1 };
    else if (kind === 'rollover')
      next = {
        ...next,
        cursor: 1,
        history: [second],
        baseline: {
          ...previous.baseline!,
          annotations: first.target === 'annotation' && first.after ? [first.after] : [],
        },
      };
    else next = { ...next, cursor: 2, history: [first, operation('replacement', 3)] };
    const tx = fixture.database.transaction(stores, 'readwrite');
    const storage = await readWorkspaceStorage(tx, 'review');
    await writeWorkspaceStorage(tx, {
      previous,
      workspace: next,
      storage,
      usageReferenceKeys: [],
      mode: kind === 'cursor' ? 'cursor' : kind === 'branch' ? 'append' : 'replace',
      ...(kind === 'rollover'
        ? { retentionStart: 1 }
        : kind === 'replace'
          ? { retentionStart: 0 }
          : {}),
    });
    await tx.done;
    const reader = fixture.database.transaction(stores, 'readonly');
    expect(parseVideoWorkspace((await readWorkspaceStorage(reader, 'review')).logical)).toEqual(
      next
    );
    await reader.done;
    expect(fixture.rows.get('video_workspace_history')!.get(JSON.stringify(['other', 1]))).toEqual(
      foreign
    );
  }
);
