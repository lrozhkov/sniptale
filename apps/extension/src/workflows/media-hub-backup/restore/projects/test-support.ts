import {
  createScenarioImageElement,
  createScenarioProjectV3,
  createScenarioSlide,
} from '../../../../features/scenario/project/v3';
import type { PreparedProjectDomains } from '../project/prepare';

export { createMissingProjectBlobZip, createStores, createZip } from './storage.test-support';

export function createPreparedDomains(): PreparedProjectDomains {
  return {
    changedIds: [],
    conflictsResolved: 0,
    effectBundles: [],
    scenarioProjects: [createPreparedScenarioProject()],
    skipped: 0,
    videoProjects: [createPreparedVideoProject()],
  };
}

export function createMinimalPreparedDomains(): PreparedProjectDomains {
  return {
    changedIds: [],
    conflictsResolved: 0,
    effectBundles: [],
    scenarioProjects: [createMinimalScenarioProject()],
    skipped: 0,
    videoProjects: [createMinimalVideoProject()],
  };
}

export function createScenarioThumbnailNoRemapDomains(): PreparedProjectDomains {
  return {
    changedIds: [],
    conflictsResolved: 0,
    effectBundles: [],
    scenarioProjects: [createScenarioThumbnailNoRemapProject()],
    skipped: 0,
    videoProjects: [],
  };
}

function createMinimalScenarioProject(): PreparedProjectDomains['scenarioProjects'][number] {
  return {
    descriptor: {
      assets: [],
      entry: createScenarioProjectEntry(),
      exports: [],
      stepDocuments: [],
    },
    projectId: 'scenario-1',
    idChanged: false,
    scenarioAssetIdMap: new Map(),
    scenarioExportIdMap: new Map(),
    stepIdMap: new Map(),
  };
}

function createMinimalVideoProject(): PreparedProjectDomains['videoProjects'][number] {
  return {
    descriptor: {
      entry: createVideoProjectEntry(),
      projectAssets: [],
      projectExports: [
        {
          entry: createProjectExportEntry(),
          recording: { blobPath: 'recording', entry: { id: 'recording-1' } as never },
        },
      ],
    },
    projectAssetIdMap: new Map(),
    projectExportIdMap: new Map(),
    projectId: 'video-1',
    idChanged: false,
    recordingIdMap: new Map(),
  };
}

function createScenarioThumbnailNoRemapProject(): PreparedProjectDomains['scenarioProjects'][number] {
  return {
    descriptor: {
      assets: [],
      entry: createScenarioProjectEntry(),
      exportThumbnails: [
        {
          blobPath: 'scenario-export-thumb',
          entry: { assetId: 'scenario-export:scenario-export-1' } as never,
        },
      ],
      exports: [createScenarioExportEntry()],
      stepDocuments: [],
    },
    projectId: 'scenario-1',
    idChanged: false,
    scenarioAssetIdMap: new Map(),
    scenarioExportIdMap: new Map(),
    stepIdMap: new Map(),
  };
}

function createPreparedScenarioProject(): PreparedProjectDomains['scenarioProjects'][number] {
  return {
    descriptor: {
      assets: [
        {
          blobPath: 'scenario-asset',
          entry: {
            createdAt: 1,
            galleryAssetId: null,
            height: 50,
            id: 'scenario-asset-1',
            mimeType: 'image/png',
            projectId: 'scenario-1',
            size: new Blob(['scenario-asset']).size,
            width: 100,
          } as never,
        },
      ],
      entry: createScenarioProjectEntry(true),
      exportThumbnails: [
        {
          blobPath: 'scenario-export-thumb',
          entry: { assetId: 'scenario-export:scenario-export-1' } as never,
        },
      ],
      exports: [createScenarioExportEntry()],
      stepDocuments: [
        {
          createdAt: 1,
          document: {} as never,
          projectId: 'scenario-1',
          stepId: 'step-1',
          updatedAt: 1,
        },
      ],
      thumbnail: {
        blobPath: 'scenario-thumb',
        entry: { assetId: 'scenario:scenario-1' } as never,
      },
    },
    projectId: 'scenario-copy',
    idChanged: true,
    scenarioAssetIdMap: new Map([['scenario-asset-1', 'scenario-asset-copy']]),
    scenarioExportIdMap: new Map([['scenario-export-1', 'scenario-export-copy']]),
    stepIdMap: new Map([['step-1', 'step-copy']]),
  };
}

function createPreparedVideoProject(): PreparedProjectDomains['videoProjects'][number] {
  return {
    descriptor: {
      entry: createVideoProjectEntry(),
      projectAssets: [
        {
          blobPath: 'project-asset',
          entry: {
            createdAt: 1,
            id: 'project-asset-1',
            mimeType: 'image/png',
            size: 10,
          },
        },
      ],
      projectExports: [createProjectExportDescriptor()],
      thumbnail: {
        blobPath: 'video-thumb',
        entry: { assetId: 'video-project:video-1' } as never,
      },
    },
    projectAssetIdMap: new Map([['project-asset-1', 'project-asset-copy']]),
    projectExportIdMap: new Map([['export-1', 'export-copy']]),
    projectId: 'video-copy',
    idChanged: true,
    recordingIdMap: new Map([['recording-1', 'recording-copy']]),
  };
}

function createScenarioProjectEntry(includeBundleRefs = false) {
  const project = {
    ...createScenarioProjectV3('Scenario'),
    id: 'scenario-1',
    slides: [
      createScenarioSlide(
        includeBundleRefs
          ? {
              elements: [
                createScenarioImageElement({
                  assetRef: { assetId: 'scenario-asset-1', galleryAssetId: null },
                  editDocumentId: 'step-1',
                }),
              ],
              id: 'slide-1',
            }
          : { id: 'slide-1' }
      ),
    ],
  };

  return {
    createdAt: 1,
    id: 'scenario-1',
    project,
    updatedAt: 1,
  } as never;
}

function createVideoProjectEntry() {
  return {
    createdAt: 1,
    id: 'video-1',
    project: { assets: [], id: 'video-1', name: 'Video' },
    updatedAt: 1,
  } as never;
}

function createScenarioExportEntry() {
  return {
    createdAt: 1,
    filename: 'scenario.html',
    format: 'html' as const,
    id: 'scenario-export-1',
    projectId: 'scenario-1',
    size: 10,
  };
}

function createProjectExportDescriptor() {
  return {
    entry: createProjectExportEntry(),
    recording: { blobPath: 'recording', entry: { id: 'recording-1' } as never },
    recordingTelemetry: { recordingId: 'recording-1' } as never,
    thumbnail: { blobPath: 'export-thumb', entry: { assetId: 'export:export-1' } as never },
  };
}

function createProjectExportEntry() {
  return {
    createdAt: 1,
    duration: 1,
    filename: 'export.webm',
    fps: 30,
    height: 100,
    id: 'export-1',
    projectId: 'video-1',
    recordingId: 'recording-1',
    size: 10,
    width: 100,
  };
}
