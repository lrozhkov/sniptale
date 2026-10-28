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
