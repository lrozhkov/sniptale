import { expect, type Mock } from 'vitest';
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

import { SyncRemoteError, type SyncRemoteStore } from './remote-store';
import type { stageRootObjects } from '../media-hub-backup/v6/staging';

type IncomingTestIO = {
  active: boolean;
  reading: boolean;
  staged: string[];
  scenarioPredecessor: Mock;
  predecessor: Mock;
  discard: Mock;
  read: Mock;
  journal: Mock;
  stage: Mock;
};

export const mediaId = 'project-asset:source';
export const sha = hashSyncText('\0\0\0');
export const ref = (assetId: string): AssetRef => ({
  assetId,
  createdAt: 1,
  location: { kind: 'opfs', objectKey: `objects/${assetId}` },
  mimeType: 'image/png',
  size: 3,
  sha256: sha,
});
export const object = (objectId: string, filename: string) => ({
  objectId,
  path: `_sniptale/assets/${objectId}/${filename}`,
  filename,
  mimeType: 'image/png',
  size: 3,
});
export function mediaEnvelope() {
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
export function projectEnvelope() {
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
export async function attempt(
  envelope: ReturnType<typeof projectEnvelope>,
  operationId: string,
  number = 1,
  parents: string[] = []
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
    parents,
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
export async function fixture(project = false, duplicate = false) {
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
    stat: async () => {
      throw new Error('This read workflow must not stat originals.');
    },
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
      spaceId: 'space',
      profileCreatedAt: 1,
      expectedBasis: [],
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
export function resetIncomingTestIO(io: IncomingTestIO) {
  io.scenarioPredecessor.mockResolvedValue([]);
  io.staged = [];
  io.active = false;
  io.reading = false;
  io.predecessor.mockImplementation(async () => {
    expect(io.reading).toBe(true);
    return null;
  });
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
}
