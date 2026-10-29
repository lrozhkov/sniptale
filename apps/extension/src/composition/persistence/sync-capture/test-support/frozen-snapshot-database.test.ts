import { expect, it, vi } from 'vitest';
import type { CapturedVideoProjectRows } from '../contracts';
import {
  createProjectAssetEntry,
  createProjectExportEntry,
  createVideoProjectEntryWithMediaClip,
} from '../../projects/index.test-support';
import { createArchivePathAllocator } from '../../../archive-transfer';
import { buildVideoProjectRootInventory } from '../../../../workflows/media-hub-backup/v6/inventory/video-projects';
import { createMediaHubBackupExportOptions } from '../../../../workflows/media-hub-backup/v6/options';
import { readVideoReviewForBackup } from '../../review-workspaces/backup-restore';
import { createFrozenSnapshotDatabase } from '../../../../workflows/sync-transfer/captured-project';

const files = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('../../assets/opfs-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../assets/opfs-store')>()),
  readAssetFile: files.read,
}));

function capturedRows(): CapturedVideoProjectRows {
  const project = createVideoProjectEntryWithMediaClip({ name: 'Frozen revision N' });
  const asset = createProjectAssetEntry({
    id: 'project-asset-1',
    mimeType: 'video/webm',
    size: 1024,
  });
  const exported = createProjectExportEntry({ projectId: project.id });
  return {
    project,
    assets: [asset],
    exports: [exported],
    media: [],
    refs: [asset, exported].map((entry) => ({
      assetId: entry.assetId,
      createdAt: entry.createdAt,
      location: { kind: 'opfs', objectKey: `objects/${entry.assetId}` },
      mimeType: entry.mimeType ?? 'video/webm',
      sha256: null,
      size: entry.size,
    })),
  };
}

it('reuses the actual video inventory from frozen native rows and declared empty sidecars', async () => {
  const rows = capturedRows();
  const frozen = createFrozenSnapshotDatabase(rows);
  files.read.mockImplementation(
    async (ref: { size: number }, filename: string) =>
      new File([new Uint8Array(ref.size)], filename, { type: 'video/webm' })
  );
  rows.project.project.name = 'Live revision N plus one';
  rows.assets.length = 0;
  const roots = await buildVideoProjectRootInventory({
    db: frozen,
    paths: createArchivePathAllocator(),
    options: createMediaHubBackupExportOptions({ includeDrafts: true }),
  });
  expect(roots).toHaveLength(1);
  const materialized = await roots[0]!.load();
  expect(JSON.stringify(materialized.metadata)).toContain('Frozen revision N');
  expect(JSON.stringify(materialized.metadata)).not.toContain('Live revision N plus one');
  expect(materialized.objects.map((object) => object.blob.size)).toEqual([1024, 55]);
  await expect(
    readVideoReviewForBackup({
      db: frozen,
      aggregateId: 'project-asset:project-asset-1',
      sourceAssetId: 'asset-object-1',
    })
  ).resolves.toBeUndefined();
});

it('returns isolated clones without accepting reads outside the captured graph', async () => {
  const rows = capturedRows();
  const frozen = createFrozenSnapshotDatabase(rows);
  const first = await frozen.getAll('video_projects');
  first.length = 0;
  expect(await frozen.getAll('video_projects')).toHaveLength(1);
  await expect(
    frozen.get('media_library', 'project-asset:project-asset-1')
  ).resolves.toBeUndefined();
  await expect(frozen.get('asset_refs', 'missing-live-asset')).rejects.toThrow(
    'key is unsupported'
  );
  await expect(frozen.get('video_projects', { toString: () => rows.project.id })).rejects.toThrow();
  const recordings = await frozen.getAll('recordings');
  expect(recordings).toEqual([]);
  recordings.push({ id: 'outside-capture' });
  expect(await frozen.getAll('recordings')).toEqual([]);
  await expect(frozen.get('recordings', 'outside-capture')).rejects.toThrow('key is unsupported');
  await expect(frozen.getAllFromIndex('project_exports', 'createdAt', 300)).rejects.toThrow();
  await expect(
    frozen.getAllFromIndex('project_exports', 'projectId', 'another-project')
  ).rejects.toThrow();
  await expect(frozen.get('aggregate_presentations', ['image', rows.project.id])).rejects.toThrow();
});

it('restricts readonly review transactions to their declared frozen stores indices and keys', async () => {
  const frozen = createFrozenSnapshotDatabase(capturedRows());
  expect(() => frozen.transaction(['recordings'], 'readonly')).toThrow(
    'transaction is unsupported'
  );
  expect(() => frozen.transaction([], 'readonly')).toThrow('transaction is unsupported');
  const tx = frozen.transaction(['video_workspaces', 'video_workspace_history'], 'readonly');
  expect(() => tx.objectStore('video_workspace_drafts')).toThrow('outside the transaction');
  await expect(tx.objectStore('video_workspaces').get('uncaptured-review')).rejects.toThrow();
  await expect(
    tx
      .objectStore('video_workspace_history')
      .index('wrong-index')
      .getAll('project-asset:project-asset-1')
  ).rejects.toThrow();
  await expect(
    tx
      .objectStore('video_workspace_history')
      .index('aggregateId')
      .getAll('project-asset:project-asset-1')
  ).resolves.toEqual([]);
  await expect(tx.done).resolves.toBeUndefined();
});
