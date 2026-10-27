import { beforeEach, expect, it, vi } from 'vitest';
import {
  createMediaLibraryEntry,
  createVideoProjectEntryWithMediaClip,
  createProjectExportEntry,
} from '../../composition/persistence/projects/index.test-support';
import type { AssetRef } from '../../composition/persistence/assets';
import { VideoProjectAssetType } from '../../features/video/project/types';
import { encodePortableVideoProjectAssetRefs } from '../media-hub-backup/v6/root-codecs/projects';
import { parseRootEnvelope } from '../media-hub-backup/v6/codec';
import { projectSyncCatalog, type CatalogAttempt } from './catalog-graph';
import { createSyncAttempt, hashSyncText, parseSyncAttemptText } from './wire-record';
import { prepareCatalogReplica } from './incoming';
import { SyncRemoteError, type SyncRemoteStore } from './remote-store';
import type { stageRootObjects } from '../media-hub-backup/v6/staging';

const io = vi.hoisted(() => ({
  active: false,
  staged: [] as string[],
  discard: vi.fn(),
  read: vi.fn(),
  journal: vi.fn(),
  stage: vi.fn(),
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
vi.mock('../media-hub-backup/v6/staging', () => ({ stageRootObjects: io.stage }));
const mediaId = 'project-asset:source';
const sha = hashSyncText('\0\0\0');
const ref = (assetId: string): AssetRef => ({
  assetId,
  createdAt: 1,
  location: { kind: 'opfs', objectKey: `objects/${assetId}` },
  mimeType: 'image/png',
  size: 3,
  sha256: sha,
});
const object = (objectId: string, filename: string) => ({
  objectId,
  path: `_sniptale/assets/${objectId}/${filename}`,
  filename,
  mimeType: 'image/png',
  size: 3,
});
function mediaEnvelope() {
  const entry = createMediaLibraryEntry({
    id: mediaId,
    filename: 'original.png',
    source: { kind: 'project-asset', projectAssetId: 'source' },
    mimeType: 'image/png',
    size: 3,
    workspaceRevision: 0,
    lifecycle: { savedAt: 1, storageClass: 'library', updatedAt: 1 },
  });
  return {
    entry,
    envelope: parseRootEnvelope({
      descriptor: {
        rootKind: 'media',
        rootId: mediaId,
        mediaSubtype: 'library-item',
        metadataPath: 'Metadata/root.json',
        objectCount: 1,
        totalBytes: 3,
      },
      metadata: {
        entry,
        originalObjectId: 'original',
        projectAsset: { id: 'source', mimeType: 'image/png', size: 3, createdAt: 1 },
      },
      objects: [object('original', 'original.png')],
    }),
  };
}
function projectEnvelope() {
  const entry = createVideoProjectEntryWithMediaClip({ id: 'project' });
  const asset = entry.project.assets[0]!;
  asset.type = VideoProjectAssetType.IMAGE;
  asset.source = { kind: 'project-asset', projectAssetId: 'private' };
  asset.metadata = { ...asset.metadata, mimeType: 'image/png', size: 3, duration: null };
  entry.project.assets.push({
    ...structuredClone(asset),
    id: 'borrowed',
    source: { kind: 'library-asset', mediaId },
  });
  const { assetId: _assetId, ...exported } = createProjectExportEntry({
    id: 'export',
    projectId: entry.id,
    mimeType: 'image/png',
    size: 3,
    filename: 'saved.png',
  });
  return parseRootEnvelope({
    descriptor: {
      rootKind: 'video-project',
      rootId: entry.id,
      metadataPath: 'Metadata/root.json',
      objectCount: 2,
      totalBytes: 6,
    },
    metadata: {
      entry: { ...entry, project: encodePortableVideoProjectAssetRefs(entry.project) },
      projectAssets: [
        {
          entry: { id: 'private', mimeType: 'image/png', size: 3, createdAt: 1 },
          filename: 'private.png',
          objectId: 'private',
          publishToLibrary: false,
        },
      ],
      projectExports: [{ entry: exported, objectId: 'export' }],
    },
    objects: [object('private', 'private.png'), object('export', 'saved.png')],
  });
}
async function attempt(
  envelope: ReturnType<typeof projectEnvelope>,
  operationId: string,
  number = 1
): Promise<CatalogAttempt> {
  const dependencies =
    envelope.descriptor.rootKind === 'video-project' ? [{ mediaId, basis: ['media-op'] }] : [];
  const operationText = JSON.stringify({
    format: 'sniptale-sync-operation',
    version: 1,
    spaceId: 'space',
    operationId,
    rootKind: envelope.descriptor.rootKind,
    rootId: envelope.descriptor.rootId,
    kind: 'edit',
    parents: [],
    dependencies,
    envelope,
    objects: envelope.objects.map((item) => ({ objectId: item.objectId, sha256: sha })),
  });
  const physical = await createSyncAttempt(
    operationText,
    `00000000-0000-0000-0000-${String(number).padStart(12, '0')}`
  );
  const parsed = await parseSyncAttemptText(physical.recordText);
  return { ...parsed, operationText };
}
async function fixture(project = false, duplicate = false) {
  const media = mediaEnvelope();
  const mediaAttempt = await attempt(media.envelope, 'media-op');
  const selected = project ? await attempt(projectEnvelope(), 'project-op', 2) : mediaAttempt;
  const attempts = [mediaAttempt, ...(project ? [selected] : [])];
  if (duplicate)
    attempts.push(
      await attempt(
        project ? projectEnvelope() : media.envelope,
        project ? 'project-op' : 'media-op',
        3
      )
    );
  const reads: string[] = [];
  const data = new Map(
    attempts.flatMap((item) =>
      item.objects.map((row) => [row.remoteKey, new Blob([new Uint8Array(3)])] as const)
    )
  );
  const remote: SyncRemoteStore = {
    list: async () => ({ objects: [], prefixes: [], nextCursor: null }),
    write: async () => {
      throw new Error('Incoming must not write remotely.');
    },
    read: async (key) => {
      reads.push(key);
      const body = data.get(key);
      if (!body) throw new SyncRemoteError('missing');
      return body.stream();
    },
  };
  const catalog = {
    ...projectSyncCatalog('space', attempts),
    invalid: [],
    metadataBytes: 0,
    pages: 1,
  };
  return {
    selected,
    catalog,
    remote,
    reads,
    data,
    admission: {
      connectionGeneration: 7,
      expectedLocalGeneration: 0,
      expectedWorkspaceRevision: null,
      dependencies: project
        ? [
            {
              entry: media.entry,
              ref: ref('borrowed'),
              expectedGeneration: 1,
              expectedBasis: ['media-op'],
            },
          ]
        : [],
    },
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  io.staged = [];
  io.active = false;
  io.discard.mockResolvedValue(undefined);
  io.read.mockImplementation(
    async () => new File([new Uint8Array(3)], 'original.png', { type: 'image/png' })
  );
  io.journal.mockImplementation(async (payload) => {
    expect(io.active).toBe(true);
    return { journalId: 'ready', payload };
  });
  io.stage.mockImplementation(async (args: Parameters<typeof stageRootObjects>[0]) => {
    expect(io.active).toBe(true);
    const staged = [];
    for (const item of args.objects) {
      expect(args.expectedSha256?.get(item.objectId)).toBe(sha);
      const source = await args.readObject(item);
      await source.pipeTo(new WritableStream({ write() {} }));
      staged.push({ objectId: item.objectId, ref: ref(`staged-${item.objectId}`) });
      io.staged.push(item.objectId);
    }
    return staged;
  });
});
it('stages a media original and uses the stable logical digest for the native journal', async () => {
  const f = await fixture();
  const journal = await prepareCatalogReplica({
    ...f,
    rootKind: 'media',
    rootId: mediaId,
    signal: new AbortController().signal,
  });
  expect(journal.payload.kind).toBe('media');
  expect(journal.payload.input.sourceDigest).toBe(hashSyncText(f.selected.operationText));
  expect(f.reads).toEqual(f.selected.objects.map((item) => item.remoteKey));
  expect(io.discard).not.toHaveBeenCalled();
  expect(io.active).toBe(false);
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
it('uses a second physical alternative when the first original is missing', async () => {
  const f = await fixture(false, true);
  f.data.delete(f.selected.objects[0]!.remoteKey);
  const journal = await prepareCatalogReplica({
    ...f,
    rootKind: 'media',
    rootId: mediaId,
    signal: new AbortController().signal,
  });
  expect(journal.payload.input.sourceDigest).toBe(hashSyncText(f.selected.operationText));
  expect(f.reads).toHaveLength(2);
});
it('rejects unreadable metadata, unavailable dependencies and cancellation before original downloads', async () => {
  const f = await fixture(true);
  const controller = new AbortController();
  controller.abort();
  await expect(
    prepareCatalogReplica({
      ...f,
      rootKind: 'video-project',
      rootId: 'project',
      signal: controller.signal,
    })
  ).rejects.toThrow();
  const root = f.catalog.roots.get(JSON.stringify(['video-project', 'project']))!;
  root.unavailableDependencies.push('missing');
  await expect(
    prepareCatalogReplica({
      ...f,
      rootKind: 'video-project',
      rootId: 'project',
      signal: new AbortController().signal,
    })
  ).rejects.toThrow();
  expect(f.reads).toEqual([]);
  expect(io.stage).not.toHaveBeenCalled();
});

it('refuses missing or extra wire dependency inventory before staging files', async () => {
  const envelope = projectEnvelope();
  for (const dependencies of [
    [],
    [
      { mediaId, basis: ['media-op'] },
      { mediaId: 'extra', basis: ['other'] },
    ],
  ]) {
    const text = JSON.stringify({
      format: 'sniptale-sync-operation',
      version: 1,
      spaceId: 'space',
      operationId: 'invalid',
      rootKind: 'video-project',
      rootId: 'project',
      kind: 'edit',
      parents: [],
      dependencies,
      envelope,
      objects: envelope.objects.map((item) => ({ objectId: item.objectId, sha256: sha })),
    });
    await expect(createSyncAttempt(text, '00000000-0000-0000-0000-000000000001')).rejects.toThrow();
  }
  expect(io.stage).not.toHaveBeenCalled();
});

it('stages reused same-space mappings through the existing native journal admission', async () => {
  const f = await fixture();
  const physical = await createSyncAttempt(
    f.selected.operationText,
    '00000000-0000-0000-0000-000000000009',
    f.selected.objects
  );
  const selected = {
    ...(await parseSyncAttemptText(physical.recordText)),
    operationText: f.selected.operationText,
  };
  const catalog = {
    ...projectSyncCatalog('space', [selected]),
    invalid: [],
    metadataBytes: 0,
    pages: 1,
  };
  const journal = await prepareCatalogReplica({
    ...f,
    catalog,
    rootKind: 'media',
    rootId: mediaId,
    signal: new AbortController().signal,
  });
  expect(f.reads).toEqual(f.selected.objects.map((item) => item.remoteKey));
  expect(io.staged).toEqual(['original']);
  expect(journal.payload.kind).toBe('media');
  expect(journal.payload.input.sourceDigest).toBe(hashSyncText(f.selected.operationText));
  expect(io.journal).toHaveBeenCalledOnce();
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
