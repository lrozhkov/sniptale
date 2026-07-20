import { createScenarioEditorProjectActions } from '../mutation/actions';
import { createScenarioEditorProjectCrud } from '../mutation/actions/project-crud';
import type { useScenarioEditorUiState } from './ui';
import type { useScenarioEditorProjectState } from './index';
import type { useScenarioEditorAiState } from '../ai';
import { createScenarioEditorAiSubmitAction } from '../ai';
import type { ScenarioEditorBrowserDriverPort } from '../../application/ports/browser-driver';
import type {
  ScenarioEditorAiController,
  ScenarioEditorController,
  ScenarioEditorProjectCrudController,
  ScenarioEditorProjectHistoryController,
  ScenarioEditorProjectStateController,
  ScenarioEditorStepActionsController,
  ScenarioEditorStepHistoryController,
  ScenarioEditorUiController,
} from './types';

export function createScenarioEditorControllerActions(
  editorState: ReturnType<typeof useScenarioEditorProjectState>,
  uiState: ReturnType<typeof useScenarioEditorUiState>,
  aiState: ReturnType<typeof useScenarioEditorAiState>,
  browserDriver: Pick<ScenarioEditorBrowserDriverPort, 'downloadBlob'>
) {
  const projectActions = createScenarioEditorProjectActions({
    applyStepPatch: editorState.stepHistory.applyStepPatch,
    applyStepReplacement: editorState.stepHistory.applyStepReplacement,
    getCurrentProject: editorState.stepHistory.getCurrentProject,
    project: editorState.state.project,
    setError: editorState.state.setError,
    updateProject: editorState.runtime.updateProject,
    setSelectedStepId: editorState.state.setSelectedStepId,
  });
  const projectCrud = createScenarioEditorProjectCrud({
    applyLoadedProject: editorState.runtime.applyLoadedProject,
    browserDriver,
    createName: editorState.state.createName,
    loadProjectById: editorState.runtime.loadProjectById,
    project: editorState.state.project,
    projectId: editorState.state.projectId,
    projects: editorState.state.projects,
    quickEditStepId: editorState.state.quickEditStepId,
    selectedStepId: editorState.state.selectedStepId,
    setCreateName: editorState.state.setCreateName,
    setError: editorState.state.setError,
    setLeftPanelMode: uiState.setLeftPanelMode,
    setProjects: editorState.state.setProjects,
    syncProjectSummary: editorState.runtime.syncProjectSummary,
  });
  const submitScenarioEditorAiRequest = createScenarioEditorAiSubmitAction({
    aiState,
    applyStepPatches: editorState.stepHistory.applyStepPatches,
    getCurrentProject: editorState.stepHistory.getCurrentProject,
    project: editorState.state.project,
    selectedStepId: editorState.state.selectedStepId,
  });

  return { projectActions, projectCrud, submitScenarioEditorAiRequest };
}

function buildScenarioEditorControllerAiState(
  aiState: ReturnType<typeof useScenarioEditorAiState>,
  submitScenarioEditorAiRequest: () => Promise<void>
): ScenarioEditorAiController {
  return {
    activeAttachmentDisclosure: aiState.activeAttachmentDisclosure,
    attachmentMode: aiState.attachmentMode,
    availableModels: aiState.availableModels,
    error: aiState.error,
    instruction: aiState.instruction,
    lastRunSummary: aiState.lastRunSummary,
    loading: aiState.loading,
    providers: aiState.providers,
    selectedModelId: aiState.selectedModelId,
    setActiveAttachmentDisclosure: aiState.setActiveAttachmentDisclosure,
    setAttachmentMode: aiState.setAttachmentMode,
    setInstruction: aiState.setInstruction,
    setSelectedModelId: aiState.setSelectedModelId,
    submitRequest: submitScenarioEditorAiRequest,
  };
}

function buildScenarioEditorControllerUiState(
  uiState: ReturnType<typeof useScenarioEditorUiState>
): ScenarioEditorUiController {
  return {
    exportDialogOpen: uiState.exportDialogOpen,
    inspectedStepId: uiState.inspectedStepId,
    leftPanelMode: uiState.leftPanelMode,
    navigatorCollapsed: uiState.navigatorCollapsed,
    setExportDialogOpen: uiState.setExportDialogOpen,
    setInspectedStepId: uiState.setInspectedStepId,
    setLeftPanelMode: uiState.setLeftPanelMode,
    setNavigatorCollapsed: uiState.setNavigatorCollapsed,
    setVisibleStepId: uiState.setVisibleStepId,
    visibleStepId: uiState.visibleStepId,
  };
}

function buildScenarioEditorControllerProjectState(
  editorState: ReturnType<typeof useScenarioEditorProjectState>
): ScenarioEditorProjectStateController {
  return {
    createName: editorState.state.createName,
    error: editorState.state.error,
    loading: editorState.state.loading,
    project: editorState.state.project,
    projectId: editorState.state.projectId,
    projects: editorState.state.projects,
    quickEditStep: editorState.state.quickEditStep,
    quickEditStepId: editorState.state.quickEditStepId,
    saveState: editorState.state.saveState,
    selectedStep: editorState.state.selectedStep,
    selectedStepId: editorState.state.selectedStepId,
    setCreateName: editorState.state.setCreateName,
    setQuickEditStepId: editorState.state.setQuickEditStepId,
    setSaveState: editorState.state.setSaveState,
    setSelectedStepId: editorState.state.setSelectedStepId,
  };
}

function buildScenarioEditorControllerProjectCrud(
  projectCrud: ReturnType<typeof createScenarioEditorProjectCrud>
): ScenarioEditorProjectCrudController {
  return projectCrud;
}

function buildScenarioEditorControllerProjectHistory(
  editorState: ReturnType<typeof useScenarioEditorProjectState>
): ScenarioEditorProjectHistoryController {
  return editorState.projectHistory;
}

function buildScenarioEditorControllerStepHistory(
  editorState: ReturnType<typeof useScenarioEditorProjectState>
): ScenarioEditorStepHistoryController {
  return {
    applyStepPatch: editorState.stepHistory.applyStepPatch,
    applyStepPatches: editorState.stepHistory.applyStepPatches,
    canRedoStep: editorState.stepHistory.canRedoStep,
    canUndoStep: editorState.stepHistory.canUndoStep,
    redoStepChange: editorState.stepHistory.redoStepChange,
    undoStepChange: editorState.stepHistory.undoStepChange,
  };
}

function buildScenarioEditorControllerStepActions(
  projectActions: ReturnType<typeof createScenarioEditorProjectActions>
): ScenarioEditorStepActionsController {
  return projectActions;
}

export function buildScenarioEditorControllerResult(
  editorState: ReturnType<typeof useScenarioEditorProjectState>,
  uiState: ReturnType<typeof useScenarioEditorUiState>,
  aiState: ReturnType<typeof useScenarioEditorAiState>,
  controllerActions: ReturnType<typeof createScenarioEditorControllerActions>
): ScenarioEditorController {
  return {
    ai: buildScenarioEditorControllerAiState(
      aiState,
      controllerActions.submitScenarioEditorAiRequest
    ),
    project: buildScenarioEditorControllerProjectState(editorState),
    projectCrud: buildScenarioEditorControllerProjectCrud(controllerActions.projectCrud),
    projectHistory: buildScenarioEditorControllerProjectHistory(editorState),
    stepActions: buildScenarioEditorControllerStepActions(controllerActions.projectActions),
    stepHistory: buildScenarioEditorControllerStepHistory(editorState),
    ui: buildScenarioEditorControllerUiState(uiState),
  };
}
