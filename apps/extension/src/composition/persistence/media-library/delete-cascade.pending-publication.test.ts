import {
  EFFECT_BUNDLE_CORPUS,
  readEffectBundleCorpusArchive,
} from '../../../../../../tooling/test/support/effect-v1-corpus.test-support';
import { importEffectBundleZip } from '../../../features/video/project/effect-bundle/import/zip';
import { parseVideoProjectEntry, parseVideoProjectMetadataEntry } from '../projects/read-guards';
import {
  parsePreparedVideoProjectReplicaRoot,
  type PreparedVideoProjectReplicaRoot,
} from '../sync-capture/prepared-project';
import type { AssetRef } from '../assets';
import { expect, it } from 'vitest';
import type { MediaAssetSource } from './contracts';
import {
  createMediaLibraryEntry,
  createVideoProjectEntryWithMediaClip,
} from '../projects/index.test-support';

it.each([
  {
    source: { kind: 'recording', recordingId: 'record' },
    domain: 'recording-assets',
    payload: { entries: [{ id: 'record' }] },
    unrelated: { entries: [{ id: 'other' }] },
  },
  {
    source: { kind: 'project-asset', projectAssetId: 'asset' },
    domain: 'project-assets',
    payload: { entry: { id: 'asset' } },
    unrelated: { entry: { id: 'other' } },
  },
  {
    source: { kind: 'project-export', exportId: 'export', projectId: 'p' },
    domain: 'project-exports',
    payload: { entry: { id: 'export' } },
    unrelated: { entry: { id: 'other' } },
  },
  {
    source: { kind: 'web-snapshot', snapshotId: 'snapshot' },
    domain: 'web-snapshot-assets',
    payload: { snapshot: { id: 'snapshot' } },
    unrelated: { snapshot: { id: 'other' } },
  },
] satisfies Array<{
  source: MediaAssetSource;
  domain: string;
  payload: object;
  unrelated: object;
}>)(
  'prevents publication resurrection for $source.kind',
  async ({ source, domain, payload, unrelated }) => {
    const { mediaHasPendingPublication } = await import('./delete-cascade.sources');
    const target = { id: 'root', source };
    expect(mediaHasPendingPublication({ domain, payload }, target)).toBe(true);
    expect(mediaHasPendingPublication({ domain, payload: {} }, target)).toBe(true);
    expect(mediaHasPendingPublication({ domain, payload: unrelated }, target)).toBe(false);
  }
);

it('recognizes exact sync replica media targets and project dependency claims', async () => {
  const { mediaHasPendingPublication } = await import('./delete-cascade.sources');
  const target = { id: 'project-asset:target' };
  expect(
    mediaHasPendingPublication(
      {
        domain: 'sync-replica',
        payload: {
          kind: 'media',
          input: { rows: { media: { id: target.id } } },
        },
      },
      target
    )
  ).toBe(true);
  const media = createMediaLibraryEntry({
    id: 'project-asset:disjoint',
    source: { kind: 'project-asset', projectAssetId: 'disjoint' },
    mimeType: 'image/png',
    size: 6,
    lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 1 },
  });
  const ref = {
    assetId: 'disjoint-body',
    sha256: null,
    createdAt: 1,
    location: { kind: 'opfs', objectKey: 'objects/disjoint-body' },
    mimeType: 'image/png',
    size: 6,
  };
  expect(
    mediaHasPendingPublication(
      {
        domain: 'sync-replica',
        payload: {
          kind: 'media',
          input: {
            rows: {
              media,
              ref,
              projectAsset: {
                id: 'disjoint',
                assetId: ref.assetId,
                mimeType: ref.mimeType,
                size: ref.size,
                createdAt: 1,
              },
            },
          },
        },
      },
      target
    )
  ).toBe(false);
  const entry = createVideoProjectEntryWithMediaClip({ id: 'incoming-project' });
  entry.project.assets[0]!.source = { kind: 'library-asset', mediaId: target.id };
  const project = {
    kind: 'video-project',
    input: { root: { entry, assets: [] }, dependencies: [] },
  };
  expect(mediaHasPendingPublication({ domain: 'sync-replica', payload: project }, target)).toBe(
    true
  );
  entry.project.assets[0]!.source = { kind: 'library-asset', mediaId: 'disjoint' };
  expect(mediaHasPendingPublication({ domain: 'sync-replica', payload: project }, target)).toBe(
    false
  );
  expect(
    mediaHasPendingPublication(
      {
        domain: 'sync-replica',
        payload: {
          ...project,
          input: { ...project.input, dependencies: [{ entry: { id: target.id } }] },
        },
      },
      target
    )
  ).toBe(true);
});

it('fails closed for malformed sync replica root or dependency evidence', async () => {
  const { mediaHasPendingPublication } = await import('./delete-cascade.sources');
  const entry = createVideoProjectEntryWithMediaClip({ id: 'incoming-project' });
  for (const payload of [
    null,
    {},
    { kind: 'media', input: {} },
    { kind: 'video-project', input: { root: { entry, assets: [] } } },
    { kind: 'video-project', input: { root: { entry, assets: [] }, dependencies: [null] } },
  ])
    expect(mediaHasPendingPublication({ domain: 'sync-replica', payload }, { id: 'target' })).toBe(
      true
    );
});

it('matches native prepared image publication and refuses an unknown target', async () => {
  const { mediaHasPendingPublication } = await import('./delete-cascade.sources');
  const journal = {
    domain: 'sync-replica',
    payload: { kind: 'image', input: { media: { id: 'image-one' } } },
  };
  expect(mediaHasPendingPublication(journal, { id: 'image-one' })).toBe(true);
  expect(mediaHasPendingPublication(journal, { id: 'image-two' })).toBe(false);
  expect(
    mediaHasPendingPublication(
      { ...journal, payload: { kind: 'image', input: {} } },
      { id: 'image-two' }
    )
  ).toBe(true);
});

async function stagedEffectProjectJournal() {
  const corpus = EFFECT_BUNDLE_CORPUS.find(
    ({ accepted, artifact }) => accepted && artifact.includes('asset-bearing-conformance')
  );
  if (!corpus) throw new Error('Expected asset-bearing effect corpus');
  const imported = await importEffectBundleZip(readEffectBundleCorpusArchive(corpus));
  if (!imported.ok) throw new Error('Expected accepted effect corpus');
  const document = imported.bundle.documents[0]!;
  const entry = createVideoProjectEntryWithMediaClip({ id: 'pending-effect-project' });
  const material = entry.project.assets[0]!;
  if (material.source.kind !== 'project-asset') throw new Error('Expected private source material');
  const privateId = material.source.projectAssetId;
  const libraryId = 'retained-library-source';
  const originMediaId = 'retained-private-origin';
  const snapshotId = `effect:${document.sha256}`;
  const reference = (assetId: string, mimeType: string, size: number): AssetRef => ({
    assetId,
    mimeType,
    size,
    createdAt: 1,
    sha256: null,
    location: { kind: 'opfs', objectKey: `objects/${assetId}` },
  });
  const sourceRef = reference(
    'pending-private-source',
    material.metadata.mimeType,
    material.metadata.size
  );
  const root: PreparedVideoProjectReplicaRoot = {
    entry: {
      ...entry,
      project: {
        ...entry.project,
        assets: [
          ...entry.project.assets,
          {
            ...material,
            id: 'library-material',
            source: { kind: 'library-asset', mediaId: libraryId },
          },
        ],
        effectSnapshots: [
          {
            assets: document.assets.map((asset) => ({
              id: asset.id,
              kind: asset.kind,
              mimeType: asset.mimeType,
              byteLength: asset.byteLength,
              sha256: asset.sha256,
            })),
            documentId: document.document.id,
            id: snapshotId,
            kind: document.document.kind,
            retainedByteLength:
              new TextEncoder().encode(document.source).byteLength +
              document.assets.reduce((total, asset) => total + asset.byteLength, 0),
            schemaVersion: 'sniptale.effect.v1',
            sha256: document.sha256,
            source: document.source,
          },
        ],
      },
    },
    assets: [
      {
        entry: {
          id: privateId,
          assetId: sourceRef.assetId,
          size: sourceRef.size,
          mimeType: sourceRef.mimeType,
          createdAt: 1,
          originMediaId,
        },
        filename: 'private.webm',
        publishToLibrary: false,
        ref: sourceRef,
      },
    ],
    snapshotRefs: document.assets.map((asset, index) => ({
      snapshotId,
      assetId: asset.id,
      ref: reference(`pending-effect-${index}`, asset.mimeType, asset.byteLength),
    })),
  };
  const jsonRoot: unknown = JSON.parse(JSON.stringify(root));
  const parsed = parsePreparedVideoProjectReplicaRoot(jsonRoot);
  expect(parseVideoProjectMetadataEntry(parsed.entry)).not.toBeNull();
  expect(parseVideoProjectEntry(parsed.entry)).toBeNull();
  expect(parsed.entry.project.effectSnapshots![0]!.assets.length).toBeGreaterThan(0);
  expect(
    parsed.entry.project.effectSnapshots![0]!.assets.every((asset) => !Object.hasOwn(asset, 'blob'))
  ).toBe(true);
  return {
    libraryId,
    originMediaId,
    privateMediaId: `project-asset:${privateId}`,
    journal: {
      domain: 'sync-replica' as const,
      payload: {
        kind: 'video-project',
        input: {
          root: parsed,
          dependencies: [],
          operationId: 'pending-effect-operation',
          sourceDigest: 'a'.repeat(64),
          spaceId: 'pending-effect-space',
          profileCreatedAt: 1,
          connectionGeneration: 1,
          expectedBasis: [],
          expectedLocalGeneration: 0,
          expectedWorkspaceRevision: null,
        },
      },
    },
  };
}

it('retains related sources without globally blocking disjoint media for valid staged effect metadata', async () => {
  const { mediaHasPendingPublication } = await import('./delete-cascade.sources');
  const data = await stagedEffectProjectJournal();
  for (const id of [data.libraryId, data.privateMediaId, data.originMediaId]) {
    expect(mediaHasPendingPublication(data.journal, { id })).toBe(true);
  }
  expect(mediaHasPendingPublication(data.journal, { id: 'disjoint-media' })).toBe(false);
});

it('fails closed for malformed staged effect project metadata', async () => {
  const { mediaHasPendingPublication } = await import('./delete-cascade.sources');
  const data = await stagedEffectProjectJournal();
  const malformed = {
    ...data.journal,
    payload: {
      ...data.journal.payload,
      input: {
        ...data.journal.payload.input,
        root: {
          ...data.journal.payload.input.root,
          entry: { ...data.journal.payload.input.root.entry, workspaceRevision: -1 },
        },
      },
    },
  };
  expect(() => parsePreparedVideoProjectReplicaRoot(malformed.payload.input.root)).toThrow();
  expect(mediaHasPendingPublication(malformed, { id: 'disjoint-media' })).toBe(true);
});
