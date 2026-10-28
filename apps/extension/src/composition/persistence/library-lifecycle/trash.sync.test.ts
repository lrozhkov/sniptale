import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createReviewWorkspaceStoreFixture } from '../review-workspaces/store.test-support';
import {
  createMediaLibraryEntry,
  createProjectAssetEntry,
  createVideoProjectEntry,
} from '../projects/index.test-support';
import { updateMediaLibraryEntry, addMediaLibraryEntryTags } from '../media-library/index.library';
import { parseSyncCaptureRecord } from '../sync-capture/guards';
import type { CapturedChange } from '../sync-capture/contracts';
import { moveStoredItemsToTrash, restoreStoredItemsFromTrash } from './trash';

const io = vi.hoisted(() => ({ database: vi.fn() }));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: io.database,
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('chrome', undefined);
  vi.stubGlobal('navigator', {});
});
afterEach(() => vi.unstubAllGlobals());

function setup() {
  let captureWritesBeforeFailure: number | null = null;
  const fixture = createReviewWorkspaceStoreFixture((name) => {
    if (name !== 'sync_capture' || captureWritesBeforeFailure === null) return false;
    if (captureWritesBeforeFailure-- > 0) return false;
    captureWritesBeforeFailure = null;
    return true;
  });
  io.database.mockResolvedValue(fixture.database);
  const table = (name: string) => fixture.rows.get(name)!;
  table('sync_capture').set('profile', {
    version: 1,
    kind: 'profile',
    key: 'profile',
    createdAt: 1,
    enabled: true,
    spaceId: 'lifecycle-space',
    connectionGeneration: 1,
  });
  const lifecycle = { storageClass: 'library' as const, savedAt: 1, updatedAt: 1 };
  const image = createMediaLibraryEntry({
    id: 'image',
    kind: 'screenshot',
    source: { kind: 'screenshot' },
    mimeType: 'image/png',
    size: 8,
    blob: new Blob(['original'], { type: 'image/png' }),
    workspaceRevision: 0,
    imageContentState: 'original',
    lifecycle,
  });
  const ref = {
    assetId: 'original-bytes',
    createdAt: 1,
    location: { kind: 'opfs' as const, objectKey: 'objects/original-bytes' },
    mimeType: 'image/png',
    size: 8,
    sha256: null,
  };
  const child = createProjectAssetEntry({
    id: 'original',
    assetId: ref.assetId,
    size: 8,
    mimeType: ref.mimeType,
  });
  const original = createMediaLibraryEntry({
    id: 'project-asset:original',
    source: { kind: 'project-asset', projectAssetId: child.id },
    mimeType: ref.mimeType,
    size: ref.size,
    workspaceRevision: 0,
    imageContentState: 'original',
    lifecycle,
  });
  const project = createVideoProjectEntry({}, { lifecycle });
  table('media_library').set(image.id, image);
  table('media_library').set(original.id, original);
  table('project_assets').set(child.id, child);
  table('asset_refs').set(ref.assetId, ref);
  table('video_projects').set(project.id, project);
  const targets = [
    { kind: 'media' as const, id: image.id },
    { kind: 'media' as const, id: original.id },
    { kind: 'video-project' as const, id: project.id },
  ];
  const captures = (): CapturedChange[] =>
    [...table('sync_capture').values()]
      .map(parseSyncCaptureRecord)
      .filter(
        (row): row is CapturedChange => row?.kind === 'sync-operation' && row.phase === 'native'
      );
  return {
    ...fixture,
    table,
    image,
    original,
    project,
    targets,
    captures,
    failSecondCapture() {
      captureWritesBeforeFailure = 2;
    },
  };
}

it('captures Trash and restore once without releasing children', async () => {
  const data = setup();
  const children = structuredClone(data.table('project_assets'));
  const refs = structuredClone(data.table('asset_refs'));
  await moveStoredItemsToTrash(data.targets, 10);
  await moveStoredItemsToTrash(data.targets, 20);
  expect(data.captures()).toHaveLength(3);
  for (const capture of data.captures()) {
    const change = capture.change;
    if (change.kind === 'tombstone') throw new Error('Soft Trash must retain its after-image');
    const root = change.kind === 'video-project' ? change.rows.project : change.rows.media;
    expect(root.lifecycle).toMatchObject({ trashedAt: 10 });
  }
  await restoreStoredItemsFromTrash(data.targets, 30);
  await restoreStoredItemsFromTrash(data.targets, 40);
  expect(data.captures()).toHaveLength(6);
  for (const capture of data.captures().filter((row) => row.generation === 2)) {
    expect(capture.basis).toEqual([
      data.captures().find((row) => row.rootKey === capture.rootKey && row.generation === 1)!
        .operationId,
    ]);
    const change = capture.change;
    if (change.kind === 'tombstone') throw new Error('Restore must retain its after-image');
    const root = change.kind === 'video-project' ? change.rows.project : change.rows.media;
    expect(root.lifecycle).toEqual({ ...data.image.lifecycle, updatedAt: 30 });
  }
  expect(data.table('project_assets')).toEqual(children);
  expect(data.table('asset_refs')).toEqual(refs);
});

it('rolls back the entire mixed Trash batch and permits exact retry', async () => {
  const data = setup();
  const before = structuredClone(data.rows);
  data.failSecondCapture();
  await expect(moveStoredItemsToTrash(data.targets, 10)).rejects.toThrow('No space');
  expect(data.rows).toEqual(before);
  await moveStoredItemsToTrash(data.targets, 10);
  expect(data.captures()).toHaveLength(3);
  expect(data.captures().every((row) => row.generation === 1)).toBe(true);
});

it('serializes metadata and Trash into causal after-images', async () => {
  const data = setup();
  await updateMediaLibraryEntry(data.original.id, {
    filename: 'renamed.png',
    sourceTitle: 'New title',
  });
  await moveStoredItemsToTrash([data.targets[1]!], 10);
  const captures = data.captures().filter((row) => row.rootId === data.original.id);
  expect(captures).toHaveLength(2);
  const [first, second] = captures;
  expect(second!.basis).toEqual([first!.operationId]);
  expect(second!.change).toMatchObject({
    kind: 'media',
    rows: {
      media: {
        filename: 'renamed.png',
        sourceTitle: 'New title',
        lifecycle: { trashedAt: 10 },
      },
    },
  });
  await addMediaLibraryEntryTags(data.original.id, ['retained']);
  expect(data.captures().at(-1)?.change).toMatchObject({
    kind: 'media',
    rows: {
      media: {
        tags: ['retained'],
        lifecycle: { trashedAt: 10 },
      },
    },
  });
  expect(data.table('asset_refs').size).toBe(1);
});

it('preserves local-only and temporary roots without validating unsupported graphs', async () => {
  const data = setup();
  data.table('sync_capture').delete('profile');
  await moveStoredItemsToTrash(data.targets, 10);
  expect(data.captures()).toHaveLength(0);
  const temporary = setup();
  temporary.table('media_library').set(temporary.original.id, {
    ...temporary.original,
    lifecycle: { storageClass: 'temporary', savedAt: null, updatedAt: 1 },
  });
  temporary.table('video_projects').set(temporary.project.id, {
    ...temporary.project,
    lifecycle: { storageClass: 'temporary', savedAt: null, updatedAt: 1 },
  });
  temporary.table('project_assets').clear();
  await moveStoredItemsToTrash(temporary.targets.slice(1), 10);
  await restoreStoredItemsFromTrash(temporary.targets.slice(1), 20);
  expect(temporary.captures()).toHaveLength(0);
});

it('rolls back original metadata when capture fails and retries without changing bytes', async () => {
  const data = setup();
  const before = structuredClone(data.rows);
  data.failSecondCapture();
  // A native capture uses two writes; the following command exhausts the staged budget.
  await updateMediaLibraryEntry(data.original.id, { filename: 'first.png' });
  const committed = structuredClone(data.rows);
  await expect(
    updateMediaLibraryEntry(data.original.id, { filename: 'retry.png' })
  ).rejects.toThrow('No space');
  expect(data.rows).toEqual(committed);
  await updateMediaLibraryEntry(data.original.id, { filename: 'retry.png' });
  expect(data.captures()).toHaveLength(2);
  expect(data.table('project_assets')).toEqual(before.get('project_assets'));
  expect(data.table('asset_refs')).toEqual(before.get('asset_refs'));
  const prior = data.captures().length;
  await addMediaLibraryEntryTags(data.original.id, ['same']);
  await addMediaLibraryEntryTags(data.original.id, ['same']);
  expect(data.captures()).toHaveLength(prior + 1);
});
