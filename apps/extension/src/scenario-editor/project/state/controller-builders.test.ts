import { describe, expect, it, vi } from 'vitest';
import {
  buildScenarioEditorControllerResult,
  createScenarioEditorControllerActions,
} from './controller-builders';

function createEditorState() {
  return {
    projectHistory: {
      canRedoProject: false,
      canUndoProject: true,
      redoProjectChange: vi.fn(),
      trackProjectMutation: vi.fn(),
      undoProjectChange: vi.fn(),
    },
    runtime: {
      applyLoadedProject: vi.fn(),
      loadProjectById: vi.fn(),
      syncProjectSummary: vi.fn(),
      updateProject: vi.fn(),
    },
    state: {
      createName: 'Project',
      error: null,
      loading: false,
      project: { id: 'project-1' },
      projectId: 'project-1',
      projects: [],
      quickEditStep: null,
      quickEditStepId: null,
      saveState: 'saved',
      selectedStep: null,
      selectedStepId: null,
      setCreateName: vi.fn(),
      setError: vi.fn(),
      setLoading: vi.fn(),
      setProject: vi.fn(),
      setProjectId: vi.fn(),
      setProjects: vi.fn(),
      setQuickEditStepId: vi.fn(),
      setSaveState: vi.fn(),
      setSelectedStepId: vi.fn(),
    },
    stepHistory: {
      applyStepPatch: vi.fn(),
      applyStepReplacement: vi.fn(),
      applyStepPatches: vi.fn(),
      canRedoStep: vi.fn(() => false),
      canUndoStep: vi.fn(() => true),
      getCurrentProject: vi.fn(() => ({ id: 'project-1' })),
      redoStepChange: vi.fn(),
      stepHistoryState: {},
      undoStepChange: vi.fn(),
    },
  } as never;
}

function createUiState() {
  return {
    exportDialogOpen: false,
    leftPanelMode: 'navigator',
    navigatorCollapsed: false,
    setExportDialogOpen: vi.fn(),
    setLeftPanelMode: vi.fn(),
    setNavigatorCollapsed: vi.fn(),
    setVisibleStepId: vi.fn(),
    visibleStepId: null,
  } as never;
}

function createAiState() {
  return {
    availableModels: [],
    error: null,
    instruction: '',
    lastRunSummary: null,
    loading: false,
    providers: [],
    selectedModelId: null,
    setInstruction: vi.fn(),
    setSelectedModelId: vi.fn(),
  } as never;
}

function createBrowserDriver() {
  return {
    downloadBlob: vi.fn(),
  };
}

function expectProjectActionsShape(projectActions: Record<string, unknown>) {
  expect(projectActions).toEqual(
    expect.objectContaining({
      acceptSuggestedEvent: expect.any(Function),
      applyEditedCaptureStep: expect.any(Function),
      clearTrash: expect.any(Function),
      deleteStep: expect.any(Function),
      dismissSuggestedEvent: expect.any(Function),
      duplicateStep: expect.any(Function),
      insertImageStep: expect.any(Function),
      insertStep: expect.any(Function),
      moveStepByOffset: expect.any(Function),
      moveStepToPosition: expect.any(Function),
      restoreStep: expect.any(Function),
      updateStep: expect.any(Function),
    })
  );
}

function expectProjectCrudShape(projectCrud: Record<string, unknown>) {
  expect(projectCrud).toEqual(
    expect.objectContaining({
      createProject: expect.any(Function),
      deleteProject: expect.any(Function),
      exportScenario: expect.any(Function),
      openVideoEditor: expect.any(Function),
      renameProject: expect.any(Function),
      selectProject: expect.any(Function),
    })
  );
}

function createControllerActions() {
  return {
    projectActions: {
      acceptSuggestedEvent: vi.fn(),
      applyEditedCaptureStep: vi.fn(),
      clearTrash: vi.fn(),
      deleteStep: vi.fn(),
      dismissSuggestedEvent: vi.fn(),
      duplicateStep: vi.fn(),
      insertImageStep: vi.fn(),
      insertStep: vi.fn(),
      moveStepByOffset: vi.fn(),
      moveStepToPosition: vi.fn(),
      restoreStep: vi.fn(),
      updateStep: vi.fn(),
    },
    projectCrud: {
      createProject: vi.fn(),
      deleteProject: vi.fn(),
      exportScenario: vi.fn(),
      openVideoEditor: vi.fn(),
      renameProject: vi.fn(),
      selectProject: vi.fn(),
    },
    submitScenarioEditorAiRequest: vi.fn(),
  };
}

function expectGroupedControllerShape(
  controller: ReturnType<typeof buildScenarioEditorControllerResult>,
  controllerActions: ReturnType<typeof createControllerActions>,
  editorState: ReturnType<typeof createEditorState>
) {
  expect(controller).toEqual(
    expect.objectContaining({
      ai: expect.objectContaining({
        submitRequest: controllerActions.submitScenarioEditorAiRequest,
      }),
      project: expect.objectContaining({
        projectId: 'project-1',
      }),
      projectCrud: controllerActions.projectCrud,
      projectHistory: (editorState as { projectHistory: unknown }).projectHistory,
      stepActions: controllerActions.projectActions,
      stepHistory: expect.objectContaining({
        applyStepPatch: (editorState as { stepHistory: { applyStepPatch: unknown } }).stepHistory
          .applyStepPatch,
      }),
      ui: expect.objectContaining({
        leftPanelMode: 'navigator',
      }),
    })
  );
}

describe('scenario editor controller builders', () => {
  it('creates grouped controller actions from project, ui, and ai ownership seams', () => {
    const editorState = createEditorState();
    const uiState = createUiState();
    const aiState = createAiState();

    const actions = createScenarioEditorControllerActions(
      editorState,
      uiState,
      aiState,
      createBrowserDriver()
    );

    expectProjectActionsShape(actions.projectActions);
    expectProjectCrudShape(actions.projectCrud);
    expect(actions.submitScenarioEditorAiRequest).toEqual(expect.any(Function));
  });

  it('builds a grouped public controller surface without widening the bag shape', () => {
    const editorState = createEditorState();
    const uiState = createUiState();
    const aiState = createAiState();
    const controllerActions = createControllerActions();

    const controller = buildScenarioEditorControllerResult(
      editorState,
      uiState,
      aiState,
      controllerActions as never
    );

    expectGroupedControllerShape(controller, controllerActions, editorState);
  });
});
