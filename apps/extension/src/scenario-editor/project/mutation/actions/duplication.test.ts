import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ScenarioCaptureStep,
  ScenarioNoteStep,
  ScenarioProject,
} from '../../../../features/scenario/contracts/types/project';
import { createScenarioEditorProjectActions } from '.';

const { cloneScenarioStepEditorDocumentRecordMock } = vi.hoisted(() => ({
  cloneScenarioStepEditorDocumentRecordMock: vi.fn(),
}));

vi.mock(
  '../../../../composition/persistence/scenario/store/step-editor-documents',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../../composition/persistence/scenario/store/step-editor-documents')
    >()),
    cloneScenarioStepEditorDocumentRecord: cloneScenarioStepEditorDocumentRecordMock,
    deleteScenarioStepEditorDocumentRecord: vi.fn(),
    saveScenarioStepEditorDocumentRecord: vi.fn(),
  })
);

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
    overlays: [
      {
        id: 'overlay-1',
        kind: 'text',
        point: { x: 1, y: 2 },
        text: 'Overlay',
        color: '#000',
        fontSize: 12,
        fontFamily: 'system-ui',
        fontWeight: 400,
      },
    ],
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
    trash: [],
    suggestedEvents: [],
    steps: [createNoteStep(), createCaptureStep()],
  };
}

function createHarness(project = createProject()) {
  let currentProject = project;
  const selectedStepIds: Array<string | null> = [];
  const setError = vi.fn();
  const actions = createScenarioEditorProjectActions({
    applyStepPatch: vi.fn(),
    applyStepReplacement: vi.fn(),
    getCurrentProject: () => currentProject,
    project: currentProject,
    setError,
    setSelectedStepId: (stepId) => {
      selectedStepIds.push(stepId);
    },
    updateProject: (updater) => {
      currentProject = updater(currentProject);
    },
  });

  return {
    actions,
    getProject: () => currentProject,
    selectedStepIds,
    setError,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  cloneScenarioStepEditorDocumentRecordMock.mockResolvedValue(undefined);
});

async function verifiesCaptureStepDuplication() {
  vi.spyOn(Date, 'now').mockReturnValue(500);
  const harness = createHarness();

  await harness.actions.duplicateStep('step-capture');

  const duplicatedStep = harness.getProject().steps[2];
  expect(harness.getProject().updatedAt).toBe(500);
  expect(duplicatedStep?.kind).toBe('capture');

  if (!duplicatedStep || duplicatedStep.kind !== 'capture') {
    throw new Error('Expected duplicated step to be a capture step');
  }

  expect(duplicatedStep.id).not.toBe('step-capture');
  expect(duplicatedStep.createdAt).toBe(500);
  expect(duplicatedStep.updatedAt).toBe(500);
  expect(duplicatedStep.overlays[0]?.id).not.toBe('overlay-1');
  expect(harness.selectedStepIds).toEqual([duplicatedStep.id]);
  expect(cloneScenarioStepEditorDocumentRecordMock).toHaveBeenCalledWith({
    nextProjectId: 'project-1',
    nextStepId: duplicatedStep.id,
    sourceStepId: 'step-capture',
  });
  expect(harness.setError).toHaveBeenCalledWith(null);
}

async function verifiesNoteStepDuplication() {
  vi.spyOn(Date, 'now').mockReturnValue(700);
  const harness = createHarness();

  await harness.actions.duplicateStep('step-note');
  await harness.actions.duplicateStep('missing-step');

  const duplicatedStep = harness.getProject().steps[1];
  expect(duplicatedStep?.kind).toBe('note');

  if (!duplicatedStep || duplicatedStep.kind !== 'note') {
    throw new Error('Expected duplicated step to be a note step');
  }

  expect(duplicatedStep.id).not.toBe('step-note');
  expect(duplicatedStep.createdAt).toBe(700);
  expect(duplicatedStep.updatedAt).toBe(700);
  expect(harness.getProject().steps).toHaveLength(3);
  expect(harness.setError).toHaveBeenCalledWith(null);
}

async function verifiesCaptureStepDuplicationFailure() {
  cloneScenarioStepEditorDocumentRecordMock.mockRejectedValueOnce(new Error('clone failed'));
  const harness = createHarness();

  await harness.actions.duplicateStep('step-capture');

  expect(harness.getProject().steps).toHaveLength(2);
  expect(harness.selectedStepIds).toEqual([]);
  expect(harness.setError).toHaveBeenCalledWith('clone failed');
}

describe('scenario editor controller duplication actions', () => {
  it(
    'duplicates capture steps with shared mutation timestamps and fresh overlay ids',
    verifiesCaptureStepDuplication
  );
  it(
    'duplicates note steps without capture overlays and keeps missing ids as no-ops',
    verifiesNoteStepDuplication
  );
  it(
    'keeps project state unchanged when capture duplication fails',
    verifiesCaptureStepDuplicationFailure
  );
});
