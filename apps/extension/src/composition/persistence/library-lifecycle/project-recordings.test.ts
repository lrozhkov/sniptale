import { createReviewWorkspaceStoreFixture } from '../review-workspaces/store.test-support';
import { expect, it, vi } from 'vitest';
import { createVideoProjectEntry, createMediaLibraryEntry } from '../projects/index.test-support';
import { createLibraryLifecycle } from './contracts';

const runWithIndexedDbMutationMock = vi.hoisted(() => vi.fn());
vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: runWithIndexedDbMutationMock,
}));

import { repairLinkedRecordingLifecycles } from './project-recordings';

it('repairs existing linked recording drafts and keeps unrelated drafts temporary', async () => {
  const lifecycle = createLibraryLifecycle('temporary', 1);
  const recording = {
    assetId: 'recording-object-1',
    createdAt: 1,
    filename: 'recording.webm',
    id: 'recording-1',
    lifecycle,
    mimeType: 'video/webm',
    size: 20,
  };
  const media = createMediaLibraryEntry({
    id: 'recording:recording-1',
    kind: 'recording',
    lifecycle,
    source: { kind: 'recording', recordingId: recording.id },
  });
  const unrelated = createMediaLibraryEntry({
    id: 'recording:unrelated',
    kind: 'recording',
    lifecycle,
    source: { kind: 'recording', recordingId: 'unrelated' },
  });
  const values = new Map<string, Map<string, unknown>>([
    [
      'video_projects',
      new Map([['project-1', createVideoProjectEntry({ baseRecordingId: recording.id })]]),
    ],
    ['recordings', new Map([[recording.id, recording]])],
    [
      'media_library',
      new Map([
        [media.id, media],
        [unrelated.id, unrelated],
      ]),
    ],
  ]);
  runWithIndexedDbMutationMock.mockImplementationOnce(async (effect) =>
    effect({
      transaction: vi.fn(() => ({
        done: Promise.resolve(),
        objectStore: vi.fn((name: string) => ({
          get: vi.fn(async (id: string) => values.get(name)?.get(id)),
          getAll: vi.fn(async () => [...(values.get(name)?.values() ?? [])]),
          put: vi.fn(async (entry: { id: string }) => values.get(name)?.set(entry.id, entry)),
        })),
      })),
    })
  );

  await repairLinkedRecordingLifecycles(100);

  expect(values.get('recordings')?.get(recording.id)).toMatchObject({
    lifecycle: { storageClass: 'library', savedAt: 100 },
  });
  expect(values.get('media_library')?.get(media.id)).toMatchObject({
    lifecycle: { storageClass: 'library', savedAt: 100 },
  });
  expect(values.get('media_library')?.get(unrelated.id)).toEqual(unrelated);
});

it('rolls back late page and promotion failures before a complete retry', async () => {
  vi.stubGlobal('IDBKeyRange', {
    lowerBound: (lower: IDBValidKey, lowerOpen: boolean) => ({ lower, lowerOpen }),
  });
  try {
    let failPromotion = false;
    let failRead = true;
    const f = createReviewWorkspaceStoreFixture(
      (name) => failPromotion && name === 'media_library'
    );
    for (const rows of f.rows.values()) rows.clear();
    for (let index = 0; index < 513; index++) {
      const id = `project-${String(index).padStart(4, '0')}`;
      f.rows
        .get('video_projects')!
        .set(id, createVideoProjectEntry({ id, baseRecordingId: 'recording-1' }));
    }
    f.rows.get('video_projects')!.set('invalid-project', { id: 'invalid-project' });
    const lifecycle = createLibraryLifecycle('temporary', 1);
    f.rows.get('recordings')!.set('recording-1', {
      id: 'recording-1',
      assetId: 'object-1',
      filename: 'source.webm',
      mimeType: 'video/webm',
      size: 20,
      createdAt: 1,
      lifecycle,
    });
    f.rows.get('media_library')!.set(
      'recording:recording-1',
      createMediaLibraryEntry({
        id: 'recording:recording-1',
        kind: 'recording',
        lifecycle,
        source: { kind: 'recording', recordingId: 'recording-1' },
      })
    );
    const before = structuredClone(f.rows);
    const aborts: ReturnType<typeof vi.spyOn>[] = [];
    const transaction = f.database.transaction.bind(f.database);
    vi.spyOn(f.database, 'transaction').mockImplementation((stores, mode) => {
      const tx = transaction(stores, mode);
      aborts.push(vi.spyOn(tx, 'abort'));
      const objectStore = tx.objectStore.bind(tx);
      vi.spyOn(tx, 'objectStore').mockImplementation((name) => {
        const store = objectStore(name);
        if (name === 'video_projects') {
          const read = store.getAll;
          let pages = 0;
          store.getAll = async (query, count) => {
            if (++pages === 2 && failRead) throw new Error('late page failed');
            return read(query, count);
          };
        }
        return store;
      });
      return tx;
    });
    runWithIndexedDbMutationMock.mockImplementation(async (effect) => effect(f.database));
    await expect(repairLinkedRecordingLifecycles(100)).rejects.toThrow('late page failed');
    expect(aborts[0]).toHaveBeenCalledOnce();
    expect(f.rows).toEqual(before);
    failRead = false;
    failPromotion = true;
    await expect(repairLinkedRecordingLifecycles(100)).rejects.toThrow('No space');
    expect(aborts[1]).toHaveBeenCalledOnce();
    expect(f.rows).toEqual(before);
    failPromotion = false;
    await repairLinkedRecordingLifecycles(100);
    expect(f.rows.get('video_projects')!.get('invalid-project')).toEqual({ id: 'invalid-project' });
    expect(f.rows.get('recordings')!.get('recording-1')).toMatchObject({
      lifecycle: { storageClass: 'library', savedAt: 100 },
    });
    expect(f.rows.get('media_library')!.get('recording:recording-1')).toMatchObject({
      lifecycle: { storageClass: 'library', savedAt: 100 },
    });
  } finally {
    vi.unstubAllGlobals();
  }
});
