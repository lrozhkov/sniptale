import { beforeEach, expect, it, vi } from 'vitest';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { AssetReadyJournal, AssetRef } from '../assets/contracts';
import { createMediaLibraryEntry } from './index.storage.test-support';
import { betaV1Fixture } from '../infrastructure/indexed-db/fixtures/beta-v1';
import { createNeutralPresentationSettings } from '../../../features/video/review/advanced/presentation';
import { createProjectExportEntry } from './index.storage.test-support';

const harness = vi.hoisted(() => ({
  database: vi.fn(),
  journals: new Map<string, AssetReadyJournal>(),
  objects: new Map<string, File>(),
  failPublication: false,
  onReadTransaction: undefined as (() => void) | undefined,
}));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: harness.database,
}));
vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: async (operation: (db: unknown) => Promise<unknown>) =>
    operation(await harness.database()),
}));
// Only storage adapters are replaced. Admission, publication, recovery, retention and locks are real.
vi.mock('../assets/opfs-store', async (original) => ({
  ...(await original<typeof import('../assets/opfs-store')>()),
  listReadyJournals: async () => [...harness.journals.values()],
  writeReadyJournal: async (journal: AssetReadyJournal) => {
    harness.journals.set(journal.journalId, structuredClone(journal));
  },
  deleteReadyJournal: async (id: string) => {
    harness.journals.delete(id);
  },
  releaseAssetPublicationTransitions: async () => undefined,
  readAssetFile: async (ref: AssetRef, filename: string) => {
    const file = harness.objects.get(ref.assetId);
    if (!file || file.size !== ref.size) throw new Error('Missing fixture object');
    return new File([file], filename, { type: ref.mimeType });
  },
  deleteAssetObject: async (id: string) => {
    harness.objects.delete(id);
  },
}));

import { prepareLibrarySceneBinding, readLibrarySceneBindingSource } from './library-scene-binding';
import { recoverProjectMediaPublications } from './asset-publication';
import { withVoiceoverAttachmentLock } from './voiceover-publication-lock';
import {
  openVideoWorkspace,
  saveVideoWorkspaceAdvanced,
  readVideoWorkspace,
} from '../review-workspaces/store';
import { runWithDurableAssetLifecycleLock } from '../infrastructure/mutation-barrier';

const aggregateId = 'recording:beta-v1-recording';
const mainSource = { duration: 12, width: 640, height: 360, mimeType: 'video/webm', size: 15 };
const ref: AssetRef = {
  assetId: 'audio-bytes',
  createdAt: 1,
  mimeType: 'video/webm',
  size: 5,
  sha256: null,
  location: { kind: 'opfs', objectKey: 'objects/audio-bytes' },
};
let rows: Map<string, Map<string, unknown>>;

function keyOf(value: unknown): string {
  if (!isRecord(value)) throw new Error('Invalid fixture row');
  if (typeof value['ownerKind'] === 'string')
    return JSON.stringify([value['ownerKind'], value['ownerId'], value['role']]);
  if (typeof value['aggregateId'] === 'string' && typeof value['ordinal'] === 'number')
    return JSON.stringify([value['aggregateId'], value['ordinal']]);
  const key = value['id'] ?? value['aggregateId'] ?? value['operationId'] ?? value['assetId'];
  if (typeof key !== 'string') throw new Error('Missing fixture key');
  return key;
}

function table(name: string, data = rows): Map<string, unknown> {
  let entries = data.get(name);
  if (!entries) {
    entries = new Map();
    data.set(name, entries);
  }
  return entries;
}

beforeEach(() => {
  rows = new Map();
  harness.journals.clear();
  harness.objects.clear();
  harness.failPublication = false;
  harness.onReadTransaction = undefined;
  table('media_library').set(aggregateId, betaV1Fixture.records.media_library[0]);
  table('recordings').set('beta-v1-recording', betaV1Fixture.records.recordings[0]);
  const database = {
    get: async (name: string, key: string) => structuredClone(table(name).get(key)),
    getAll: async (name: string) => structuredClone([...table(name).values()]),
    put: async (name: string, value: unknown) => {
      table(name).set(keyOf(value), structuredClone(value));
    },
    delete: async (name: string, key: string) => {
      table(name).delete(key);
    },
    transaction: (_names: string[], mode: string) => {
      if (mode === 'readonly') harness.onReadTransaction?.();
      const pending = structuredClone(rows);
      let aborted = false;
      return {
        abort() {
          aborted = true;
        },
        objectStore(name: string) {
          const entries = table(name, pending);
          return {
            get: async (key: string | (string | number)[]) =>
              structuredClone(entries.get(typeof key === 'string' ? key : JSON.stringify(key))),
            getAll: async () => structuredClone([...entries.values()]),
            put: async (value: unknown) => {
              if (harness.failPublication && name === 'project_assets')
                throw new DOMException('Fixture quota', 'QuotaExceededError');
              entries.set(keyOf(value), structuredClone(value));
            },
            delete: async (key: string | (string | number)[]) => {
              entries.delete(typeof key === 'string' ? key : JSON.stringify(key));
            },
            index: (indexName: string) => ({
              count: async (key: string) =>
                [...entries.values()].filter((value) => isRecord(value) && value[indexName] === key)
                  .length,
              getAll: async (key: string) =>
                structuredClone(
                  [...entries.values()].filter(
                    (value) => isRecord(value) && value[indexName] === key
                  )
                ),
              getAllKeys: async (key: string) =>
                [...entries]
                  .filter(([, value]) => isRecord(value) && value[indexName] === key)
                  .map(([storedKey, value]) =>
                    isRecord(value) &&
                    typeof value['aggregateId'] === 'string' &&
                    typeof value['ordinal'] === 'number'
                      ? [value['aggregateId'], value['ordinal']]
                      : storedKey
                  ),
            }),
          };
        },
        get done() {
          if (aborted) return Promise.reject(new DOMException('Fixture aborted', 'AbortError'));
          if (mode === 'readwrite') rows = pending;
          return Promise.resolve();
        },
      };
    },
  };
  harness.database.mockResolvedValue(database);
});

function seed(kind: 'project-asset' | 'recording' | 'stored-asset' | 'project-export') {
  const mediaId = kind === 'project-asset' ? 'project-asset:audio' : `${kind}:audio`;
  const source =
    kind === 'project-asset'
      ? { kind, projectAssetId: 'audio' }
      : kind === 'recording'
        ? { kind, recordingId: 'audio' }
        : kind === 'project-export'
          ? { kind, exportId: 'audio', projectId: 'project' }
          : { kind, assetId: ref.assetId };
  const media = createMediaLibraryEntry({
    id: mediaId,
    source,
    kind: 'video',
    mimeType: ref.mimeType,
    size: ref.size,
    filename: 'My music.webm',
    originalFilename: 'My music.webm',
  });
  table('media_library').set(mediaId, media);
  table('asset_refs').set(ref.assetId, ref);
  const owner = {
    assetId: ref.assetId,
    ownerKind: kind === 'stored-asset' ? 'media-library' : kind,
    ownerId: kind === 'stored-asset' ? mediaId : 'audio',
    role: kind === 'stored-asset' ? 'source' : 'body',
  };
  table('asset_owners').set(keyOf(owner), owner);
  const entry = {
    id: 'audio',
    assetId: ref.assetId,
    size: ref.size,
    mimeType: ref.mimeType,
    createdAt: 1,
  };
  if (kind === 'project-asset') table('project_assets').set('audio', entry);
  if (kind === 'recording')
    table('recordings').set('audio', { ...entry, filename: media.filename });
  if (kind === 'project-export')
    table('project_exports').set(
      'audio',
      createProjectExportEntry({
        id: 'audio',
        projectId: 'project',
        assetId: ref.assetId,
        mimeType: ref.mimeType,
        size: ref.size,
      })
    );
  harness.objects.set(ref.assetId, new File(['audio'], 'original', { type: ref.mimeType }));
  return { mediaId, media };
}

async function attach(assetId: string, slot: 'intro' | 'outro' = 'intro') {
  const opened = await openVideoWorkspace(aggregateId, mainSource);
  const presentation = structuredClone(
    opened.workspace.advanced.presentation ?? createNeutralPresentationSettings()
  );
  presentation[slot] = {
    mode: 'none',
    video: {
      assetId,
      source: { duration: 2, width: 20, height: 10, size: ref.size, mimeType: ref.mimeType },
      trim: { start: 0, end: 2 },
      audio: { muted: false, gain: 1 },
      fit: 'contain',
      fillColor: '#000000ff',
      crop: { panX: 0, panY: 0 },
    },
  };
  return saveVideoWorkspaceAdvanced({
    aggregateId,
    expectedRevision: opened.workspace.revision,
    expectedSourceAssetId: opened.workspace.sourceAssetId,
    advanced: { ...opened.workspace.advanced, presentation },
  });
}
const claim = { aggregateId, slot: 'intro' as const, kind: 'video' as const };

it.each(['project-asset', 'recording', 'stored-asset', 'project-export'] as const)(
  'binds %s bytes under an exact remembered scene slot without duplicate objects or Library cards',
  async (kind) => {
    const { mediaId, media } = seed(kind);
    const source = await readLibrarySceneBindingSource(mediaId, 'video');
    const id = source.entry?.id ?? 'private';
    await withVoiceoverAttachmentLock(`project-asset:${id}`, async () => {
      const prepared = await prepareLibrarySceneBinding(source, claim, id);
      expect(await recoverProjectMediaPublications()).toBe(0);
      await attach(prepared.assetId);
      await prepared.publish();
      await prepared.publish();
    });
    expect(table('media_library').size).toBe(2);
    expect(table('media_library').get(mediaId)).toEqual(media);
    expect(harness.objects.size).toBe(1);
    expect(harness.journals.size).toBe(0);
    expect(table('project_assets').get(id)).toMatchObject({ assetId: ref.assetId });
    expect(
      (await readVideoWorkspace(aggregateId))?.workspace.advanced.presentation?.intro.video?.assetId
    ).toBe(`project-asset:${id}`);
  }
);

it.each(['project-asset', 'recording', 'stored-asset', 'project-export'] as const)(
  'cancels an unattached %s claim without releasing another owner',
  async (kind) => {
    const { mediaId, media } = seed(kind);
    const source = await readLibrarySceneBindingSource(mediaId, 'video');
    const prepared = await prepareLibrarySceneBinding(source, claim, source.entry?.id ?? 'private');
    await prepared.cancel();
    expect(harness.journals.size).toBe(0);
    expect(harness.objects.has(ref.assetId)).toBe(true);
    expect(table('media_library').get(mediaId)).toEqual(media);
    expect(table('project_assets').has('private')).toBe(false);
  }
);

it.each(['trash', 'purge', 'replace', 'missing-ref'] as const)(
  'refuses %s after selection without a ready claim',
  async (change) => {
    const { mediaId, media } = seed('stored-asset');
    const source = await readLibrarySceneBindingSource(mediaId, 'video');
    if (change === 'trash')
      table('media_library').set(mediaId, {
        ...media,
        lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 2, trashedAt: 2 },
      });
    if (change === 'purge') table('media_library').delete(mediaId);
    if (change === 'replace')
      table('asset_refs').set(ref.assetId, { ...ref, sha256: 'a'.repeat(64) });
    if (change === 'missing-ref') table('asset_refs').delete(ref.assetId);
    await expect(prepareLibrarySceneBinding(source, claim, 'private')).rejects.toMatchObject({
      name: 'LibrarySceneBindingError',
    });
    expect(harness.journals.size).toBe(0);
    expect(table('project_assets').has('private')).toBe(false);
  }
);

it('recovers an attached private binding after failed publication without losing the selected slot', async () => {
  const { mediaId } = seed('stored-asset');
  const source = await readLibrarySceneBindingSource(mediaId, 'video');
  await withVoiceoverAttachmentLock('project-asset:private', async () => {
    const prepared = await prepareLibrarySceneBinding(source, claim, 'private');
    await attach(prepared.assetId);
    harness.failPublication = true;
    await expect(prepared.publish()).rejects.toThrow();
    expect(harness.journals.size).toBe(1);
  });
  harness.failPublication = false;
  expect(await recoverProjectMediaPublications()).toBe(1);
  expect(await recoverProjectMediaPublications()).toBe(0);
  expect(table('project_assets').get('private')).toMatchObject({
    assetId: ref.assetId,
    originMediaId: mediaId,
  });
  expect(harness.objects.size).toBe(1);
  expect(table('media_library').size).toBe(2);
});

it('does not adopt an uncommitted outro claim just because intro retains the same source', async () => {
  const { mediaId } = seed('project-asset');
  await attach('project-asset:audio');
  const source = await readLibrarySceneBindingSource(mediaId, 'video');
  await prepareLibrarySceneBinding(source, { ...claim, slot: 'outro' }, 'audio');
  expect(await recoverProjectMediaPublications()).toBe(1);
  expect(harness.journals.size).toBe(0);
  expect(harness.objects.has(ref.assetId)).toBe(true);
  expect(
    (await readVideoWorkspace(aggregateId))?.workspace.advanced.presentation?.outro.video
  ).toBeUndefined();
});

it('serializes ready protection then refuses a lifecycle change before attachment', async () => {
  const { mediaId, media } = seed('stored-asset');
  const source = await readLibrarySceneBindingSource(mediaId, 'video');
  let mutation: Promise<void> | undefined;
  harness.onReadTransaction = () => {
    mutation ??= runWithDurableAssetLifecycleLock(async () => {
      expect(harness.journals.size).toBe(1);
      table('media_library').set(mediaId, {
        ...media,
        lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 2, trashedAt: 2 },
      });
    });
  };
  const prepared = await prepareLibrarySceneBinding(source, claim, 'private');
  await mutation;
  await expect(attach(prepared.assetId)).rejects.toMatchObject({ code: 'missing-media' });
  await prepared.cancel();
  expect(harness.objects.has(ref.assetId)).toBe(true);
});

it('rechecks a newly selected outro even when intro already retains the object', async () => {
  const { mediaId, media } = seed('project-asset');
  await attach('project-asset:audio');
  const source = await readLibrarySceneBindingSource(mediaId, 'video');
  const prepared = await prepareLibrarySceneBinding(source, { ...claim, slot: 'outro' }, 'audio');
  table('media_library').set(mediaId, {
    ...media,
    lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 2, trashedAt: 2 },
  });
  const before = await readVideoWorkspace(aggregateId);
  await expect(attach(prepared.assetId, 'outro')).rejects.toMatchObject({ code: 'missing-media' });
  expect(await readVideoWorkspace(aggregateId)).toEqual(before);
  await prepared.cancel();
  expect(harness.objects.has(ref.assetId)).toBe(true);
});

it.each(['read', 'prepare'] as const)(
  'rejects unavailable object bytes during %s without creating a publication journal',
  async (operation) => {
    const { mediaId, media } = seed('stored-asset');
    const source = await readLibrarySceneBindingSource(mediaId, 'video');
    harness.objects.delete(ref.assetId);
    const result =
      operation === 'read'
        ? readLibrarySceneBindingSource(mediaId, 'video')
        : prepareLibrarySceneBinding(source, claim, 'private');
    await expect(result).rejects.toMatchObject({ code: 'unavailable' });
    expect(harness.journals.size).toBe(0);
    expect(table('media_library').get(mediaId)).toEqual(media);
    expect(table('project_assets').size).toBe(0);
  }
);
it.each(['project_assets', 'media_library'] as const)(
  'preserves an occupied target in %s and refuses a new claim',
  async (store) => {
    const { mediaId } = seed('stored-asset');
    const source = await readLibrarySceneBindingSource(mediaId, 'video');
    const key = store === 'project_assets' ? 'private' : 'project-asset:private';
    const occupied =
      store === 'project_assets'
        ? {
            id: 'private',
            assetId: ref.assetId,
            size: ref.size,
            mimeType: ref.mimeType,
            createdAt: 1,
          }
        : createMediaLibraryEntry({
            id: key,
            source: { kind: 'project-asset', projectAssetId: 'private' },
            kind: 'video',
            mimeType: ref.mimeType,
            size: ref.size,
            filename: 'existing.webm',
            originalFilename: 'existing.webm',
          });
    table(store).set(key, occupied);
    await expect(prepareLibrarySceneBinding(source, claim, 'private')).rejects.toMatchObject({
      code: 'changed-source',
    });
    expect(table(store).get(key)).toEqual(occupied);
    expect(harness.journals.size).toBe(0);
    expect(harness.objects.has(ref.assetId)).toBe(true);
  }
);
it.each(['aggregateId', 'assetId'] as const)(
  'rejects an empty %s before creating any claim',
  async (field) => {
    const { mediaId } = seed('stored-asset');
    const source = await readLibrarySceneBindingSource(mediaId, 'video');
    await expect(
      prepareLibrarySceneBinding(
        source,
        { ...claim, aggregateId: field === 'aggregateId' ? '' : aggregateId },
        field === 'assetId' ? '' : 'private'
      )
    ).rejects.toMatchObject({ code: 'unavailable' });
    expect(harness.journals.size).toBe(0);
    expect(table('project_assets').size).toBe(0);
    expect(harness.objects.has(ref.assetId)).toBe(true);
  }
);
