import { vi } from 'vitest';
import { createVideoProjectEntryWithMediaClip } from '../../../../composition/persistence/projects/index.test-support.ts';
import {
  createScenarioImageElement,
  createScenarioProjectV3,
  createScenarioSlide,
} from '../../../../features/scenario/project/v3';
import { createEditorDocument } from './editor-document.test-support.ts';
import {
  createEffectVideoProjectFixture,
  createVideoProjectFixture,
} from './video-fixture.test-support.ts';

export function createProjectBundleDb() {
  return {
    get: vi.fn(readProjectBundleRecord),
    getAll: vi.fn(readProjectBundleRecords),
    getAllFromIndex: vi.fn(async (storeName: string) => {
      if (storeName === 'project_exports') {
        return [
          createProjectExportRecord('export-1', 'recording-1'),
          createProjectExportRecord('export-missing', 'missing-recording'),
        ];
      }
      if (storeName === 'scenario_assets') {
        return [createScenarioAssetRecord()];
      }
      if (storeName === 'scenario_exports') {
        return [createScenarioExportRecord()];
      }
      if (storeName === 'scenario_step_editor_documents') {
        return [createScenarioStepDocumentRecord()];
      }
      return [];
    }),
  };
}

export function createSparseProjectBundleDb() {
  return {
    get: vi.fn(async () => undefined),
    getAll: vi.fn(async (storeName: string) => {
      if (storeName === 'video_projects') {
        return [
          {
            id: 'video-project-2',
            project: createVideoProjectFixture('video-project-2'),
            createdAt: 1,
            updatedAt: 2,
          },
        ];
      }
      return storeName === 'scenario_projects'
        ? [createScenarioProjectEntry('scenario-2', false)]
        : [];
    }),
    getAllFromIndex: vi.fn(async () => []),
  };
}

export async function createEffectProjectBundleDb() {
  const project = await createEffectVideoProjectFixture('video-project-effect');
  return {
    get: vi.fn(async () => undefined),
    getAll: vi.fn(async (storeName: string) =>
      storeName === 'video_projects'
        ? [{ createdAt: 1, id: project.id, project, updatedAt: 2 }]
        : []
    ),
    getAllFromIndex: vi.fn(async () => []),
  };
}

export function createInvalidVideoProjectBundleDb() {
  const entry = createVideoProjectEntryWithMediaClip({ id: 'video-project-invalid' });
  return {
    get: vi.fn(async () => undefined),
    getAll: vi.fn(async (storeName: string) => (storeName === 'video_projects' ? [entry] : [])),
    getAllFromIndex: vi.fn(async () => []),
  };
}

export function createUnsupportedEngine1VideoProjectBundleDb() {
  const project = createVideoProjectFixture('video-project-engine1') as unknown as Record<
    string,
    unknown
  >;
  project['templateInstances'] = [];
  return {
    get: vi.fn(async () => undefined),
    getAll: vi.fn(async (storeName: string) =>
      storeName === 'video_projects'
        ? [{ createdAt: 1, id: 'video-project-engine1', project, updatedAt: 2 }]
        : []
    ),
    getAllFromIndex: vi.fn(async () => []),
  };
}

export function createInvalidScenarioV3ProjectBundleDb() {
  return {
    get: vi.fn(async () => undefined),
    getAll: vi.fn(async (storeName: string) =>
      storeName === 'scenario_projects' ? [createScenarioProjectV3EntryWithMissingAsset()] : []
    ),
    getAllFromIndex: vi.fn(async () => []),
  };
}

export async function readProjectBundleRecord(storeName: string, key: string) {
  if (storeName === 'thumbnails') {
    return {
      assetId: key,
      blob: new Blob(['thumb']),
      createdAt: 3,
      height: 10,
      updatedAt: 4,
      width: 10,
    };
  }
  if (storeName === 'project_assets' && key === 'asset-1') {
    return {
      id: 'asset-1',
      blob: new Blob(['asset']),
      createdAt: 1,
      mimeType: 'image/png',
      size: 5,
    };
  }
  if (storeName === 'recordings' && key === 'recording-1') {
    return {
      id: 'recording-1',
      blob: new Blob(['recording']),
      filename: 'export.webm',
      createdAt: 2,
      size: 9,
    };
  }
  return undefined;
}

async function readProjectBundleRecords(storeName: string) {
  if (storeName === 'video_projects') {
    return [
      {
        id: 'video-project-1',
        project: createVideoProjectFixture('video-project-1', [
          { source: { kind: 'project-asset', projectAssetId: 'asset-1' } },
        ]),
        createdAt: 1,
        updatedAt: 2,
      },
    ];
  }
  return storeName === 'scenario_projects' ? [createScenarioProjectEntry('scenario-1')] : [];
}

function createScenarioProjectEntry(id: string, includeBundleRefs = true) {
  const project = {
    ...createScenarioProjectV3('Scenario'),
    createdAt: 1,
    id,
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
    updatedAt: 2,
  };
  return { createdAt: 1, id, project, updatedAt: 2 };
}

function createScenarioProjectV3EntryWithMissingAsset() {
  const image = createScenarioImageElement({
    assetRef: { assetId: 'missing-asset', galleryAssetId: null },
  });
  const project = {
    ...createScenarioProjectV3('Scenario V3'),
    id: 'scenario-v3',
    slides: [createScenarioSlide({ elements: [image] })],
  };
  return { createdAt: 1, id: project.id, project, updatedAt: 2 };
}

export function createScenarioAssetRecord(
  args: { id?: string; mimeType?: string; projectId?: string } = {}
) {
  const mimeType = args.mimeType ?? 'image/png';
  const blob = new Blob(['scenario-asset'], { type: mimeType });
  return {
    id: args.id ?? 'scenario-asset-1',
    projectId: args.projectId ?? 'scenario-1',
    galleryAssetId: null,
    blob,
    mimeType,
    width: 10,
    height: 10,
    createdAt: 3,
    size: blob.size,
  };
}

function createScenarioExportRecord(args: { id?: string; projectId?: string } = {}) {
  return {
    createdAt: 4,
    filename: 'scenario.html',
    format: 'html',
    id: args.id ?? 'scenario-export-1',
    projectId: args.projectId ?? 'scenario-1',
    size: 8,
  };
}

function createScenarioStepDocumentRecord(args: { projectId?: string; stepId?: string } = {}) {
  return {
    createdAt: 5,
    document: createEditorDocument(),
    projectId: args.projectId ?? 'scenario-1',
    stepId: args.stepId ?? 'step-1',
    updatedAt: 6,
  };
}

function createProjectExportRecord(id: string, recordingId: string) {
  return {
    createdAt: 4,
    duration: 1,
    filename: `${id}.webm`,
    fps: 30,
    height: 100,
    id,
    projectId: 'video-project-1',
    recordingId,
    size: 8,
    width: 100,
  };
}
