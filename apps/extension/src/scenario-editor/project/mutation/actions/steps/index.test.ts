import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_FRAME_SETTINGS,
} from '../../../../../features/editor/document/constants';
import {
  createScenarioCaptureStep,
  createScenarioNoteStep,
} from '../../../../../features/scenario/project/public';
import type {
  ScenarioCaptureStep,
  ScenarioNoteStep,
  ScenarioProject,
} from '../../../../../features/scenario/contracts/types/project';

const {
  buildScenarioEditedCaptureStepMock,
  commitScenarioAggregateSnapshotMutationMock,
  getScenarioStepEditorDocumentRecordMock,
  prepareScenarioEditedCaptureAssetMock,
  prepareScenarioStepEditorDocumentRecordMock,
} = vi.hoisted(() => ({
  buildScenarioEditedCaptureStepMock: vi.fn(),
  commitScenarioAggregateSnapshotMutationMock: vi.fn(),
  getScenarioStepEditorDocumentRecordMock: vi.fn(),
  prepareScenarioEditedCaptureAssetMock: vi.fn(),
  prepareScenarioStepEditorDocumentRecordMock: vi.fn(),
}));

vi.mock('../../../../../workflows/scenario-capture-edit/edits', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../../workflows/scenario-capture-edit/edits')
  >()),
  buildScenarioEditedCaptureStep: buildScenarioEditedCaptureStepMock,
  prepareScenarioEditedCaptureAsset: prepareScenarioEditedCaptureAssetMock,
}));

vi.mock(
  '../../../../../composition/persistence/scenario/aggregate-mutations',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../../../composition/persistence/scenario/aggregate-mutations')
    >()),
    commitScenarioAggregateSnapshotMutation: commitScenarioAggregateSnapshotMutationMock,
  })
);

vi.mock(
  '../../../../../composition/persistence/scenario/store/step-editor-documents',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../../../composition/persistence/scenario/store/step-editor-documents')
    >()),
    getScenarioStepEditorDocumentRecord: getScenarioStepEditorDocumentRecordMock,
    prepareScenarioStepEditorDocumentRecord: prepareScenarioStepEditorDocumentRecordMock,
  })
);

import { createApplyEditedCaptureStepAction, createDuplicateStepAction } from '.';

function createEditorDocument() {
  return {
    version: 2 as const,
    sourceImageData: 'data:image/png;base64,doc',
    sourceName: null,
    sourceWidth: 320,
    sourceHeight: 180,
    canvasWidth: 320,
    canvasHeight: 180,
    sourceLeft: 0,
    sourceTop: 0,
    sourceDisplayWidth: 320,
    sourceDisplayHeight: 180,
    frame: DEFAULT_EDITOR_FRAME_SETTINGS,
    browserFrame: DEFAULT_BROWSER_FRAME_STATE,
    canvasJson: '{"version":"7.2.0","objects":[]}',
  };
}

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

function resetApplyEditedCaptureStepMocks() {
  vi.clearAllMocks();
  getScenarioStepEditorDocumentRecordMock.mockResolvedValue(undefined);
  prepareScenarioEditedCaptureAssetMock.mockResolvedValue({
    asset: { id: 'asset-new' },
    entry: { id: 'asset-new', projectId: 'project-1' },
  });
  prepareScenarioStepEditorDocumentRecordMock.mockImplementation((value) => value);
  commitScenarioAggregateSnapshotMutationMock.mockImplementation(async ({ nextProject }) => ({
    project: nextProject,
    workspaceRevision: 2,
  }));
  buildScenarioEditedCaptureStepMock.mockImplementation((step, assetId) => ({
    ...step,
    assetId,
    overlays: [],
  }));
}

async function verifiesCaptureStepApply() {
  const applyStepReplacement = vi.fn();
  const document = createEditorDocument();
  let project = createProject();
  const action = createApplyEditedCaptureStepAction({
    applyStepReplacement,
    getCurrentProject: () => project,
    project,
    updateProject: (updater) => {
      project = updater(project);
    },
  });

  await action('capture-1', { dataUrl: 'data:image/png;base64,next', document });

  expect(prepareScenarioStepEditorDocumentRecordMock).toHaveBeenCalledWith({
    document,
    projectId: 'project-1',
    stepId: 'capture-1',
  });
  expect(prepareScenarioEditedCaptureAssetMock).toHaveBeenCalledWith({
    dataUrl: 'data:image/png;base64,next',
    galleryAssetId: 'gallery-1',
    projectId: 'project-1',
  });
  expect(commitScenarioAggregateSnapshotMutationMock).toHaveBeenCalledWith(
    expect.objectContaining({ baseProject: expect.objectContaining({ id: 'project-1' }) })
  );
  expect(project.steps[0]).toEqual(expect.objectContaining({ assetId: 'asset-new', overlays: [] }));
  expect(buildScenarioEditedCaptureStepMock).toHaveBeenCalledWith(
    expect.objectContaining({ kind: 'capture' }),
    'asset-new',
    document
  );
}

async function verifiesEarlyApplyReturn() {
  const applyStepReplacement = vi.fn();
  const document = createEditorDocument();
  const project = createProject();
  const action = createApplyEditedCaptureStepAction({
    applyStepReplacement,
    getCurrentProject: () => project,
    project,
    updateProject: vi.fn(),
  });

  await action('missing-step', { dataUrl: 'data:image/png;base64,next', document });
  await action('note-1', { dataUrl: 'data:image/png;base64,next', document });

  expect(prepareScenarioEditedCaptureAssetMock).not.toHaveBeenCalled();
  expect(applyStepReplacement).not.toHaveBeenCalled();
  expect(prepareScenarioStepEditorDocumentRecordMock).not.toHaveBeenCalled();
}

describe('createApplyEditedCaptureStepAction', () => {
  beforeEach(resetApplyEditedCaptureStepMocks);

  it(
    'creates a new asset and applies the dedicated step replacement for capture steps',
    verifiesCaptureStepApply
  );

  it(
    'returns early when the selected step is missing or not a capture step',
    verifiesEarlyApplyReturn
  );
});

describe('createDuplicateStepAction', () => {
  it('clones the persisted step document for duplicated capture steps', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(500);
    const setSelectedStepId = vi.fn();
    const setError = vi.fn();
    let currentProject: ReturnType<typeof createProject> = createProject();
    getScenarioStepEditorDocumentRecordMock.mockResolvedValue({ document: createEditorDocument() });
    const action = createDuplicateStepAction({
      getCurrentProject: () => currentProject,
      setError,
      setSelectedStepId,
      updateProject: (updater) => {
        currentProject = updater(currentProject);
      },
    });

    await action('capture-1');

    expect(currentProject.steps).toHaveLength(3);
    expect(currentProject.steps[1]?.id).not.toBe('capture-1');
    expect(getScenarioStepEditorDocumentRecordMock).toHaveBeenCalledWith('capture-1');
    expect(prepareScenarioStepEditorDocumentRecordMock).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'project-1', stepId: currentProject.steps[1]?.id })
    );
    expect(setSelectedStepId).toHaveBeenCalledWith(currentProject.steps[1]?.id);
    expect(setError).toHaveBeenCalledWith(null);
  });
});
