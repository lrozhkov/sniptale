import type { ScenarioAssetEntry } from '../../../../composition/persistence/scenario/contracts';
import { type EditorDocument } from '../../../../features/editor/document/types';
import {
  createScenarioImageElement,
  createScenarioProjectV3,
  createScenarioSlide,
} from '../../../../features/scenario/project/v3';
import type {
  ScenarioProjectV3,
  ScenarioSlideSource,
} from '@sniptale/runtime-contracts/scenario/types/v3';
import type { MediaHubBackupMetadata } from '../../contracts/types';

export function createV3ScenarioMetadata(projectOverrides = {}): MediaHubBackupMetadata {
  const project = {
    ...createScenarioProjectV3('V3 Scenario'),
    id: 'scenario-v3',
    ...projectOverrides,
  };
  return {
    assets: [],
    effectBundles: [],
    scenarioProjects: [
      {
        assets: [],
        entry: { createdAt: 1, id: 'scenario-v3', project, updatedAt: 1 },
        exportThumbnails: [],
        exports: [],
        stepDocuments: [],
      },
    ],
    videoProjects: [],
  };
}

export function createV3ScenarioMetadataWithImageAsset(): MediaHubBackupMetadata {
  const imageElement = createScenarioImageElement({
    assetRef: { assetId: 'asset-1', galleryAssetId: null },
  });
  const slide = createScenarioSlide({
    elements: [imageElement],
    id: 'slide-1',
    source: createCaptureSlideSource(),
  });
  const metadata = createV3ScenarioMetadata({
    slides: [slide],
    trash: [{ deletedAt: 2, originalIndex: 0, slide }],
  });
  metadata.scenarioProjects![0]!.assets = [
    {
      blobPath: 'scenario-projects/scenario-v3/assets/asset-1',
      entry: createScenarioAssetEntry(),
    },
  ];
  return metadata;
}

export function createV3ScenarioMetadataWithProjectId(id: string): MediaHubBackupMetadata {
  const metadata = createV3ScenarioMetadata();
  const descriptor = metadata.scenarioProjects![0]!;
  descriptor.entry = {
    ...descriptor.entry,
    id,
    project: { ...descriptor.entry.project, id },
  };
  return metadata;
}

export function createV3ScenarioMetadataWithUnsafeAssetId(): MediaHubBackupMetadata {
  const metadata = createV3ScenarioMetadataWithImageAsset();
  metadata.scenarioProjects![0]!.assets[0]!.entry = createScenarioAssetEntry({ id: '../asset' });
  return metadata;
}

export function createV3ScenarioMetadataWithUnsafeExportId(): MediaHubBackupMetadata {
  const metadata = createV3ScenarioMetadata();
  metadata.scenarioProjects![0]!.exports = [
    {
      createdAt: 1,
      filename: 'scenario.html',
      format: 'html',
      id: '../export',
      projectId: 'scenario-v3',
      size: 1,
    },
  ];
  return metadata;
}

export function createV3ScenarioMetadataWithUnsafeStepDocumentId(): MediaHubBackupMetadata {
  return createV3ScenarioMetadataWithImageEditDocument('', '../doc');
}

export function createV3ScenarioMetadataWithImageEditDocument(
  assetId = 'asset-1',
  documentId = 'doc-1'
): MediaHubBackupMetadata {
  const imageElement = createScenarioImageElement({
    assetRef: { assetId, galleryAssetId: null },
    editDocumentId: documentId,
  });
  const metadata = createV3ScenarioMetadata({
    slides: [createScenarioSlide({ elements: [imageElement], id: 'slide-1' })],
  });
  metadata.scenarioProjects![0]!.stepDocuments = [
    {
      createdAt: 1,
      document: createEditorDocument(),
      projectId: 'scenario-v3',
      stepId: documentId,
      updatedAt: 1,
    },
  ];
  if (assetId) {
    metadata.scenarioProjects![0]!.assets = [
      {
        blobPath: `scenario-projects/scenario-v3/assets/${assetId}`,
        entry: createScenarioAssetEntry({ id: assetId }),
      },
    ];
  }
  return metadata;
}

export function createCaptureSlideSource(): ScenarioSlideSource {
  return {
    assetId: 'asset-1',
    captureMetadata: { pointerRange: null, scroll: null, trigger: 'pointer-up' },
    captureSurface: null,
    cursorPoint: null,
    galleryAssetId: null,
    interactionPoint: null,
    kind: 'capture',
    page: {
      devicePixelRatio: 1,
      scrollX: 0,
      scrollY: 0,
      title: 'Page',
      url: 'https://example.test/',
      viewport: { height: 100, width: 100, x: 0, y: 0 },
    },
    sourceKind: null,
    target: null,
  };
}

export function readFirstV3Project(metadata: MediaHubBackupMetadata): ScenarioProjectV3 {
  return metadata.scenarioProjects![0]!.entry.project as ScenarioProjectV3;
}

function createEditorDocument(): EditorDocument {
  return {
    canvasHeight: 1,
    canvasJson: '{}',
    canvasWidth: 1,
    frame: {
      backgroundColor: '#fff',
      backgroundGradientAngle: 90,
      backgroundGradientFrom: '#fff',
      backgroundGradientTo: '#000',
      backgroundImageData: null,
      backgroundImageFit: 'cover',
      backgroundMode: 'color',
      browserMode: false,
      browserTitle: '',
      browserUrl: '',
      layoutMode: 'fit-image',
      paddingBottom: 0,
      paddingLeft: 0,
      paddingRight: 0,
      paddingTop: 0,
    },
    sourceDisplayHeight: 1,
    sourceDisplayWidth: 1,
    sourceHeight: 1,
    sourceImageData: 'data:image/png;base64,source',
    sourceLeft: 0,
    sourceName: null,
    sourceTop: 0,
    sourceWidth: 1,
    version: 1,
  };
}

function createScenarioAssetEntry(
  overrides: Partial<Omit<ScenarioAssetEntry, 'blob'>> = {}
): Omit<ScenarioAssetEntry, 'blob'> {
  return {
    createdAt: 1,
    galleryAssetId: null,
    height: 100,
    id: 'asset-1',
    mimeType: 'image/png',
    projectId: 'scenario-v3',
    size: 10,
    width: 100,
    ...overrides,
  };
}
