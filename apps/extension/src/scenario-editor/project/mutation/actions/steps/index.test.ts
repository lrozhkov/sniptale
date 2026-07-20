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
  cloneScenarioStepEditorDocumentRecordMock,
  createScenarioEditedCaptureAssetMock,
  saveScenarioStepEditorDocumentRecordMock,
} = vi.hoisted(() => ({
  buildScenarioEditedCaptureStepMock: vi.fn(),
  cloneScenarioStepEditorDocumentRecordMock: vi.fn(),
  createScenarioEditedCaptureAssetMock: vi.fn(),
  saveScenarioStepEditorDocumentRecordMock: vi.fn(),
}));

vi.mock('../../../../../workflows/scenario-capture-edit/edits', () => ({
  buildScenarioEditedCaptureStep: buildScenarioEditedCaptureStepMock,
  createScenarioEditedCaptureAsset: createScenarioEditedCaptureAssetMock,
}));

vi.mock(
  '../../../../../composition/persistence/scenario/store/step-editor-documents',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../../../composition/persistence/scenario/store/step-editor-documents')
    >()),
    cloneScenarioStepEditorDocumentRecord: cloneScenarioStepEditorDocumentRecordMock,
    saveScenarioStepEditorDocumentRecord: saveScenarioStepEditorDocumentRecordMock,
  })
);

import { createApplyEditedCaptureStepAction, createDuplicateStepAction } from '.';

function createEditorDocument() {
  return {
    version: 1 as const,
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
  saveScenarioStepEditorDocumentRecordMock.mockResolvedValue(undefined);
  cloneScenarioStepEditorDocumentRecordMock.mockResolvedValue(undefined);
  createScenarioEditedCaptureAssetMock.mockResolvedValue({ id: 'asset-new' });
  buildScenarioEditedCaptureStepMock.mockImplementation((step, assetId) => ({
    ...step,
    assetId,
    overlays: [],
  }));
}

async function verifiesCaptureStepApply() {
  const applyStepReplacement = vi.fn();
  const document = createEditorDocument();
  const action = createApplyEditedCaptureStepAction({
    applyStepReplacement,
    project: createProject(),
  });

  await action('capture-1', { dataUrl: 'data:image/png;base64,next', document });

  expect(saveScenarioStepEditorDocumentRecordMock).toHaveBeenCalledWith({
    document,
    projectId: 'project-1',
    stepId: 'capture-1',
  });
  expect(createScenarioEditedCaptureAssetMock).toHaveBeenCalledWith({
    dataUrl: 'data:image/png;base64,next',
    galleryAssetId: 'gallery-1',
    projectId: 'project-1',
  });
  expect(applyStepReplacement).toHaveBeenCalledWith('capture-1', expect.any(Function));

  const replaceStep = applyStepReplacement.mock.calls[0]?.[1] as (step: unknown) => unknown;
  expect(
    replaceStep(
      createScenarioCaptureStep({
        assetId: 'asset-1',
      })
    )
  ).toEqual(expect.objectContaining({ assetId: 'asset-new', overlays: [] }));
  expect(buildScenarioEditedCaptureStepMock).toHaveBeenCalledWith(
    expect.objectContaining({ kind: 'capture' }),
    'asset-new',
    document
  );
}

async function verifiesEarlyApplyReturn() {
  const applyStepReplacement = vi.fn();
  const document = createEditorDocument();
  const action = createApplyEditedCaptureStepAction({
    applyStepReplacement,
    project: createProject(),
  });

  await action('missing-step', { dataUrl: 'data:image/png;base64,next', document });
  await action('note-1', { dataUrl: 'data:image/png;base64,next', document });

  expect(createScenarioEditedCaptureAssetMock).not.toHaveBeenCalled();
  expect(applyStepReplacement).not.toHaveBeenCalled();
  expect(saveScenarioStepEditorDocumentRecordMock).not.toHaveBeenCalled();
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
    expect(cloneScenarioStepEditorDocumentRecordMock).toHaveBeenCalledWith({
      nextProjectId: 'project-1',
      nextStepId: currentProject.steps[1]?.id,
      sourceStepId: 'capture-1',
    });
    expect(setSelectedStepId).toHaveBeenCalledWith(currentProject.steps[1]?.id);
    expect(setError).toHaveBeenCalledWith(null);
  });
});
