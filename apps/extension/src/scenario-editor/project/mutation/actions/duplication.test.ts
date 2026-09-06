import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ScenarioCaptureStep,
  ScenarioNoteStep,
  ScenarioProject,
} from '../../../../features/scenario/contracts/types/project';
import type { EditorDocument } from '../../../../features/editor/document/types';
import { createScenarioEditorProjectActions } from '.';
import { preparePersistedEditorDocument } from '../../../../composition/persistence/document-assets';

vi.mock('../../../../composition/persistence/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/assets')>()),
  writeBlobToAsset: vi.fn(async (blob: Blob) => ({
    ref: {
      assetId: 'duplicated-editor-source',
      createdAt: 1,
      location: { kind: 'opfs', objectKey: 'objects/duplicated-editor-source' },
      mimeType: blob.type,
      sha256: null,
      size: blob.size,
    },
  })),
}));

const {
  commitScenarioAggregateSnapshotMutationMock,
  getScenarioStepEditorDocumentRecordMock,
  prepareScenarioStepEditorDocumentRecordMock,
} = vi.hoisted(() => ({
  commitScenarioAggregateSnapshotMutationMock: vi.fn(),
  getScenarioStepEditorDocumentRecordMock: vi.fn(),
  prepareScenarioStepEditorDocumentRecordMock: vi.fn(),
}));

vi.mock(
  '../../../../composition/persistence/scenario/aggregate-mutations',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../../composition/persistence/scenario/aggregate-mutations')
    >()),
    commitScenarioAggregateSnapshotMutation: commitScenarioAggregateSnapshotMutationMock,
  })
);

function createEditorDocumentFixture(): EditorDocument {
  return {
    version: 2,
    sourceImageData: 'data:image/png;base64,c291cmNl',
    sourceName: 'capture.png',
    sourceWidth: 100,
    sourceHeight: 80,
    canvasWidth: 100,
    canvasHeight: 80,
    sourceLeft: 0,
    sourceTop: 0,
    sourceDisplayWidth: 100,
    sourceDisplayHeight: 80,
    frame: {
      browserMode: false,
      paddingTop: 0,
      paddingRight: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      backgroundMode: 'color',
      backgroundBlurAmount: 0,
      backgroundColor: '#ffffff',
      backgroundGradientFrom: '#ffffff',
      backgroundGradientTo: '#000000',
      backgroundGradientAngle: 90,
      backgroundImageData: null,
      backgroundImageFit: 'cover',
      layoutMode: 'fit-image',
      browserTitle: '',
      browserUrl: '',
    },
    canvasJson: '{"objects":[]}',
  };
}

vi.mock(
  '../../../../composition/persistence/scenario/store/step-editor-documents',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../../composition/persistence/scenario/store/step-editor-documents')
    >()),
    getScenarioStepEditorDocumentRecord: getScenarioStepEditorDocumentRecordMock,
    prepareScenarioStepEditorDocumentRecord: prepareScenarioStepEditorDocumentRecordMock,
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
  getScenarioStepEditorDocumentRecordMock.mockResolvedValue(undefined);
  prepareScenarioStepEditorDocumentRecordMock.mockImplementation((entry) => ({
    ...entry,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }));
  commitScenarioAggregateSnapshotMutationMock.mockImplementation(async ({ nextProject }) => ({
    project: nextProject,
    workspaceRevision: 1,
  }));
});

async function verifiesCaptureStepDuplication() {
  vi.spyOn(Date, 'now').mockReturnValue(500);
  const sourceUrl = URL.createObjectURL(new Blob(['source'], { type: 'image/png' }));
  const releaseDocumentAssets = vi.fn(() => URL.revokeObjectURL(sourceUrl));
  const sourceDocument = createEditorDocumentFixture();
  sourceDocument.sourceImageData = sourceUrl;
  getScenarioStepEditorDocumentRecordMock.mockResolvedValue({
    document: sourceDocument,
    releaseDocumentAssets,
  });
  commitScenarioAggregateSnapshotMutationMock.mockImplementationOnce(
    async ({ children, nextProject }) => {
      expect(releaseDocumentAssets).not.toHaveBeenCalled();
      const document = children?.editorDocumentPuts?.[0]?.document;
      if (!document) throw new Error('Expected duplicated editor document');
      const prepared = await preparePersistedEditorDocument(document);
      expect(prepared.document).toEqual(
        expect.objectContaining({
          sourceImage: { assetId: 'duplicated-editor-source' },
          version: 3,
        })
      );
      return { project: nextProject, workspaceRevision: 1 };
    }
  );
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
  expect(getScenarioStepEditorDocumentRecordMock).toHaveBeenCalledWith('step-capture');
  expect(prepareScenarioStepEditorDocumentRecordMock).toHaveBeenCalledWith(
    expect.objectContaining({ projectId: 'project-1', stepId: duplicatedStep.id })
  );
  expect(commitScenarioAggregateSnapshotMutationMock).toHaveBeenCalledWith(
    expect.objectContaining({
      baseProject: expect.objectContaining({ id: 'project-1' }),
      children: expect.objectContaining({ editorDocumentPuts: [expect.any(Object)] }),
    })
  );
  expect(harness.setError).toHaveBeenCalledWith(null);
  expect(releaseDocumentAssets).toHaveBeenCalledOnce();
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
  commitScenarioAggregateSnapshotMutationMock.mockRejectedValueOnce(new Error('clone failed'));
  const harness = createHarness();

  await harness.actions.duplicateStep('step-capture');

  expect(harness.getProject().steps).toHaveLength(2);
  expect(harness.selectedStepIds).toEqual([]);
  expect(harness.setError).toHaveBeenLastCalledWith(expect.stringContaining('Sniptale'));
  expect(harness.setError).not.toHaveBeenCalledWith('clone failed');
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
