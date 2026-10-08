import { beforeEach, expect, it, vi } from 'vitest';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { AssetReadyJournal, AssetRef } from '../../composition/persistence/assets/contracts';
import { createMediaLibraryEntry } from '../../composition/persistence/projects/index.storage.test-support';
import { betaV1Fixture } from '../../composition/persistence/infrastructure/indexed-db/fixtures/beta-v1';
import { createNeutralPresentationSettings } from '../../features/video/review/advanced/presentation';
import { readLibrarySceneBindingSource } from '../../composition/persistence/projects/library-scene-binding';

const harness = vi.hoisted(() => ({
  database: vi.fn(),
  journals: new Map<string, AssetReadyJournal>(),
  objects: new Map<string, File>(),
  failPublication: false,
  failReads: false,
  afterWrite: undefined as (() => void) | undefined,
}));
vi.mock('../../composition/persistence/infrastructure/indexed-db/core', async (original) => ({
  ...(await original<
    typeof import('../../composition/persistence/infrastructure/indexed-db/core')
  >()),
  initDB: harness.database,
}));
vi.mock('../../composition/persistence/infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: async (operation: (db: unknown) => Promise<unknown>) =>
    operation(await harness.database()),
}));
// Only storage adapters are replaced. Admission, publication, recovery, retention and locks are real.
vi.mock('../../composition/persistence/assets/quota', () => ({
  assertAssetWriteAdmission: async () => undefined,
}));
vi.mock('../../composition/persistence/assets/opfs-store', async (original) => ({
  ...(await original<typeof import('../../composition/persistence/assets/opfs-store')>()),
  writeBlobToAsset: async (blob: Blob) => {
    harness.objects.set(ref.assetId, new File([blob], 'scene', { type: blob.type }));
    harness.afterWrite?.();
    return { ref: { ...ref, size: blob.size, mimeType: blob.type } };
  },
  releaseAssetReadyProtection: async () => undefined,
  discardPreparedAsset: async (id: string) => {
    harness.objects.delete(id);
  },
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

import { createReviewPresentationAttachment } from './presentation-attachment';
import { recoverProjectMediaPublications } from '../../composition/persistence/projects/asset-publication';
import {
  openVideoWorkspace,
  saveVideoWorkspaceAdvanced,
  readVideoWorkspace,
} from '../../composition/persistence/review-workspaces/store';

const aggregateId = 'recording:beta-v1-recording';
const mainSource = { duration: 12, width: 640, height: 360, mimeType: 'video/webm', size: 15 };
const ref: AssetRef = {
  assetId: 'logo-bytes',
  createdAt: 1,
  mimeType: 'image/png',
  size: 5,
  sha256: null,
  location: { kind: 'opfs', objectKey: 'objects/logo-bytes' },
};
let rows: Map<string, Map<string, unknown>>;

function keyOf(value: unknown): string {
  if (!isRecord(value)) throw new Error('Invalid fixture row');
  if (typeof value['ownerKind'] === 'string')
    return JSON.stringify([value['ownerKind'], value['ownerId'], value['role']]);
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
  harness.failReads = false;
  harness.afterWrite = undefined;
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
      if (mode === 'readonly' && harness.failReads) throw new Error('Unavailable review read');
      const pending = structuredClone(rows);
      let aborted = false;
      return {
        abort() {
          aborted = true;
        },
        objectStore(name: string) {
          const entries = table(name, pending);
          return {
            get: async (key: string | string[]) =>
              structuredClone(entries.get(typeof key === 'string' ? key : JSON.stringify(key))),
            getAll: async () => structuredClone([...entries.values()]),
            put: async (value: unknown) => {
              if (harness.failPublication && name === 'project_assets')
                throw new DOMException('Fixture quota', 'QuotaExceededError');
              entries.set(keyOf(value), structuredClone(value));
            },
            delete: async (key: string | string[]) => {
              entries.delete(typeof key === 'string' ? key : JSON.stringify(key));
            },
            index: () => ({
              count: async (assetId: string) =>
                [...entries.values()].filter(
                  (value) => isRecord(value) && value['assetId'] === assetId
                ).length,
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

function selection(
  origin = false,
  slot: 'intro' | 'outro' = 'intro',
  kind: 'image' | 'video' = 'image'
) {
  if (origin) table('media_library').set('origin', createMediaLibraryEntry({ id: 'origin' }));
  const controller = new AbortController();
  const file = new File(['image'], kind === 'image' ? 'scene.png' : 'scene.webm', {
    type: kind === 'image' ? 'image/png' : 'video/webm',
  });
  const attach = vi.fn(async (assetId: string) => {
    expect(harness.journals.size).toBe(1);
    expect(await recoverProjectMediaPublications()).toBe(0);
    const opened = await openVideoWorkspace(aggregateId, mainSource);
    const presentation = structuredClone(
      opened.workspace.advanced.presentation ?? createNeutralPresentationSettings()
    );
    const framing = { fit: 'contain' as const, fillColor: '#000000ff', crop: { panX: 0, panY: 0 } };
    presentation[slot] =
      kind === 'image'
        ? { mode: 'none', image: { ...framing, assetId, width: 80, height: 40, duration: 3 } }
        : {
            mode: 'none',
            video: {
              ...framing,
              assetId,
              source: { duration: 2, width: 80, height: 40, size: file.size, mimeType: file.type },
              trim: { start: 0, end: 2 },
              audio: { muted: false, gain: 1 },
            },
          };
    await saveVideoWorkspaceAdvanced({
      aggregateId,
      expectedRevision: opened.workspace.revision,
      expectedSourceAssetId: opened.workspace.sourceAssetId,
      advanced: { ...opened.workspace.advanced, presentation },
    });
  });
  const acquisition = origin
    ? { kind: 'private-frozen-image' as const, file, originMediaId: 'origin' }
    : { kind: 'private-upload' as const, file };
  const args = {
    acquisition,
    aggregateId,
    slot,
    kind,
    signal: controller.signal,
    assertCurrentTarget: vi.fn(),
    attach,
  };
  return { args, controller, operation: createReviewPresentationAttachment(args) };
}

it.each([
  { slot: 'intro' as const, kind: 'image' as const, origin: false },
  { slot: 'outro' as const, kind: 'video' as const, origin: false },
  { slot: 'outro' as const, kind: 'image' as const, origin: true },
])(
  'protects and attaches one $kind to $slot with origin=$origin',
  async ({ slot, kind, origin }) => {
    const { args, operation } = selection(origin, slot, kind);
    const cards = table('media_library').size;
    const first = operation.run();
    expect(operation.run()).toBe(first);
    const result = await first;
    expect(await operation.run()).toEqual(result);
    expect(args.attach).toHaveBeenCalledOnce();
    expect(table('media_library').size).toBe(cards);
    expect(table('project_assets').size).toBe(1);
    expect(harness.objects.size).toBe(1);
    expect(harness.journals.size).toBe(0);
  }
);

it('retries publication without reattaching even after the original signal becomes aborted', async () => {
  const { args, controller, operation } = selection();
  harness.failPublication = true;
  await expect(operation.run()).rejects.toThrow();
  expect(operation.hasRetainedAsset()).toBe(true);
  controller.abort();
  harness.failPublication = false;
  await operation.run();
  expect(args.attach).toHaveBeenCalledOnce();
  expect(harness.journals.size).toBe(0);
  expect(harness.objects.size).toBe(1);
});

it.each([false, true])(
  'reconciles committed-then-thrown attachment with unavailable reads=%s',
  async (unknown) => {
    const { args } = selection();
    let attempts = 0;
    const operation = createReviewPresentationAttachment({
      ...args,
      attach: async (assetId) => {
        attempts++;
        await args.attach(assetId);
        harness.failReads = unknown;
        throw new Error('Commit response lost');
      },
    });
    await expect(operation.run()).rejects.toThrow('Commit response lost');
    expect(harness.journals.size).toBe(1);
    expect(harness.objects.size).toBe(1);
    harness.failReads = false;
    await operation.run();
    expect(attempts).toBe(1);
    expect(harness.journals.size).toBe(0);
  }
);

it.each(['cancel', 'target', 'reject'] as const)(
  'cleans only unadopted upload for %s',
  async (reason) => {
    const { args, controller, operation } = selection();
    if (reason === 'cancel') harness.afterWrite = () => controller.abort();
    if (reason === 'target')
      harness.afterWrite = () =>
        args.assertCurrentTarget.mockImplementation(() => {
          throw new Error('Changed target');
        });
    if (reason === 'reject') args.attach.mockRejectedValueOnce(new Error('No placement'));
    await expect(operation.run()).rejects.toThrow();
    expect(harness.objects.size).toBe(0);
    expect(harness.journals.size).toBe(0);
    expect(operation.hasRetainedAsset()).toBe(false);
  }
);

it('keeps a ready claim while uncommitted attachment retention cannot be read, then retries once', async () => {
  const { args } = selection();
  let attempts = 0;
  const operation = createReviewPresentationAttachment({
    ...args,
    attach: async (assetId) => {
      attempts++;
      if (attempts === 1) {
        harness.failReads = true;
        throw new Error('Commit unavailable');
      }
      await args.attach(assetId);
    },
  });
  await expect(operation.run()).rejects.toThrow('Commit unavailable');
  expect(harness.journals.size).toBe(1);
  await expect(operation.run()).rejects.toThrow('Unavailable review read');
  expect(attempts).toBe(1);
  harness.failReads = false;
  await operation.run();
  expect(attempts).toBe(2);
  expect(harness.objects.size).toBe(1);
  expect(harness.journals.size).toBe(0);
});

it('retains a committed scene claim through history after current settings no longer reference it', async () => {
  const { args, operation } = selection(false, 'outro');
  harness.failPublication = true;
  await expect(operation.run()).rejects.toThrow();
  const saved = (await readVideoWorkspace(aggregateId))!;
  const { commitVideoWorkspace } =
    await import('../../composition/persistence/review-workspaces/store');
  const { reviewAdvancedContentBaseline } = await import('../../features/video/review/document');
  const before = reviewAdvancedContentBaseline(saved.workspace.advanced);
  await commitVideoWorkspace({
    aggregateId,
    expectedRevision: saved.workspace.revision,
    expectedSourceAssetId: saved.workspace.sourceAssetId,
    operation: {
      id: 'clear-outro',
      at: 2,
      target: 'advancedContent',
      before,
      after: { ...before, presentation: { ...before.presentation!, outro: { mode: 'none' } } },
    },
  });
  harness.failPublication = false;
  expect(await recoverProjectMediaPublications()).toBe(1);
  expect(harness.objects.size).toBe(1);
  expect(args.attach).toHaveBeenCalledOnce();
});

async function librarySelection() {
  const selected = selection();
  const mediaId = 'stored-asset:scene';
  table('media_library').set(
    mediaId,
    createMediaLibraryEntry({
      id: mediaId,
      kind: 'image',
      mimeType: ref.mimeType,
      size: ref.size,
      source: { kind: 'stored-asset', assetId: ref.assetId },
    })
  );
  table('asset_refs').set(ref.assetId, ref);
  const owner = {
    assetId: ref.assetId,
    ownerKind: 'media-library',
    ownerId: mediaId,
    role: 'source',
  };
  table('asset_owners').set(keyOf(owner), owner);
  harness.objects.set(ref.assetId, new File(['image'], 'scene.png', { type: ref.mimeType }));
  const source = await readLibrarySceneBindingSource(mediaId, 'image');
  const args = { ...selected.args, acquisition: { kind: 'library-binding' as const, source } };
  return { args, mediaId, operation: createReviewPresentationAttachment(args) };
}

it('attaches an admitted Library source without a second object and preserves it on cancellation', async () => {
  const first = await librarySelection();
  first.args.attach.mockRejectedValueOnce(new Error('No placement'));
  await expect(first.operation.run()).rejects.toThrow('No placement');
  expect(harness.objects.size).toBe(1);
  expect(harness.journals.size).toBe(0);
  expect(first.operation.hasRetainedAsset()).toBe(false);
  const cards = table('media_library').size;
  await first.operation.run();
  expect(harness.objects.size).toBe(1);
  expect(table('media_library').size).toBe(cards);
  expect(table('project_assets').size).toBe(1);
});

it('refuses a stale Library selection before invoking attachment', async () => {
  const { args, mediaId, operation } = await librarySelection();
  table('media_library').delete(mediaId);
  await expect(operation.run()).rejects.toMatchObject({ name: 'LibrarySceneBindingError' });
  expect(args.attach).not.toHaveBeenCalled();
  expect(harness.journals.size).toBe(0);
  expect(operation.hasRetainedAsset()).toBe(false);
});
