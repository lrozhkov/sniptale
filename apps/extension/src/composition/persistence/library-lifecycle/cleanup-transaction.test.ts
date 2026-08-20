import { beforeEach, expect, it, vi } from 'vitest';
import { createVideoProjectEntryWithMediaClip } from '../projects/index.test-support';
import { createEditorDocumentFixture } from '../../../editor/document/page-session/document.test-support';
import { createScenarioProject } from '../../../features/scenario/project/factories/project';

const persistenceMocks = vi.hoisted(() => ({
  listMediaLibrary: vi.fn(),
  listScenarioProjectEntries: vi.fn(),
  listVideoProjectEntries: vi.fn(),
  runWithIndexedDbMutation: vi.fn(),
  recoverProjectMediaPublications: vi.fn(),
  recoverRecordingAssetPublications: vi.fn(),
}));

vi.mock('../projects/asset-publication', async (importOriginal) => ({
  ...(await importOriginal()),
  recoverProjectMediaPublications: persistenceMocks.recoverProjectMediaPublications,
}));
vi.mock('../recordings/asset-publication', async (importOriginal) => ({
  ...(await importOriginal()),
  recoverRecordingAssetPublications: persistenceMocks.recoverRecordingAssetPublications,
}));

vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: persistenceMocks.runWithIndexedDbMutation,
}));
vi.mock('../assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../assets')>()),
  buildPhysicalDeleteOperation: () => ({
    assetIds: [],
    createdAt: 1,
    kind: 'physical-delete',
    operationId: 'delete-1',
    status: 'pending',
    updatedAt: 1,
  }),
  completePhysicalDeleteOperation: vi.fn(),
}));
vi.mock('../media-library', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../media-library')>()),
  listMediaLibrary: persistenceMocks.listMediaLibrary,
}));
vi.mock('../projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../projects')>()),
  listVideoProjectEntries: persistenceMocks.listVideoProjectEntries,
}));
vi.mock('../scenario/projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../scenario/projects')>()),
  listScenarioProjectEntries: persistenceMocks.listScenarioProjectEntries,
}));

import { cleanupDrafts, createLibraryLifecycle, DEFAULT_LOCAL_STORAGE_POLICY } from '.';

beforeEach(() => {
  vi.clearAllMocks();
  persistenceMocks.listMediaLibrary.mockResolvedValue([]);
  persistenceMocks.listScenarioProjectEntries.mockResolvedValue([]);
  persistenceMocks.listVideoProjectEntries.mockResolvedValue([]);
  persistenceMocks.recoverProjectMediaPublications.mockResolvedValue(0);
  persistenceMocks.recoverRecordingAssetPublications.mockResolvedValue(0);
});

it('does not begin lifecycle cleanup while retained project journals cannot drain', async () => {
  persistenceMocks.recoverProjectMediaPublications.mockRejectedValueOnce(
    new Error('ready journal replay failed')
  );

  await expect(
    cleanupDrafts({ includeUnexpired: true, now: 2, policy: DEFAULT_LOCAL_STORAGE_POLICY })
  ).rejects.toThrow('ready journal replay failed');

  expect(persistenceMocks.listMediaLibrary).not.toHaveBeenCalled();
  expect(persistenceMocks.runWithIndexedDbMutation).not.toHaveBeenCalled();
});

it('removes standalone media dependency graphs and aggregate sidecars atomically', async () => {
  const lifecycle = createLibraryLifecycle('temporary', 1);
  const createMedia = (
    id: string,
    source:
      | { kind: 'recording'; recordingId: string }
      | { kind: 'project-asset'; projectAssetId: string }
  ) => ({
    createdAt: 1,
    duration: null,
    filename: `${id}.bin`,
    height: null,
    id,
    kind: source.kind === 'recording' ? ('recording' as const) : ('image' as const),
    lifecycle,
    mimeType: source.kind === 'recording' ? 'video/webm' : 'image/png',
    originalFilename: `${id}.bin`,
    size: 5,
    source,
    sourceFavicon: null,
    sourceTitle: null,
    sourceUrl: null,
    tags: [],
    updatedAt: 1,
    width: null,
  });
  const recordingMedia = createMedia('recording:recording-1', {
    kind: 'recording',
    recordingId: 'recording-1',
  });
  const projectAssetMedia = createMedia('project-asset:asset-1', {
    kind: 'project-asset',
    projectAssetId: 'asset-1',
  });
  const recording = {
    assetId: 'asset-recording-1',
    createdAt: 1,
    filename: 'recording.webm',
    id: 'recording-1',
    lifecycle,
    mimeType: 'video/webm',
    size: 5,
  };
  persistenceMocks.listMediaLibrary.mockResolvedValue([recordingMedia, projectAssetMedia]);

  const deletes = vi.fn();
  const valuesByStore = new Map<string, Map<string, unknown>>([
    [
      'media_library',
      new Map([
        [recordingMedia.id, recordingMedia],
        [projectAssetMedia.id, projectAssetMedia],
      ]),
    ],
    ['recordings', new Map([[recording.id, recording]])],
    ['project_assets', new Map([['asset-1', { id: 'asset-1' }]])],
    ['video_projects', new Map()],
  ]);
  persistenceMocks.runWithIndexedDbMutation.mockImplementation(async (effect) =>
    effect({
      transaction: vi.fn(() => ({
        done: Promise.resolve(),
        objectStore: vi.fn((name: string) => ({
          delete: vi.fn(async (id: string) => {
            deletes(name, id);
            valuesByStore.get(name)?.delete(id);
          }),
          get: vi.fn(async (id: string) => valuesByStore.get(name)?.get(id)),
          getAll: vi.fn(async () => [...(valuesByStore.get(name)?.values() ?? [])]),
          index: vi.fn(() => ({ count: vi.fn(async () => 0) })),
          put: vi.fn(),
        })),
      })),
    })
  );

  await expect(
    cleanupDrafts({ includeUnexpired: true, now: 2, policy: DEFAULT_LOCAL_STORAGE_POLICY })
  ).resolves.toEqual({
    deletedCount: 2,
    deletedIds: [recordingMedia.id, projectAssetMedia.id],
  });
  expect(deletes).toHaveBeenCalledWith('recordings', recording.id);
  expect(deletes).toHaveBeenCalledWith('recording_telemetry', recording.id);
  expect(deletes).toHaveBeenCalledWith('project_assets', 'asset-1');
  expect(deletes).toHaveBeenCalledWith('image_workspaces', recordingMedia.id);
  expect(deletes).toHaveBeenCalledWith('image_workspaces', projectAssetMedia.id);
  expect(deletes).toHaveBeenCalledWith('aggregate_presentations', ['image', recordingMedia.id]);
  expect(deletes).toHaveBeenCalledWith('aggregate_presentations', ['image', projectAssetMedia.id]);
});

it('commits expired linked and standalone draft cleanup through current transactional rows', async () => {
  const lifecycle = createLibraryLifecycle('temporary', 1);
  const projectWithAsset = createVideoProjectEntryWithMediaClip();
  const sharedAsset = {
    ...projectWithAsset.project.assets[0]!,
    id: 'shared-asset',
    source: { kind: 'project-asset' as const, projectAssetId: 'project-asset-shared' },
  };
  const project = {
    ...projectWithAsset,
    lifecycle,
    project: {
      ...projectWithAsset.project,
      assets: [...projectWithAsset.project.assets, sharedAsset],
    },
  };
  const projectAssetMedia = {
    createdAt: 1,
    duration: null,
    filename: 'project-asset.png',
    height: 1,
    id: 'project-asset:project-asset-1',
    kind: 'image',
    lifecycle,
    mimeType: 'image/png',
    originalFilename: 'project-asset.png',
    size: 5,
    source: { kind: 'project-asset' as const, projectAssetId: 'project-asset-1' },
    sourceFavicon: null,
    sourceTitle: null,
    sourceUrl: null,
    tags: [],
    updatedAt: 1,
    width: 1,
  };
  const sharedProjectAssetMedia = {
    ...projectAssetMedia,
    id: 'project-asset:project-asset-shared',
    lifecycle: createLibraryLifecycle('library', 1),
    source: {
      kind: 'project-asset' as const,
      projectAssetId: 'project-asset-shared',
    },
  };
  const scenarioProject = createScenarioProject('Scenario');
  const scenario = {
    createdAt: 1,
    id: scenarioProject.id,
    lifecycle,
    project: scenarioProject,
    updatedAt: 1,
  };
  const scenarioAsset = {
    blob: new Blob(['asset'], { type: 'image/png' }),
    createdAt: 1,
    galleryAssetId: null,
    height: 1,
    id: 'scenario-asset-1',
    mimeType: 'image/png',
    projectId: scenario.id,
    size: 5,
    width: 1,
  };
  const scenarioExport = {
    createdAt: 1,
    filename: 'scenario.md',
    format: 'markdown',
    id: 'scenario-export-1',
    projectId: scenario.id,
    size: 5,
  };
  const scenarioDocument = {
    createdAt: 1,
    document: createEditorDocumentFixture(),
    projectId: scenario.id,
    stepId: 'scenario-step-1',
    updatedAt: 1,
  };
  const malformedScenarioAsset = {
    id: 'scenario-asset-malformed',
    projectId: scenario.id,
  };
  const malformedScenarioExport = {
    id: 'scenario-export-malformed',
    projectId: scenario.id,
  };
  const malformedScenarioDocument = {
    projectId: scenario.id,
    stepId: 'scenario-step-malformed',
  };
  persistenceMocks.listVideoProjectEntries.mockResolvedValue([project]);
  persistenceMocks.listMediaLibrary.mockResolvedValue([projectAssetMedia, sharedProjectAssetMedia]);
  persistenceMocks.listScenarioProjectEntries.mockResolvedValue([scenario]);
  const deletes = vi.fn();
  const valuesByStore = new Map<string, Map<string, unknown>>([
    ['video_projects', new Map<string, unknown>([[project.id, project]])],
    [
      'project_assets',
      new Map<string, unknown>([
        ['project-asset-1', { id: 'project-asset-1' }],
        ['project-asset-shared', { id: 'project-asset-shared' }],
      ]),
    ],
    [
      'media_library',
      new Map<string, unknown>([
        [projectAssetMedia.id, projectAssetMedia],
        [sharedProjectAssetMedia.id, sharedProjectAssetMedia],
        [
          'recording:unrelated',
          {
            ...projectAssetMedia,
            id: 'recording:unrelated',
            source: { kind: 'recording', recordingId: 'unrelated' },
          },
        ],
      ]),
    ],
    ['scenario_projects', new Map([[scenario.id, scenario]])],
    [
      'scenario_assets',
      new Map([
        [scenarioAsset.id, scenarioAsset],
        [malformedScenarioAsset.id, malformedScenarioAsset],
      ]),
    ],
    [
      'scenario_exports',
      new Map([
        [scenarioExport.id, scenarioExport],
        [malformedScenarioExport.id, malformedScenarioExport],
      ]),
    ],
    [
      'scenario_step_editor_documents',
      new Map([
        [scenarioDocument.stepId, scenarioDocument],
        [malformedScenarioDocument.stepId, malformedScenarioDocument],
      ]),
    ],
  ]);
  persistenceMocks.runWithIndexedDbMutation.mockImplementation(async (effect) =>
    effect({
      transaction: vi.fn(() => ({
        done: Promise.resolve(),
        objectStore: vi.fn((name: string) => ({
          delete: vi.fn(async (id: string) => {
            deletes(name, id);
            valuesByStore.get(name)?.delete(id);
          }),
          get: vi.fn(async (id: string) => valuesByStore.get(name)?.get(id)),
          getAll: vi.fn(async () => [...(valuesByStore.get(name)?.values() ?? [])]),
        })),
      })),
    })
  );

  await expect(
    cleanupDrafts({ includeUnexpired: true, now: 2, policy: DEFAULT_LOCAL_STORAGE_POLICY })
  ).resolves.toEqual({
    deletedCount: 2,
    deletedIds: [`video-project:${project.id}`, `scenario:${scenario.id}`],
  });
  expect(deletes).toHaveBeenCalledWith('project_assets', 'project-asset-1');
  expect(deletes).toHaveBeenCalledWith('media_library', projectAssetMedia.id);
  expect(deletes).not.toHaveBeenCalledWith('project_assets', 'project-asset-shared');
  expect(deletes).not.toHaveBeenCalledWith('media_library', sharedProjectAssetMedia.id);
  expect(deletes).toHaveBeenCalledWith('thumbnails', `video-project:${project.id}`);
  expect(deletes).toHaveBeenCalledWith('scenario_assets', scenarioAsset.id);
  expect(deletes).toHaveBeenCalledWith('scenario_assets', malformedScenarioAsset.id);
  expect(deletes).toHaveBeenCalledWith('scenario_exports', scenarioExport.id);
  expect(deletes).toHaveBeenCalledWith('scenario_exports', malformedScenarioExport.id);
  expect(deletes).toHaveBeenCalledWith('scenario_step_editor_documents', scenarioDocument.stepId);
  expect(deletes).toHaveBeenCalledWith(
    'scenario_step_editor_documents',
    malformedScenarioDocument.stepId
  );
  expect(deletes).toHaveBeenCalledWith('thumbnails', `scenario:${scenario.id}`);
  expect(deletes).toHaveBeenCalledWith('thumbnails', `scenario-export:${scenarioExport.id}`);
});
