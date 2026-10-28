import { beforeEach, expect, it, vi } from 'vitest';

import { parsePortableVideoProjectMetadata } from '../media-hub-backup/v6/root-codecs/projects';
import { parseRootEnvelope } from '../media-hub-backup/v6/codec';
import { projectSyncCatalog } from './catalog-graph';
import { createSyncAttempt, parseSyncAttemptText } from './wire-record';
import { prepareCatalogReplica } from './incoming';

import {
  object,
  mediaEnvelope,
  projectEnvelope,
  attempt,
  fixture,
  resetIncomingTestIO,
} from './incoming.test-support';

const io = vi.hoisted(() => ({
  active: false,
  reading: false,
  staged: [] as string[],
  discard: vi.fn(),
  read: vi.fn(),
  journal: vi.fn(),
  deletion: vi.fn(),
  stage: vi.fn(),
  predecessor: vi.fn(),
  scenarioPredecessor: vi.fn(),
  releaseReader: vi.fn(),
}));
vi.mock('../../composition/persistence/assets/resource-sessions', () => ({
  runWithAssetResourceRead: async (operation: () => Promise<unknown>) => {
    io.reading = true;
    try {
      return await operation();
    } finally {
      io.reading = false;
      io.releaseReader();
    }
  },
}));
vi.mock('../../composition/persistence/sync-capture/apply-scenario', () => ({
  loadScenarioReplicaPredecessorAssets: io.scenarioPredecessor,
}));
vi.mock('../../composition/persistence/sync-capture/apply-media', () => ({
  loadMediaReplicaPredecessorRef: io.predecessor,
}));
vi.mock('../../composition/persistence/assets', async (original) => ({
  ...(await original<typeof import('../../composition/persistence/assets')>()),
  runWithDurableAssetOperation: async (operation: () => Promise<unknown>) => {
    io.active = true;
    try {
      return await operation();
    } finally {
      io.active = false;
    }
  },
  discardPreparedAsset: io.discard,
  readAssetFile: io.read,
}));
vi.mock('../../composition/persistence/sync-capture/replica-publication', () => ({
  createPreparedReplicaJournal: io.journal,
}));
vi.mock('../../composition/persistence/sync-capture/apply-deletion', () => ({
  applyCatalogDeletionNative: io.deletion,
}));
vi.mock('../media-hub-backup/v6/staging', () => ({ stageRootObjects: io.stage }));
beforeEach(() => {
  vi.clearAllMocks();
  resetIncomingTestIO(io);
});

it('prepares editing bytes and checks borrowed originals without downloading exports', async () => {
  const f = await fixture(true);
  const journal = await prepareCatalogReplica({
    ...f,
    rootKind: 'video-project',
    rootId: 'project',
    signal: new AbortController().signal,
  });
  expect(journal.payload.kind).toBe('video-project');
  expect(io.staged).toEqual(['private']);
  expect(io.read).toHaveBeenCalledOnce();
  expect(f.reads).toEqual([
    f.selected.objects.find((item) => item.objectId === 'private')!.remoteKey,
  ]);
});
it('stages the project preview and thumbnail closure without downloading saved exports', async () => {
  const f = await fixture(true);
  const envelope = projectEnvelope();
  const metadata = parsePortableVideoProjectMetadata(envelope.metadata);
  metadata.thumbnail = { objectId: 'thumbnail', createdAt: 1, updatedAt: 1, width: 1, height: 1 };
  metadata.presentation = {
    entry: {
      aggregateId: 'project',
      aggregateKind: 'video-project',
      presentationRevision: 0,
      updatedAt: 1,
    },
    thumbnailObjectId: 'presentation-thumbnail',
    previewObjectId: 'preview',
  };
  envelope.metadata = JSON.parse(JSON.stringify(metadata));
  envelope.objects.push(
    object('thumbnail', 'thumbnail.png'),
    object('presentation-thumbnail', 'presentation.png'),
    object('preview', 'preview.png')
  );
  envelope.descriptor.objectCount = envelope.objects.length;
  envelope.descriptor.totalBytes = 15;
  const selected = await attempt(parseRootEnvelope(envelope), 'complete-project', 4);
  const media = await attempt(mediaEnvelope().envelope, 'media-op');
  for (const item of selected.objects) f.data.set(item.remoteKey, new Blob([new Uint8Array(3)]));
  const catalog = { ...f.catalog, ...projectSyncCatalog('space', [media, selected]) };
  const args = {
    ...f,
    catalog,
    rootKind: 'video-project' as const,
    rootId: 'project',
    signal: new AbortController().signal,
  };
  const journal = await prepareCatalogReplica(args);
  if (journal.payload.kind !== 'video-project') throw new Error('Expected project.');
  expect(io.staged).toEqual(['private', 'thumbnail', 'presentation-thumbnail', 'preview']);
  expect(f.reads).not.toContain(
    selected.objects.find((item) => item.objectId === 'export')!.remoteKey
  );
  expect(journal.payload.input.root.thumbnail!.ref.assetId).toBe('staged-thumbnail');
  expect(journal.payload.input.root.presentation!.previewRef!.assetId).toBe('staged-preview');
  io.journal.mockRejectedValueOnce(new Error('Native refusal'));
  await expect(prepareCatalogReplica(args)).rejects.toThrow('Native refusal');
  expect(io.discard.mock.calls).toEqual([
    ['staged-private'],
    ['staged-thumbnail'],
    ['staged-presentation-thumbnail'],
    ['staged-preview'],
  ]);
});
it('refuses missing borrowed bytes before staging or publication', async () => {
  const f = await fixture(true);
  io.read.mockRejectedValue(new Error('Missing local original'));
  await expect(
    prepareCatalogReplica({
      ...f,
      rootKind: 'video-project',
      rootId: 'project',
      signal: new AbortController().signal,
    })
  ).rejects.toThrow();
  expect(io.stage).not.toHaveBeenCalled();
  expect(io.journal).not.toHaveBeenCalled();
  expect(f.reads).toEqual([]);
});
it('cleans new staged files when journal admission refuses and preserves the borrowed original', async () => {
  const f = await fixture(true);
  io.journal.mockRejectedValue(new Error('Native refusal'));
  await expect(
    prepareCatalogReplica({
      ...f,
      rootKind: 'video-project',
      rootId: 'project',
      signal: new AbortController().signal,
    })
  ).rejects.toThrow('Native refusal');
  expect(io.discard.mock.calls).toEqual([['staged-private']]);
});
it('stages a mixed fresh editing and reused export mapping without downloading the export', async () => {
  const f = await fixture(true);
  const fresh = await createSyncAttempt(
    f.selected.operationText,
    '00000000-0000-0000-0000-000000000009'
  );
  const mixed = fresh.objects.map((item) =>
    item.objectId === 'export'
      ? f.selected.objects.find((candidate) => candidate.objectId === item.objectId)!
      : item
  );
  const physical = await createSyncAttempt(f.selected.operationText, fresh.attemptId, mixed);
  const selected = {
    ...(await parseSyncAttemptText(physical.recordText)),
    operationText: f.selected.operationText,
  };
  const media = await attempt(mediaEnvelope().envelope, 'media-op');
  const catalog = {
    ...projectSyncCatalog('space', [media, selected]),
    invalid: [],
    metadataBytes: 0,
    pages: 1,
  };
  const privateKey = mixed.find((item) => item.objectId === 'private')!.remoteKey;
  f.data.set(privateKey, new Blob([new Uint8Array(3)]));
  const journal = await prepareCatalogReplica({
    ...f,
    catalog,
    rootKind: 'video-project',
    rootId: 'project',
    signal: new AbortController().signal,
  });
  expect(f.reads).toEqual([privateKey]);
  expect(io.staged).toEqual(['private']);
  expect(journal.payload.kind).toBe('video-project');
});
