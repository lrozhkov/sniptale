import { beforeEach, expect, it, vi } from 'vitest';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { AssetReadyJournal, AssetRef } from '../../composition/persistence/assets/contracts';
import { createMediaLibraryEntry } from '../../composition/persistence/projects/index.storage.test-support';
import { betaV1Fixture } from '../../composition/persistence/infrastructure/indexed-db/fixtures/beta-v1';
import { createQuickEditWatermark } from '../../features/video/project/scene/watermark';

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
    harness.objects.set(ref.assetId, new File([blob], 'logo.png', { type: ref.mimeType }));
    harness.afterWrite?.();
    return { ref: { ...ref, size: blob.size } };
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

import { createReviewWatermarkImageAttachment } from './watermark-image';
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

function selection(origin = false) {
  if (origin) table('media_library').set('origin', createMediaLibraryEntry({ id: 'origin' }));
  const controller = new AbortController();
  const attach = vi.fn(async (assetId: string) => {
    expect(harness.journals.size).toBe(1);
    expect(await recoverProjectMediaPublications()).toBe(0);
    const opened = await openVideoWorkspace(aggregateId, mainSource);
    await saveVideoWorkspaceAdvanced({
      aggregateId,
      expectedRevision: opened.workspace.revision,
      expectedSourceAssetId: opened.workspace.sourceAssetId,
      advanced: {
        ...opened.workspace.advanced,
        watermark: {
          ...createQuickEditWatermark('Saved text'),
          mode: 'image',
          image: { assetId, width: 80, height: 40, size: 0.2, opacity: 1 },
        },
      },
    });
  });
  const args = {
    file: new File(['image'], 'logo.png', { type: 'image/png' }),
    aggregateId,
    signal: controller.signal,
    assertCurrentTarget: vi.fn(),
    attach,
    ...(origin ? { originMediaId: 'origin' } : {}),
  };
  return { args, controller, operation: createReviewWatermarkImageAttachment(args) };
}

it.each([false, true])(
  'prepares one private logo, attaches once and publishes no Library card (origin=%s)',
  async (origin) => {
    const { args, operation } = selection(origin);
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
    const entry = [...table('project_assets').values()][0];
    expect(entry).toMatchObject({
      assetId: ref.assetId,
      ...(origin ? { originMediaId: 'origin' } : {}),
    });
  }
);

it('recovers the real prepared writer journal after attached publication failure and later None mode', async () => {
  const { operation } = selection(true);
  harness.failPublication = true;
  await expect(operation.run()).rejects.toThrow('Fixture quota');
  const journal = [...harness.journals.values()][0]!;
  expect(journal.payload).toMatchObject({
    publishToLibrary: false,
    requiredReviewResource: { aggregateId, slot: 'watermark' },
    entry: { originMediaId: 'origin' },
  });
  expect(harness.objects.size).toBe(1);
  const saved = (await readVideoWorkspace(aggregateId))!;
  await saveVideoWorkspaceAdvanced({
    aggregateId,
    expectedRevision: saved.workspace.revision,
    expectedSourceAssetId: saved.workspace.sourceAssetId,
    advanced: {
      ...saved.workspace.advanced,
      watermark: { ...saved.workspace.advanced.watermark!, mode: 'none' },
    },
  });
  const media = table('media_library').get('origin');
  if (!isRecord(media)) throw new Error('Missing source fixture');
  table('media_library').set('origin', {
    ...media,
    lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 2, trashedAt: 2 },
  });
  harness.failPublication = false;
  expect(await recoverProjectMediaPublications()).toBe(1);
  expect(await recoverProjectMediaPublications()).toBe(0);
  expect(table('project_assets').size).toBe(1);
  expect(table('media_library').size).toBe(2);
  expect(harness.objects.size).toBe(1);
});

it('retry after publication failure does not attach twice', async () => {
  const { args, operation } = selection();
  harness.failPublication = true;
  await expect(operation.run()).rejects.toThrow();
  harness.failPublication = false;
  await operation.run();
  expect(args.attach).toHaveBeenCalledOnce();
  expect(harness.objects.size).toBe(1);
});

it.each([false, true])(
  'reconciles committed-then-thrown attachment with unavailable read=%s',
  async (unknown) => {
    const { args } = selection();
    const attach = args.attach;
    let attempts = 0;
    const operation = createReviewWatermarkImageAttachment({
      ...args,
      attach: async (assetId) => {
        attempts++;
        await attach(assetId);
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
  'cleans only unadopted staged bytes for %s',
  async (reason) => {
    const { args, controller } = selection();
    if (reason === 'cancel') harness.afterWrite = () => controller.abort();
    if (reason === 'target')
      harness.afterWrite = () =>
        args.assertCurrentTarget.mockImplementation(() => {
          throw new Error('Changed target');
        });
    if (reason === 'reject') args.attach.mockRejectedValueOnce(new Error('No placement'));
    const operation = createReviewWatermarkImageAttachment(args);
    await expect(operation.run()).rejects.toThrow();
    expect(harness.objects.size).toBe(0);
    expect(harness.journals.size).toBe(0);
    expect(table('project_assets').size).toBe(0);
  }
);
