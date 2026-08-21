import { describe, expect, it, vi } from 'vitest';
import { createArchivePathAllocator } from '../../../../composition/archive-transfer';
import { createVideoProjectEntry } from '../../../../composition/persistence/projects/index.test-support';
import { createScenarioProjectV3 } from '../../../../features/scenario/project/v3';
import { createMediaHubBackupExportOptions } from '../options';
import { buildScenarioProjectRootInventory } from './scenario-projects';
import { buildVideoProjectRootInventory } from './video-projects';

function database(rows: unknown[]) {
  return {
    get: vi.fn(async () => undefined),
    getAll: vi.fn(async () => rows),
    getAllFromIndex: vi.fn(async () => []),
  };
}

describe('project draft archive inventory', () => {
  it('includes a temporary video project only when drafts are requested', async () => {
    const entry = createVideoProjectEntry(
      {},
      {
        lifecycle: { savedAt: null, storageClass: 'temporary', updatedAt: 10 },
      }
    );
    const db = database([entry]);
    await expect(
      buildVideoProjectRootInventory({
        db,
        options: createMediaHubBackupExportOptions(),
        paths: createArchivePathAllocator(),
      })
    ).resolves.toEqual([]);
    const [root] = await buildVideoProjectRootInventory({
      db,
      options: createMediaHubBackupExportOptions({ includeDrafts: true }),
      paths: createArchivePathAllocator(),
    });
    expect(root?.summary.draftCount).toBe(1);
  });

  it('includes a temporary scenario project only when drafts are requested', async () => {
    const project = createScenarioProjectV3('Draft scenario');
    const entry = {
      createdAt: project.createdAt,
      id: project.id,
      lifecycle: { savedAt: null, storageClass: 'temporary' as const, updatedAt: 10 },
      project,
      updatedAt: project.updatedAt,
      workspaceRevision: 0,
    };
    const db = database([entry]);
    await expect(
      buildScenarioProjectRootInventory({
        db,
        options: createMediaHubBackupExportOptions(),
        paths: createArchivePathAllocator(),
      })
    ).resolves.toEqual([]);
    const [root] = await buildScenarioProjectRootInventory({
      db,
      options: createMediaHubBackupExportOptions({ includeDrafts: true }),
      paths: createArchivePathAllocator(),
    });
    expect(root?.summary.draftCount).toBe(1);
  });
});
