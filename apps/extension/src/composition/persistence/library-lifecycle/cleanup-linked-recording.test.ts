import { expect, it, vi } from 'vitest';
import { createMediaLibraryEntry, createVideoProjectEntry } from '../projects/index.test-support';
import { createLibraryLifecycle } from './contracts';

const mocks = vi.hoisted(() => ({
  listMediaLibrary: vi.fn(),
  listScenarioProjectEntries: vi.fn(),
  listVideoProjectEntries: vi.fn(),
  runWithIndexedDbMutation: vi.fn(),
}));

vi.mock('../projects/asset-publication', async (importOriginal) => ({
  ...(await importOriginal()),
  recoverProjectMediaPublications: vi.fn().mockResolvedValue(0),
}));
vi.mock('../recordings/asset-publication', async (importOriginal) => ({
  ...(await importOriginal()),
  recoverRecordingAssetPublications: vi.fn().mockResolvedValue(0),
}));
vi.mock('../image-aggregates/mutations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../image-aggregates/mutations')>()),
  recoverImageWorkspacePublications: vi.fn().mockResolvedValue(0),
}));
vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: mocks.runWithIndexedDbMutation,
}));
vi.mock('../media-library', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../media-library')>()),
  listMediaLibrary: mocks.listMediaLibrary,
}));
vi.mock('../projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../projects')>()),
  listVideoProjectEntries: mocks.listVideoProjectEntries,
}));
vi.mock('../scenario/projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../scenario/projects')>()),
  listScenarioProjectEntries: mocks.listScenarioProjectEntries,
}));

import { cleanupDrafts, DEFAULT_LOCAL_STORAGE_POLICY } from '.';

it('expires a draft project after saving its linked recording and media', async () => {
  const day = 24 * 60 * 60 * 1000;
  const now = 10 * day;
  const lifecycle = createLibraryLifecycle('temporary', 1);
  const project = createVideoProjectEntry({ baseRecordingId: 'recording-1' }, { lifecycle });
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
  const values = new Map<string, Map<string, unknown>>([
    ['video_projects', new Map([[project.id, project]])],
    ['recordings', new Map([[recording.id, recording]])],
    ['media_library', new Map([[media.id, media]])],
  ]);
  mocks.listMediaLibrary.mockImplementation(async () => [...values.get('media_library')!.values()]);
  mocks.listVideoProjectEntries.mockImplementation(async () => [
    ...values.get('video_projects')!.values(),
  ]);
  mocks.listScenarioProjectEntries.mockResolvedValue([]);
  mocks.runWithIndexedDbMutation.mockImplementation(async (effect) =>
    effect({
      transaction: vi.fn(() => ({
        done: Promise.resolve(),
        objectStore: vi.fn((name: string) => ({
          delete: vi.fn(async (id: string) => values.get(name)?.delete(id)),
          get: vi.fn(async (id: string) => values.get(name)?.get(id)),
          getAll: vi.fn(async () => [...(values.get(name)?.values() ?? [])]),
          put: vi.fn(async (entry: { id: string }) => values.get(name)?.set(entry.id, entry)),
        })),
      })),
    })
  );

  await expect(cleanupDrafts({ now, policy: DEFAULT_LOCAL_STORAGE_POLICY })).resolves.toEqual({
    deletedCount: 1,
    deletedIds: [`video-project:${project.id}`],
  });
  expect(values.get('video_projects')?.has(project.id)).toBe(false);
  expect(values.get('recordings')?.get(recording.id)).toMatchObject({
    lifecycle: { storageClass: 'library', savedAt: now },
  });
  expect(values.get('media_library')?.get(media.id)).toMatchObject({
    lifecycle: { storageClass: 'library', savedAt: now },
  });
});
