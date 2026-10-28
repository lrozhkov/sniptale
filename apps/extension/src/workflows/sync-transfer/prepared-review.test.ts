import { afterEach, expect, it, vi } from 'vitest';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { AssetRef } from '../../composition/persistence/assets';
import { buildProjectAssetMediaEntry } from '../../composition/persistence/media-library/entry-mapping';
import { createProjectAssetEntry } from '../../composition/persistence/projects/index.test-support';
import { workspace as reviewWorkspace } from '../../composition/persistence/review-workspaces/backup-restore.test-support';
import { encodePortableReviewAssetRefs } from '../../composition/persistence/review-workspaces/asset-refs';
import { materializeVideoWorkspaceProject } from '../../composition/persistence/review-workspaces/project-metadata';
import { parsePreparedVideoReviewReplicaRoot } from '../../composition/persistence/sync-capture/prepared-review';
import { createQuickEditWebcam } from '../../features/video/review/advanced/webcam';
import { parseRootEnvelope } from '../media-hub-backup/v6/codec';
import { parsePortableMediaMetadata } from '../media-hub-backup/v6/root-codecs/media';
import {
  parsePortableSyncRoot,
  portableSyncDependencyIds,
  portableSyncEditingObjectIds,
} from './prepared-root';
import { preparePortableVideoReviewRoot } from './prepared-review';
import { nestedMediaReviewFixture } from '../media-hub-backup/v6/root-publication/media.review-assets.test-support';

afterEach(() => vi.restoreAllMocks());

function ref(assetId: string, mimeType = 'video/webm', size = 6): AssetRef {
  return {
    assetId,
    createdAt: 1,
    size,
    mimeType,
    sha256: null,
    location: { kind: 'opfs', objectKey: `objects/${assetId}` },
  };
}

function fixture(archived = false) {
  const original = createProjectAssetEntry({
    id: 'source',
    assetId: 'local-original',
    mimeType: 'video/webm',
    size: 6,
  });
  const camera = createProjectAssetEntry({
    id: 'camera',
    assetId: 'local-camera',
    mimeType: 'video/webm',
    size: 6,
  });
  const music = createProjectAssetEntry({
    id: 'music',
    assetId: 'local-music',
    mimeType: 'audio/mpeg',
    size: 6,
  });
  const lifecycle = { storageClass: 'library' as const, savedAt: 1, updatedAt: 1 };
  const source = { ...buildProjectAssetMediaEntry(original), lifecycle };
  const aggregateId = archived ? 'project-asset:quick-project:previous' : source.id;
  const projectAssetId = aggregateId.slice('project-asset:'.length);
  const native = materializeVideoWorkspaceProject(
    {
      ...reviewWorkspace,
      aggregateId,
      advanced: {
        ...reviewWorkspace.advanced,
        webcam: createQuickEditWebcam(
          'project-asset:camera',
          reviewWorkspace.source,
          reviewWorkspace.source
        ),
        audio: {
          ...reviewWorkspace.advanced.audio,
          music: [
            {
              id: 'music',
              assetId: 'project-asset:music',
              timelineStart: 0,
              sourceOffset: 0,
              duration: 1,
              volume: 1,
              muted: true,
              fadeIn: 0,
              fadeOut: 0,
            },
          ],
        },
      },
    },
    'Saved review'
  );
  const { sourceAssetId: _nativeId, ...workspace } = native;
  const { assetId: _cameraId, ...portableCamera } = camera;
  const { assetId: _musicId, ...portableMusic } = music;
  const raw = {
    entry: { ...source, id: aggregateId, source: { kind: 'project-asset', projectAssetId } },
    projectAsset: { id: projectAssetId, createdAt: 1, size: 6, mimeType: 'video/webm' },
    originalObjectId: 'original',
    videoReview: encodePortableReviewAssetRefs({
      workspace,
      draft: {
        aggregateId,
        revision: workspace.revision,
        annotation: { id: 'draft', text: 'Recovery', anchor: { kind: 'point', time: 1 } },
        before: null,
        updatedAt: 4,
      },
    }),
    reviewAssets: [
      {
        entry: portableCamera,
        filename: 'camera.webm',
        objectId: 'camera',
        publishToLibrary: false,
      },
      {
        entry: portableMusic,
        filename: 'music.mp3',
        objectId: 'music',
        libraryMediaId: 'project-asset:music',
      },
    ],
    thumbnail: { objectId: 'thumbnail', createdAt: 1, updatedAt: 2, width: 100, height: 80 },
  };
  const refs = new Map([
    ['original', ref(original.assetId)],
    ['camera', ref(camera.assetId)],
    ['music', ref(music.assetId, music.mimeType)],
    ['thumbnail', ref('local-thumbnail', 'image/png', 7)],
  ]);
  const envelope = parseRootEnvelope({
    descriptor: {
      rootKind: 'media',
      mediaSubtype: 'library-item',
      rootId: aggregateId,
      metadataPath: 'Metadata/sync-root.json',
      objectCount: 4,
      totalBytes: 25,
    },
    metadata: raw,
    objects: [...refs].map(([objectId, value]) => ({
      objectId,
      path: `_sniptale/assets/${objectId}/${objectId}`,
      filename: objectId,
      size: value.size,
      mimeType: value.mimeType,
    })),
  });
  const dependencies = [
    {
      entry: source,
      ref: refs.get('original')!,
      expectedGeneration: 2,
      expectedBasis: ['source-operation'],
    },
    {
      entry: { ...buildProjectAssetMediaEntry(music), lifecycle },
      ref: refs.get('music')!,
      expectedGeneration: 3,
      expectedBasis: ['music-operation'],
    },
  ];
  const metadata = parsePortableMediaMetadata(envelope.metadata);
  const refFor = (objectId: string) => {
    const value = refs.get(objectId);
    if (!value) throw new Error('Verified resource is missing.');
    return value;
  };
  return { envelope, metadata, refs, dependencies, sourceMediaId: source.id, refFor };
}

it.each([false, true])(
  'prepares the saved review and full resource closure without duplicating its original (archived=%s)',
  async (archived) => {
    const f = fixture(archived);
    const parsed = await parsePortableSyncRoot(f.envelope, f.sourceMediaId);
    if (parsed.kind !== 'video-review') throw new Error('Expected review carrier.');
    expect(portableSyncDependencyIds(parsed)).toEqual(
      ['project-asset:music', f.sourceMediaId].sort()
    );
    expect(portableSyncEditingObjectIds(parsed)).toEqual([
      'original',
      'camera',
      'music',
      'thumbnail',
    ]);
    const root = await preparePortableVideoReviewRoot({ ...f, expectedLocalGeneration: 0 });
    expect(root.review.workspace.sourceAssetId).toBe('local-original');
    expect(root.review.workspace.sourceMediaId).toBe(archived ? f.sourceMediaId : undefined);
    expect(root.review.workspace.project?.name).toBe('Saved review');
    expect(root.review.workspace.history).toEqual(f.metadata.videoReview?.workspace.history);
    expect(root.review.draft?.annotation.text).toBe('Recovery');
    expect(root.assets.map((asset) => [asset.entry.id, asset.reusePublished])).toEqual([
      ['camera', undefined],
      ['music', true],
    ]);
    expect(root.thumbnail?.ref).toEqual(f.refs.get('thumbnail'));
    expect(root.thumbnail?.entry.assetId).toBe(f.metadata.entry.id);
    expect(root).not.toHaveProperty('source');
    expect(root.assets.some((asset) => asset.ref.assetId === 'local-original')).toBe(false);
  }
);

it('allocates replacement private identities once in the prepared journal graph', async () => {
  const f = fixture(true);
  const privateId = '00000000-0000-4000-8000-000000000001';
  const uuid = vi.spyOn(crypto, 'randomUUID').mockReturnValue(privateId);
  const root = await preparePortableVideoReviewRoot({ ...f, expectedLocalGeneration: 1 });
  expect(uuid).toHaveBeenCalledTimes(1);
  expect(root.assets.map((asset) => asset.entry.id)).toEqual([privateId, 'music']);
  expect(root.review.workspace.advanced.webcam?.assetId).toBe(`project-asset:${privateId}`);
  const retained: unknown = JSON.parse(JSON.stringify(root));
  expect(parsePreparedVideoReviewReplicaRoot(retained)).toEqual(root);
  expect(parsePreparedVideoReviewReplicaRoot(retained)).toEqual(root);
  expect(uuid).toHaveBeenCalledTimes(1);
});

it('requires exact original ref and actual published resource source associations', async () => {
  const wrongOriginal = fixture();
  wrongOriginal.refs.set('original', ref('unadmitted-original'));
  await expect(
    preparePortableVideoReviewRoot({ ...wrongOriginal, expectedLocalGeneration: 0 })
  ).rejects.toThrow('original differs');
  const sourceAlias = fixture();
  sourceAlias.dependencies[0]!.entry.source = {
    kind: 'project-asset',
    projectAssetId: 'another-source',
  };
  await expect(
    preparePortableVideoReviewRoot({ ...sourceAlias, expectedLocalGeneration: 0 })
  ).rejects.toThrow('original differs');
  const resourceAlias = fixture();
  resourceAlias.dependencies[1]!.entry.source = {
    kind: 'project-asset',
    projectAssetId: 'another-music',
  };
  await expect(
    preparePortableVideoReviewRoot({ ...resourceAlias, expectedLocalGeneration: 0 })
  ).rejects.toThrow('Borrowed portable review resource');
  const resourceBytes = fixture();
  resourceBytes.refs.set('music', ref('unadmitted-music', 'audio/mpeg'));
  await expect(
    preparePortableVideoReviewRoot({ ...resourceBytes, expectedLocalGeneration: 0 })
  ).rejects.toThrow('Borrowed portable review resource');
});

it('refuses absent resources, mismatched resource metadata and unsaved review state', async () => {
  const missing = fixture();
  missing.refs.delete('camera');
  await expect(
    preparePortableVideoReviewRoot({ ...missing, expectedLocalGeneration: 0 })
  ).rejects.toThrow('Verified resource is missing');
  const changed = fixture();
  changed.refs.set('camera', ref('local-camera', 'image/png'));
  await expect(
    preparePortableVideoReviewRoot({ ...changed, expectedLocalGeneration: 0 })
  ).rejects.toThrow('resource metadata differs');
  const unsaved = fixture();
  delete unsaved.metadata.videoReview!.workspace.project;
  await expect(
    preparePortableVideoReviewRoot({ ...unsaved, expectedLocalGeneration: 0 })
  ).rejects.toThrow('Unsupported portable video review');
});

it('rejects unqualified or incomplete carriers and records exact resource origin dependencies', async () => {
  const f = fixture(true);
  await expect(parsePortableSyncRoot(f.envelope)).rejects.toThrow();
  const missingObject = structuredClone(f.envelope);
  missingObject.objects = missingObject.objects.filter((object) => object.objectId !== 'camera');
  await expect(parsePortableSyncRoot(missingObject, f.sourceMediaId)).rejects.toThrow();
  const wrongThumbnail = structuredClone(f.envelope);
  wrongThumbnail.objects.find((object) => object.objectId === 'thumbnail')!.mimeType = 'video/webm';
  await expect(parsePortableSyncRoot(wrongThumbnail, f.sourceMediaId)).rejects.toThrow(
    'thumbnail requires image bytes'
  );
  const incomplete = structuredClone(f.envelope);
  if (!isRecord(incomplete.metadata) || !Array.isArray(incomplete.metadata['reviewAssets']))
    throw new Error('Missing fixture resource metadata.');
  incomplete.metadata['reviewAssets'].pop();
  await expect(parsePortableSyncRoot(incomplete, f.sourceMediaId)).rejects.toThrow();
  const origin = structuredClone(f.envelope);
  if (!isRecord(origin.metadata) || !Array.isArray(origin.metadata['reviewAssets']))
    throw new Error('Missing fixture resource metadata.');
  const camera: unknown = origin.metadata['reviewAssets'][0];
  if (!isRecord(camera) || !isRecord(camera['entry']))
    throw new Error('Missing fixture camera metadata.');
  camera['entry']['originMediaId'] = 'project-asset:origin';
  const parsed = await parsePortableSyncRoot(origin, f.sourceMediaId);
  expect(portableSyncDependencyIds(parsed)).toEqual(
    ['project-asset:music', 'project-asset:origin', f.sourceMediaId].sort()
  );
});

it('refuses malformed nested resource review associations', async () => {
  const f = fixture();
  if (!isRecord(f.envelope.metadata) || !Array.isArray(f.envelope.metadata['reviewAssets']))
    throw new Error('Missing fixture resource metadata.');
  const asset: unknown = f.envelope.metadata['reviewAssets'][0];
  if (!isRecord(asset)) throw new Error('Missing fixture asset.');
  asset['videoReview'] = { workspace: { aggregateId: 'project-asset:camera' }, draft: null };
  await expect(parsePortableSyncRoot(f.envelope, f.sourceMediaId)).rejects.toThrow();
});

it.each([false, true])(
  'remaps every nested sidecar after allocating the complete private ID map (cycle=%s)',
  async (cycle) => {
    const f = nestedMediaReviewFixture(cycle);
    const ids = [
      '00000000-0000-4000-8000-00000000000b',
      '00000000-0000-4000-8000-00000000000c',
    ] as const;
    vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce(ids[0]).mockReturnValueOnce(ids[1]);
    const refs = new Map(f.staged.map((object) => [object.objectId, object.ref]));
    const root = await preparePortableVideoReviewRoot({
      metadata: parsePortableMediaMetadata(f.metadata),
      sourceMediaId: f.rows.source.media.id,
      dependencies: [
        {
          entry: f.rows.source.media,
          ref: f.rows.source.ref,
          expectedGeneration: 1,
          expectedBasis: ['source'],
        },
      ],
      expectedLocalGeneration: 1,
      refFor: (id) => {
        const value = refs.get(id);
        if (!value) throw new Error('Missing fixture object.');
        return value;
      },
    });
    expect(root.assets.map((asset) => asset.entry.id)).toEqual(ids);
    expect(root.review.workspace.advanced.webcam?.assetId).toBe(`project-asset:${ids[0]}`);
    expect(root.assets[0]?.videoReview).toHaveProperty(
      'workspace.history.0.after.webcam.assetId',
      `project-asset:${ids[1]}`
    );
    expect(root.assets[0]?.videoReview?.draft?.annotation.text).toBe('Draft b');
    if (cycle)
      expect(root.assets[1]?.videoReview?.workspace.advanced.webcam?.assetId).toBe(
        `project-asset:${ids[0]}`
      );
    expect(parsePreparedVideoReviewReplicaRoot(JSON.parse(JSON.stringify(root)))).toEqual(root);
  }
);

it.each([false, true])(
  'prepares a recording review using the independent admitted original (archived=%s)',
  async (archived) => {
    const f = fixture(archived);
    const aggregateId = archived ? 'recording:quick-project:previous' : 'recording:saved-source';
    const recordingId = aggregateId.slice('recording:'.length);
    const { projectAsset: _projectAsset, ...carrier } = f.metadata;
    const metadata = parsePortableMediaMetadata({
      ...carrier,
      entry: {
        ...carrier.entry,
        kind: 'recording',
        id: aggregateId,
        source: { kind: 'recording', recordingId },
      },
      recording: {
        entry: {
          id: recordingId,
          filename: 'Saved.webm',
          createdAt: 1,
          size: 6,
          mimeType: 'video/webm',
        },
      },
      videoReview: encodePortableReviewAssetRefs({
        ...carrier.videoReview,
        workspace: { ...carrier.videoReview!.workspace, aggregateId },
        draft: carrier.videoReview!.draft ? { ...carrier.videoReview!.draft, aggregateId } : null,
      }),
    });
    const dependencies = f.dependencies.map((item, index) =>
      index === 0
        ? {
            ...item,
            entry: {
              ...item.entry,
              kind: 'recording' as const,
              id: 'recording:saved-source',
              source: { kind: 'recording' as const, recordingId: 'saved-source' },
            },
          }
        : item
    );
    const prepared = await preparePortableVideoReviewRoot({
      metadata,
      sourceMediaId: 'recording:saved-source',
      dependencies,
      expectedLocalGeneration: 0,
      refFor: f.refFor,
    });
    expect(prepared.review.workspace.aggregateId).toBe(aggregateId);
    expect(prepared.review.workspace.sourceAssetId).toBe(f.refs.get('original')!.assetId);
    expect(prepared.sourceMediaId).toBe('recording:saved-source');
    expect(prepared.assets).toHaveLength(2);
    await expect(
      preparePortableVideoReviewRoot({
        metadata,
        sourceMediaId: 'recording:saved-source',
        dependencies: f.dependencies,
        expectedLocalGeneration: 0,
        refFor: f.refFor,
      })
    ).rejects.toThrow('admitted source');
  }
);
