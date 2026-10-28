import { expect, it } from 'vitest';
import {
  createMediaLibraryEntry,
  createVideoProjectEntryWithMediaClip,
} from '../../composition/persistence/projects/index.test-support';
import { encodePortableVideoProjectAssetRefs } from '../media-hub-backup/v6/root-codecs/projects';
import { parseRootEnvelope } from '../media-hub-backup/v6/codec';
import { parsePortableMediaMetadata } from '../media-hub-backup/v6/root-codecs/media';
import { createSyncAttempt, parseSyncOperationText } from './wire-record';
import { projectSyncCatalog, syncCatalogRootKey, type CatalogAttempt } from './catalog-graph';

type Operation = CatalogAttempt['operation'];
const mediaId = 'project-asset:source';
const mediaKey = syncCatalogRootKey('media', mediaId);
const projectKey = syncCatalogRootKey('video-project', 'project');
const object = {
  objectId: 'sync-object-000001',
  path: '_sniptale/assets/sync-object-000001/original.png',
  filename: 'original.png',
  mimeType: 'image/png',
  size: 3,
};

function envelope(rootKind: Operation['rootKind'], rootId: string) {
  const sourceId = rootKind === 'media' ? rootId.slice('project-asset:'.length) : 'source';
  const project = createVideoProjectEntryWithMediaClip({ id: rootId });
  project.project.assets[0]!.source = { kind: 'project-asset', projectAssetId: 'source' };
  return parseRootEnvelope({
    descriptor: {
      rootKind,
      rootId,
      ...(rootKind === 'media' ? { mediaSubtype: 'library-item' } : {}),
      metadataPath: 'Metadata/sync-root.json',
      objectCount: 1,
      totalBytes: 3,
    },
    metadata:
      rootKind === 'media'
        ? {
            entry: createMediaLibraryEntry({
              id: rootId,
              filename: object.filename,
              source: { kind: 'project-asset', projectAssetId: sourceId },
              mimeType: object.mimeType,
              size: object.size,
              workspaceRevision: 0,
              lifecycle: { savedAt: 1, storageClass: 'library', updatedAt: 1 },
            }),
            originalObjectId: object.objectId,
            projectAsset: {
              id: sourceId,
              mimeType: object.mimeType,
              size: object.size,
              createdAt: 1,
            },
          }
        : {
            entry: { ...project, project: encodePortableVideoProjectAssetRefs(project.project) },
            projectAssets: [
              {
                entry: { id: 'source', mimeType: object.mimeType, size: object.size, createdAt: 1 },
                filename: object.filename,
                objectId: object.objectId,
                libraryMediaId: mediaId,
              },
            ],
            projectExports: [],
          },
    objects: [object],
  });
}

async function attempt(
  id: string,
  changes: Partial<Operation> = {},
  physical = 1
): Promise<CatalogAttempt> {
  const rootKind = changes.rootKind ?? 'media';
  const rootId = changes.rootId ?? mediaId;
  const kind = changes.kind ?? 'edit';
  const value = {
    format: 'sniptale-sync-operation',
    version: 1,
    spaceId: 'space',
    operationId: id,
    rootKind,
    rootId,
    kind,
    parents: [],
    dependencies: [],
    envelope: kind === 'delete' ? null : envelope(rootKind, rootId),
    objects: kind === 'delete' ? [] : [{ objectId: object.objectId, sha256: 'a'.repeat(64) }],
    ...changes,
  };
  const operationText = JSON.stringify(value);
  const operation = await parseSyncOperationText(operationText);
  const attemptId = `00000000-0000-0000-0000-${physical.toString().padStart(12, '0')}`;
  return { ...(await createSyncAttempt(operationText, attemptId)), operationText, operation };
}

it('deduplicates exact logical bytes and preserves sorted distinct physical alternatives', async () => {
  const first = await attempt('a', {}, 1);
  const second = await attempt('a', {}, 2);
  const graph = projectSyncCatalog('space', [second, first, second]);
  expect(graph.operations.get('a')!.attempts.map((entry) => entry.recordKey)).toEqual(
    [first.recordKey, second.recordKey].sort()
  );
  expect(graph.roots.get(mediaKey)).toMatchObject({
    heads: ['a'],
    blocked: false,
    deleted: false,
    conflict: false,
  });
  expect(graph).toEqual(projectSyncCatalog('space', [first, second]));
  const logical = graph.operations.get('a')!;
  expect(logical.attempts.every((physical) => physical.operation === logical.operation)).toBe(true);
});

it('produces the same complete graph for shuffled ancestors and concurrent heads', async () => {
  const a = await attempt('a');
  const b = await attempt('b', { parents: ['a'] });
  const c = await attempt('c', { parents: ['a'] });
  const graph = projectSyncCatalog('space', [a, b, c]);
  for (const records of [
    [c, a, b],
    [b, c, a],
    [c, b, a],
  ])
    expect(projectSyncCatalog('space', records)).toEqual(graph);
  expect(graph.roots.get(mediaKey)).toMatchObject({
    heads: ['b', 'c'],
    conflict: true,
    blocked: false,
  });
});

it('quarantines every contradictory identity variant and blocks every mentioned root in both orders', async () => {
  const first = await attempt('ambiguous');
  const other = await attempt('ambiguous', { rootId: 'project-asset:other' }, 2);
  const child = await attempt('child', { parents: ['ambiguous'] });
  const safe = await attempt('safe', { rootId: 'project-asset:safe' });
  for (const records of [
    [first, other, child, safe],
    [other, first, safe, child],
  ]) {
    const graph = projectSyncCatalog('space', records);
    expect(graph.quarantined).toEqual(['ambiguous']);
    expect(graph.pending).toEqual(['child']);
    expect([...graph.operations.keys()]).toEqual(['safe']);
    expect(graph.roots.get(mediaKey)?.blocked).toBe(true);
    expect(graph.roots.get(syncCatalogRootKey('media', 'project-asset:other'))?.blocked).toBe(true);
    expect(graph.roots.get(syncCatalogRootKey('media', 'project-asset:safe'))?.blocked).toBe(false);
  }
});

it('blocks an older head while a later parent is missing and admits its child after arrival', async () => {
  const a = await attempt('a');
  const b = await attempt('b', { parents: ['a'] });
  const c = await attempt('c', { parents: ['b'] });
  const incomplete = projectSyncCatalog('space', [a, c]);
  expect(incomplete.pending).toEqual(['c']);
  expect(incomplete.roots.get(mediaKey)).toMatchObject({ heads: ['a'], blocked: true });
  expect(projectSyncCatalog('space', [c, b, a]).roots.get(mediaKey)).toMatchObject({
    heads: ['c'],
    blocked: false,
  });
});

it('keeps cycles pending without suppressing an unrelated root', async () => {
  const a = await attempt('a', { parents: ['b'] });
  const b = await attempt('b', { parents: ['a'] });
  const safe = await attempt('safe', { rootId: 'project-asset:safe' });
  const graph = projectSyncCatalog('space', [b, safe, a]);
  expect(graph.pending).toEqual(['a', 'b']);
  expect(graph.roots.get(mediaKey)?.blocked).toBe(true);
  expect([...graph.operations.keys()]).toEqual(['safe']);
});

it('rejects foreign-root and foreign-space ancestry and keeps descendants pending', async () => {
  const parent = await attempt('parent', { rootId: 'project-asset:other' });
  const child = await attempt('child', { parents: ['parent'] });
  const descendant = await attempt('descendant', { parents: ['child'] });
  const foreign = await attempt('foreign', { spaceId: 'foreign' });
  const spaceChild = await attempt('space-child', { parents: ['foreign'] });
  const graph = projectSyncCatalog('space', [parent, child, descendant, foreign, spaceChild]);
  expect(graph.invalidOperations).toEqual(['child', 'foreign', 'space-child']);
  expect(graph.pending).toEqual(['descendant']);
  expect(graph.roots.get(mediaKey)?.blocked).toBe(true);
  expect(graph.roots.get(syncCatalogRootKey('media', 'project-asset:other'))?.blocked).toBe(false);
});

it('keeps deletion sticky through late edits until an explicit descendant restore', async () => {
  const a = await attempt('a');
  const deletion = await attempt('deletion', { kind: 'delete', parents: ['a'] });
  const late = await attempt('late', { parents: ['deletion'] });
  expect(projectSyncCatalog('space', [late, a, deletion]).roots.get(mediaKey)).toMatchObject({
    heads: ['late'],
    deleted: true,
  });
  const restore = await attempt('restore', { kind: 'restore', parents: ['late'] });
  const laterDelete = await attempt('later-delete', { kind: 'delete', parents: ['restore'] });
  expect(
    projectSyncCatalog('space', [restore, late, deletion, a]).roots.get(mediaKey)?.deleted
  ).toBe(false);
  expect(
    projectSyncCatalog('space', [laterDelete, restore, late, deletion, a]).roots.get(mediaKey)
      ?.deleted
  ).toBe(true);
});

it('preserves concurrent tombstones through partial restores until a restore covers both branches', async () => {
  const a = await attempt('a');
  const left = await attempt('left-delete', { kind: 'delete', parents: ['a'] });
  const right = await attempt('right-delete', { kind: 'delete', parents: ['a'] });
  const partialLeft = await attempt('left-restore', { kind: 'restore', parents: ['left-delete'] });
  const partialRight = await attempt('right-restore', {
    kind: 'restore',
    parents: ['right-delete'],
  });
  const records = [a, left, right, partialLeft, partialRight];
  for (const order of [records, [...records].reverse()])
    expect(projectSyncCatalog('space', order).roots.get(mediaKey)).toMatchObject({
      heads: ['left-restore', 'right-restore'],
      conflict: true,
      deleted: true,
    });
  const mergeEdit = await attempt('merge-edit', { parents: ['left-restore', 'right-restore'] });
  expect(projectSyncCatalog('space', [...records, mergeEdit]).roots.get(mediaKey)).toMatchObject({
    conflict: false,
    deleted: true,
  });
  const restore = await attempt('restore', { kind: 'restore', parents: ['merge-edit'] });
  expect(
    projectSyncCatalog('space', [restore, mergeEdit, ...records]).roots.get(mediaKey)
  ).toMatchObject({ heads: ['restore'], conflict: false, deleted: false });
});

it('requires a live unambiguous unchanged source for each project dependency', async () => {
  const project = await attempt('project-op', {
    rootKind: 'video-project',
    rootId: 'project',
    dependencies: [{ mediaId, basis: ['media-op'] }],
  });
  const media = await attempt('media-op');
  const updated = await attempt('media-updated', { parents: ['media-op'] });
  const concurrent = await attempt('media-concurrent');
  const missing = await attempt('media-pending', { parents: ['missing'] });
  const deleted = await attempt('media-deleted', { kind: 'delete', parents: ['media-op'] });
  expect(
    projectSyncCatalog('space', [project]).roots.get(projectKey)?.unavailableDependencies
  ).toEqual([mediaId]);
  expect(
    projectSyncCatalog('space', [project, media]).roots.get(projectKey)?.unavailableDependencies
  ).toEqual([]);
  expect(
    projectSyncCatalog('space', [project, media, updated]).roots.get(projectKey)
      ?.unavailableDependencies
  ).toEqual([]);
  for (const alternative of [concurrent, missing, deleted]) {
    const root = projectSyncCatalog('space', [project, media, alternative]).roots.get(projectKey);
    expect(root?.unavailableDependencies).toEqual([mediaId]);
    expect(root?.heads).toEqual(['project-op']);
  }
});

it('preserves the result of a long alternating delete and restore history in either order', async () => {
  const records = await Promise.all(
    Array.from({ length: 1000 }, (_, index) =>
      attempt(`operation-${index}`, {
        kind: index % 2 ? 'restore' : 'delete',
        parents: index ? [`operation-${index - 1}`] : [],
      })
    )
  );
  for (const order of [records, [...records].reverse()]) {
    const graph = projectSyncCatalog('space', order);
    expect(graph.operations.size).toBe(1000);
    expect(graph.pending).toEqual([]);
    expect(graph.roots.get(mediaKey)).toMatchObject({
      heads: ['operation-999'],
      deleted: false,
      conflict: false,
      blocked: false,
    });
  }
  const nextDelete = await attempt('operation-1000', {
    kind: 'delete',
    parents: ['operation-999'],
  });
  expect(projectSyncCatalog('space', [...records, nextDelete]).roots.get(mediaKey)?.deleted).toBe(
    true
  );
});

it('keeps a dependent project available after an original rename or tag edit', async () => {
  const source = await attempt('source-before');
  const root = envelope('media', mediaId);
  const metadata = parsePortableMediaMetadata(root.metadata);
  metadata.entry.filename = 'Renamed.png';
  metadata.entry.tags = ['Retained source'];
  metadata.entry.updatedAt += 1;
  const renamed = await attempt('source-renamed', {
    parents: ['source-before'],
    envelope: parseRootEnvelope({ ...root, metadata }),
  });
  const project = await attempt('dependent-project', {
    rootKind: 'video-project',
    rootId: 'project',
    dependencies: [{ mediaId, basis: ['source-before'] }],
  });
  const graph = projectSyncCatalog('space', [renamed, project, source]);
  expect(graph.roots.get(mediaKey)?.heads).toEqual(['source-renamed']);
  expect(graph.roots.get(projectKey)?.unavailableDependencies).toEqual([]);
});

it('refuses dependency advancement through changed bytes or a deleted source lifetime', async () => {
  const source = await attempt('source-before');
  const project = await attempt('dependent-project', {
    rootKind: 'video-project',
    rootId: 'project',
    dependencies: [{ mediaId, basis: ['source-before'] }],
  });
  const changed = await attempt('source-changed', {
    parents: ['source-before'],
    objects: [{ objectId: object.objectId, sha256: 'b'.repeat(64) }],
  });
  const changedBack = await attempt('source-changed-back', { parents: ['source-changed'] });
  const deleted = await attempt('source-deleted', { kind: 'delete', parents: ['source-before'] });
  const restored = await attempt('source-restored', {
    kind: 'restore',
    parents: ['source-deleted'],
  });
  for (const history of [[changed], [changed, changedBack], [deleted, restored]]) {
    expect(
      projectSyncCatalog('space', [source, project, ...history]).roots.get(projectKey)
        ?.unavailableDependencies
    ).toEqual([mediaId]);
  }
});

it('checks every merged dependency branch before accepting unchanged original bytes', async () => {
  const source = await attempt('source-before');
  const project = await attempt('dependent-project', {
    rootKind: 'video-project',
    rootId: 'project',
    dependencies: [{ mediaId, basis: ['source-before'] }],
  });
  const first = await attempt('source-first', { parents: ['source-before'] });
  const second = await attempt('source-second', { parents: ['source-before'] });
  const merged = await attempt('source-merged', { parents: ['source-first', 'source-second'] });
  expect(
    projectSyncCatalog('space', [source, project, first, second, merged]).roots.get(projectKey)
      ?.unavailableDependencies
  ).toEqual([]);
  const changedSecond = await attempt('source-second', {
    parents: ['source-before'],
    objects: [{ objectId: object.objectId, sha256: 'b'.repeat(64) }],
  });
  expect(
    projectSyncCatalog('space', [source, project, first, changedSecond, merged]).roots.get(
      projectKey
    )?.unavailableDependencies
  ).toEqual([mediaId]);
});

it('admits recording metadata and telemetry successors but refuses byte and lifetime changes', async () => {
  const recordingMediaId = 'recording:saved-source';
  const original = envelope('media', mediaId);
  const originalMetadata = parsePortableMediaMetadata(original.metadata);
  const recordingEnvelope = parseRootEnvelope({
    ...original,
    descriptor: { ...original.descriptor, rootId: recordingMediaId },
    metadata: {
      entry: {
        ...originalMetadata.entry,
        id: recordingMediaId,
        source: { kind: 'recording', recordingId: 'saved-source' },
      },
      originalObjectId: object.objectId,
      recording: {
        entry: {
          id: 'saved-source',
          filename: 'Original.png',
          createdAt: 1,
          mimeType: object.mimeType,
          size: object.size,
        },
      },
    },
  });
  const before = await attempt('recording-before', {
    rootId: recordingMediaId,
    envelope: recordingEnvelope,
  });
  const metadata = parsePortableMediaMetadata(recordingEnvelope.metadata);
  metadata.entry.filename = 'Renamed.png';
  metadata.entry.tags = ['Saved'];
  metadata.recording!.entry.filename = 'Renamed.png';
  metadata.recording!.telemetry = {
    recordingId: 'saved-source',
    createdAt: 1,
    updatedAt: 2,
    captureMode: null,
    viewport: null,
    cursorTrack: null,
    actionEvents: [],
    signals: [],
  };
  const updatedEnvelope = parseRootEnvelope({ ...recordingEnvelope, metadata });
  const updated = await attempt('recording-updated', {
    rootId: recordingMediaId,
    parents: ['recording-before'],
    envelope: updatedEnvelope,
  });
  const projectEntry = createVideoProjectEntryWithMediaClip({ id: 'project' });
  projectEntry.project.assets[0]!.source = { kind: 'library-asset', mediaId: recordingMediaId };
  const projectEnvelope = parseRootEnvelope({
    ...envelope('video-project', 'project'),
    metadata: {
      entry: {
        ...projectEntry,
        project: encodePortableVideoProjectAssetRefs(projectEntry.project),
      },
      projectAssets: [],
      projectExports: [],
    },
    descriptor: {
      ...envelope('video-project', 'project').descriptor,
      objectCount: 0,
      totalBytes: 0,
    },
    objects: [],
  });
  const project = await attempt('recording-consumer', {
    rootKind: 'video-project',
    rootId: 'project',
    envelope: projectEnvelope,
    objects: [],
    dependencies: [{ mediaId: recordingMediaId, basis: ['recording-before'] }],
  });
  expect(
    projectSyncCatalog('space', [before, updated, project]).roots.get(projectKey)
      ?.unavailableDependencies
  ).toEqual([]);
  const changed = await attempt('recording-changed', {
    rootId: recordingMediaId,
    parents: ['recording-updated'],
    envelope: updatedEnvelope,
    objects: [{ objectId: object.objectId, sha256: 'b'.repeat(64) }],
  });
  const changedBack = await attempt('recording-back', {
    rootId: recordingMediaId,
    parents: ['recording-changed'],
    envelope: updatedEnvelope,
  });
  const deleted = await attempt('recording-deleted', {
    rootId: recordingMediaId,
    parents: ['recording-updated'],
    kind: 'delete',
  });
  const restored = await attempt('recording-restored', {
    rootId: recordingMediaId,
    parents: ['recording-deleted'],
    kind: 'restore',
    envelope: updatedEnvelope,
  });
  const concurrent = await attempt('recording-concurrent', {
    rootId: recordingMediaId,
    envelope: updatedEnvelope,
  });
  for (const history of [[changed], [changed, changedBack], [deleted, restored], [concurrent]])
    expect(
      projectSyncCatalog('space', [before, updated, project, ...history]).roots.get(projectKey)
        ?.unavailableDependencies
    ).toEqual([recordingMediaId]);
});
