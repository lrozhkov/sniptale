import { beforeEach, expect, it, vi } from 'vitest';
import type { AssetRef } from '../../composition/persistence/assets';
import { createProjectAssetEntry } from '../../composition/persistence/projects/index.test-support';
import { buildProjectAssetMediaEntry } from '../../composition/persistence/media-library/entry-mapping';
import { workspace as reviewTemplate } from '../../composition/persistence/review-workspaces/backup-restore.test-support';
import { materializeVideoWorkspaceProject } from '../../composition/persistence/review-workspaces/project-metadata';
import { updateQuickEditBackground } from '../../features/video/review/advanced/background';
import type { CapturedVideoReviewRows } from '../../composition/persistence/sync-capture/review-snapshot';
import { parseRootEnvelope } from '../media-hub-backup/v6/codec';
import type { stageRootObjects } from '../media-hub-backup/v6/staging';
import { encodeCapturedVideoReviewRoot } from './captured-review';
import { projectSyncCatalog, type CatalogAttempt } from './catalog-graph';
import { createSyncAttempt, hashSyncText, parseSyncAttemptText } from './wire-record';
import { prepareCatalogReplica } from './incoming';
import type { SyncRemoteStore } from './remote-store';

const io = vi.hoisted(() => ({
  read: vi.fn(),
  stage: vi.fn(),
  journal: vi.fn(),
  discard: vi.fn(),
}));
vi.mock('../../composition/persistence/assets', async (original) => ({
  ...(await original<typeof import('../../composition/persistence/assets')>()),
  readAssetFile: io.read,
  discardPreparedAsset: io.discard,
  runWithDurableAssetOperation: async (operation: () => Promise<unknown>) => operation(),
}));
vi.mock('../../composition/persistence/assets/resource-sessions', () => ({
  runWithAssetResourceRead: async (operation: () => Promise<unknown>) => operation(),
}));
vi.mock('../media-hub-backup/v6/staging', () => ({ stageRootObjects: io.stage }));
vi.mock('../../composition/persistence/sync-capture/replica-publication', () => ({
  createPreparedReplicaJournal: io.journal,
}));
const sha = hashSyncText('\0\0\0');
const mediaId = 'project-asset:source';
const reviewId = 'project-asset:quick-project:review';
const lifecycle = { storageClass: 'library' as const, savedAt: 1, updatedAt: 1 };
function reference(assetId: string, mimeType: string): AssetRef {
  return {
    assetId,
    createdAt: 1,
    size: 3,
    mimeType,
    sha256: sha,
    location: { kind: 'opfs', objectKey: `objects/${assetId}` },
  };
}
function asset(id: string, mimeType: string) {
  return createProjectAssetEntry({ id, assetId: `sender-${id}`, mimeType, size: 3 });
}
function sourceEnvelope(
  entry: CapturedVideoReviewRows['source']['projectAsset'],
  filename: string
) {
  const { assetId: _assetId, ...projectAsset } = entry;
  const media = {
    ...buildProjectAssetMediaEntry(entry),
    filename,
    originalFilename: filename,
    lifecycle,
  };
  return {
    media,
    envelope: parseRootEnvelope({
      descriptor: {
        rootKind: 'media',
        rootId: media.id,
        mediaSubtype: 'library-item',
        metadataPath: 'Metadata/root.json',
        objectCount: 1,
        totalBytes: 3,
      },
      metadata: { entry: media, projectAsset, originalObjectId: 'original' },
      objects: [
        {
          objectId: 'original',
          filename,
          path: `_sniptale/assets/original/${filename}`,
          size: 3,
          mimeType: entry.mimeType,
        },
      ],
    }),
  };
}
async function record(
  envelope: ReturnType<typeof parseRootEnvelope>,
  operationId: string,
  number: number,
  parents: string[] = [],
  reviewSourceMediaId?: string
): Promise<CatalogAttempt> {
  const operationText = JSON.stringify({
    format: 'sniptale-sync-operation',
    version: 1,
    spaceId: 'space',
    operationId,
    rootKind: reviewSourceMediaId ? 'video-review' : 'media',
    rootId: envelope.descriptor.rootId,
    ...(reviewSourceMediaId ? { reviewSourceMediaId } : {}),
    kind: 'edit',
    parents,
    dependencies: reviewSourceMediaId
      ? [
          { mediaId, basis: ['source-before'] },
          { mediaId: 'project-asset:music', basis: ['music-op'] },
        ]
      : [],
    envelope,
    objects: envelope.objects.map((object) => ({ objectId: object.objectId, sha256: sha })),
  });
  const attempt = await createSyncAttempt(
    operationText,
    `00000000-0000-0000-0000-${String(number).padStart(12, '0')}`
  );
  return { ...(await parseSyncAttemptText(attempt.recordText)), operationText };
}
async function fixture() {
  const original = asset('source', 'video/webm');
  const background = asset('background', 'image/png');
  const music = asset('music', 'audio/mpeg');
  const originalRoot = sourceEnvelope(original, 'source.webm');
  const renamedRoot = sourceEnvelope(original, 'Renamed.webm');
  renamedRoot.media.tags = ['Renamed original'];
  renamedRoot.envelope.metadata = {
    ...Object(renamedRoot.envelope.metadata),
    entry: renamedRoot.media,
  };
  const musicRoot = sourceEnvelope(music, 'music.mp3');
  const review = materializeVideoWorkspaceProject(
    {
      ...structuredClone(reviewTemplate),
      aggregateId: reviewId,
      sourceMediaId: mediaId,
      sourceAssetId: original.assetId,
      source: { ...reviewTemplate.source, size: 3 },
    },
    'Restored review'
  );
  review.advanced.background = updateQuickEditBackground(review.advanced.background, {
    enabled: true,
    type: 'image',
    assetId: 'project-asset:background',
  });
  review.advanced.audio.music = [
    {
      id: 'music',
      assetId: 'project-asset:music',
      timelineStart: 0,
      sourceOffset: 0,
      duration: 1,
      volume: 1,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
    },
  ];
  const carrier = await encodeCapturedVideoReviewRoot({
    review: { workspace: review, draft: null },
    source: {
      media: originalRoot.media,
      projectAsset: original,
      ref: reference(original.assetId, original.mimeType),
    },
    assets: [background, music],
    refs: [
      reference(background.assetId, background.mimeType),
      reference(music.assetId, music.mimeType),
    ],
    media: [musicRoot.media],
    privateReviews: [],
  });
  const attempts = [
    await record(originalRoot.envelope, 'source-before', 1),
    await record(renamedRoot.envelope, 'source-renamed', 2, ['source-before']),
    await record(musicRoot.envelope, 'music-op', 3),
    await record(carrier.envelope, 'review-op', 4, [], mediaId),
  ];
  const reads: string[] = [];
  const remote: SyncRemoteStore = {
    stat: async () => {
      throw new Error('Unexpected stat.');
    },
    list: async () => ({ objects: [], prefixes: [], nextCursor: null }),
    write: async () => {
      throw new Error('Unexpected remote write.');
    },
    read: async (key) => {
      reads.push(key);
      return new Blob([new Uint8Array(3)]).stream();
    },
  };
  const catalog = {
    ...projectSyncCatalog('space', attempts),
    invalid: [],
    metadataBytes: 0,
    pages: 1,
  };
  const admission = {
    connectionGeneration: 7,
    spaceId: 'space',
    profileCreatedAt: 1,
    expectedBasis: [],
    expectedLocalGeneration: 0,
    expectedWorkspaceRevision: null,
    dependencies: [
      {
        entry: renamedRoot.media,
        ref: reference('target-original', original.mimeType),
        expectedGeneration: 2,
        expectedBasis: ['source-renamed'],
      },
      {
        entry: musicRoot.media,
        ref: reference('target-music', music.mimeType),
        expectedGeneration: 1,
        expectedBasis: ['music-op'],
      },
    ],
  };
  io.read.mockClear();
  return { remote, catalog, admission, reads, attempts };
}
beforeEach(() => {
  vi.clearAllMocks();
  io.read.mockImplementation(
    async (ref: AssetRef, filename: string) =>
      new File([new Uint8Array(ref.size)], filename, { type: ref.mimeType })
  );
  io.discard.mockResolvedValue(undefined);
  io.journal.mockImplementation(async (payload) => ({ journalId: 'review-ready', payload }));
  io.stage.mockImplementation(async (args: Parameters<typeof stageRootObjects>[0]) => {
    const staged = [];
    for (const object of args.objects) {
      expect(args.expectedSha256?.get(object.objectId)).toBe(sha);
      const source = await args.readObject(object);
      await source.pipeTo(new WritableStream({ write() {} }));
      staged.push({
        objectId: object.objectId,
        ref: reference(`staged-${object.objectId}`, object.mimeType),
      });
    }
    return staged;
  });
});
it('prepares an archived review after an original rename without downloading shared files', async () => {
  const f = await fixture();
  const result = await prepareCatalogReplica({
    ...f,
    rootKind: 'video-review',
    rootId: reviewId,
    signal: new AbortController().signal,
  });
  if (result.payload.kind !== 'video-review') throw new Error('Expected review.');
  expect(result.payload.input.root.sourceMediaId).toBe(mediaId);
  expect(result.payload.input.root.review.workspace.sourceAssetId).toBe('target-original');
  expect(result.payload.input.root.review.workspace.sourceMediaId).toBe(mediaId);
  expect(result.payload.input.dependencies[0]?.expectedBasis).toEqual(['source-renamed']);
  expect(result.payload.input.root.assets.find((item) => item.entry.id === 'music')).toMatchObject({
    reusePublished: true,
    ref: { assetId: 'target-music' },
  });
  expect(f.reads).toHaveLength(1);
  expect(io.stage.mock.calls[0]?.[0].objects).toHaveLength(1);
  expect(new Set(io.read.mock.calls.map(([ref]) => ref.assetId))).toEqual(
    new Set(['target-original', 'target-music'])
  );
  expect(io.discard).not.toHaveBeenCalled();
});
it('refuses changed local original bytes before staging review resources', async () => {
  const f = await fixture();
  io.read.mockImplementation(
    async (ref: AssetRef, filename: string) =>
      new File(
        [ref.assetId === 'target-original' ? new Uint8Array([1, 0, 0]) : new Uint8Array(3)],
        filename,
        { type: ref.mimeType }
      )
  );
  await expect(
    prepareCatalogReplica({
      ...f,
      rootKind: 'video-review',
      rootId: reviewId,
      signal: new AbortController().signal,
    })
  ).rejects.toThrow();
  expect(io.stage).not.toHaveBeenCalled();
  expect(io.journal).not.toHaveBeenCalled();
  expect(f.reads).toEqual([]);
});
it('discards only new private staging when durable journal creation fails', async () => {
  const f = await fixture();
  io.journal.mockRejectedValueOnce(new Error('Quota exceeded.'));
  await expect(
    prepareCatalogReplica({
      ...f,
      rootKind: 'video-review',
      rootId: reviewId,
      signal: new AbortController().signal,
    })
  ).rejects.toThrow('Quota');
  expect(io.discard).toHaveBeenCalledTimes(1);
  expect(io.discard.mock.calls.flat()).not.toContain('target-original');
  expect(io.discard.mock.calls.flat()).not.toContain('target-music');
  expect(io.discard.mock.calls[0]?.[0]).toMatch(/^staged-/u);
});
