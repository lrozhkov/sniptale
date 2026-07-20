import type { MediaHubBackupMetadata } from '../../contracts/types';
import { createV3ScenarioMetadataWithImageAsset } from './prepare-v3.test-support.ts';

export function createRestoreProjectMetadata(): MediaHubBackupMetadata {
  const scenarioMetadata = createV3ScenarioMetadataWithImageAsset();
  return {
    assets: [],
    effectBundles: [],
    scenarioProjects: scenarioMetadata.scenarioProjects ?? [],
    videoProjects: [createVideoDescriptor()],
  };
}

export function createLegacyScenarioProjectMetadata(): MediaHubBackupMetadata {
  return {
    assets: [],
    effectBundles: [],
    scenarioProjects: [createLegacyScenarioDescriptor()],
    videoProjects: [],
  };
}

function createLegacyScenarioDescriptor() {
  return {
    assets: [
      {
        blobPath: 'scenario-projects/scenario-1/assets/scenario-asset-1',
        entry: createScenarioAssetEntry(),
      },
    ],
    entry: createLegacyScenarioEntry(),
    exportThumbnails: [
      {
        blobPath: 'scenario-projects/scenario-1/exports/scenario-export-1.thumb',
        entry: {
          assetId: 'scenario-export:scenario-export-1',
          createdAt: 1,
          height: 10,
          updatedAt: 1,
          width: 10,
        } as never,
      },
    ],
    exports: [
      {
        createdAt: 1,
        filename: 'scenario.zip',
        format: 'html' as const,
        id: 'scenario-export-1',
        projectId: 'scenario-1',
        size: 10,
      },
    ],
    stepDocuments: [
      {
        createdAt: 1,
        document: {} as never,
        projectId: 'scenario-1',
        stepId: 'step-1',
        updatedAt: 1,
      },
    ],
  };
}

function createVideoDescriptor() {
  return {
    entry: {
      createdAt: 1,
      id: 'video-1',
      project: { assets: [createVideoAssetRef()], id: 'video-1', name: 'Video' } as never,
      updatedAt: 1,
    },
    projectAssets: [
      {
        blobPath: 'video-projects/video-1/assets/project-asset-1',
        entry: { createdAt: 1, id: 'project-asset-1', mimeType: 'image/png', size: 10 } as never,
      },
    ],
    projectExports: [
      {
        entry: {
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
        },
        recording: {
          blobPath: 'video-projects/video-1/exports/export-1.webm',
          entry: { createdAt: 1, filename: 'export.webm', id: 'recording-1', size: 10 } as never,
        },
      },
    ],
  };
}

function createScenarioAssetEntry() {
  return {
    createdAt: 1,
    galleryAssetId: null,
    height: 100,
    id: 'scenario-asset-1',
    mimeType: 'image/png',
    projectId: 'scenario-1',
    size: 10,
    width: 100,
  } as never;
}

function createVideoAssetRef() {
  return {
    createdAt: 1,
    id: 'asset-ref-1',
    metadata: {
      audioPeaks: null,
      duration: null,
      hasAudio: false,
      height: 100,
      mimeType: 'image/png',
      size: 10,
      width: 100,
    },
    name: 'Asset',
    source: { kind: 'project-asset', projectAssetId: 'project-asset-1' },
    type: 'image',
  };
}

function createLegacyScenarioEntry() {
  return {
    createdAt: 1,
    id: 'scenario-1',
    project: {
      createdAt: 1,
      id: 'scenario-1',
      name: 'Scenario',
      steps: [createLegacyStep()],
      suggestedEvents: [createSuggestedEvent()],
      trash: [],
      updatedAt: 1,
      version: 2 as const,
    },
    updatedAt: 1,
  };
}

function createLegacyStep() {
  return {
    assetId: 'scenario-asset-1',
    body: '',
    captureMetadata: { pointerRange: null, scroll: null, trigger: 'pointer-up' as const },
    captureSurface: 'visible' as const,
    createdAt: 1,
    cursorPoint: null,
    galleryAssetId: null,
    id: 'step-1',
    imageTransform: { scale: 1, x: 0, y: 0 },
    interactionPoint: null,
    kind: 'capture' as const,
    overlays: [],
    page: {
      devicePixelRatio: 1,
      scrollX: 0,
      scrollY: 0,
      title: null,
      url: null,
      viewport: { height: 100, width: 100, x: 0, y: 0 },
    },
    sourceKind: 'manual' as const,
    target: null,
    title: 'Step',
    updatedAt: 1,
    viewportTransform: { height: 100, width: 100, x: 0, y: 0 },
  };
}

function createSuggestedEvent() {
  return {
    createdAt: 1,
    data: {},
    id: 'event-1',
    kind: 'click' as const,
    message: 'Click',
    sourceStepId: 'step-1',
    status: 'pending' as const,
    target: null,
  };
}
