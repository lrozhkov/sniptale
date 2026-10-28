import { beforeEach, expect, it, vi } from 'vitest';
import { createProjectExportEntry } from '../../composition/persistence/projects/index.test-support';

import type { AssetRef } from '../../composition/persistence/assets';

import { encodeCapturedPortableRoot } from './captured-root';
import {
  parsePortableSyncRoot,
  portableSyncDependencyIds,
  portableSyncEditingObjectIds,
  preparePortableReplica,
} from './prepared-root';
import { parsePortableVideoProjectMetadata } from '../media-hub-backup/v6/root-codecs/projects';
import { encodePortableReviewAssetRefs } from '../../composition/persistence/review-workspaces/asset-refs';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import { workspace as reviewWorkspace } from '../../composition/persistence/review-workspaces/backup-restore.test-support';
import { parseVideoWorkspace } from '../../composition/persistence/review-workspaces/parser';
import { materializeVideoWorkspaceProject } from '../../composition/persistence/review-workspaces/project-metadata';
import type { CapturedVideoReviewRows } from '../../composition/persistence/sync-capture/review-snapshot';
import type { PortableVideoReview } from '../../composition/persistence/review-workspaces/backup-restore';

import { nestedMediaReviewFixture } from '../media-hub-backup/v6/root-publication/media.review-assets.test-support';

import { ref, mediaRows, capture, admission, projectRows } from './portable-root.test-support';

const io = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('../../composition/persistence/assets', async (original) => ({
  ...(await original<typeof import('../../composition/persistence/assets')>()),
  readAssetFile: io.read,
}));
beforeEach(() => {
  vi.clearAllMocks();
  io.read.mockImplementation(
    async (ref: AssetRef, name: string) =>
      new File([new Uint8Array(ref.size)], name, { type: ref.mimeType })
  );
});
function portableReview(aggregateId: string, resource: string) {
  const advanced = createQuickEditAdvancedState();
  advanced.audio.music = [
    {
      id: 'music',
      assetId: `project-asset:${resource}`,
      timelineStart: 0,
      sourceOffset: 0,
      duration: 2,
      volume: 1,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
    },
  ];
  const review: PortableVideoReview = {
    workspace: {
      aggregateId,
      formatVersion: 1,
      revision: 1,
      cursor: 0,
      history: [],
      advanced,
      source: { duration: 2, width: 640, height: 360, size: 1024, mimeType: 'video/webm' },
      createdAt: 1,
      updatedAt: 1,
    },
    draft: null,
  };
  return encodePortableReviewAssetRefs(review);
}

function reviewRows(archived: boolean): CapturedVideoReviewRows {
  const source = mediaRows();
  source.media.kind = 'video';
  const original = source.ref;
  const aggregateId = archived ? 'project-asset:quick-project:previous' : source.media.id;
  const resourceRef = { ...ref('music-bytes'), mimeType: 'audio/mpeg' };
  const advanced = createQuickEditAdvancedState();
  advanced.audio.music = [
    {
      id: 'music',
      assetId: 'project-asset:music',
      timelineStart: 0,
      sourceOffset: 0,
      duration: 2,
      volume: 1,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
    },
  ];
  const workspace = parseVideoWorkspace({
    ...reviewWorkspace,
    aggregateId,
    ...(archived ? { sourceMediaId: source.media.id } : {}),
    sourceAssetId: original.assetId,
    source: { ...reviewWorkspace.source, size: original.size },
    advanced,
  });
  if (!workspace) throw new Error('Invalid captured review fixture.');
  return {
    source,
    review: { workspace: materializeVideoWorkspaceProject(workspace, 'Saved review'), draft: null },
    assets: [
      {
        id: 'music',
        assetId: resourceRef.assetId,
        createdAt: 1,
        size: resourceRef.size,
        mimeType: resourceRef.mimeType,
      },
    ],
    refs: [resourceRef],
    media: [],
    privateReviews: [],
  };
}

it.each([false, true])(
  'preserves the complete nested private closure through real encoding and replica preparation (cycle=%s)',
  async (cycle) => {
    const { rows } = nestedMediaReviewFixture(cycle);
    const encoded = await encodeCapturedPortableRoot(
      capture({
        kind: 'video-review',
        rows,
        mediaDependencies: [{ mediaId: rows.source.media.id, generation: 1, basis: ['source'] }],
      })
    );
    const local = admission();
    local.dependencies = [
      {
        entry: rows.source.media,
        ref: rows.source.ref,
        expectedGeneration: 1,
        expectedBasis: ['source'],
      },
    ];
    if (!encoded.reviewSourceMediaId) throw new Error('Review source binding is missing.');
    const payload = await preparePortableReplica({
      envelope: encoded.envelope,
      reviewSourceMediaId: encoded.reviewSourceMediaId,
      verifiedObjects: new Map(encoded.bindings.map((binding) => [binding.objectId, binding.ref])),
      senderDependencies: encoded.dependencies,
      admission: local,
    });
    if (payload.kind !== 'video-review') throw new Error('Expected review replica.');
    expect(payload.input.root.assets.map((asset) => asset.entry.id)).toEqual(['b', 'c']);
    expect(payload.input.root.assets[0]?.videoReview).toHaveProperty(
      'workspace.history.0.after.webcam.assetId',
      'project-asset:c'
    );
    if (cycle)
      expect(payload.input.root.assets[1]?.videoReview?.workspace.advanced.webcam?.assetId).toBe(
        'project-asset:b'
      );
    expect(payload.input.root.assets[1]?.videoReview?.draft?.annotation.text).toBe('Draft c');
  }
);

it.each([false, true])(
  'prepares an independent review using the real source dependency (archived=%s)',
  async (archived) => {
    const rows = reviewRows(archived);
    const encoded = await encodeCapturedPortableRoot(
      capture({
        kind: 'video-review',
        rows,
        mediaDependencies: [{ mediaId: rows.source.media.id, generation: 1, basis: ['source-op'] }],
      })
    );
    expect(encoded.reviewSourceMediaId).toBe(rows.source.media.id);
    const parsed = await parsePortableSyncRoot(encoded.envelope, encoded.reviewSourceMediaId);
    if (parsed.kind !== 'video-review') throw new Error('Expected portable review.');
    expect(portableSyncDependencyIds(parsed)).toEqual([rows.source.media.id]);
    expect(new Set(portableSyncEditingObjectIds(parsed))).toEqual(
      new Set(encoded.envelope.objects.map((object) => object.objectId))
    );
    const original = ref('target-original');
    const verifiedObjects = new Map(
      encoded.envelope.objects.map((object): [string, AssetRef] => [
        object.objectId,
        object.objectId === parsed.metadata.originalObjectId
          ? original
          : { ...ref('received-music'), mimeType: object.mimeType, size: object.size },
      ])
    );
    const local = admission();
    local.dependencies = [
      {
        entry: rows.source.media,
        ref: original,
        expectedGeneration: 7,
        expectedBasis: ['source-op'],
      },
    ];
    const payload = await preparePortableReplica({
      envelope: encoded.envelope,
      reviewSourceMediaId: parsed.sourceMediaId,
      verifiedObjects,
      senderDependencies: encoded.dependencies,
      admission: local,
    });
    if (payload.kind !== 'video-review') throw new Error('Expected review replica.');
    expect(payload.input.root.sourceMediaId).toBe(rows.source.media.id);
    expect(payload.input.root.review.workspace.sourceAssetId).toBe(original.assetId);
    expect(payload.input.root.review.workspace.sourceMediaId).toBe(
      archived ? rows.source.media.id : undefined
    );
    expect(payload.input.root.assets.map((asset) => asset.entry.id)).toEqual(['music']);
    expect(payload.input.root).not.toHaveProperty('source');
    expect(payload.input.dependencies).toEqual(local.dependencies);
    local.dependencies[0]!.expectedBasis = ['different-source'];
    await expect(
      preparePortableReplica({
        envelope: encoded.envelope,
        reviewSourceMediaId: parsed.sourceMediaId,
        verifiedObjects,
        senderDependencies: encoded.dependencies,
        admission: local,
      })
    ).rejects.toThrow('causal dependency');
    await expect(parsePortableSyncRoot(encoded.envelope)).rejects.toThrow();
  }
);

it('publishes only the editing source-review closure and excludes export-only review dependencies', async () => {
  const encoded = await encodeCapturedPortableRoot(
    capture({ kind: 'video-project', rows: projectRows() })
  );
  const metadata = parsePortableVideoProjectMetadata(encoded.envelope.metadata);
  const source = metadata.projectAssets[0]!;
  source.videoReview = portableReview(`project-asset:${source.entry.id}`, 'editing-audio');
  const original = encoded.envelope.objects[0]!;
  const objects = ['editing-audio', 'export-only', 'saved-export'].map((objectId) => ({
    ...original,
    objectId,
    filename: 'source.webm',
    path: `_sniptale/assets/${objectId}/source.webm`,
  }));
  metadata.projectAssets.push(
    {
      entry: { id: 'editing-audio', mimeType: 'video/webm', size: 1024, createdAt: 1 },
      filename: 'editing.webm',
      objectId: 'editing-audio',
      publishToLibrary: false,
    },
    {
      entry: { id: 'export-only', mimeType: 'video/webm', size: 1024, createdAt: 1 },
      filename: 'export-only.webm',
      objectId: 'export-only',
      libraryMediaId: 'project-asset:export-only',
    }
  );
  const { assetId: _assetId, ...exported } = createProjectExportEntry({
    id: 'saved',
    projectId: metadata.entry.id,
    assetId: 'sender-export',
    size: 1024,
    mimeType: 'video/webm',
    filename: 'saved.webm',
  });
  metadata.projectExports.push({
    entry: exported,
    objectId: 'saved-export',
    videoReview: portableReview('export:saved', 'export-only'),
  });
  const envelope = {
    ...encoded.envelope,
    metadata: JSON.parse(JSON.stringify(metadata)),
    objects: [...encoded.envelope.objects, ...objects],
    descriptor: { ...encoded.envelope.descriptor, objectCount: 4, totalBytes: 4096 },
  };
  const parsed = await parsePortableSyncRoot(envelope);
  expect(portableSyncDependencyIds(parsed)).toEqual([]);
  expect(portableSyncEditingObjectIds(parsed)).toEqual([source.objectId, 'editing-audio']);
  const context = { ...admission(), expectedLocalGeneration: 1, expectedBasis: ['old-project'] };
  const verifiedObjects = new Map([
    [source.objectId, ref('source-target')],
    ['editing-audio', ref('audio-target')],
  ]);
  const payload = await preparePortableReplica({
    envelope,
    verifiedObjects,
    senderDependencies: [],
    admission: context,
  });
  if (payload.kind !== 'video-project') throw new Error('Expected project.');
  expect(payload.input.root.assets).toHaveLength(2);
  expect(payload.input.root.assets.some((asset) => asset.entry.id === 'export-only')).toBe(false);
  const audio = payload.input.root.assets.find((asset) => asset.ref.assetId === 'audio-target')!;
  const restored = payload.input.root.assets.find(
    (asset) => asset.ref.assetId === 'source-target'
  )!;
  expect(restored.videoReview!.workspace.advanced.audio.music[0]!.assetId).toBe(
    `project-asset:${audio.entry.id}`
  );
  expect(restored.videoReview!.workspace.aggregateId).toBe(`project-asset:${restored.entry.id}`);
  expect(payload.input.dependencies).toEqual([]);
  verifiedObjects.delete('editing-audio');
  await expect(
    preparePortableReplica({
      envelope,
      verifiedObjects,
      senderDependencies: [],
      admission: context,
    })
  ).rejects.toThrow('binding');
});
