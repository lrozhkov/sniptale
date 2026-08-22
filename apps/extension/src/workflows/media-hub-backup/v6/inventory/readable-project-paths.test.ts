import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readAssetFile: vi.fn() }));
vi.mock('../../../../composition/persistence/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/assets')>()),
  readAssetFile: mocks.readAssetFile,
}));

import { createArchivePathAllocator } from '../../../../composition/archive-transfer';
import {
  createProjectAssetEntry,
  createProjectExportEntry,
  createMediaLibraryEntry,
  createVideoProjectEntryWithMediaClip,
} from '../../../../composition/persistence/projects/index.test-support';
import { createScenarioProjectV3 } from '../../../../features/scenario/project/v3';
import { createMediaHubBackupExportOptions } from '../options';
import { buildScenarioProjectRootInventory } from './scenario-projects';
import { buildVideoProjectRootInventory } from './video-projects';

function ref(assetId: string, mimeType: string) {
  return {
    assetId,
    createdAt: 1,
    location: { kind: 'opfs', objectKey: `objects/${assetId}` },
    mimeType,
    sha256: null,
    size: 1,
  };
}

describe('readable project archive paths', () => {
  it('places video project assets and exports in named user directories', async () => {
    const project = createVideoProjectEntryWithMediaClip({ name: 'Demo/Project' });
    const asset = createProjectAssetEntry({
      assetId: 'project-asset-object',
      id: 'project-asset-1',
      mimeType: 'video/webm',
    });
    const projectExport = createProjectExportEntry({
      assetId: 'project-export-object',
      filename: 'Final?.webm',
      projectId: project.id,
    });
    mocks.readAssetFile.mockImplementation(
      async (_ref, filename: string) =>
        new File(['x'], filename, {
          type: filename.includes('Final') ? 'video/webm' : asset.mimeType,
        })
    );
    const db = {
      get: vi.fn(async (store: string, key: unknown) => {
        if (store === 'project_assets') return asset;
        if (store === 'media_library') {
          return createMediaLibraryEntry({
            filename: 'Camera clip.webm',
            id: 'project-asset:project-asset-1',
            mimeType: 'video/webm',
          });
        }
        if (store === 'asset_refs') {
          return ref(String(key), key === 'project-export-object' ? 'video/webm' : asset.mimeType);
        }
        return undefined;
      }),
      getAll: vi.fn(async () => [project]),
      getAllFromIndex: vi.fn(async (store: string) =>
        store === 'project_exports' ? [projectExport] : []
      ),
    };
    const [root] = await buildVideoProjectRootInventory({
      db,
      options: createMediaHubBackupExportOptions(),
      paths: createArchivePathAllocator(),
    });
    const payload = await root!.load();
    expect(payload.objects.map((object) => object.ref.path)).toEqual([
      'Recordings/Projects/Demo-Project/Assets/Camera clip.webm',
      'Exports/Demo-Project/Final-.webm',
    ]);
  });

  it('places temporary scenario assets below Drafts with a sanitized project name', async () => {
    const scenario = createScenarioProjectV3('Scenario: One');
    const entry = {
      createdAt: scenario.createdAt,
      id: scenario.id,
      lifecycle: { savedAt: null, storageClass: 'temporary' as const, updatedAt: 10 },
      project: scenario,
      updatedAt: scenario.updatedAt,
      workspaceRevision: 0,
    };
    const asset = {
      assetId: 'scenario-object',
      createdAt: 1,
      galleryAssetId: null,
      height: 10,
      id: 'step image.png',
      mimeType: 'image/png',
      projectId: scenario.id,
      size: 1,
      width: 10,
    };
    mocks.readAssetFile.mockResolvedValue(new File(['x'], asset.id, { type: asset.mimeType }));
    const db = {
      get: vi.fn(async (store: string) =>
        store === 'asset_refs' ? ref(asset.assetId, asset.mimeType) : undefined
      ),
      getAll: vi.fn(async () => [entry]),
      getAllFromIndex: vi.fn(async (store: string) => (store === 'scenario_assets' ? [asset] : [])),
    };
    const [root] = await buildScenarioProjectRootInventory({
      db,
      options: createMediaHubBackupExportOptions({ includeDrafts: true }),
      paths: createArchivePathAllocator(),
    });
    const payload = await root!.load();
    expect(payload.objects.map((object) => object.ref.path)).toEqual([
      'Drafts/Scenarios/Scenario- One/Assets/Asset 001.png',
    ]);
  });
});
