import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createScenarioCaptureStep,
  createScenarioNoteStep,
} from '../../../../../features/scenario/project/public';
import type {
  ScenarioCaptureStep,
  ScenarioNoteStep,
  ScenarioProject,
} from '../../../../../features/scenario/contracts/types/project';

type ImportedAssetEntryResult = ReturnType<typeof createImportedAssetEntry>;

const { createScenarioAssetEntryFromBlobMock, persistScenarioCaptureArtifactsMock } = vi.hoisted(
  () => ({
    createScenarioAssetEntryFromBlobMock: vi.fn(),
    persistScenarioCaptureArtifactsMock: vi.fn(),
  })
);

vi.mock(
  '../../../../../composition/persistence/scenario/store/capture-step/assets',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('../../../../../composition/persistence/scenario/store/capture-step/assets')
      >();
    return {
      ...actual,
      createScenarioAssetEntryFromBlob: createScenarioAssetEntryFromBlobMock,
      persistScenarioCaptureArtifacts: persistScenarioCaptureArtifactsMock,
    };
  }
);

import { createInsertImageStepAction } from './insert-image';

function createProject(): ScenarioProject {
  const captureStep: ScenarioCaptureStep = {
    ...createScenarioCaptureStep({
      assetId: 'asset-1',
      galleryAssetId: 'gallery-1',
    }),
    id: 'capture-1',
  };
  const noteStep: ScenarioNoteStep = {
    ...createScenarioNoteStep({
      title: 'Note',
    }),
    id: 'note-1',
  };

  return {
    id: 'project-1',
    name: 'Project',
    version: 2 as const,
    createdAt: 1,
    updatedAt: 1,
    suggestedEvents: [],
    trash: [],
    steps: [captureStep, noteStep],
  };
}

function createInsertImageAction() {
  let currentProject = createProject();
  const setSelectedStepId = vi.fn();
  const action = createInsertImageStepAction({
    getCurrentProject: () => currentProject,
    project: currentProject,
    setSelectedStepId,
    updateProject: (updater) => {
      currentProject = updater(currentProject);
    },
  });

  return {
    action,
    getCurrentProject: () => currentProject,
    setCurrentProject: (project: ScenarioProject) => {
      currentProject = project;
    },
    setSelectedStepId,
  };
}

function createImportedAssetEntry(galleryAssetId: string | null = 'gallery-1') {
  return {
    assetEntry: {
      id: 'asset-imported',
      projectId: 'project-1',
      galleryAssetId,
      blob: new Blob(['image'], { type: 'image/png' }),
      mimeType: 'image/png',
      width: 1280,
      height: 720,
      createdAt: 22,
      size: 5,
    },
    now: 22,
  };
}

function createDeferredAssetEntry() {
  let resolve: ((value: ImportedAssetEntryResult) => void) | null = null;
  const promise = new Promise<ImportedAssetEntryResult>((nextResolve) => {
    resolve = nextResolve;
  });

  return {
    promise,
    resolve: (value: ImportedAssetEntryResult) => {
      if (!resolve) {
        throw new Error('Expected asset-entry resolver');
      }

      resolve(value);
    },
  };
}

function expectInsertedImageStep(currentProject: ScenarioProject, blob: Blob) {
  expect(createScenarioAssetEntryFromBlobMock).toHaveBeenCalledWith({
    blob,
    galleryAssetId: 'gallery-1',
    projectId: 'project-1',
  });
  expect(currentProject.steps[1]).toEqual(
    expect.objectContaining({
      kind: 'capture',
      assetId: 'asset-imported',
      galleryAssetId: 'gallery-1',
      title: 'Captured source',
      page: expect.objectContaining({
        title: 'Captured source',
        url: 'https://example.com/source',
      }),
    })
  );
  expect(persistScenarioCaptureArtifactsMock).toHaveBeenCalledWith(
    expect.objectContaining({
      assetEntry: expect.objectContaining({ id: 'asset-imported' }),
      baseUpdatedAt: 1,
      project: currentProject,
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  createScenarioAssetEntryFromBlobMock.mockResolvedValue(createImportedAssetEntry());
  persistScenarioCaptureArtifactsMock.mockImplementation(async (args) => args.project);
});

async function verifyImportedImageInsert() {
  const { action, getCurrentProject, setSelectedStepId } = createInsertImageAction();
  const blob = new Blob(['image'], { type: 'image/png' });

  await action(1, {
    blob,
    filename: 'Example image.png',
    galleryAssetId: 'gallery-1',
    sourceTitle: 'Captured source',
    sourceUrl: 'https://example.com/source',
  });

  const currentProject = getCurrentProject();
  expectInsertedImageStep(currentProject, blob);
  expect(setSelectedStepId).toHaveBeenCalledWith(currentProject.steps[1]?.id);
}

async function verifyNoProjectGuard() {
  createScenarioAssetEntryFromBlobMock.mockClear();
  persistScenarioCaptureArtifactsMock.mockClear();
  const action = createInsertImageStepAction({
    getCurrentProject: () => null,
    project: null,
    setSelectedStepId: vi.fn(),
    updateProject: vi.fn(),
  });

  await action(0, {
    blob: new Blob(['image'], { type: 'image/png' }),
    filename: 'ignored.png',
  });

  expect(createScenarioAssetEntryFromBlobMock).not.toHaveBeenCalled();
  expect(persistScenarioCaptureArtifactsMock).not.toHaveBeenCalled();
}

async function verifyFilenameFallback() {
  const { action, getCurrentProject } = createInsertImageAction();

  await action(0, {
    blob: new Blob(['image'], { type: 'image/png' }),
    filename: ' Trimmed image.png ',
  });

  expect(getCurrentProject().steps[0]).toEqual(
    expect.objectContaining({
      kind: 'capture',
      title: 'Trimmed image',
      page: expect.objectContaining({
        title: null,
        url: null,
      }),
    })
  );
}

async function verifyLiveProjectSnapshotInsert() {
  const assetEntryDeferred = createDeferredAssetEntry();
  createScenarioAssetEntryFromBlobMock.mockImplementationOnce(() => assetEntryDeferred.promise);
  const { action, getCurrentProject, setCurrentProject } = createInsertImageAction();
  const pendingInsert = action(1, {
    blob: new Blob(['image'], { type: 'image/png' }),
    filename: 'Example image.png',
  });
  setCurrentProject({
    ...getCurrentProject(),
    steps: [
      ...getCurrentProject().steps,
      {
        ...createScenarioNoteStep({ title: 'Concurrent note' }),
        id: 'note-2',
      },
    ],
  });
  assetEntryDeferred.resolve(createImportedAssetEntry(null));
  await pendingInsert;

  expect(getCurrentProject().steps.map((step) => step.id)).toEqual([
    'capture-1',
    expect.any(String),
    'note-1',
    'note-2',
  ]);
  expect(persistScenarioCaptureArtifactsMock).toHaveBeenCalledWith(
    expect.objectContaining({
      baseUpdatedAt: 1,
      project: expect.objectContaining({
        steps: expect.arrayContaining([expect.objectContaining({ id: 'note-2' })]),
      }),
    })
  );
}

async function verifyPersistedProjectRevisionAppliedAfterInsert() {
  persistScenarioCaptureArtifactsMock.mockImplementationOnce(async (args) => ({
    ...args.project,
    updatedAt: 2,
  }));
  const { action, getCurrentProject } = createInsertImageAction();

  await action(1, {
    blob: new Blob(['image'], { type: 'image/png' }),
    filename: 'Example image.png',
  });

  expect(getCurrentProject()).toEqual(
    expect.objectContaining({
      updatedAt: 2,
      steps: expect.arrayContaining([expect.objectContaining({ assetId: 'asset-imported' })]),
    })
  );
}

describe('createInsertImageStepAction', () => {
  it(
    'creates and persists an imported image step from an arbitrary blob source',
    verifyImportedImageInsert
  );
  it('returns early when no project is loaded', verifyNoProjectGuard);
  it(
    'falls back to the filename when imported images do not have source metadata',
    verifyFilenameFallback
  );
  it(
    'builds the inserted step from the latest in-memory project snapshot',
    verifyLiveProjectSnapshotInsert
  );
  it(
    'applies the persisted project revision after imported image insertion',
    verifyPersistedProjectRevisionAppliedAfterInsert
  );
});
