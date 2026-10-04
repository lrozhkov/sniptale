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
