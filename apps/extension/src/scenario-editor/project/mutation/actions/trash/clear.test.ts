import { beforeEach, expect, it, vi } from 'vitest';
import type {
  ScenarioCaptureStep,
  ScenarioNoteStep,
  ScenarioProject,
} from '../../../../../features/scenario/contracts/types/project';
import { createScenarioEditorProjectActions } from '..';

const { deleteScenarioAssetRecordMock, deleteScenarioStepEditorDocumentRecordMock } = vi.hoisted(
  () => ({
    deleteScenarioAssetRecordMock: vi.fn(),
    deleteScenarioStepEditorDocumentRecordMock: vi.fn(),
  })
);

vi.mock(
  '../../../../../composition/persistence/scenario/store/step-editor-documents',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../../../composition/persistence/scenario/store/step-editor-documents')
    >()),
    cloneScenarioStepEditorDocumentRecord: vi.fn(),
    deleteScenarioStepEditorDocumentRecord: deleteScenarioStepEditorDocumentRecordMock,
    saveScenarioStepEditorDocumentRecord: vi.fn(),
  })
);

vi.mock('../../../../../composition/persistence/scenario/store/project-records/assets', () => ({
  deleteScenarioAssetRecord: deleteScenarioAssetRecordMock,
}));

function createNoteStep(id = 'step-note'): ScenarioNoteStep {
  return {
    id,
    kind: 'note',
    title: 'Note',
    body: '',
    tone: 'neutral',
    createdAt: 1,
    updatedAt: 1,
  };
}

function createCaptureStep(id = 'step-capture'): ScenarioCaptureStep {
  return {
    id,
    kind: 'capture',
    title: 'Capture',
    body: '',
    assetId: 'asset-1',
    galleryAssetId: null,
    captureSurface: 'visible',
    sourceKind: 'manual',
    page: {
      title: 'Page',
      url: 'https://example.com',
      viewport: { x: 0, y: 0, width: 100, height: 100 },
      scrollX: 0,
      scrollY: 0,
      devicePixelRatio: 1,
    },
    target: null,
    interactionPoint: null,
    cursorPoint: null,
    captureMetadata: {
      pointerRange: null,
      scroll: null,
      trigger: 'pointer-up',
    },
    overlays: [],
    annotationRenderMode: 'overlays',
    imageTransform: { x: 0, y: 0, scale: 1 },
    viewportTransform: { x: 0, y: 0, width: 100, height: 100 },
    createdAt: 1,
    updatedAt: 1,
  };
}

function createProject(): ScenarioProject {
  return {
    id: 'project-1',
    name: 'Project',
    createdAt: 1,
    updatedAt: 1,
    version: 2,
    suggestedEvents: [],
    steps: [createNoteStep()],
    trash: [
      {
        deletedAt: 10,
        originalIndex: 1,
        step: createCaptureStep('trash-capture'),
      },
    ],
  };
}

function createHarness(project = createProject()) {
  let currentProject = project;
  const setError = vi.fn();
  const actions = createScenarioEditorProjectActions({
    applyStepPatch: vi.fn(),
    applyStepReplacement: vi.fn(),
    getCurrentProject: () => currentProject,
    project: currentProject,
    setError,
    setSelectedStepId: vi.fn(),
    updateProject: (updater) => {
      currentProject = updater(currentProject);
    },
  });

  return {
    actions,
    getProject: () => currentProject,
    setError,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('clears trash entries and deletes persisted capture documents for removed steps', async () => {
  const harness = createHarness();

  await harness.actions.clearTrash();

  expect(harness.getProject().trash).toEqual([]);
  expect(deleteScenarioAssetRecordMock).toHaveBeenCalledWith('asset-1');
  expect(deleteScenarioStepEditorDocumentRecordMock).toHaveBeenCalledWith('trash-capture');
  expect(harness.setError).toHaveBeenCalledWith(null);
});

it('keeps shared capture assets when an active step still references the same asset id', async () => {
  const harness = createHarness({
    ...createProject(),
    steps: [createNoteStep(), createCaptureStep('active-capture')],
  });

  await harness.actions.clearTrash();

  expect(deleteScenarioAssetRecordMock).not.toHaveBeenCalled();
  expect(deleteScenarioStepEditorDocumentRecordMock).toHaveBeenCalledWith('trash-capture');
});

it('keeps trash entries when persisted cleanup fails', async () => {
  deleteScenarioAssetRecordMock.mockRejectedValueOnce(new Error('cleanup failed'));
  const harness = createHarness();

  await harness.actions.clearTrash();

  expect(harness.getProject().trash).toHaveLength(1);
  expect(deleteScenarioStepEditorDocumentRecordMock).toHaveBeenCalledWith('trash-capture');
  expect(harness.setError).toHaveBeenCalledWith('cleanup failed');
});
