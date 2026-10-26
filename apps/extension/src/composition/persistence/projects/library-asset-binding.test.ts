import { beforeEach, expect, it, vi } from 'vitest';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { AssetReadyJournal, AssetRef } from '../assets/contracts';
import { createMediaLibraryEntry } from './index.storage.test-support';
import { betaV1Fixture } from '../infrastructure/indexed-db/fixtures/beta-v1';
import { createQuickEditAudioClip } from '../../../features/video/review/advanced/audio';

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

import {
  assertLibraryAudioBindingSource,
  prepareLibraryAudioBinding,
  readLibraryAudioBindingSource,
} from './library-asset-binding';
import { recoverProjectMediaPublications } from './asset-publication';
import { withVoiceoverAttachmentLock } from './voiceover-publication-lock';
import {
  openVideoWorkspace,
  saveVideoWorkspaceAdvanced,
  readVideoWorkspace,
} from '../review-workspaces/store';
import { runWithDurableAssetLifecycleLock } from '../infrastructure/mutation-barrier';
import { readLibraryAudioSource } from './library-audio-source';

const aggregateId = 'recording:beta-v1-recording';
// Native Web Locks are shared across Vitest workers; independent fixture databases need distinct identities.
const audioAssetId = 'library-audio-binding:audio';
const privateAssetId = 'library-audio-binding:private';
const mainSource = { duration: 12, width: 640, height: 360, mimeType: 'video/webm', size: 15 };
const ref: AssetRef = {
  assetId: 'audio-bytes',
  createdAt: 1,
  mimeType: 'audio/webm',
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

function seed(kind: 'project-asset' | 'recording' | 'stored-asset') {
  const mediaId =
    kind === 'project-asset' ? `project-asset:${audioAssetId}` : `${kind}:${audioAssetId}`;
  const source =
    kind === 'project-asset'
      ? { kind, projectAssetId: audioAssetId }
      : kind === 'recording'
        ? { kind, recordingId: audioAssetId }
        : { kind, assetId: ref.assetId };
  const media = createMediaLibraryEntry({
    id: mediaId,
    source,
    kind: 'audio',
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
    ownerId: kind === 'stored-asset' ? mediaId : audioAssetId,
    role: kind === 'stored-asset' ? 'source' : 'body',
  };
  table('asset_owners').set(keyOf(owner), owner);
  const entry = {
    id: audioAssetId,
    assetId: ref.assetId,
    size: ref.size,
    mimeType: ref.mimeType,
    createdAt: 1,
  };
  if (kind === 'project-asset') table('project_assets').set(audioAssetId, entry);
  if (kind === 'recording')
    table('recordings').set(audioAssetId, { ...entry, filename: media.filename });
  harness.objects.set(ref.assetId, new File(['audio'], 'original', { type: ref.mimeType }));
  return { mediaId, media };
}

async function attach(assetId: string, clipId = 'music', preserve = false) {
  const opened = await openVideoWorkspace(aggregateId, mainSource);
  const clip = createQuickEditAudioClip({
    id: clipId,
    assetId,
    timelineStart: 0,
    duration: 2,
    endMax: 12,
  });
  return saveVideoWorkspaceAdvanced({
    aggregateId,
    expectedRevision: opened.workspace.revision,
    expectedSourceAssetId: opened.workspace.sourceAssetId,
    advanced: {
      ...opened.workspace.advanced,
      audio: {
        ...opened.workspace.advanced.audio,
        music: [...(preserve ? opened.workspace.advanced.audio.music : []), clip],
      },
    },
  });
}

it('read-only receipt re-admission preserves bytes and creates no journal, then refuses a deleted source', async () => {
  const { mediaId } = seed('stored-asset');
  const source = await readLibraryAudioBindingSource(mediaId);
  await withVoiceoverAttachmentLock('project-asset:pending', () =>
    assertLibraryAudioBindingSource(source, 'pending')
  );
  expect(harness.journals.size).toBe(0);
  expect(harness.objects.has(ref.assetId)).toBe(true);
  table('media_library').delete(mediaId);
  await expect(assertLibraryAudioBindingSource(source, 'pending')).rejects.toThrow('unavailable');
  expect(harness.journals.size).toBe(0);
});

it.each(['project-asset', 'recording', 'stored-asset'] as const)(
  'attaches %s without byte writes or a second Library identity and reopens it',
  async (kind) => {
    const { mediaId, media } = seed(kind);
    const snapshot = await readLibraryAudioBindingSource(mediaId);
    expect(snapshot.file.name).toBe(media.filename);
    const id = snapshot.entry?.id ?? privateAssetId;
    await withVoiceoverAttachmentLock(`project-asset:${id}`, async () => {
      const prepared = await prepareLibraryAudioBinding(
        snapshot,
        { aggregateId, clipId: 'music' },
        id
      );
      expect(await recoverProjectMediaPublications()).toBe(0);
      await attach(prepared.assetId);
      await prepared.publish();
      await prepared.publish();
    });
    expect(table('media_library').size).toBe(2);
    expect(table('media_library').get(mediaId)).toEqual(media);
    expect(table('asset_refs').size).toBe(1);
    expect(harness.objects.size).toBe(1);
    expect(harness.journals.size).toBe(0);
    expect(table('project_assets').get(id)).toMatchObject({ assetId: ref.assetId });
    if (kind !== 'project-asset')
      expect(table('project_assets').get(id)).toHaveProperty('originMediaId', mediaId);
    expect(
      (await readVideoWorkspace(aggregateId))?.workspace.advanced.audio.music[0]?.assetId
    ).toBe(`project-asset:${id}`);
  }
);

it.each(['project-asset', 'recording', 'stored-asset'] as const)(
  'cancels an unattached %s claim without deleting the existing object or identity',
  async (kind) => {
    const { mediaId, media } = seed(kind);
    const snapshot = await readLibraryAudioBindingSource(mediaId);
    const prepared = await prepareLibraryAudioBinding(
      snapshot,
      { aggregateId, clipId: 'music' },
      snapshot.entry?.id ?? privateAssetId
    );
    await prepared.cancel();
    expect(harness.journals.size).toBe(0);
    expect(harness.objects.has(ref.assetId)).toBe(true);
    expect(table('media_library').get(mediaId)).toEqual(media);
    expect(table('project_assets').has(privateAssetId)).toBe(false);
  }
);

it.each(['trash', 'purge', 'replace', 'missing-ref'] as const)(
  'refuses %s between selection and preparation without creating a ready claim',
  async (change) => {
    const { mediaId, media } = seed('stored-asset');
    const snapshot = await readLibraryAudioBindingSource(mediaId);
    if (change === 'trash')
      table('media_library').set(mediaId, {
        ...media,
        lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 2, trashedAt: 2 },
      });
    if (change === 'purge') table('media_library').delete(mediaId);
    if (change === 'replace') {
      table('media_library').set(mediaId, {
        ...media,
        source: { kind: 'stored-asset', assetId: 'replacement' },
      });
      table('asset_refs').set('replacement', {
        ...ref,
        assetId: 'replacement',
        location: { kind: 'opfs', objectKey: 'objects/replacement' },
      });
    }
    if (change === 'missing-ref') table('asset_refs').delete(ref.assetId);
    await expect(
      prepareLibraryAudioBinding(snapshot, { aggregateId, clipId: 'music' }, privateAssetId)
    ).rejects.toHaveProperty('code');
    expect(harness.journals.size).toBe(0);
  }
);

it('revalidates a direct acquisition even when its asset is already retained', async () => {
  const { mediaId, media } = seed('project-asset');
  await attach(`project-asset:${audioAssetId}`, 'old');
  const snapshot = await readLibraryAudioBindingSource(mediaId);
  const prepared = await prepareLibraryAudioBinding(
    snapshot,
    { aggregateId, clipId: 'new' },
    audioAssetId
  );
  table('media_library').set(mediaId, {
    ...media,
    lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 2, trashedAt: 2 },
  });
  const previous = await readVideoWorkspace(aggregateId);
  await expect(attach(prepared.assetId, 'new', true)).rejects.toMatchObject({
    code: 'missing-media',
  });
  expect(await readVideoWorkspace(aggregateId)).toEqual(previous);
  await attach(prepared.assetId, 'old');
  await prepared.cancel();
});

it('recovers an adopted private binding after publication failure and permits later Trash', async () => {
  const { mediaId, media } = seed('stored-asset');
  const snapshot = await readLibraryAudioBindingSource(mediaId);
  await withVoiceoverAttachmentLock(`project-asset:${privateAssetId}`, async () => {
    const prepared = await prepareLibraryAudioBinding(
      snapshot,
      { aggregateId, clipId: 'music' },
      privateAssetId
    );
    await attach(prepared.assetId);
    harness.failPublication = true;
    await expect(prepared.publish()).rejects.toThrow();
    expect(table('project_assets').has(privateAssetId)).toBe(false);
    expect(harness.journals.size).toBe(1);
  });
  harness.failPublication = false;
  table('media_library').set(mediaId, {
    ...media,
    lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 2, trashedAt: 2 },
  });
  expect(await recoverProjectMediaPublications()).toBe(1);
  expect(await recoverProjectMediaPublications()).toBe(0);
  expect(table('project_assets').get(privateAssetId)).toMatchObject({
    assetId: ref.assetId,
    originMediaId: mediaId,
  });
  expect(table('media_library').size).toBe(2);
  expect(harness.objects.size).toBe(1);
});

it('recovery cancels an unadopted direct claim even when another clip retains its asset', async () => {
  const { mediaId } = seed('project-asset');
  await attach(`project-asset:${audioAssetId}`, 'old');
  const snapshot = await readLibraryAudioBindingSource(mediaId);
  await prepareLibraryAudioBinding(
    snapshot,
    { aggregateId, clipId: 'never-attached' },
    audioAssetId
  );
  expect(await recoverProjectMediaPublications()).toBe(1);
  expect(harness.journals.size).toBe(0);
  expect(harness.objects.has(ref.assetId)).toBe(true);
});

it('serializes source admission and ready protection against a competing lifecycle mutation', async () => {
  const { mediaId, media } = seed('stored-asset');
  const snapshot = await readLibraryAudioBindingSource(mediaId);
  let mutation: Promise<void> | undefined;
  harness.onReadTransaction = () => {
    if (!mutation)
      mutation = runWithDurableAssetLifecycleLock(async () => {
        expect(harness.journals.size).toBe(1);
        table('media_library').set(mediaId, {
          ...media,
          lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 2, trashedAt: 2 },
        });
      });
  };
  const prepared = await prepareLibraryAudioBinding(
    snapshot,
    { aggregateId, clipId: 'music' },
    privateAssetId
  );
  await mutation;
  await expect(attach(prepared.assetId)).rejects.toMatchObject({ code: 'missing-media' });
  await prepared.cancel();
});

it('does not decode or repair malformed Library metadata on the read path', async () => {
  const { mediaId } = seed('stored-asset');
  table('media_library').set(mediaId, { broken: true });
  await expect(readLibraryAudioSource(mediaId)).rejects.toMatchObject({ code: 'unavailable' });
  expect(table('media_library').get(mediaId)).toEqual({ broken: true });
  expect(harness.journals.size).toBe(0);
});

it('keeps simultaneous direct claims scoped to their exact clips and refuses conflicting evidence', async () => {
  const { mediaId } = seed('project-asset');
  const snapshot = await readLibraryAudioBindingSource(mediaId);
  await prepareLibraryAudioBinding(snapshot, { aggregateId, clipId: 'unrelated' }, audioAssetId);
  const unrelated = [...harness.journals.values()][0]!;
  unrelated.assetRefs = [{ ...ref, assetId: 'stale-bytes' }];
  await prepareLibraryAudioBinding(snapshot, { aggregateId, clipId: 'selected' }, audioAssetId);
  await attach(`project-asset:${audioAssetId}`, 'selected');
  const before = await readVideoWorkspace(aggregateId);
  await expect(attach(`project-asset:${audioAssetId}`, 'unrelated', true)).rejects.toMatchObject({
    code: 'missing-media',
  });
  expect(await readVideoWorkspace(aggregateId)).toEqual(before);
  await prepareLibraryAudioBinding(snapshot, { aggregateId, clipId: 'conflict' }, audioAssetId);
  const current = [...harness.journals.values()].at(-1)!;
  harness.journals.set('conflicting', {
    ...structuredClone(current),
    journalId: 'conflicting',
    assetRefs: [{ ...ref, size: 6 }],
  });
  await expect(attach(`project-asset:${audioAssetId}`, 'conflict', true)).rejects.toMatchObject({
    code: 'missing-media',
  });
});

it('cannot borrow a private ready source for a different clip or review', async () => {
  const { mediaId } = seed('stored-asset');
  const snapshot = await readLibraryAudioBindingSource(mediaId);
  const prepared = await prepareLibraryAudioBinding(
    snapshot,
    { aggregateId, clipId: 'selected' },
    privateAssetId
  );
  await expect(attach(prepared.assetId, 'other')).rejects.toMatchObject({ code: 'missing-media' });
  await prepared.cancel();
  await prepareLibraryAudioBinding(
    snapshot,
    { aggregateId: 'different-review', clipId: 'selected' },
    privateAssetId
  );
  await expect(attach(`project-asset:${privateAssetId}`, 'selected')).rejects.toMatchObject({
    code: 'missing-media',
  });
});
