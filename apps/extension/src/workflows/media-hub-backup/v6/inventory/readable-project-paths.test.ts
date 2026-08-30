import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readAssetFile: vi.fn() }));
vi.mock('../../../../composition/persistence/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/assets')>()),
  readAssetFile: mocks.readAssetFile,
}));
vi.mock('../../../../features/video/project/effect-instance', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../features/video/project/effect-instance')>()),
  verifyVideoProjectEffectSnapshotIntegrity: vi.fn(async () => undefined),
}));
vi.mock('../../../../composition/persistence/projects/read-guards', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../composition/persistence/projects/read-guards')
  >()),
  parseVideoProjectEntryResult: (entry: unknown) => ({ entry, status: 'ready' }),
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
    project.project.effectSnapshots = [
      {
        id: 'snapshot-1',
        assets: [
          {
            blob: new Blob(['effect'], { type: 'image/png' }),
            byteLength: 6,
            id: 'effect-asset',
            kind: 'image',
            mimeType: 'image/png',
            sha256: 'a'.repeat(64),
          },
        ],
        documentId: 'document-1',
        kind: 'standalone',
        retainedByteLength: 8,
        schemaVersion: 'sniptale.effect.v1',
        sha256: 'b'.repeat(64),
        source: '{}',
      },
    ];
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
        if (store === 'thumbnails') {
          if (String(key).startsWith('export:')) return undefined;
          return {
            assetId: `video-project:${project.id}`,
            blob: new Blob(['thumbnail'], { type: 'image/png' }),
            createdAt: 1,
            height: 90,
            updatedAt: 2,
            width: 160,
          };
        }
        if (store === 'aggregate_presentations') {
          return {
            aggregateId: project.id,
            aggregateKind: 'video-project',
            presentationRevision: 1,
            previewBlob: new Blob(['preview'], { type: 'image/png' }),
            thumbnailBlob: new Blob(['presentation-thumbnail'], { type: 'image/png' }),
            updatedAt: 2,
          };
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
    expect(payload.objects.map((object) => object.ref.filename)).toEqual([
      'Camera clip.webm',
      'Final?.webm',
      'snapshot-1-effect-asset',
      `${project.id}-thumbnail`,
      `${project.id}-preview`,
      `${project.id}-presentation-thumbnail`,
    ]);
    expect(payload.objects.slice(0, 2).map((object) => object.ref.path)).toEqual([
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
      get: vi.fn(async (store: string) => {
        if (store === 'asset_refs') return ref(asset.assetId, asset.mimeType);
        if (store === 'thumbnails') {
          return {
            assetId: `scenario:${scenario.id}`,
            blob: new Blob(['thumbnail'], { type: 'image/png' }),
            createdAt: 1,
            height: 90,
            updatedAt: 2,
            width: 160,
          };
        }
        if (store === 'aggregate_presentations') {
          return {
            aggregateId: scenario.id,
            aggregateKind: 'scenario',
            presentationRevision: 1,
            previewBlob: new Blob(['preview'], { type: 'image/png' }),
            thumbnailBlob: new Blob(['presentation-thumbnail'], { type: 'image/png' }),
            updatedAt: 2,
          };
        }
        return undefined;
      }),
      getAll: vi.fn(async () => [entry]),
      getAllFromIndex: vi.fn(async (store: string) => (store === 'scenario_assets' ? [asset] : [])),
    };
    const [root] = await buildScenarioProjectRootInventory({
      db,
      options: createMediaHubBackupExportOptions({ includeDrafts: true }),
      paths: createArchivePathAllocator(),
    });
    const payload = await root!.load();
    expect(payload.objects.map((object) => object.ref.filename)).toEqual([
      'Asset 001.png',
      `${scenario.id}-thumbnail`,
      `${scenario.id}-preview`,
      `${scenario.id}-presentation-thumbnail`,
    ]);
    expect(payload.objects[0]?.ref.path).toBe(
      'Drafts/Scenarios/Scenario- One/Assets/Asset 001.png'
    );
  });
});
